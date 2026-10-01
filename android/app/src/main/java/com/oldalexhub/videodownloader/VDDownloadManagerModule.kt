package com.oldalexhub.videodownloader

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.oldalexhub.videodownloader.download.DownloadDatabase
import com.oldalexhub.videodownloader.download.DownloadRecord
import com.oldalexhub.videodownloader.download.DownloadScheduler
import com.oldalexhub.videodownloader.download.DownloadWorker
import com.oldalexhub.videodownloader.player.PlayerActivity
import org.json.JSONObject
import java.io.File
import java.util.UUID

class VDDownloadManagerModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), ActivityEventListener {
  private val database = DownloadDatabase.get(context)
  private var folderPromise: Promise? = null

  init { context.addActivityEventListener(this) }

  override fun getName() = "VDDownloadManager"

  @ReactMethod
  fun listDownloads(promise: Promise) {
    runCatching {
      Arguments.createArray().apply { database.list().forEach { pushMap(it.toWritableMap()) } }
    }.fold(promise::resolve) { error -> promise.reject("E_DATABASE", error.message, error) }
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
      })
      val maxParallel = payload.int("parallelDownloads", 2).coerceIn(1, 4)
      context.getSharedPreferences("download_settings", 0).edit().putInt("max_parallel", maxParallel).apply()
      requestNotificationPermission()
      DownloadScheduler.enqueue(context, id, payload.boolean("wifiOnly"))
      Telemetry.record(context, "download_started", JSONObject().apply {
        put("title", title)
        put("filename", finalFilename)
        put("sourceHost", runCatching { Uri.parse(sourceUrl).host }.getOrNull())
        put("mediaType", payload.string("mediaType"))
        put("quality", payload.string("qualityLabel"))
        put("estimatedBytes", payload.long("estimatedBytes"))
      })
      id
    }.fold(promise::resolve) { error -> promise.reject("E_ENQUEUE", error.message, error) }
  }

  @ReactMethod
  fun pauseDownload(id: String, promise: Promise) {
    runCatching { DownloadScheduler.pause(context, id); true }
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
      DownloadScheduler.enqueue(context, id, false)
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
      DownloadScheduler.enqueue(context, id, false)
      true
    }.fold(promise::resolve) { error -> promise.reject("E_RESTART", error.message, error) }
  }

  @ReactMethod
  fun cancelDownload(id: String, promise: Promise) {
    runCatching { DownloadScheduler.cancel(context, id); true }
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
          putExtra(PlayerActivity.EXTRA_TITLE, record.title)
          putExtra(PlayerActivity.EXTRA_MIME, record.mimeType)
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
    val activity = currentActivity ?: return promise.reject("E_ACTIVITY", "No Android activity is available")
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
  fun clearBrowserData(kind: String, promise: Promise) {
    runCatching {
      if (kind == "cookies" || kind == "all") CookieManager.getInstance().removeAllCookies(null)
      if (kind == "cache" || kind == "all") WebView(context).apply { clearCache(true); clearHistory(); destroy() }
      if (kind == "all") WebStorage.getInstance().deleteAllData()
      true
    }.fold(promise::resolve) { error -> promise.reject("E_BROWSER_DATA", error.message, error) }
  }

  @ReactMethod
  fun clearAllData(promise: Promise) {
    runCatching {
      database.list().forEach { record -> record.localUri?.let { runCatching { context.contentResolver.delete(Uri.parse(it), null, null) } } }
      database.deleteAll()
      File(context.cacheDir, "download-parts").deleteRecursively()
      CookieManager.getInstance().removeAllCookies(null)
      WebStorage.getInstance().deleteAllData()
      true
    }.fold(promise::resolve) { error -> promise.reject("E_CLEAR_ALL", error.message, error) }
  }

  @ReactMethod
  fun setAnalyticsEnabled(enabled: Boolean, promise: Promise) {
    Telemetry.setEnabled(context, enabled)
    promise.resolve(true)
  }

  @ReactMethod
  fun trackEvent(name: String, properties: ReadableMap, promise: Promise) {
    val json = JSONObject()
    properties.toHashMap().forEach { (key, value) -> if (value is String || value is Number || value is Boolean) json.put(key, value) }
    Telemetry.record(context, name, json)
    promise.resolve(true)
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
      currentActivity?.let { ActivityCompat.requestPermissions(it, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4102) }
    }
  }

  companion object {
    private const val REQUEST_FOLDER = 4101
    private fun sanitizeFilename(value: String): String = value
      .replace(Regex("[<>:\"/\\\\|?*\\u0000-\\u001F]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim().trimEnd('.', ' ').take(160).ifBlank { "download.bin" }
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
}
