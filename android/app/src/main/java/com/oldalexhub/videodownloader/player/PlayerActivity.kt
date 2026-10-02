package com.oldalexhub.videodownloader.player

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.oldalexhub.videodownloader.Telemetry
import org.json.JSONObject

class PlayerActivity : AppCompatActivity() {
  private lateinit var playerView: PlayerView
  private var player: ExoPlayer? = null
  private var position = 0L
  private var playWhenReady = true

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
    position = savedInstanceState?.getLong(STATE_POSITION) ?: 0L
    playWhenReady = savedInstanceState?.getBoolean(STATE_PLAYING) ?: true
    val mediaType = intent.getStringExtra(EXTRA_MIME).orEmpty().substringBefore('/').ifBlank { "unknown" }
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
    releasePlayer()
    super.onStop()
  }

  override fun onSaveInstanceState(outState: Bundle) {
    outState.putLong(STATE_POSITION, player?.currentPosition ?: position)
    outState.putBoolean(STATE_PLAYING, player?.playWhenReady ?: playWhenReady)
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

  companion object {
    const val EXTRA_URI = "uri"
    const val EXTRA_TITLE = "title"
    const val EXTRA_MIME = "mime"
    private const val STATE_POSITION = "position"
    private const val STATE_PLAYING = "playing"
  }
}
