package com.oldalexhub.videodownloader

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.view.WindowManager
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.documentfile.provider.DocumentFile
import androidx.work.WorkManager
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.oldalexhub.videodownloader.download.DownloadDatabase
import com.oldalexhub.videodownloader.download.DownloadRecord
import com.oldalexhub.videodownloader.download.DownloadScheduler
import com.oldalexhub.videodownloader.download.DownloadWorker
import com.oldalexhub.videodownloader.download.AdaptiveExporter
import com.oldalexhub.videodownloader.player.PlayerActivity
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.UUID
import java.util.concurrent.TimeUnit

class VDDownloadManagerModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), ActivityEventListener {
  private val database = DownloadDatabase.get(context)
  private var folderPromise: Promise? = null
  private val downloadReceiver = object : BroadcastReceiver() {
    override fun onReceive(receiverContext: Context?, intent: Intent?) = emitDownloadChanged()
  }

  init {
    context.addActivityEventListener(this)
    ContextCompat.registerReceiver(context, downloadReceiver, IntentFilter(DownloadDatabase.ACTION_DOWNLOADS_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  override fun invalidate() {
    runCatching { context.unregisterReceiver(downloadReceiver) }
    super.invalidate()
  }

  override fun getName() = "VDDownloadManager"

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun emitDownloadChanged() {
    if (context.hasActiveReactInstance()) {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("VDDownloadChanged", null)
    }
  }

  @ReactMethod
  fun listDownloads(promise: Promise) {
    runCatching {
      Arguments.createArray().apply { database.list().forEach { pushMap(it.toWritableMap()) } }
    }.fold(promise::resolve) { error -> promise.reject("E_DATABASE", error.message, error) }
  }

  @ReactMethod
  fun deleteServerAnalytics(promise: Promise) {
    Thread {
      runCatching { Telemetry.deleteServerAnalytics(context) }
        .fold(promise::resolve) { error -> promise.reject("E_ANALYTICS_DELETE", error.message, error) }
    }.start()
  }

  @ReactMethod
  fun configureTelemetry(revision: String, sampleRate: Double, batchSize: Int, promise: Promise) {
    Telemetry.configure(context, revision, sampleRate, batchSize)
    promise.resolve(true)
  }

  @ReactMethod
  fun getAppVersionInfo(promise: Promise) {
    promise.resolve(Arguments.createMap().apply {
      putInt("versionCode", BuildConfig.VERSION_CODE)
      putString("versionName", BuildConfig.VERSION_NAME)
      putString("packageName", context.packageName)
    })
  }

  @ReactMethod
  fun enqueueDownload(payload: ReadableMap, promise: Promise) {
    runCatching {
      val id = UUID.randomUUID().toString()
      val sourceUrl = payload.string("sourceUrl")
      val pageUrl = payload.string("pageUrl")
      val title = payload.string("title").ifBlank { "Downloaded media" }.take(180)
      val extension = payload.string("extension").ifBlank { "bin" }.filter { it.isLetterOrDigit() }.take(8).lowercase()
      val finalFilename = sanitizeFilename(payload.string("finalFilename").ifBlank { "$title.$extension" })
      val sourceName = Uri.parse(sourceUrl).lastPathSegment?.substringBefore('?')?.takeIf { it.isNotBlank() } ?: finalFilename
      val cookie = CookieManager.getInstance().getCookie(sourceUrl) ?: CookieManager.getInstance().getCookie(pageUrl).orEmpty()
      val headers = JSONObject().apply {
        payload.string("userAgent").takeIf { it.isNotBlank() }?.let { put("User-Agent", it) }
        pageUrl.takeIf { it.isNotBlank() }?.let { put("Referer", it) }
        cookie.takeIf { it.isNotBlank() }?.let { put("Cookie", it) }
      }
      database.insert(ContentValues().apply {
        put("id", id)
        put("source_url", sourceUrl)
        put("page_url", pageUrl)
        put("title", title)
        put("original_filename", sourceName)
        put("final_filename", finalFilename)
        put("mime_type", payload.string("mimeType").ifBlank { "application/octet-stream" })
        put("extension", extension)
        put("media_type", payload.string("mediaType").ifBlank { "video" })
        put("resolution", payload.optionalString("resolution"))
        put("quality_label", payload.optionalString("qualityLabel"))
        put("estimated_bytes", payload.long("estimatedBytes"))
        put("actual_bytes", 0)
        put("downloaded_bytes", 0)
        put("progress", 0.0)
        put("speed_bps", 0.0)
        put("eta_seconds", 0)
        put("supports_range", -1)
        put("status", "queued")
        put("thumbnail_uri", payload.optionalString("thumbnailUrl"))
        put("created_at", System.currentTimeMillis())
        put("retry_count", 0)
        put("source_metadata", JSONObject().apply {
          put("sourceHost", runCatching { Uri.parse(sourceUrl).host }.getOrNull())
          put("isManifest", payload.boolean("isManifest"))
        }.toString())
        put("headers_json", headers.toString())
        put("destination_uri", payload.optionalString("destinationUri"))
        put("wifi_only", if (payload.boolean("wifiOnly")) 1 else 0)
        put("auto_resume", if (payload.boolean("resumeAutomatically")) 1 else 0)
        put("hidden_downloads", 0)
        put("asset_id", payload.optionalString("assetId"))
        put("variant_id", payload.optionalString("variantId"))
        put("protocol", payload.string("protocol").ifBlank { "progressive" })
        put("selection_token", payload.optionalString("selectionToken"))
        put("video_codec", payload.optionalString("videoCodec"))
        put("audio_codec", payload.optionalString("audioCodec"))
        put("duration_ms", payload.long("durationMs"))
        put("audio_mode", payload.string("audioMode").ifBlank { "unknown" })
        put("flow_id", payload.optionalString("flowId"))
        put("processing_stage", "queued")
        put("playback_position_ms", 0)
        put("watched_percent", 0.0)
      })
      val maxParallel = payload.int("parallelDownloads", 2).coerceIn(1, 4)
      context.getSharedPreferences("download_settings", 0).edit().putInt("max_parallel", maxParallel).apply()
      requestNotificationPermission()
      DownloadScheduler.enqueue(context, id, payload.boolean("wifiOnly"))
      Telemetry.record(context, "download_started", JSONObject().apply {
        put("sourceHost", runCatching { Uri.parse(sourceUrl).host }.getOrNull())
        put("mediaType", payload.string("mediaType"))
        put("protocol", payload.string("protocol"))
        put("stage", "queued")
        put("flowId", payload.string("flowId"))
        put("estimatedBytes", payload.long("estimatedBytes"))
      })
      id
    }.fold(promise::resolve) { error -> promise.reject("E_ENQUEUE", error.message, error) }
  }

  @ReactMethod
  fun pauseDownload(id: String, promise: Promise) {
    runCatching { database.get(id)?.let { recordDownloadEvent("download_paused", it) }; DownloadScheduler.pause(context, id); true }
      .fold(promise::resolve) { error -> promise.reject("E_PAUSE", error.message, error) }
  }

  @ReactMethod
  fun resumeDownload(id: String, promise: Promise) {
    runCatching {
      val record = database.get(id) ?: error("Download not found")
      if (DownloadWorker.partFile(context, id).length() > 0 && record.supportsRange == 0) {
        throw IllegalStateException("This server does not support resumable downloads. Restart confirmation is required.")
      }
      database.update(id, ContentValues().apply { put("status", "queued"); putNull("failure_message"); putNull("failure_code") })
      DownloadScheduler.enqueue(context, id, record.wifiOnly)
      recordDownloadEvent("download_resumed", record)
      true
    }.fold(promise::resolve) { error -> promise.reject("E_RESTART_REQUIRED", error.message, error) }
  }

  @ReactMethod
  fun restartDownload(id: String, promise: Promise) {
    runCatching {
      DownloadWorker.partFile(context, id).delete()
      DownloadWorker.stateFile(context, id).delete()
      database.update(id, ContentValues().apply {
        put("status", "queued"); put("downloaded_bytes", 0); put("progress", 0); put("supports_range", -1)
        putNull("failure_message"); putNull("failure_code"); putNull("etag"); putNull("last_modified")
      })
      DownloadScheduler.enqueue(context, id, database.get(id)?.wifiOnly ?: false)
      database.get(id)?.let { recordDownloadEvent("download_retry", it) }
      true
    }.fold(promise::resolve) { error -> promise.reject("E_RESTART", error.message, error) }
  }

  @ReactMethod
  fun cancelDownload(id: String, promise: Promise) {
    runCatching { database.get(id)?.let { recordDownloadEvent("download_cancelled", it) }; DownloadScheduler.cancel(context, id); true }
      .fold(promise::resolve) { error -> promise.reject("E_CANCEL", error.message, error) }
  }

  @ReactMethod
  fun deleteDownload(id: String, deleteFile: Boolean, promise: Promise) {
    runCatching {
      val record = database.get(id) ?: return@runCatching true
      DownloadScheduler.cancel(context, id)
      if (deleteFile) record.localUri?.let { context.contentResolver.delete(Uri.parse(it), null, null) }
      database.delete(id)
      true
    }.fold(promise::resolve) { error -> promise.reject("E_DELETE", error.message, error) }
  }

  @ReactMethod
  fun renameDownload(id: String, requestedName: String, promise: Promise) {
    runCatching {
      val record = database.get(id) ?: error("Download not found")
      val uri = Uri.parse(record.localUri ?: error("Downloaded file is unavailable"))
      val name = sanitizeFilename(requestedName)
      val document = DocumentFile.fromSingleUri(context, uri)
      val renamed = document?.renameTo(name) == true || context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.DISPLAY_NAME, name) }, null, null) > 0
      if (!renamed) error("The destination does not allow renaming this file")
      database.update(id, ContentValues().apply { put("final_filename", name) })
      name
    }.fold(promise::resolve) { error -> promise.reject("E_RENAME", error.message, error) }
  }

  @ReactMethod
  fun openDownload(id: String, promise: Promise) {
    runCatching {
      val record = database.get(id) ?: error("Download not found")
      val uri = Uri.parse(record.localUri ?: error("Downloaded file is unavailable"))
      val intent = if (record.mediaType == "video" || record.mediaType == "audio") {
        Intent(context, PlayerActivity::class.java).apply {
          putExtra(PlayerActivity.EXTRA_URI, uri.toString())
          putExtra(PlayerActivity.EXTRA_DOWNLOAD_ID, record.id)
          putExtra(PlayerActivity.EXTRA_TITLE, record.title)
          putExtra(PlayerActivity.EXTRA_MIME, record.mimeType)
          putExtra(PlayerActivity.EXTRA_POSITION, record.playbackPositionMs)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      } else Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, record.mimeType)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.startActivity(intent)
      true
    }.fold(promise::resolve) { error -> promise.reject("E_OPEN", error.message, error) }
  }

  @ReactMethod
  fun shareDownload(id: String, promise: Promise) {
    runCatching {
      val record = database.get(id) ?: error("Download not found")
      val uri = Uri.parse(record.localUri ?: error("Downloaded file is unavailable"))
      val share = Intent(Intent.ACTION_SEND).apply {
        type = record.mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.startActivity(Intent.createChooser(share, "Share media").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }.fold(promise::resolve) { error -> promise.reject("E_SHARE", error.message, error) }
  }

  @ReactMethod
  fun moveDownload(id: String, destinationUri: String, promise: Promise) {
    runCatching {
      val record = database.get(id) ?: error("Download not found")
      val oldUri = Uri.parse(record.localUri ?: error("Downloaded file is unavailable"))
      val tree = DocumentFile.fromTreeUri(context, Uri.parse(destinationUri)) ?: error("Destination unavailable")
      val output = tree.createFile(record.mimeType, record.finalFilename) ?: error("Destination cannot be written")
      context.contentResolver.openInputStream(oldUri)?.use { input ->
        context.contentResolver.openOutputStream(output.uri)?.use { destination -> input.copyTo(destination) }
          ?: error("Destination cannot be written")
      } ?: error("Downloaded file is unavailable")
      context.contentResolver.delete(oldUri, null, null)
      database.update(id, ContentValues().apply { put("local_uri", output.uri.toString()); put("destination_uri", destinationUri) })
      output.uri.toString()
    }.fold(promise::resolve) { error -> promise.reject("E_MOVE", error.message, error) }
  }

  @ReactMethod
  fun chooseDestination(promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject("E_ACTIVITY", "No Android activity is available")
    if (folderPromise != null) return promise.reject("E_PICKER", "A folder picker is already open")
    folderPromise = promise
    activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }, REQUEST_FOLDER)
  }

  @ReactMethod
  fun clearCompleted(promise: Promise) {
    runCatching { database.clearCompleted() }.fold(promise::resolve) { error -> promise.reject("E_CLEAR", error.message, error) }
  }

  @ReactMethod
  fun clearTemporaryFiles(promise: Promise) {
    runCatching {
      val active = database.list().filter { it.status in listOf("queued", "preparing", "downloading", "paused", "retrying") }.map { it.id }.toSet()
      val directory = File(context.cacheDir, "download-parts")
      var bytes = 0L
      directory.listFiles()?.forEach { file ->
        val fileId = file.name.substringBefore('.')
        if (fileId !in active) { bytes += file.length(); file.delete() }
      }
      bytes.toDouble()
    }.fold(promise::resolve) { error -> promise.reject("E_CLEAR_TEMP", error.message, error) }
  }

  @ReactMethod
  fun getStorageStats(promise: Promise) {
    runCatching {
      val temporary = File(context.cacheDir, "download-parts").walkTopDown().filter { it.isFile }.sumOf { it.length() }
      Arguments.createMap().apply {
        putDouble("videos", database.storageBytes("video").toDouble())
        putDouble("audio", database.storageBytes("audio").toDouble())
        putDouble("images", database.storageBytes("image").toDouble())
        putDouble("temporary", temporary.toDouble())
      }
    }.fold(promise::resolve) { error -> promise.reject("E_STORAGE", error.message, error) }
  }

  @ReactMethod
  fun getInitialSharedUrl(promise: Promise) {
    promise.resolve(MainActivity.consumeSharedUrl())
  }

  @ReactMethod
  fun inspectManifest(sourceUrl: String, pageUrl: String, title: String, promise: Promise) {
    Thread {
      runCatching {
        val connection = URL(sourceUrl).openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = true
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.setRequestProperty("Accept-Encoding", "identity")
        connection.setRequestProperty("Referer", pageUrl)
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/121 Mobile Safari/537.36 VDMediaSaver/2.0")
        CookieManager.getInstance().getCookie(sourceUrl)?.let { connection.setRequestProperty("Cookie", it) }
        if (connection.responseCode !in 200..299) error("The media manifest could not be loaded")
        val text = connection.inputStream.bufferedReader().use { it.readText() }
        connection.disconnect()
        if (text.contains("ContentProtection", true) || (text.contains("#EXT-X-KEY", true) && !text.contains("METHOD=NONE", true))) {
          throw IllegalStateException("Protected media cannot be downloaded.")
        }
        val isHls = sourceUrl.substringBefore('?').endsWith(".m3u8", true) || text.contains("#EXTM3U")
        if (isHls && text.contains("#EXTINF", true) && !text.contains("#EXT-X-ENDLIST", true)) error("Live streams are not supported")
        if (!isHls && Regex("<MPD[^>]+type=[\"']dynamic[\"']", RegexOption.IGNORE_CASE).containsMatchIn(text)) error("Live streams are not supported")
        val requestHeaders = buildMap {
          put("Referer", pageUrl)
          put("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/121 Mobile Safari/537.36 VDMediaSaver/2.0")
          CookieManager.getInstance().getCookie(sourceUrl)?.takeIf { it.isNotBlank() }?.let { put("Cookie", it) }
        }
        val inspected = AdaptiveExporter.inspect(context, sourceUrl, requestHeaders)
        if (inspected.any { it.protected }) throw IllegalStateException("Protected media cannot be downloaded.")
        if (inspected.none { it.hasAudio }) throw IllegalStateException("The manifest has no compatible video and audio combination.")
        val mime = if (isHls) "application/vnd.apple.mpegurl" else "application/dash+xml"
        val extension = if (isHls) "m3u8" else "mpd"
        val results = Arguments.createArray()
        inspected.forEach { variant ->
          results.pushMap(manifestMap(sourceUrl, pageUrl, title, mime, extension, variant.width, variant.height, variant.bitrate, variant.hasAudio, variant.audioMode, variant.videoCodec, variant.selectionToken, variant.audioCodec, variant.audioLanguage))
        }
        results
      }.fold(promise::resolve) { error -> promise.reject(if (error.message?.contains("Protected") == true) "E_PROTECTED" else "E_MANIFEST", error.message, error) }
    }.start()
  }

  @ReactMethod
  fun inspectCandidates(candidates: ReadableArray, promise: Promise) {
    Thread {
      runCatching {
        Arguments.createArray().apply {
          for (index in 0 until candidates.size()) {
            val candidate = candidates.getMap(index) ?: continue
            val sourceUrl = candidate.string("sourceUrl")
            val pageUrl = candidate.string("pageUrl")
            val result = Arguments.createMap().apply { putString("candidateKey", candidate.string("candidateKey")) }
            var connection = URL(sourceUrl).openConnection() as HttpURLConnection
            fun configure(method: String) {
              connection.instanceFollowRedirects = true
              connection.connectTimeout = 10_000
              connection.readTimeout = 10_000
              connection.requestMethod = method
              connection.setRequestProperty("Accept-Encoding", "identity")
              connection.setRequestProperty("User-Agent", candidate.string("userAgent").ifBlank { "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome Mobile Safari/537.36 VDMediaSaver/2.0" })
              pageUrl.takeIf { it.isNotBlank() }?.let { connection.setRequestProperty("Referer", it) }
              CookieManager.getInstance().getCookie(sourceUrl)?.let { connection.setRequestProperty("Cookie", it) }
            }
            configure("HEAD")
            var code = connection.responseCode
            if (code == 405 || code == 501 || connection.contentType.isNullOrBlank()) {
              connection.disconnect()
              connection = URL(sourceUrl).openConnection() as HttpURLConnection
              configure("GET")
              connection.setRequestProperty("Range", "bytes=0-4095")
              code = connection.responseCode
            }
            if (code in listOf(401, 403, 404, 410)) {
              result.putString("inspectionState", "expired")
              result.putString("supportState", "unsupported")
              result.putString("unsupportedReason", if (code == 401 || code == 403) "The page session or media link expired" else "The media is no longer available")
            } else if (code !in 200..299) {
              result.putString("inspectionState", "unsupported")
              result.putString("supportState", "unsupported")
              result.putString("unsupportedReason", "The source rejected inspection (HTTP $code)")
            } else {
              val type = connection.contentType?.substringBefore(';')?.trim().orEmpty()
              val length = connection.getHeaderField("Content-Range")?.substringAfterLast('/')?.toLongOrNull() ?: connection.contentLengthLong.coerceAtLeast(0)
              result.putString("inspectionState", "ready")
              result.putString("supportState", "supported")
              if (type.isNotBlank()) result.putString("mimeType", type)
              if (length > 0) result.putDouble("estimatedBytes", length.toDouble())
              result.putBoolean("supportsRange", code == 206 || connection.getHeaderField("Accept-Ranges")?.contains("bytes", true) == true)
              val extension = type.takeIf { it.isNotBlank() }?.let { mime ->
                when {
                  mime.contains("mp4") -> "mp4"
                  mime.contains("webm") -> "webm"
                  mime.contains("mpeg") -> if (mime.startsWith("audio")) "mp3" else "mpg"
                  mime.contains("jpeg") -> "jpg"
                  mime.contains("png") -> "png"
                  mime.contains("webp") -> "webp"
                  else -> null
                }
              }
              extension?.let { result.putString("extension", it); result.putString("container", it.uppercase()) }
            }
            connection.disconnect()
            pushMap(result)
          }
        }
      }.fold(promise::resolve) { error -> promise.reject("E_INSPECTION", error.message, error) }
    }.start()
  }

  @ReactMethod
  fun clearBrowserData(kind: String, promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      runCatching {
        if (kind == "cookies" || kind == "all") CookieManager.getInstance().removeAllCookies(null)
        if (kind == "cache" || kind == "all") WebView(context).apply { clearCache(true); clearHistory(); destroy() }
        if (kind == "all") WebStorage.getInstance().deleteAllData()
        true
      }.fold(promise::resolve) { error -> promise.reject("E_BROWSER_DATA", error.message, error) }
    }
  }

  @ReactMethod
  fun clearAllData(promise: Promise) {
    Thread {
      runCatching {
        val records = database.list()
        records.forEach { record ->
          DownloadScheduler.cancel(context, record.id)
        }
        val workManager = WorkManager.getInstance(context)
        records.forEach { record ->
          workManager.cancelUniqueWork("media-download-${record.id}").result.get(10, TimeUnit.SECONDS)
        }
        workManager.cancelAllWorkByTag("media-download").result.get(10, TimeUnit.SECONDS)
        DownloadWorker.awaitRunningWorkers(40, TimeUnit.SECONDS)
        records.forEach { record ->
          record.localUri?.let { runCatching { context.contentResolver.delete(Uri.parse(it), null, null) } }
          DownloadWorker.partFile(context, record.id).delete()
          DownloadWorker.stateFile(context, record.id).delete()
        }
        database.deleteAll()
        File(context.cacheDir, "download-parts").deleteRecursively()
        context.getSharedPreferences("download_settings", 0).edit().clear().apply()
        Telemetry.clearLocalData(context)
      }.fold(
        onSuccess = {
          Handler(Looper.getMainLooper()).post {
            runCatching {
              CookieManager.getInstance().removeAllCookies(null)
              WebStorage.getInstance().deleteAllData()
              true
            }.fold(promise::resolve) { error -> promise.reject("E_CLEAR_ALL", error.message, error) }
          }
        },
        onFailure = { error -> promise.reject("E_CLEAR_ALL", error.message, error) },
      )
    }.start()
  }

  @ReactMethod
  fun setAnalyticsEnabled(enabled: Boolean, promise: Promise) {
    Telemetry.setEnabled(context, enabled)
    promise.resolve(true)
  }

  @ReactMethod
  fun setUsageInsightsEnabled(enabled: Boolean, promise: Promise) {
    Telemetry.setUsageInsightsEnabled(context, enabled)
    promise.resolve(true)
  }

  @ReactMethod
  fun setKeepScreenAwake(enabled: Boolean, promise: Promise) {
    val activity = context.currentActivity ?: return promise.resolve(false)
    activity.runOnUiThread {
      if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun trackEvent(name: String, properties: ReadableMap, promise: Promise) {
    val json = JSONObject()
    properties.toHashMap().forEach { (key, value) -> if (value is String || value is Number || value is Boolean) json.put(key, value) }
    Telemetry.record(context, name, json)
    promise.resolve(true)
  }

  @ReactMethod
  fun trackUsageInsight(name: String, properties: ReadableMap, promise: Promise) {
    val json = when (name) {
      "search_performed" -> properties.getString("term")?.trim()?.take(80)
        ?.takeIf { it.isNotBlank() }?.let { JSONObject().put("term", it) }
      "site_visited" -> properties.getString("siteHost")?.trim()?.lowercase()?.take(253)
        ?.takeIf { it.matches(Regex("^[a-z0-9.:[\\]-]+$")) }?.let { JSONObject().put("siteHost", it) }
      else -> null
    }
    if (json != null) Telemetry.recordUsageInsight(context, name, json)
    promise.resolve(json != null)
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_FOLDER) return
    val promise = folderPromise.also { folderPromise = null } ?: return
    if (resultCode != Activity.RESULT_OK || data?.data == null) return promise.reject("E_CANCELLED", "Folder selection cancelled")
    val uri = data.data!!
    runCatching {
      context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      val document = DocumentFile.fromTreeUri(context, uri)
      Arguments.createMap().apply { putString("uri", uri.toString()); putString("name", document?.name ?: "Selected folder") }
    }.fold(promise::resolve) { error -> promise.reject("E_FOLDER", error.message, error) }
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      context.currentActivity?.let { activity: Activity -> activity.runOnUiThread { ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4102) } }
    }
  }

  private fun recordDownloadEvent(name: String, record: DownloadRecord) {
    Telemetry.record(context, name, JSONObject().apply {
      put("sourceHost", runCatching { Uri.parse(record.sourceUrl).host }.getOrNull())
      put("mediaType", record.mediaType); put("protocol", record.protocol); put("stage", record.processingStage)
      put("bytes", record.downloadedBytes); put("flowId", record.flowId)
    })
  }

  companion object {
    private const val REQUEST_FOLDER = 4101
    private fun sanitizeFilename(value: String): String = value
      .replace(Regex("[<>:\"/\\\\|?*\\u0000-\\u001F]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim().trimEnd('.', ' ').take(160).ifBlank { "download.bin" }

    private fun manifestMap(url: String, pageUrl: String, title: String, mime: String, extension: String, width: Int, height: Int, bandwidth: Long, hasAudio: Boolean, audioMode: String, codecs: String, selectionToken: String, audioCodec: String = "", language: String? = null): WritableMap = Arguments.createMap().apply {
      putString("id", "$url|$selectionToken")
      putString("groupKey", "${runCatching { Uri.parse(pageUrl).host }.getOrNull()}|${title.lowercase()}|video")
      putString("sourceUrl", url); putString("pageUrl", pageUrl); putString("title", title)
      putString("mimeType", mime); putString("extension", extension); putString("mediaType", "video")
      putString("protocol", if (extension == "m3u8") "hls" else "dash"); putString("container", "MP4")
      putString("qualityLabel", if (height > 0) "${height}p" else "Adaptive stream")
      if (height > 0) { putString("resolution", "${height}p"); putInt("height", height); putInt("width", width) }
      putDouble("estimatedBytes", 0.0); putBoolean("hasAudio", hasAudio); putString("audioMode", audioMode); putString("inspectionState", "ready"); putString("supportState", "supported"); putString("selectionToken", selectionToken); putBoolean("isManifest", true)
      putBoolean("isProtected", false); putDouble("confidence", if (height > 0) 96.0 else 86.0)
      if (bandwidth > 0) putDouble("bitrate", bandwidth.toDouble())
      if (codecs.isNotBlank()) {
        putString("videoCodec", codecs.split(',').firstOrNull { !Regex("mp4a|ac-3|ec-3|opus|vorbis", RegexOption.IGNORE_CASE).containsMatchIn(it) }?.trim() ?: codecs)
      }
      if (audioCodec.isNotBlank()) putString("audioCodec", audioCodec)
      language?.takeIf { it.isNotBlank() }?.let { putString("language", it) }
    }
  }
}

private fun ReadableMap.string(key: String): String = if (hasKey(key) && !isNull(key)) getString(key).orEmpty() else ""
private fun ReadableMap.optionalString(key: String): String? = string(key).takeIf { it.isNotBlank() }
private fun ReadableMap.boolean(key: String): Boolean = hasKey(key) && !isNull(key) && getBoolean(key)
private fun ReadableMap.long(key: String): Long = if (hasKey(key) && !isNull(key)) getDouble(key).toLong() else 0L
private fun ReadableMap.int(key: String, fallback: Int): Int = if (hasKey(key) && !isNull(key)) getDouble(key).toInt() else fallback

private fun DownloadRecord.toWritableMap(): WritableMap = Arguments.createMap().apply {
  putString("id", id); putString("sourceUrl", sourceUrl); putString("pageUrl", pageUrl); putString("title", title)
  putString("originalFilename", originalFilename); putString("finalFilename", finalFilename); putString("mimeType", mimeType)
  putString("extension", extension); putString("mediaType", mediaType); putString("resolution", resolution); putString("qualityLabel", qualityLabel)
  putDouble("estimatedBytes", estimatedBytes.toDouble()); putDouble("actualBytes", actualBytes.toDouble()); putDouble("downloadedBytes", downloadedBytes.toDouble())
  putDouble("progress", progress); putDouble("speedBytesPerSecond", speedBps); putDouble("etaSeconds", etaSeconds.toDouble())
  putBoolean("supportsRange", supportsRange == 1); putString("etag", etag); putString("lastModified", lastModified); putString("status", status)
  putString("localUri", localUri); putString("thumbnailUri", thumbnailUri); putDouble("createdAt", createdAt.toDouble())
  startedAt?.let { putDouble("startedAt", it.toDouble()) }; completedAt?.let { putDouble("completedAt", it.toDouble()) }
  putInt("retryCount", retryCount); putString("failureCode", failureCode); putString("failureMessage", failureMessage); putString("hash", contentHash)
  putBoolean("hiddenFromDownloads", hiddenFromDownloads)
  putString("assetId", assetId); putString("variantId", variantId); putString("protocol", protocol); putString("selectionToken", selectionToken)
  putString("videoCodec", videoCodec); putString("audioCodec", audioCodec); putDouble("durationMs", durationMs.toDouble()); putString("audioMode", audioMode)
  putString("flowId", flowId); putString("processingStage", processingStage); putDouble("playbackPositionMs", playbackPositionMs.toDouble()); putDouble("watchedPercent", watchedPercent)
}
