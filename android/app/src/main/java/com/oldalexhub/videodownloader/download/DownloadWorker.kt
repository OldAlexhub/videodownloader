package com.oldalexhub.videodownloader.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import androidx.documentfile.provider.DocumentFile
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.oldalexhub.videodownloader.Telemetry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLDecoder
import java.security.MessageDigest
import java.util.Locale
import kotlin.math.max

class DownloadWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  private val database = DownloadDatabase.get(context)
  private val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private val id = inputData.getString(DownloadScheduler.INPUT_ID).orEmpty()

  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    if (id.isBlank()) return@withContext Result.failure()
    createChannel()
    val initial = database.get(id) ?: return@withContext Result.failure()
    if (initial.status == "cancelled" || initial.status == "completed") return@withContext Result.success()

    val maxParallel = applicationContext.getSharedPreferences("download_settings", Context.MODE_PRIVATE)
      .getInt("max_parallel", 2).coerceIn(1, 4)
    synchronized(slotLock) {
      if (database.activeCount() >= maxParallel) return@withContext Result.retry()
      database.update(id, ContentValues().apply {
        put("status", "preparing")
        if (initial.startedAt == null) put("started_at", System.currentTimeMillis())
        putNull("failure_code")
        putNull("failure_message")
      })
    }
    setForeground(foregroundInfo(initial, 0, "Preparing", false))

    try {
      val record = database.get(id) ?: return@withContext Result.failure()
      val resultFile = when {
        record.extension.equals("m3u8", true) || record.mimeType.contains("mpegurl", true) -> downloadHls(record)
        record.extension.equals("mpd", true) || record.mimeType.contains("dash", true) -> downloadDash(record)
        else -> downloadHttp(record, record.sourceUrl)
      }
      ensureNotStopped()
      database.update(id, ContentValues().apply { put("status", "processing") })
      setForeground(foregroundInfo(database.get(id) ?: record, 100, "Saving to device", false))
      val current = database.get(id) ?: record
      val hash = sha256(resultFile)
      val output = saveToDestination(current, resultFile)
      database.update(id, ContentValues().apply {
        put("status", "completed")
        put("local_uri", output.uri.toString())
        put("final_filename", output.name)
        put("actual_bytes", resultFile.length())
        put("downloaded_bytes", resultFile.length())
        put("progress", 100.0)
        put("speed_bps", 0.0)
        put("eta_seconds", 0)
        put("completed_at", System.currentTimeMillis())
        put("content_hash", hash)
      })
      val finished = database.get(id) ?: current
      Telemetry.record(applicationContext, "download_completed", JSONObject().apply {
        put("title", finished.title)
        put("filename", finished.finalFilename)
        put("sourceHost", runCatching { Uri.parse(finished.sourceUrl).host }.getOrNull())
        put("mediaType", finished.mediaType)
        put("quality", finished.qualityLabel.orEmpty())
        put("bytes", resultFile.length())
        put("durationMs", System.currentTimeMillis() - (finished.startedAt ?: finished.createdAt))
      })
      resultFile.delete()
      stateFile(applicationContext, id).delete()
      showCompleted(database.get(id) ?: current)
      Result.success()
    } catch (_: StoppedDownload) {
      Result.success()
    } catch (error: DownloadFailure) {
      fail(error.code, error.message ?: "The download could not be completed.")
      Result.failure()
    } catch (error: IOException) {
      val current = database.get(id)
      val retries = (current?.retryCount ?: 0) + 1
      if (!isStopped && retries <= 3 && current?.autoResume != false && current?.status != "paused" && current?.status != "cancelled") {
        database.update(id, ContentValues().apply {
          put("status", "retrying")
          put("retry_count", retries)
          put("failure_message", "Your internet connection was interrupted. Retrying safely.")
          put("speed_bps", 0)
        })
        Result.retry()
      } else {
        val message = if (error.message?.contains("ENOSPC", true) == true) "Not enough storage space." else "Your internet connection was interrupted."
        fail("network_or_storage", message)
        Result.failure()
      }
    } catch (error: Exception) {
      fail("unexpected", error.message ?: "The download could not be completed.")
      Result.failure()
    }
  }

  private suspend fun downloadHttp(record: DownloadRecord, sourceUrl: String): File {
    val target = partFile(applicationContext, id)
    target.parentFile?.mkdirs()
    var existing = target.length()
    var connection = openConnection(sourceUrl, record, existing, "GET")
    var response = connection.responseCode
    if (response == 416 && record.estimatedBytes > 0 && existing == record.estimatedBytes) return target
    if (existing > 0 && response == HttpURLConnection.HTTP_OK) {
      connection.disconnect()
      database.update(id, ContentValues().apply {
        put("supports_range", 0)
        put("status", "failed")
        put("failure_code", "resume_required")
        put("failure_message", "This server does not support resumable downloads. Restart confirmation is required.")
      })
      throw DownloadFailure("resume_required", "This download cannot be resumed and must restart.")
    }
    if (response !in 200..299) {
      val message = when (response) {
        401, 403 -> "The source server rejected the download. The page session may have expired."
        404, 410 -> "This file no longer exists at the source."
        else -> "The source server rejected the download (HTTP $response)."
      }
      connection.disconnect()
      throw DownloadFailure("http_$response", message)
    }

    val responseEtag = connection.getHeaderField("ETag")
    val responseModified = connection.getHeaderField("Last-Modified")
    if (existing > 0 && record.etag != null && responseEtag != null && record.etag != responseEtag) {
      connection.disconnect()
      throw DownloadFailure("source_changed", "The source file changed, so the partial download cannot be resumed safely.")
    }
    if (existing > 0 && record.lastModified != null && responseModified != null && record.lastModified != responseModified) {
      connection.disconnect()
      throw DownloadFailure("source_changed", "The source file changed, so the partial download cannot be resumed safely.")
    }
    val contentRangeTotal = connection.getHeaderField("Content-Range")?.substringAfterLast('/')?.toLongOrNull()
    val responseLength = connection.contentLengthLong.coerceAtLeast(0)
    val expected = contentRangeTotal ?: if (responseLength > 0) existing + responseLength else record.estimatedBytes
    val supports = response == HttpURLConnection.HTTP_PARTIAL || connection.getHeaderField("Accept-Ranges")?.contains("bytes", true) == true
    val responseMime = connection.contentType?.substringBefore(';')?.trim()?.takeIf { it.contains('/') }
    val dispositionName = contentDispositionFilename(connection.getHeaderField("Content-Disposition"))
    val reliableExtension = dispositionName?.substringAfterLast('.', "")?.filter { it.isLetterOrDigit() }?.take(8)?.lowercase()
      ?.takeIf { it.isNotBlank() } ?: responseMime?.let(::extensionForMime)
    database.update(id, ContentValues().apply {
      put("status", "downloading")
      put("supports_range", if (supports) 1 else 0)
      if (expected > 0) put("estimated_bytes", expected)
      responseEtag?.let { put("etag", it) }
      responseModified?.let { put("last_modified", it) }
      responseMime?.let { put("mime_type", it) }
      reliableExtension?.let {
        put("extension", it)
        put("final_filename", replaceExtension(record.finalFilename, it))
      }
      dispositionName?.let { put("original_filename", it) }
    })

    RandomAccessFile(target, "rw").use { output ->
      if (existing == 0L) output.setLength(0)
      output.seek(existing)
      BufferedInputStream(connection.inputStream, BUFFER_SIZE).use { input ->
        val buffer = ByteArray(BUFFER_SIZE)
        var lastUpdate = System.currentTimeMillis()
        var lastBytes = existing
        var rollingSpeed = 0.0
        while (true) {
          ensureNotStopped()
          val count = input.read(buffer)
          if (count < 0) break
          output.write(buffer, 0, count)
          existing += count
          val now = System.currentTimeMillis()
          if (now - lastUpdate >= 500) {
            val instant = (existing - lastBytes) * 1000.0 / max(1L, now - lastUpdate)
            rollingSpeed = if (rollingSpeed == 0.0) instant else rollingSpeed * 0.65 + instant * 0.35
            updateProgress(existing, expected, rollingSpeed)
            lastBytes = existing
            lastUpdate = now
          }
        }
        updateProgress(existing, expected.takeIf { it > 0 } ?: existing, rollingSpeed)
      }
    }
    connection.disconnect()
    if (expected > 0 && target.length() != expected) {
      throw IOException("Connection ended before all bytes were received")
    }
    return target
  }

  private suspend fun downloadHls(record: DownloadRecord): File {
    var manifestUrl = record.sourceUrl
    var manifest = fetchText(manifestUrl, record)
    if (manifest.contains("#EXT-X-KEY", true) && !manifest.contains("METHOD=NONE", true)) {
      throw DownloadFailure("protected_media", "Protected media cannot be downloaded.")
    }
    if (manifest.contains("#EXT-X-STREAM-INF", true)) {
      val variants = parseMasterPlaylist(manifest, manifestUrl)
      val chosen = if (record.heightValue() > 0) {
        variants.minByOrNull { kotlin.math.abs(it.height - record.heightValue()) }
      } else variants.maxByOrNull { it.bandwidth }
      manifestUrl = chosen?.url ?: throw DownloadFailure("invalid_manifest", "This media source is not supported.")
      manifest = fetchText(manifestUrl, record)
    }
    if (manifest.contains("#EXT-X-KEY", true) && !manifest.contains("METHOD=NONE", true)) {
      throw DownloadFailure("protected_media", "Protected media cannot be downloaded.")
    }
    if (!manifest.contains("#EXT-X-ENDLIST")) {
      throw DownloadFailure("live_stream", "Live or expiring streams cannot be saved reliably.")
    }
    val segments = parseMediaPlaylist(manifest, manifestUrl)
    if (segments.isEmpty()) throw DownloadFailure("invalid_manifest", "The media playlist did not contain downloadable segments.")
    val target = partFile(applicationContext, id)
    target.parentFile?.mkdirs()
    var index = stateFile(applicationContext, id).takeIf { it.exists() }?.readText()?.toIntOrNull() ?: 0
    if (index == 0) target.delete()
    database.update(id, ContentValues().apply {
      put("status", "downloading")
      put("supports_range", 1)
      put("estimated_bytes", segments.size.toLong())
      put("downloaded_bytes", index.toLong())
    })
    FileOutputStream(target, index > 0).use { output ->
      for (position in index until segments.size) {
        ensureNotStopped()
        val segment = segments[position]
        val connection = openConnection(segment.url, record, 0, "GET", segment.rangeStart, segment.rangeLength)
        val code = connection.responseCode
        if (code !in 200..299) {
          connection.disconnect()
          throw IOException("Segment request failed with HTTP $code")
        }
        connection.inputStream.use { input -> input.copyTo(output, BUFFER_SIZE) }
        connection.disconnect()
        index = position + 1
        stateFile(applicationContext, id).writeText(index.toString())
        val progress = index * 100.0 / segments.size
        database.update(id, ContentValues().apply {
          put("downloaded_bytes", index.toLong())
          put("progress", progress)
        })
        setForeground(foregroundInfo(database.get(id) ?: record, progress.toInt(), "Downloading", false))
      }
    }
    val usesMap = manifest.contains("#EXT-X-MAP", true)
    database.update(id, ContentValues().apply {
      put("mime_type", if (usesMap) "video/mp4" else "video/mp2t")
      put("extension", if (usesMap) "mp4" else "ts")
      put("final_filename", replaceExtension(record.finalFilename, if (usesMap) "mp4" else "ts"))
      put("estimated_bytes", target.length())
      put("downloaded_bytes", target.length())
    })
    return target
  }

  private suspend fun downloadDash(record: DownloadRecord): File {
    val manifest = fetchText(record.sourceUrl, record)
    if (manifest.contains("ContentProtection", true)) {
      throw DownloadFailure("protected_media", "Protected media cannot be downloaded.")
    }
    if (manifest.contains("SegmentTemplate", true) || manifest.contains("SegmentList", true)) {
      throw DownloadFailure("unsupported_dash", "This adaptive DASH layout cannot be packaged safely on this device.")
    }
    val base = Regex("<BaseURL[^>]*>([^<]+)</BaseURL>", RegexOption.IGNORE_CASE).find(manifest)?.groupValues?.get(1)?.trim()
      ?: throw DownloadFailure("invalid_manifest", "This media source is not supported.")
    val direct = URI(record.sourceUrl).resolve(base).toString()
    database.update(id, ContentValues().apply {
      put("mime_type", "video/mp4")
      put("extension", "mp4")
      put("final_filename", replaceExtension(record.finalFilename, "mp4"))
    })
    return downloadHttp(database.get(id) ?: record, direct)
  }

  private fun openConnection(
    source: String,
    record: DownloadRecord,
    existing: Long,
    method: String,
    rangeStart: Long? = null,
    rangeLength: Long? = null,
  ): HttpURLConnection {
    var current = source
    repeat(MAX_REDIRECTS + 1) { redirectCount ->
      val connection = URL(current).openConnection() as HttpURLConnection
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 20_000
      connection.readTimeout = 30_000
      connection.requestMethod = method
      connection.setRequestProperty("Accept-Encoding", "identity")
      applyHeaders(connection, record)
      when {
        rangeStart != null && rangeLength != null -> connection.setRequestProperty("Range", "bytes=$rangeStart-${rangeStart + rangeLength - 1}")
        existing > 0 -> {
          connection.setRequestProperty("Range", "bytes=$existing-")
          val validator = record.etag ?: record.lastModified
          if (validator != null) connection.setRequestProperty("If-Range", validator)
        }
      }
      val code = connection.responseCode
      if (code !in 300..399) return connection
      val location = connection.getHeaderField("Location")
      connection.disconnect()
      if (location.isNullOrBlank()) throw DownloadFailure("redirect", "The source returned an invalid redirect.")
      if (redirectCount >= MAX_REDIRECTS) throw DownloadFailure("redirect", "The source redirected too many times.")
      current = URI(current).resolve(location).toString()
    }
    throw DownloadFailure("redirect", "The source redirected too many times.")
  }

  private fun applyHeaders(connection: HttpURLConnection, record: DownloadRecord) {
    val headers = runCatching { JSONObject(record.headersJson ?: "{}") }.getOrDefault(JSONObject())
    headers.keys().forEach { key ->
      val value = headers.optString(key)
      if (value.isNotBlank() && !key.equals("Range", true) && !key.equals("Host", true)) connection.setRequestProperty(key, value)
    }
    if (connection.getRequestProperty("Referer").isNullOrBlank() && record.pageUrl.isNotBlank()) connection.setRequestProperty("Referer", record.pageUrl)
  }

  private fun fetchText(url: String, record: DownloadRecord): String {
    val connection = openConnection(url, record, 0, "GET")
    if (connection.responseCode !in 200..299) {
      val code = connection.responseCode
      connection.disconnect()
      throw DownloadFailure("manifest_http_$code", "The media manifest expired or could not be loaded.")
    }
    val text = connection.inputStream.bufferedReader().use { it.readText() }
    connection.disconnect()
    return text
  }

  private suspend fun updateProgress(downloaded: Long, expected: Long, speed: Double) {
    val progress = if (expected > 0) (downloaded * 100.0 / expected).coerceIn(0.0, 100.0) else 0.0
    val eta = if (speed > 0 && expected > downloaded) ((expected - downloaded) / speed).toLong() else 0
    database.update(id, ContentValues().apply {
      put("downloaded_bytes", downloaded)
      put("progress", progress)
      put("speed_bps", speed)
      put("eta_seconds", eta)
      put("status", "downloading")
    })
    setProgress(workDataOf("progress" to progress, "downloaded" to downloaded))
    setForeground(foregroundInfo(database.get(id) ?: return, progress.toInt(), "Downloading", false))
  }

  private fun saveToDestination(record: DownloadRecord, file: File): SavedOutput {
    val name = uniqueName(record.finalFilename, record.destinationUri)
    if (!record.destinationUri.isNullOrBlank()) {
      val tree = DocumentFile.fromTreeUri(applicationContext, Uri.parse(record.destinationUri))
        ?: throw DownloadFailure("destination", "The selected destination cannot be written to.")
      val document = tree.createFile(record.mimeType, name)
        ?: throw DownloadFailure("destination", "The selected destination cannot be written to.")
      applicationContext.contentResolver.openOutputStream(document.uri, "w")?.use { output ->
        file.inputStream().use { input -> input.copyTo(output, BUFFER_SIZE) }
      } ?: throw DownloadFailure("destination", "The selected destination cannot be written to.")
      return SavedOutput(document.uri, document.name ?: name)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val collection = when (record.mediaType) {
        "audio" -> MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        "image" -> MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        else -> MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      }
      val folder = when (record.mediaType) {
        "audio" -> "Audio"
        "image" -> "Images"
        else -> "Videos"
      }
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, record.mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/Video Downloader & Media Saver/$folder")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val uri = applicationContext.contentResolver.insert(collection, values)
        ?: throw DownloadFailure("storage", "The selected destination cannot be written to.")
      try {
        applicationContext.contentResolver.openOutputStream(uri, "w")?.use { output ->
          file.inputStream().use { input -> input.copyTo(output, BUFFER_SIZE) }
        } ?: throw IOException("Unable to open MediaStore output")
        applicationContext.contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      } catch (error: Exception) {
        applicationContext.contentResolver.delete(uri, null, null)
        throw error
      }
      return SavedOutput(uri, name)
    }
    val directory = File(applicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), record.mediaType.replaceFirstChar { it.uppercase() })
    directory.mkdirs()
    val output = File(directory, name)
    file.copyTo(output, overwrite = false)
    return SavedOutput(FileProvider.getUriForFile(applicationContext, "${applicationContext.packageName}.files", output), output.name)
  }

  private fun uniqueName(requested: String, destination: String?): String {
    val dot = requested.lastIndexOf('.')
    val base = if (dot > 0) requested.substring(0, dot) else requested
    val suffix = if (dot > 0) requested.substring(dot) else ""
    fun exists(name: String): Boolean {
      if (!destination.isNullOrBlank()) return DocumentFile.fromTreeUri(applicationContext, Uri.parse(destination))?.findFile(name) != null
      return database.list().any { it.status == "completed" && it.finalFilename.equals(name, true) }
    }
    if (!exists(requested)) return requested
    var index = 1
    while (exists("$base ($index)$suffix")) index++
    return "$base ($index)$suffix"
  }

  private fun ensureNotStopped() {
    val status = database.get(id)?.status
    if (isStopped || status == "paused" || status == "cancelled") throw StoppedDownload()
  }

  private fun fail(code: String, message: String) {
    val status = database.get(id)?.status
    if (status == "paused" || status == "cancelled") return
    database.update(id, ContentValues().apply {
      put("status", "failed")
      put("failure_code", code)
      put("failure_message", message)
      put("speed_bps", 0)
      put("eta_seconds", 0)
    })
    database.get(id)?.let { record ->
      Telemetry.record(applicationContext, "download_failed", JSONObject().apply {
        put("title", record.title)
        put("filename", record.finalFilename)
        put("sourceHost", runCatching { Uri.parse(record.sourceUrl).host }.getOrNull())
        put("mediaType", record.mediaType)
        put("quality", record.qualityLabel.orEmpty())
        put("failureCode", code)
        put("downloadedBytes", record.downloadedBytes)
        put("durationMs", System.currentTimeMillis() - (record.startedAt ?: record.createdAt))
      })
    }
    notificationManager.cancel(notificationId(id))
  }

  private fun foregroundInfo(record: DownloadRecord, progress: Int, state: String, paused: Boolean): ForegroundInfo {
    val openIntent = applicationContext.packageManager.getLaunchIntentForPackage(applicationContext.packageName)
    val contentIntent = PendingIntent.getActivity(applicationContext, notificationId(id), openIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val pauseIntent = PendingIntent.getBroadcast(applicationContext, notificationId(id) + 1, Intent(applicationContext, DownloadActionReceiver::class.java).apply { action = DownloadActionReceiver.ACTION_PAUSE; putExtra(DownloadActionReceiver.EXTRA_ID, id) }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val cancelIntent = PendingIntent.getBroadcast(applicationContext, notificationId(id) + 2, Intent(applicationContext, DownloadActionReceiver::class.java).apply { action = DownloadActionReceiver.ACTION_CANCEL; putExtra(DownloadActionReceiver.EXTRA_ID, id) }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(record.title)
      .setContentText(if (record.speedBps > 0) "$state · ${humanSpeed(record.speedBps)}" else state)
      .setContentIntent(contentIntent)
      .setOnlyAlertOnce(true)
      .setOngoing(!paused)
      .setProgress(100, progress.coerceIn(0, 100), record.estimatedBytes <= 0)
      .addAction(0, "Pause", pauseIntent)
      .addAction(0, "Cancel", cancelIntent)
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(notificationId(id), notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else ForegroundInfo(notificationId(id), notification)
  }

  private fun showCompleted(record: DownloadRecord) {
    val intent = applicationContext.packageManager.getLaunchIntentForPackage(applicationContext.packageName)
    val pending = PendingIntent.getActivity(applicationContext, notificationId(id), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download_done)
      .setContentTitle("Download complete")
      .setContentText(record.finalFilename)
      .setContentIntent(pending)
      .setAutoCancel(true)
      .setGroup("completed-downloads")
      .build()
    notificationManager.notify(notificationId(id), notification)
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      notificationManager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Download progress and controls"
      })
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(BUFFER_SIZE)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private data class SavedOutput(val uri: Uri, val name: String)
  private data class HlsVariant(val url: String, val height: Int, val bandwidth: Long)
  private data class HlsSegment(val url: String, val rangeStart: Long?, val rangeLength: Long?)
  private class StoppedDownload : RuntimeException()
  private class DownloadFailure(val code: String, message: String) : RuntimeException(message)

  companion object {
    private const val BUFFER_SIZE = 128 * 1024
    private const val MAX_REDIRECTS = 8
    private const val CHANNEL_ID = "media_downloads"
    private val slotLock = Any()

    fun partFile(context: Context, id: String): File = File(File(context.cacheDir, "download-parts"), "$id.part")
    fun stateFile(context: Context, id: String): File = File(File(context.cacheDir, "download-parts"), "$id.state")
    private fun notificationId(id: String) = id.hashCode() and 0x7fffffff
    private fun humanSpeed(value: Double): String {
      val units = arrayOf("B/s", "KB/s", "MB/s", "GB/s")
      var speed = value
      var index = 0
      while (speed >= 1024 && index < units.lastIndex) { speed /= 1024; index++ }
      return String.format(Locale.US, if (speed >= 10) "%.0f %s" else "%.1f %s", speed, units[index])
    }
    private fun replaceExtension(name: String, extension: String): String = "${name.substringBeforeLast('.', name)}.$extension"
    private fun extensionForMime(mime: String): String? = when (mime.lowercase()) {
      "video/mp4" -> "mp4"
      "video/webm" -> "webm"
      "video/quicktime" -> "mov"
      "audio/mpeg" -> "mp3"
      "audio/mp4", "audio/x-m4a" -> "m4a"
      "audio/aac" -> "aac"
      "audio/ogg", "video/ogg" -> "ogg"
      "image/jpeg" -> "jpg"
      "image/png" -> "png"
      "image/webp" -> "webp"
      else -> null
    }
    private fun contentDispositionFilename(value: String?): String? {
      if (value.isNullOrBlank()) return null
      val encoded = Regex("filename\\*=UTF-8''([^;]+)", RegexOption.IGNORE_CASE).find(value)?.groupValues?.get(1)
      if (encoded != null) return runCatching { URLDecoder.decode(encoded, "UTF-8") }.getOrNull()?.substringAfterLast('/')?.substringAfterLast('\\')
      return Regex("filename=\"([^\"]+)\"|filename=([^;]+)", RegexOption.IGNORE_CASE).find(value)?.let {
        (it.groupValues[1].ifBlank { it.groupValues[2] }).trim().trim('"').substringAfterLast('/').substringAfterLast('\\')
      }
    }
    private fun DownloadRecord.heightValue(): Int = resolution?.filter { it.isDigit() }?.toIntOrNull() ?: 0

    private fun parseMasterPlaylist(text: String, base: String): List<HlsVariant> {
      val lines = text.lines().map { it.trim() }
      val result = mutableListOf<HlsVariant>()
      lines.forEachIndexed { index, line ->
        if (line.startsWith("#EXT-X-STREAM-INF", true)) {
          val attrs = line.substringAfter(':')
          val bandwidth = Regex("BANDWIDTH=(\\d+)", RegexOption.IGNORE_CASE).find(attrs)?.groupValues?.get(1)?.toLongOrNull() ?: 0
          val height = Regex("RESOLUTION=\\d+x(\\d+)", RegexOption.IGNORE_CASE).find(attrs)?.groupValues?.get(1)?.toIntOrNull() ?: 0
          val path = lines.drop(index + 1).firstOrNull { it.isNotBlank() && !it.startsWith('#') }
          if (path != null) result += HlsVariant(URI(base).resolve(path).toString(), height, bandwidth)
        }
      }
      return result.distinctBy { it.url }
    }

    private fun parseMediaPlaylist(text: String, base: String): List<HlsSegment> {
      val result = mutableListOf<HlsSegment>()
      var rangeLength: Long? = null
      var rangeOffset: Long? = null
      var nextOffset = 0L
      text.lines().map { it.trim() }.forEach { line ->
        when {
          line.startsWith("#EXT-X-MAP", true) -> {
            val uri = Regex("URI=\"([^\"]+)\"", RegexOption.IGNORE_CASE).find(line)?.groupValues?.get(1)
            val range = Regex("BYTERANGE=\"(\\d+)(?:@(\\d+))?\"", RegexOption.IGNORE_CASE).find(line)
            if (uri != null) result += HlsSegment(URI(base).resolve(uri).toString(), range?.groupValues?.get(2)?.toLongOrNull(), range?.groupValues?.get(1)?.toLongOrNull())
          }
          line.startsWith("#EXT-X-BYTERANGE", true) -> {
            val match = Regex("(\\d+)(?:@(\\d+))?").find(line.substringAfter(':'))
            rangeLength = match?.groupValues?.get(1)?.toLongOrNull()
            rangeOffset = match?.groupValues?.get(2)?.toLongOrNull() ?: nextOffset
          }
          line.isNotBlank() && !line.startsWith('#') -> {
            result += HlsSegment(URI(base).resolve(line).toString(), rangeOffset, rangeLength)
            if (rangeOffset != null && rangeLength != null) nextOffset = rangeOffset!! + rangeLength!!
            rangeLength = null
            rangeOffset = null
          }
        }
      }
      return result
    }
  }
}
