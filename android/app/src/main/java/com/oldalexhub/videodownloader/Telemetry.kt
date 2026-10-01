package com.oldalexhub.videodownloader

import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors

object Telemetry {
  private const val BASE_URL = "https://vd.server.oldalexhub.com"
  private const val EVENT_URL = "$BASE_URL/v1/events"
  private const val PREFS = "privacy_settings"
  private const val QUEUE = "analytics_queue"
  private const val ENABLED = "analytics_enabled"
  private const val INSTALL_ID = "install_id"
  private const val MAX_QUEUE = 100
  private val executor = Executors.newSingleThreadExecutor()
  private val lock = Any()

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(ENABLED, enabled).apply()
    if (!enabled) context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(QUEUE).apply()
  }

  fun isEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(ENABLED, true)

  fun record(context: Context, type: String, properties: JSONObject = JSONObject()) {
    val appContext = context.applicationContext
    if (!isEnabled(appContext)) return
    val event = JSONObject().apply {
      put("event", type.take(80))
      put("installId", installId(appContext))
      put("occurredAt", System.currentTimeMillis())
      put("platform", "android")
      put("osVersion", Build.VERSION.SDK_INT)
      put("appVersion", appVersion(appContext))
      put("locale", Locale.getDefault().toLanguageTag())
      put("timeZone", TimeZone.getDefault().id)
      put("properties", sanitize(properties))
    }
    synchronized(lock) {
      val queue = readQueue(appContext)
      queue.put(event)
      while (queue.length() > MAX_QUEUE) queue.remove(0)
      saveQueue(appContext, queue)
    }
    executor.execute { flush(appContext) }
  }

  fun flush(context: Context) {
    if (!isEnabled(context)) return
    repeat(10) {
      val event = synchronized(lock) { readQueue(context).optJSONObject(0) } ?: return
      val sent = runCatching { send(event) }.getOrDefault(false)
      if (!sent) return
      synchronized(lock) {
        val queue = readQueue(context)
        if (queue.length() > 0) queue.remove(0)
        saveQueue(context, queue)
      }
    }
  }

  private fun send(event: JSONObject): Boolean {
    val connection = URL(EVENT_URL).openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 4_000
      connection.readTimeout = 4_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
      connection.setRequestProperty("Accept", "application/json")
      connection.outputStream.use { it.write(event.toString().toByteArray(Charsets.UTF_8)) }
      connection.responseCode in 200..299
    } finally {
      connection.disconnect()
    }
  }

  private fun sanitize(source: JSONObject): JSONObject {
    val result = JSONObject()
    source.keys().forEach { key ->
      val safeKey = key.take(60)
      when (val value = source.opt(key)) {
        is String -> result.put(safeKey, value.take(300))
        is Number, is Boolean -> result.put(safeKey, value)
      }
    }
    return result
  }

  private fun installId(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return prefs.getString(INSTALL_ID, null) ?: UUID.randomUUID().toString().also {
      prefs.edit().putString(INSTALL_ID, it).apply()
    }
  }

  private fun appVersion(context: Context): String = runCatching {
    context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown"
  }.getOrDefault("unknown")

  private fun readQueue(context: Context): JSONArray = runCatching {
    JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(QUEUE, "[]"))
  }.getOrDefault(JSONArray())

  private fun saveQueue(context: Context, queue: JSONArray) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(QUEUE, queue.toString()).apply()
  }
}
