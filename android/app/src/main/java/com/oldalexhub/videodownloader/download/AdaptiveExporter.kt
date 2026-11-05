package com.oldalexhub.videodownloader.download

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.util.Clock
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.offline.DownloadHelper
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultDecoderFactory
import androidx.media3.transformer.ExoPlayerAssetLoader
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

@OptIn(UnstableApi::class)
object AdaptiveExporter {
  @Volatile private var mediaCache: SimpleCache? = null

  data class InspectedVariant(
    val width: Int,
    val height: Int,
    val bitrate: Long,
    val videoCodec: String,
    val audioCodec: String,
    val audioLanguage: String?,
    val hasAudio: Boolean,
    val audioMode: String,
    val protected: Boolean,
    val selectionToken: String,
  )

  fun inspect(context: Context, sourceUrl: String, requestHeaders: Map<String, String>, mimeType: String? = null): List<InspectedVariant> {
    val completion = CompletableFuture<List<InspectedVariant>>()
    val helperRef = java.util.concurrent.atomic.AtomicReference<DownloadHelper>()
    Handler(Looper.getMainLooper()).post {
      if (completion.isDone) return@post
      val upstream = DefaultHttpDataSource.Factory()
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(20_000)
        .setReadTimeoutMs(30_000)
        .setDefaultRequestProperties(requestHeaders)
      val mediaItem = MediaItem.Builder()
        .setUri(sourceUrl)
        .setMimeType(mimeType ?: if (sourceUrl.substringBefore('?').endsWith(".mpd", true)) "application/dash+xml" else "application/x-mpegURL")
        .build()
      val helper = DownloadHelper.Factory()
        .setRenderersFactory(DefaultRenderersFactory(context))
        .setDataSourceFactory(upstream)
        .create(mediaItem)
      helperRef.set(helper)
      helper.prepare(object : DownloadHelper.Callback {
        override fun onPrepared(helper: DownloadHelper, tracksInfoAvailable: Boolean) {
          try {
            if (!tracksInfoAvailable) throw IOException("Adaptive tracks are unavailable")
            if (helper.periodCount != 1) throw IOException("Multi-period adaptive streams are not supported")
            data class LocatedFormat(val period: Int, val renderer: Int, val group: Int, val track: Int, val format: Format)
            val videoFormats = mutableListOf<LocatedFormat>()
            val audioFormats = mutableListOf<LocatedFormat>()
            for (period in 0 until helper.periodCount) {
              val mapped = helper.getMappedTrackInfo(period)
              for (renderer in 0 until mapped.rendererCount) {
                val groups = mapped.getTrackGroups(renderer)
                for (groupIndex in 0 until groups.length) {
                  val group = groups[groupIndex]
                  for (trackIndex in 0 until group.length) {
                    val format = group.getFormat(trackIndex)
                    if (mapped.getTrackSupport(renderer, groupIndex, trackIndex) != C.FORMAT_HANDLED) continue
                    when (mapped.getRendererType(renderer)) {
                      C.TRACK_TYPE_VIDEO -> videoFormats += LocatedFormat(period, renderer, groupIndex, trackIndex, format)
                      C.TRACK_TYPE_AUDIO -> audioFormats += LocatedFormat(period, renderer, groupIndex, trackIndex, format)
                    }
                  }
                }
              }
            }
            val selectedAudio = audioFormats.firstOrNull { it.format.selectionFlags and C.SELECTION_FLAG_DEFAULT != 0 } ?: audioFormats.firstOrNull()
            val audio = selectedAudio?.format
            val hasAudio = audio != null
            val audioCodec = audio?.codecs.orEmpty()
            val audioLanguage = audio?.language
            val variants = videoFormats.map { located ->
              val format = located.format
              InspectedVariant(
                width = format.width.takeUnless { it == Format.NO_VALUE } ?: 0,
                height = format.height.takeUnless { it == Format.NO_VALUE } ?: 0,
                bitrate = format.bitrate.takeUnless { it == Format.NO_VALUE }?.toLong() ?: 0L,
                videoCodec = format.codecs.orEmpty(),
                audioCodec = audioCodec,
                audioLanguage = audioLanguage,
                hasAudio = hasAudio,
                audioMode = if (hasAudio) "separate" else "none",
                protected = format.drmInitData != null || audio?.drmInitData != null,
                selectionToken = "period:${located.period}:renderer:${located.renderer}:group:${located.group}:track:${located.track}:height:${format.height.takeUnless { it == Format.NO_VALUE } ?: 0}:fingerprint:${trackFingerprint(format)}:audioRenderer:${selectedAudio?.renderer ?: -1}:audioGroup:${selectedAudio?.group ?: -1}:audioTrack:${selectedAudio?.track ?: -1}:audioFingerprint:${audio?.let(::trackFingerprint) ?: 0}",
              )
            }.distinctBy { listOf(it.width, it.height, it.bitrate, it.videoCodec, it.audioCodec) }
            if (variants.isEmpty()) throw IOException("The manifest has no supported video tracks")
            completion.complete(variants)
          } catch (error: Exception) {
            completion.completeExceptionally(error)
          } finally {
            helperRef.getAndSet(null)?.release()
          }
        }

        override fun onPrepareError(helper: DownloadHelper, e: IOException) {
          helperRef.getAndSet(null)?.release()
          completion.completeExceptionally(e)
        }
      })
    }
    return try {completion.get(15, TimeUnit.SECONDS)} finally {
      if (!completion.isDone) completion.cancel(true)
      Handler(Looper.getMainLooper()).post {helperRef.getAndSet(null)?.release()}
    }
  }

  fun export(
    context: Context,
    record: DownloadRecord,
    output: File,
    stopped: () -> Boolean,
    progress: (Int) -> Unit,
  ): File {
    val headers = headers(record)
    val upstream = DefaultHttpDataSource.Factory()
      .setAllowCrossProtocolRedirects(true)
      .setConnectTimeoutMs(20_000)
      .setReadTimeoutMs(30_000)
      .setDefaultRequestProperties(headers)
    val cacheFactory = CacheDataSource.Factory()
      .setCache(cache(context))
      .setUpstreamDataSourceFactory(upstream)
      .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    val mediaItem = selectTracks(context, record, cacheFactory)
    output.parentFile?.mkdirs()
    if (output.exists()) output.delete()
    val completion = CompletableFuture<File>()
    val transformerRef = arrayOfNulls<Transformer>(1)
    Handler(Looper.getMainLooper()).post {
      val mediaSourceFactory = DefaultMediaSourceFactory(cacheFactory)
      val assetLoader = ExoPlayerAssetLoader.Factory(
        context,
        DefaultDecoderFactory.Builder(context).build(),
        Clock.DEFAULT,
        mediaSourceFactory,
      )
      val transformer = Transformer.Builder(context)
        .setAssetLoaderFactory(assetLoader)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(composition: Composition, result: ExportResult) {
            completion.complete(output)
          }

          override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
            completion.completeExceptionally(exception)
          }
        })
        .build()
      transformerRef[0] = transformer
      transformer.start(mediaItem, output.absolutePath)
    }
    val holder = ProgressHolder()
    while (!completion.isDone) {
      if (stopped()) {
        Handler(Looper.getMainLooper()).post { transformerRef[0]?.cancel() }
        throw IOException("Adaptive export stopped")
      }
      Handler(Looper.getMainLooper()).post {
        val transformer = transformerRef[0] ?: return@post
        if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) progress(holder.progress)
      }
      runCatching { completion.get(500, TimeUnit.MILLISECONDS) }
    }
    return completion.get()
  }

  private fun selectTracks(context: Context, record: DownloadRecord, dataSourceFactory: CacheDataSource.Factory): MediaItem {
    val result = CompletableFuture<MediaItem>()
    val helperRef = java.util.concurrent.atomic.AtomicReference<DownloadHelper>()
    Handler(Looper.getMainLooper()).post {
      if (result.isDone) return@post
      val helper = DownloadHelper.Factory()
        .setRenderersFactory(DefaultRenderersFactory(context))
        .setDataSourceFactory(dataSourceFactory)
        .create(MediaItem.Builder().setUri(record.sourceUrl).setMimeType(if (record.protocol == "dash") "application/dash+xml" else "application/x-mpegURL").build())
      helperRef.set(helper)
      helper.prepare(object : DownloadHelper.Callback {
        override fun onPrepared(helper: DownloadHelper, tracksInfoAvailable: Boolean) {
          try {
            if (!tracksInfoAvailable) throw IOException("Adaptive tracks are unavailable")
            if (helper.periodCount != 1) throw IOException("Multi-period adaptive streams are not supported")
            var hasCompatibleVideo = false
            var hasCompatibleAudio = false
            var hasProtection = false
            for (period in 0 until helper.periodCount) {
              val mapped = helper.getMappedTrackInfo(period)
              for (renderer in 0 until mapped.rendererCount) {
                val groups = mapped.getTrackGroups(renderer)
                for (groupIndex in 0 until groups.length) {
                  val group = groups[groupIndex]
                  for (trackIndex in 0 until group.length) {
                    val format = group.getFormat(trackIndex)
                    if (format.drmInitData != null) hasProtection = true
                    if (mapped.getTrackSupport(renderer, groupIndex, trackIndex) != C.FORMAT_HANDLED) continue
                    if (mapped.getRendererType(renderer) == C.TRACK_TYPE_VIDEO) hasCompatibleVideo = true
                    if (mapped.getRendererType(renderer) == C.TRACK_TYPE_AUDIO) hasCompatibleAudio = true
                  }
                }
              }
            }
            if (hasProtection) throw IOException("Protected adaptive media is not supported")
            if (!hasCompatibleVideo || (record.audioMode != "none" && !hasCompatibleAudio)) throw IOException("No compatible video and audio combination is available")
            val targetHeight = record.resolution?.filter(Char::isDigit)?.toIntOrNull() ?: 0
            val token = parseSelectionToken(record.selectionToken)
            val baseParameters = DownloadHelper.DEFAULT_TRACK_SELECTOR_PARAMETERS.buildUpon().apply {
              if (targetHeight > 0) {
                setMinVideoSize(0, targetHeight)
                setMaxVideoSize(Int.MAX_VALUE, targetHeight)
              }
            }.build()
            for (period in 0 until helper.periodCount) {
              var parameters = baseParameters
              if (token != null && token.period == period) {
                val mapped = helper.getMappedTrackInfo(period)
                if (token.renderer !in 0 until mapped.rendererCount) throw IOException("Selected tracks changed; inspect the source again")
                val groups = mapped.getTrackGroups(token.renderer)
                if (token.group !in 0 until groups.length || token.track !in 0 until groups[token.group].length) throw IOException("Selected tracks changed; inspect the source again")
                val selected = groups[token.group].getFormat(token.track)
                if (token.fingerprint != null && token.fingerprint != trackFingerprint(selected)) throw IOException("Selected video changed; inspect the source again")
                val builder = baseParameters.buildUpon()
                  .setOverrideForType(TrackSelectionOverride(groups[token.group], listOf(token.track)))
                if (token.audioRenderer >= 0) {
                  if (token.audioRenderer !in 0 until mapped.rendererCount) throw IOException("Selected audio changed")
                  val audioGroups = mapped.getTrackGroups(token.audioRenderer)
                  if (token.audioGroup !in 0 until audioGroups.length || token.audioTrack !in 0 until audioGroups[token.audioGroup].length) throw IOException("Selected audio changed")
                  if (token.audioFingerprint != trackFingerprint(audioGroups[token.audioGroup].getFormat(token.audioTrack))) throw IOException("Selected audio changed")
                  builder.setOverrideForType(TrackSelectionOverride(audioGroups[token.audioGroup], listOf(token.audioTrack)))
                }
                if (record.audioMode == "none") builder.setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                parameters = builder.build()
              }
              helper.replaceTrackSelections(period, parameters)
            }
            val request = helper.getDownloadRequest(record.id, null)
            result.complete(request.toMediaItem())
          } catch (error: Exception) {
            result.completeExceptionally(error)
          } finally {
            helperRef.getAndSet(null)?.release()
          }
        }

        override fun onPrepareError(helper: DownloadHelper, e: IOException) {
          helperRef.getAndSet(null)?.release()
          result.completeExceptionally(e)
        }
      })
    }
    return try {result.get(20, TimeUnit.SECONDS)} finally {
      if (!result.isDone) result.cancel(true)
      Handler(Looper.getMainLooper()).post {helperRef.getAndSet(null)?.release()}
    }
  }

  private fun headers(record: DownloadRecord): Map<String, String> {
    val json = runCatching { JSONObject(record.headersJson ?: "{}") }.getOrDefault(JSONObject())
    return buildMap {
      json.keys().forEach { key ->
        val value = json.optString(key)
        if (value.isNotBlank() && !key.equals("Range", true) && !key.equals("Host", true)) put(key, value)
      }
    }
  }

  private fun trackFingerprint(format: Format): Int = listOf(format.id, format.width, format.height, format.bitrate, format.codecs, format.language).joinToString("|").hashCode()

  private data class SelectionToken(val period: Int, val renderer: Int, val group: Int, val track: Int,
    val fingerprint: Int?, val audioRenderer: Int, val audioGroup: Int, val audioTrack: Int, val audioFingerprint: Int?)

  private fun parseSelectionToken(value: String?): SelectionToken? {
    if (value.isNullOrBlank()) return null
    val fields = value.split(':').chunked(2).associate { pair -> pair.first() to pair.getOrElse(1) { "" } }
    return SelectionToken(
      period = fields["period"]?.toIntOrNull() ?: return null,
      renderer = fields["renderer"]?.toIntOrNull() ?: return null,
      group = fields["group"]?.toIntOrNull() ?: return null,
      track = fields["track"]?.toIntOrNull() ?: return null,
      fingerprint = fields["fingerprint"]?.toIntOrNull(),
      audioRenderer = fields["audioRenderer"]?.toIntOrNull() ?: -1,
      audioGroup = fields["audioGroup"]?.toIntOrNull() ?: -1,
      audioTrack = fields["audioTrack"]?.toIntOrNull() ?: -1,
      audioFingerprint = fields["audioFingerprint"]?.toIntOrNull(),
    )
  }

  private fun cache(context: Context): SimpleCache = mediaCache ?: synchronized(this) {
    mediaCache ?: SimpleCache(
      File(context.filesDir, "adaptive-media-cache"),
      LeastRecentlyUsedCacheEvictor(512L * 1024 * 1024),
      StandaloneDatabaseProvider(context),
    ).also { mediaCache = it }
  }
}
