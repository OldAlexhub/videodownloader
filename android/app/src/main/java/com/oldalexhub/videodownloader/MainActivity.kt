package com.oldalexhub.videodownloader

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "VideoDownloader"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    captureSharedUrl(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    captureSharedUrl(intent)
  }

  private fun captureSharedUrl(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    val url = Regex("https?://[^\\s]+", RegexOption.IGNORE_CASE).find(text)?.value ?: return
    synchronized(sharedLock) { pendingSharedUrl = url }
  }

  companion object {
    private val sharedLock = Any()
    private var pendingSharedUrl: String? = null

    fun consumeSharedUrl(): String? = synchronized(sharedLock) {
      pendingSharedUrl.also { pendingSharedUrl = null }
    }
  }
}
