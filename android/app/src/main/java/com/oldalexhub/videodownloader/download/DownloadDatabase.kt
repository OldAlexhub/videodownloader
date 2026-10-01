package com.oldalexhub.videodownloader.download

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class DownloadDatabase private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, "media_saver.db", null, VERSION) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE downloads (
        id TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        page_url TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        final_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        media_type TEXT NOT NULL,
        resolution TEXT,
        quality_label TEXT,
        estimated_bytes INTEGER NOT NULL DEFAULT 0,
        actual_bytes INTEGER NOT NULL DEFAULT 0,
        downloaded_bytes INTEGER NOT NULL DEFAULT 0,
        progress REAL NOT NULL DEFAULT 0,
        speed_bps REAL NOT NULL DEFAULT 0,
        eta_seconds INTEGER NOT NULL DEFAULT 0,
        supports_range INTEGER NOT NULL DEFAULT -1,
        etag TEXT,
        last_modified TEXT,
        status TEXT NOT NULL,
        local_uri TEXT,
        thumbnail_uri TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        failure_code TEXT,
        failure_message TEXT,
        source_metadata TEXT,
        headers_json TEXT,
        destination_uri TEXT,
        content_hash TEXT,
        work_id TEXT
      )
      """.trimIndent(),
    )
    db.execSQL("CREATE INDEX idx_downloads_status ON downloads(status)")
    db.execSQL("CREATE INDEX idx_downloads_completed ON downloads(completed_at DESC)")
    db.execSQL("CREATE INDEX idx_downloads_hash ON downloads(content_hash)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      db.execSQL("ALTER TABLE downloads ADD COLUMN work_id TEXT")
    }
  }

  fun insert(values: ContentValues) {
    writableDatabase.insertOrThrow("downloads", null, values)
  }

  fun update(id: String, values: ContentValues): Int =
    writableDatabase.update("downloads", values, "id = ?", arrayOf(id))

  fun get(id: String): DownloadRecord? =
    readableDatabase.query("downloads", null, "id = ?", arrayOf(id), null, null, null).use { cursor ->
      if (cursor.moveToFirst()) DownloadRecord.from(cursor) else null
    }

  fun list(): List<DownloadRecord> =
    readableDatabase.query("downloads", null, null, null, null, null, "created_at DESC").use { cursor ->
      buildList {
        while (cursor.moveToNext()) add(DownloadRecord.from(cursor))
      }
    }

  fun activeCount(): Int = readableDatabase.rawQuery(
    "SELECT COUNT(*) FROM downloads WHERE status IN ('preparing','downloading','processing')",
    null,
  ).use { cursor -> if (cursor.moveToFirst()) cursor.getInt(0) else 0 }

  fun delete(id: String): Int = writableDatabase.delete("downloads", "id = ?", arrayOf(id))

  fun clearCompleted(): Int = writableDatabase.delete("downloads", "status = 'completed'", null)

  fun deleteAll() {
    writableDatabase.delete("downloads", null, null)
  }

  fun storageBytes(mediaType: String): Long = readableDatabase.rawQuery(
    "SELECT COALESCE(SUM(actual_bytes), 0) FROM downloads WHERE status = 'completed' AND media_type = ?",
    arrayOf(mediaType),
  ).use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else 0L }

  companion object {
    private const val VERSION = 2
    @Volatile private var instance: DownloadDatabase? = null

    fun get(context: Context): DownloadDatabase = instance ?: synchronized(this) {
      instance ?: DownloadDatabase(context).also { instance = it }
    }
  }
}

data class DownloadRecord(
  val id: String,
  val sourceUrl: String,
  val pageUrl: String,
  val title: String,
  val originalFilename: String,
  val finalFilename: String,
  val mimeType: String,
  val extension: String,
  val mediaType: String,
  val resolution: String?,
  val qualityLabel: String?,
  val estimatedBytes: Long,
  val actualBytes: Long,
  val downloadedBytes: Long,
  val progress: Double,
  val speedBps: Double,
  val etaSeconds: Long,
  val supportsRange: Int,
  val etag: String?,
  val lastModified: String?,
  val status: String,
  val localUri: String?,
  val thumbnailUri: String?,
  val createdAt: Long,
  val startedAt: Long?,
  val completedAt: Long?,
  val retryCount: Int,
  val failureCode: String?,
  val failureMessage: String?,
  val sourceMetadata: String?,
  val headersJson: String?,
  val destinationUri: String?,
  val contentHash: String?,
  val workId: String?,
) {
  companion object {
    fun from(cursor: Cursor): DownloadRecord {
      fun text(name: String): String? {
        val index = cursor.getColumnIndexOrThrow(name)
        return if (cursor.isNull(index)) null else cursor.getString(index)
      }
      fun longOrNull(name: String): Long? {
        val index = cursor.getColumnIndexOrThrow(name)
        return if (cursor.isNull(index)) null else cursor.getLong(index)
      }
      return DownloadRecord(
        id = text("id")!!,
        sourceUrl = text("source_url")!!,
        pageUrl = text("page_url") ?: "",
        title = text("title")!!,
        originalFilename = text("original_filename")!!,
        finalFilename = text("final_filename")!!,
        mimeType = text("mime_type")!!,
        extension = text("extension")!!,
        mediaType = text("media_type")!!,
        resolution = text("resolution"),
        qualityLabel = text("quality_label"),
        estimatedBytes = cursor.getLong(cursor.getColumnIndexOrThrow("estimated_bytes")),
        actualBytes = cursor.getLong(cursor.getColumnIndexOrThrow("actual_bytes")),
        downloadedBytes = cursor.getLong(cursor.getColumnIndexOrThrow("downloaded_bytes")),
        progress = cursor.getDouble(cursor.getColumnIndexOrThrow("progress")),
        speedBps = cursor.getDouble(cursor.getColumnIndexOrThrow("speed_bps")),
        etaSeconds = cursor.getLong(cursor.getColumnIndexOrThrow("eta_seconds")),
        supportsRange = cursor.getInt(cursor.getColumnIndexOrThrow("supports_range")),
        etag = text("etag"),
        lastModified = text("last_modified"),
        status = text("status")!!,
        localUri = text("local_uri"),
        thumbnailUri = text("thumbnail_uri"),
        createdAt = cursor.getLong(cursor.getColumnIndexOrThrow("created_at")),
        startedAt = longOrNull("started_at"),
        completedAt = longOrNull("completed_at"),
        retryCount = cursor.getInt(cursor.getColumnIndexOrThrow("retry_count")),
        failureCode = text("failure_code"),
        failureMessage = text("failure_message"),
        sourceMetadata = text("source_metadata"),
        headersJson = text("headers_json"),
        destinationUri = text("destination_uri"),
        contentHash = text("content_hash"),
        workId = text("work_id"),
      )
    }
  }
}
