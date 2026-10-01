package com.oldalexhub.videodownloader.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

object DownloadNotifications {
  private const val CHANNEL_ID = "media_downloads"

  fun showPaused(context: Context, record: DownloadRecord) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW))
    }
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val openIntent = PendingIntent.getActivity(context, notificationId(record.id), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val resume = PendingIntent.getBroadcast(context, notificationId(record.id) + 1, Intent(context, DownloadActionReceiver::class.java).apply {
      action = DownloadActionReceiver.ACTION_RESUME
      putExtra(DownloadActionReceiver.EXTRA_ID, record.id)
    }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val cancel = PendingIntent.getBroadcast(context, notificationId(record.id) + 2, Intent(context, DownloadActionReceiver::class.java).apply {
      action = DownloadActionReceiver.ACTION_CANCEL
      putExtra(DownloadActionReceiver.EXTRA_ID, record.id)
    }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(record.title)
      .setContentText("Download paused")
      .setContentIntent(openIntent)
      .setOnlyAlertOnce(true)
      .setOngoing(false)
      .setProgress(100, record.progress.toInt().coerceIn(0, 100), record.estimatedBytes <= 0)
      .addAction(0, "Resume", resume)
      .addAction(0, "Cancel", cancel)
      .build()
    manager.notify(notificationId(record.id), notification)
  }

  fun cancel(context: Context, id: String) {
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(notificationId(id))
  }

  private fun notificationId(id: String) = id.hashCode() and 0x7fffffff
}
