package com.oldalexhub.videodownloader.download

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class DownloadActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(EXTRA_ID) ?: return
    when (intent.action) {
      ACTION_PAUSE -> DownloadScheduler.pause(context, id)
      ACTION_RESUME -> DownloadScheduler.enqueue(context, id, DownloadDatabase.get(context).get(id)?.wifiOnly ?: false)
      ACTION_CANCEL -> DownloadScheduler.cancel(context, id)
    }
  }

  companion object {
    const val EXTRA_ID = "download_id"
    const val ACTION_PAUSE = "com.oldalexhub.videodownloader.PAUSE"
    const val ACTION_RESUME = "com.oldalexhub.videodownloader.RESUME"
    const val ACTION_CANCEL = "com.oldalexhub.videodownloader.CANCEL"
  }
}
