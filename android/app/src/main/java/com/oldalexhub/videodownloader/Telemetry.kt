package com.oldalexhub.videodownloader

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import java.util.zip.GZIPOutputStream
import kotlin.math.min

object Telemetry {
  private const val BASE_URL = "https://vd.server.oldalexhub.com"
  private const val BATCH_URL = "$BASE_URL/v2/events/batch"
  private const val DELETE_URL = "$BASE_URL/v2/analytics/delete"
  private const val PREFS = "privacy_settings"
  private const val ENABLED = "analytics_enabled"
  private const val USAGE_INSIGHTS_ENABLED = "usage_insights_enabled"
  private const val INSTALL_ID = "install_id"
  private const val SEQUENCE = "event_sequence"
  private const val CONFIG_REVISION = "config_revision"
  private const val SAMPLE_RATE = "sample_rate"
  private const val BATCH_SIZE_SETTING = "batch_size"
  private const val MAX_QUEUE = 500
  private const val DEFAULT_BATCH_SIZE = 25
  private val executor = Executors.newSingleThreadExecutor()
  private val lock = Any()
  @Volatile private var deletionInProgress = false
  @Volatile private var sessionId = UUID.randomUUID().toString()
  private val sequence = AtomicLong(-1)

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(ENABLED, enabled).apply()
    if (!enabled) queue(context).clear()
  }

  fun isEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(ENABLED, true)

  fun setUsageInsightsEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(USAGE_INSIGHTS_ENABLED, enabled).apply()
    if (!enabled) queue(context).deleteEvents(USAGE_INSIGHT_EVENTS)
  }

  fun isUsageInsightsEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(USAGE_INSIGHTS_ENABLED, true)

  fun configure(context: Context, revision: String, sampleRate: Double, batchSize: Int) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(CONFIG_REVISION, revision.take(40))
      .putFloat(SAMPLE_RATE, sampleRate.coerceIn(0.0, 1.0).toFloat())
      .putInt(BATCH_SIZE_SETTING, batchSize.coerceIn(1, 50))
      .apply()
  }

  fun clearLocalData(context: Context) {
    queue(context).clear()
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    sequence.set(-1)
  }

  fun record(context: Context, type: String, properties: JSONObject = JSONObject()) {
    val appContext = context.applicationContext
    if (!isEnabled(appContext) || deletionInProgress) return
    val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val sampleRate = prefs.getFloat(SAMPLE_RATE, 1f)
    val sampleBucket = (installId(appContext).hashCode().toUInt().toDouble() / UInt.MAX_VALUE.toDouble())
    if (sampleBucket >= sampleRate) return
    val eventName = V1_TO_V2[type] ?: type.take(80)
    if (eventName == "session_started") sessionId = UUID.randomUUID().toString()
    val safeProperties = sanitize(eventName, properties)
    val flowId = properties.optString("flowId").takeIf { UUID_PATTERN.matches(it) }
    val event = JSONObject().apply {
      put("schemaVersion", 2)
      put("eventId", UUID.randomUUID().toString())
      put("event", eventName)
      put("installId", installId(appContext))
      put("sessionId", sessionId)
      if (flowId != null) put("flowId", flowId)
      put("sequence", nextSequence(appContext))
      put("timestamp", System.currentTimeMillis())
      put("appVersion", appVersion(appContext))
      put("detectorVersion", "2.0")
      put("configVersion", prefs.getString(CONFIG_REVISION, "bundled-safe-defaults-v1"))
      put("androidApi", Build.VERSION.SDK_INT)
      put("locale", Locale.getDefault().toLanguageTag())
      put("timeZone", TimeZone.getDefault().id)
      put("properties", safeProperties)
    }
    synchronized(lock) { queue(appContext).enqueue(eventName, event.toString(), MAX_QUEUE) }
    executor.execute { flush(appContext) }
  }

  fun recordUsageInsight(context: Context, type: String, properties: JSONObject) {
    if (type !in USAGE_INSIGHT_EVENTS || !isEnabled(context) || !isUsageInsightsEnabled(context)) return
    record(context, type, properties)
  }

  fun flush(context: Context) {
    if (!isEnabled(context)) return
    val rows = synchronized(lock) {
      val batchSize = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(BATCH_SIZE_SETTING, DEFAULT_BATCH_SIZE).coerceIn(1, 50)
      queue(context).ready(batchSize)
    }
    if (rows.isEmpty()) return
    val response = runCatching { sendBatch(rows) }.getOrNull()
    synchronized(lock) {
      if (response == null) {
        queue(context).retry(rows.map { it.id })
        return
      }
      val acknowledged = mutableSetOf<String>()
      response.optJSONArray("accepted")?.strings()?.let(acknowledged::addAll)
      response.optJSONArray("duplicate")?.strings()?.let(acknowledged::addAll)
      response.optJSONArray("rejected")?.let { rejected ->
        for (index in 0 until rejected.length()) rejected.optJSONObject(index)?.optString("eventId")?.takeIf(String::isNotBlank)?.let(acknowledged::add)
      }
      queue(context).delete(acknowledged)
      val retryable = rows.map { it.id }.filterNot(acknowledged::contains)
      if (retryable.isNotEmpty()) queue(context).retry(retryable)
    }
  }

  fun deleteServerAnalytics(context: Context): Boolean {
    val appContext = context.applicationContext
    deletionInProgress = true
    return try {
      executor.submit<Boolean> { deleteServerAnalyticsNow(appContext) }.get()
    } finally {
      deletionInProgress = false
    }
  }

  private fun deleteServerAnalyticsNow(appContext: Context): Boolean {
    val oldId = installId(appContext)
    val connection = URL(DELETE_URL).openConnection() as HttpURLConnection
    val success = try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 8_000
      connection.readTimeout = 8_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
      connection.outputStream.use { it.write(JSONObject().put("installId", oldId).toString().toByteArray()) }
      connection.responseCode in 200..299
    } finally {
      connection.disconnect()
    }
    if (success) {
      queue(appContext).clear()
      appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString(INSTALL_ID, UUID.randomUUID().toString()).putLong(SEQUENCE, 0).apply()
      sequence.set(0)
    }
    return success
  }

  private fun sendBatch(rows: List<QueueRow>): JSONObject {
    val events = JSONArray()
    rows.forEach { events.put(JSONObject(it.body)) }
    val raw = JSONObject().put("events", events).toString().toByteArray(Charsets.UTF_8)
    val compressed = ByteArrayOutputStream().use { output ->
      GZIPOutputStream(output).use { it.write(raw) }
      output.toByteArray()
    }
    val connection = URL(BATCH_URL).openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 8_000
      connection.readTimeout = 8_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
      connection.setRequestProperty("Content-Encoding", "gzip")
      connection.setRequestProperty("Accept", "application/json")
      connection.outputStream.use { it.write(compressed) }
      if (connection.responseCode !in 200..299) error("Analytics endpoint returned ${connection.responseCode}")
      JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
    } finally {
      connection.disconnect()
    }
  }

  private fun sanitize(event: String, source: JSONObject): JSONObject {
    val allowed = ALLOWED_PROPERTIES[event] ?: emptySet()
    val result = JSONObject()
    source.keys().forEach { originalKey ->
      val key = when (originalKey) {
        "sourceHost", "siteHost" -> if (event == "site_visited") "siteHost" else "sourceDomain"
        "estimatedBytes", "downloadedBytes" -> "bytes"
        else -> originalKey
      }
      if (key !in allowed) return@forEach
      when (val value = source.opt(originalKey)) {
        is String -> result.put(key, value.take(if (key == "term") 80 else 253))
        is Number, is Boolean -> result.put(key, value)
      }
    }
    return result
  }

  private fun installId(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return prefs.getString(INSTALL_ID, null) ?: UUID.randomUUID().toString().also { prefs.edit().putString(INSTALL_ID, it).apply() }
  }

  private fun nextSequence(context: Context): Long {
    if (sequence.get() < 0) sequence.compareAndSet(-1, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(SEQUENCE, 0))
    val next = sequence.incrementAndGet()
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(SEQUENCE, next).apply()
    return next
  }

  private fun appVersion(context: Context): String = runCatching {
    context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown"
  }.getOrDefault("unknown")

  private fun queue(context: Context) = TelemetryQueue.get(context)

  private val UUID_PATTERN = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
  private val USAGE_INSIGHT_EVENTS = setOf("search_performed", "site_visited")
  private val V1_TO_V2 = mapOf("download_started" to "download_queued")
  private val DOWNLOAD_PROPERTIES = setOf("sourceDomain", "mediaType", "protocol", "stage", "bytes", "durationMs", "elapsedMs", "throughputBps", "failureCode")
  private val ALLOWED_PROPERTIES = mapOf(
    "session_started" to setOf("entryPoint"),
    "session_ended" to setOf("durationMs", "exitReason"),
    "screen_engagement" to setOf("screen", "durationMs"),
    "app_open" to emptySet(), "player_opened" to setOf("mediaType"),
    "search_performed" to setOf("term"), "site_visited" to setOf("siteHost"),
    "media_result_incorrect" to setOf("assetCount", "variantCount", "detectorVersion"),
    "scan_started" to setOf("sourceDomain"),
    "scan_completed" to setOf("sourceDomain", "assetCount", "variantCount", "rejectedCount", "inspectionLatencyMs"),
    "picker_opened" to setOf("assetCount", "variantCount"),
    "variant_selected" to setOf("protocol", "height", "bitrate", "audioMode", "preset"),
    "web_playback_summary" to setOf("sourceDomain", "mediaType", "durationMs", "activeWatchedMs", "completionPercent", "pauseCount", "seekCount", "bufferCount", "speed", "exitReason"),
    "native_playback_summary" to setOf("mediaType", "durationMs", "activeWatchedMs", "completionPercent", "pauseCount", "seekCount", "bufferCount", "speed", "exitReason"),
    "download_queued" to DOWNLOAD_PROPERTIES, "download_completed" to DOWNLOAD_PROPERTIES, "download_failed" to DOWNLOAD_PROPERTIES,
    "download_combine_started" to DOWNLOAD_PROPERTIES, "download_combine_completed" to DOWNLOAD_PROPERTIES,
    "download_paused" to DOWNLOAD_PROPERTIES, "download_resumed" to DOWNLOAD_PROPERTIES,
    "download_retry" to DOWNLOAD_PROPERTIES, "download_cancelled" to DOWNLOAD_PROPERTIES,
    "download_first_byte" to DOWNLOAD_PROPERTIES,
    "ad_request" to setOf("format", "placement"), "ad_load" to setOf("format", "placement", "latencyMs"),
    "ad_failure" to setOf("format", "placement", "errorCode"), "ad_impression" to setOf("format", "placement"),
    "ad_paid" to setOf("format", "placement", "currency", "micros"),
  )
}

private data class QueueRow(val id: String, val body: String)

private class TelemetryQueue private constructor(context: Context) : SQLiteOpenHelper(context.applicationContext, "telemetry_v2.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE events (event_id TEXT PRIMARY KEY, event_name TEXT NOT NULL, body TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)")
    db.execSQL("CREATE INDEX events_ready_idx ON events(next_attempt, created_at)")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  fun enqueue(eventName: String, body: String, limit: Int) {
    val id = JSONObject(body).getString("eventId")
    writableDatabase.insertOrThrow("events", null, ContentValues().apply {
      put("event_id", id); put("event_name", eventName); put("body", body); put("created_at", System.currentTimeMillis())
    })
    writableDatabase.execSQL("DELETE FROM events WHERE event_id IN (SELECT event_id FROM events ORDER BY created_at ASC LIMIT MAX(0, (SELECT COUNT(*) FROM events) - ?))", arrayOf(limit))
  }

  fun ready(limit: Int): List<QueueRow> = readableDatabase.rawQuery(
    "SELECT event_id, body FROM events WHERE next_attempt <= ? ORDER BY created_at ASC LIMIT ?",
    arrayOf(System.currentTimeMillis().toString(), limit.toString()),
  ).use { cursor -> buildList { while (cursor.moveToNext()) add(QueueRow(cursor.getString(0), cursor.getString(1))) } }

  fun delete(ids: Set<String>) { ids.forEach { writableDatabase.delete("events", "event_id = ?", arrayOf(it)) } }

  fun retry(ids: List<String>) {
    ids.forEach { id ->
      readableDatabase.rawQuery("SELECT attempts FROM events WHERE event_id = ?", arrayOf(id)).use { cursor ->
        if (!cursor.moveToFirst()) return@use
        val attempts = cursor.getInt(0) + 1
        val delay = min(6 * 60 * 60 * 1000L, 5_000L * (1L shl min(attempts, 12)))
        writableDatabase.update("events", ContentValues().apply { put("attempts", attempts); put("next_attempt", System.currentTimeMillis() + delay) }, "event_id = ?", arrayOf(id))
      }
    }
  }

  fun deleteEvents(names: Set<String>) { names.forEach { writableDatabase.delete("events", "event_name = ?", arrayOf(it)) } }
  fun clear() { writableDatabase.delete("events", null, null) }

  companion object {
    @Volatile private var instance: TelemetryQueue? = null
    fun get(context: Context): TelemetryQueue = instance ?: synchronized(this) { instance ?: TelemetryQueue(context).also { instance = it } }
  }
}

private fun JSONArray.strings(): List<String> = buildList {
  for (index in 0 until length()) optString(index).takeIf(String::isNotBlank)?.let(::add)
}
