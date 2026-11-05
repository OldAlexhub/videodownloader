package com.oldalexhub.videodownloader.download

import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.IOException

data class VerifiedMedia(val video: Boolean, val audio: Boolean, val durationMs: Long, val width: Int, val height: Int)

object MediaVerifier {
  fun inspectImage(source: String, headers: Map<String, String>): VerifiedMedia {
    val connection = (java.net.URL(source).openConnection() as java.net.HttpURLConnection).apply {
      connectTimeout = 8000; readTimeout = 8000
      headers.forEach { (key, value) -> setRequestProperty(key, value) }
    }
    try {
      if (connection.responseCode !in 200..299) throw IOException("Image source unavailable")
      val bytes = connection.inputStream.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
          if (Thread.currentThread().isInterrupted) throw IOException("Inspection cancelled")
          val count = input.read(buffer)
          if (count < 0) break
          if (output.size() + count > 16 * 1024 * 1024) throw IOException("Image exceeds inspection limit")
          output.write(buffer, 0, count)
        }
        output.toByteArray()
      }
      val options = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
      android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
      if (options.outWidth <= 0 || options.outHeight <= 0) throw IOException("No readable image")
      return VerifiedMedia(false, false, 0, options.outWidth, options.outHeight)
    } finally { connection.disconnect() }
  }

  fun inspect(source: String, headers: Map<String, String> = emptyMap()): VerifiedMedia {
    val extractor = MediaExtractor()
    try {
      if (headers.isEmpty()) extractor.setDataSource(source) else extractor.setDataSource(source, headers)
      var video = false; var audio = false; var duration = 0L; var width = 0; var height = 0
      for (index in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(index)
        val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
        if (mime.startsWith("video/")) {
          video = true
          if (format.containsKey(MediaFormat.KEY_WIDTH)) width = maxOf(width, format.getInteger(MediaFormat.KEY_WIDTH))
          if (format.containsKey(MediaFormat.KEY_HEIGHT)) height = maxOf(height, format.getInteger(MediaFormat.KEY_HEIGHT))
        }
        if (mime.startsWith("audio/")) audio = true
        if (format.containsKey(MediaFormat.KEY_DURATION)) duration = maxOf(duration, format.getLong(MediaFormat.KEY_DURATION) / 1000)
      }
      if (!video && !audio) throw IOException("No readable media tracks")
      return VerifiedMedia(video, audio, duration, width, height)
    } finally {extractor.release()}
  }

  fun verify(file: File, mediaType: String, audioMode: String, expectedDurationMs: Long): VerifiedMedia? {
    if (file.length() == 0L) throw IOException("The downloaded file is empty")
    if (mediaType == "image") {
      val options = android.graphics.BitmapFactory.Options().apply {inJustDecodeBounds = true}
      android.graphics.BitmapFactory.decodeFile(file.absolutePath, options)
      if (options.outWidth <= 0 || options.outHeight <= 0) throw IOException("The image cannot be decoded")
      return null
    }
    val media = inspect(file.absolutePath)
    requireTracks(media, mediaType, audioMode, expectedDurationMs)
    // Verify actual samples and seeking, not merely a plausible header.
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(file.absolutePath)
      val buffer = java.nio.ByteBuffer.allocate(4 * 1024 * 1024)
      for (index in 0 until extractor.trackCount) {
        val mime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME).orEmpty()
        if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue
        extractor.selectTrack(index)
        extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
        if (extractor.readSampleData(buffer, 0) <= 0) throw IOException("The media track contains no readable samples")
        if (media.durationMs > 2000) {
          extractor.seekTo(media.durationMs * 500, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
          if (extractor.readSampleData(buffer, 0) <= 0) throw IOException("The media file cannot be seeked")
        }
        extractor.unselectTrack(index)
      }
    } finally {extractor.release()}
    return media
  }

  fun requireTracks(media: VerifiedMedia, mediaType: String, audioMode: String, expectedDurationMs: Long) {
    if (mediaType == "video" && !media.video) throw IOException("The downloaded file has no video track")
    if ((mediaType == "audio" || audioMode in setOf("muxed", "separate")) && !media.audio) throw IOException("The expected audio track is missing")
    if (media.durationMs <= 0) throw IOException("The media duration could not be verified")
    if (expectedDurationMs > 0 && kotlin.math.abs(media.durationMs - expectedDurationMs) > maxOf(3000L, expectedDurationMs / 20)) throw IOException("The downloaded duration does not match the selected video")
  }
}
