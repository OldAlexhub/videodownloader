package com.oldalexhub.videodownloader.download

import android.content.ContentValues
import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

object DownloadScheduler {
  const val INPUT_ID = "download_id"

  fun enqueue(context: Context, id: String, wifiOnly: Boolean) {
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
      .build()
    val request = OneTimeWorkRequestBuilder<DownloadWorker>()
      .setInputData(workDataOf(INPUT_ID to id))
      .setConstraints(constraints)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .addTag("media-download")
      .addTag("media-download-$id")
      .build()
    DownloadDatabase.get(context).update(id, ContentValues().apply { put("work_id", request.id.toString()) })
    WorkManager.getInstance(context).enqueueUniqueWork("media-download-$id", ExistingWorkPolicy.REPLACE, request)
  }

  fun pause(context: Context, id: String) {
    DownloadDatabase.get(context).update(id, ContentValues().apply {
      put("status", "paused")
      put("speed_bps", 0)
      put("eta_seconds", 0)
    })
    WorkManager.getInstance(context).cancelUniqueWork("media-download-$id")
  }

  fun cancel(context: Context, id: String) {
    DownloadDatabase.get(context).update(id, ContentValues().apply {
      put("status", "cancelled")
      put("speed_bps", 0)
      put("eta_seconds", 0)
      put("failure_message", "Download cancelled.")
    })
    WorkManager.getInstance(context).cancelUniqueWork("media-download-$id")
    DownloadWorker.partFile(context, id).delete()
    DownloadWorker.stateFile(context, id).delete()
  }
}
