package com.oldalexhub.videodownloader.player

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
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
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    playerView = PlayerView(this).apply {
      useController = true
      controllerAutoShow = true
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
    Telemetry.record(this, "player_opened", JSONObject().apply { put("mediaType", intent.getStringExtra(EXTRA_MIME).orEmpty().substringBefore('/')) })
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
    player = ExoPlayer.Builder(this).build().also { exoPlayer ->
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
