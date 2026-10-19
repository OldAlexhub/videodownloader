package com.oldalexhub.videodownloader.player

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.os.SystemClock
import android.content.ContentValues
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.ViewCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.oldalexhub.videodownloader.Telemetry
import com.oldalexhub.videodownloader.download.DownloadDatabase
import org.json.JSONObject

class PlayerActivity : AppCompatActivity() {
  private lateinit var playerView: PlayerView
  private var player: ExoPlayer? = null
  private var position = 0L
  private var playWhenReady = true
  private var activeSince = 0L
  private var watchedMs = 0L
  private var pauseCount = 0
  private var seekCount = 0
  private var bufferCount = 0
  private var summaryFlushed = false
  private var lastPlaybackState = Player.STATE_IDLE
  private var mediaType = "unknown"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    hideSystemBars()
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    playerView = PlayerView(this).apply {
      useController = true
      controllerAutoShow = true
      setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
      setShowSubtitleButton(true)
      setShowFastForwardButton(true)
      setShowRewindButton(true)
      setFullscreenButtonClickListener { fullScreen ->
        requestedOrientation = if (fullScreen) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
      }
    }
    setContentView(playerView)
    ViewCompat.setOnApplyWindowInsetsListener(playerView) { view, insets ->
      val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
      insets
    }
    position = savedInstanceState?.getLong(STATE_POSITION) ?: intent.getLongExtra(EXTRA_POSITION, 0L)
    playWhenReady = savedInstanceState?.getBoolean(STATE_PLAYING) ?: true
    watchedMs = savedInstanceState?.getLong(STATE_WATCHED) ?: 0L
    mediaType = intent.getStringExtra(EXTRA_MIME).orEmpty().substringBefore('/').ifBlank { "unknown" }
    Telemetry.record(this, "player_opened", JSONObject().apply { put("mediaType", mediaType) })
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  private fun hideSystemBars() {
    WindowInsetsControllerCompat(window, window.decorView).apply {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.systemBars())
    }
  }

  override fun onStart() {
    super.onStart()
    initializePlayer()
  }

  override fun onStop() {
    flushPlayback("background")
    persistPlayback()
    releasePlayer()
    super.onStop()
  }

  override fun onSaveInstanceState(outState: Bundle) {
    outState.putLong(STATE_POSITION, player?.currentPosition ?: position)
    outState.putBoolean(STATE_PLAYING, player?.playWhenReady ?: playWhenReady)
    accrueWatched()
    outState.putLong(STATE_WATCHED, watchedMs)
    super.onSaveInstanceState(outState)
  }

  private fun initializePlayer() {
    if (player != null) return
    val uri = intent.getStringExtra(EXTRA_URI) ?: return finish()
    player = ExoPlayer.Builder(this)
      .setWakeMode(C.WAKE_MODE_LOCAL)
      .setHandleAudioBecomingNoisy(true)
      .build().also { exoPlayer ->
      playerView.player = exoPlayer
      exoPlayer.setMediaItem(MediaItem.fromUri(uri))
      exoPlayer.seekTo(position)
      exoPlayer.playWhenReady = playWhenReady
      exoPlayer.repeatMode = Player.REPEAT_MODE_OFF
      exoPlayer.addListener(object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
          if (isPlaying) {
            if (activeSince == 0L) activeSince = SystemClock.elapsedRealtime()
          } else {
            accrueWatched()
            if (exoPlayer.playbackState == Player.STATE_READY && !exoPlayer.playWhenReady) pauseCount++
            persistPlayback()
          }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
          if (playbackState == Player.STATE_BUFFERING && lastPlaybackState != Player.STATE_BUFFERING) bufferCount++
          lastPlaybackState = playbackState
          if (playbackState == Player.STATE_ENDED) {
            persistPlayback()
            flushPlayback("ended")
          }
        }

        override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
          if (reason == Player.DISCONTINUITY_REASON_SEEK) seekCount++
        }
      })
      exoPlayer.prepare()
    }
  }

  private fun releasePlayer() {
    player?.let {
      position = it.currentPosition
      playWhenReady = it.playWhenReady
      it.release()
    }
    player = null
    playerView.player = null
  }

  private fun accrueWatched() {
    if (activeSince == 0L) return
    watchedMs += (SystemClock.elapsedRealtime() - activeSince).coerceAtLeast(0)
    activeSince = 0L
  }

  private fun persistPlayback() {
    val id = intent.getStringExtra(EXTRA_DOWNLOAD_ID) ?: return
    val currentPosition = player?.currentPosition ?: position
    val duration = player?.duration?.takeIf { it > 0 } ?: 0L
    DownloadDatabase.get(this).update(id, ContentValues().apply {
      put("playback_position_ms", currentPosition)
      put("watched_percent", if (duration > 0) (currentPosition.toDouble() / duration * 100).coerceIn(0.0, 100.0) else 0.0)
    })
  }

  private fun flushPlayback(reason: String) {
    if (summaryFlushed && reason != "ended") return
    accrueWatched()
    val current = player?.currentPosition ?: position
    val duration = player?.duration?.takeIf { it > 0 } ?: 0L
    Telemetry.record(this, "native_playback_summary", JSONObject().apply {
      put("mediaType", mediaType)
      put("durationMs", duration)
      put("activeWatchedMs", watchedMs)
      put("completionPercent", if (duration > 0) (current.toDouble() / duration * 100).coerceIn(0.0, 100.0) else 0.0)
      put("pauseCount", pauseCount)
      put("seekCount", seekCount)
      put("bufferCount", bufferCount)
      put("speed", player?.playbackParameters?.speed ?: 1f)
      put("exitReason", reason)
    })
    summaryFlushed = true
  }

  companion object {
    const val EXTRA_URI = "uri"
    const val EXTRA_DOWNLOAD_ID = "download_id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_MIME = "mime"
    const val EXTRA_POSITION = "position"
    private const val STATE_POSITION = "position"
    private const val STATE_PLAYING = "playing"
    private const val STATE_WATCHED = "watched"
  }
}
