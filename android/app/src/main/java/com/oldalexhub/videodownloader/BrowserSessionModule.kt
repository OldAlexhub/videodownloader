package com.oldalexhub.videodownloader

import android.os.Bundle
import android.os.Parcel
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.reactnativecommunity.webview.BrowserObserver
import com.reactnativecommunity.webview.RNCWebView
import java.io.File
import java.util.concurrent.ConcurrentHashMap

class BrowserSessionModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "VDBrowserSession"
  private val scripts = java.util.WeakHashMap<WebView, androidx.webkit.ScriptHandler>()
  private val privateStates = ConcurrentHashMap<String, Bundle>()
  private val directory get() = File(context.noBackupFilesDir, "browser-sessions").apply { mkdirs() }
  private fun file(id: String): File {
    require(Regex("[a-zA-Z0-9_-]{1,80}").matches(id))
    return File(directory, "$id.state")
  }
  private fun web(view: View?): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) for (index in 0 until view.childCount) web(view.getChildAt(index))?.let { return it }
    return null
  }
  private fun withWeb(tag: Int, promise: Promise, action: (WebView) -> Any) {
    UiThreadUtil.runOnUiThread {
      runCatching {
        val view = UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag)
        action(web(view) ?: error("Browser view unavailable"))
      }.fold(promise::resolve) { promise.reject("E_BROWSER_STATE", it.message, it) }
    }
  }
  @ReactMethod fun attach(tag: Int, id: String, promise: Promise) = withWeb(tag, promise) { view ->
    if (view is RNCWebView) BrowserObserver.attach(view) { url, page, document ->
      if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("VDBrowserResource", Arguments.createMap().apply {
          putString("tabId", id); putString("url", url); putString("pageUrl", page); putString("documentId", document)
        })
    }
    true
  }
  @ReactMethod fun back(tag: Int, promise: Promise) = withWeb(tag, promise) {view -> BrowserObserver.back(view)}
  @ReactMethod fun configureScript(tag: Int, script: String, promise: Promise) = withWeb(tag, promise) { view ->
    if (androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT)) {
      scripts.remove(view)?.remove()
      scripts[view] = androidx.webkit.WebViewCompat.addDocumentStartJavaScript(view, script, setOf("*"))
      true
    } else false
  }
  @ReactMethod fun save(tag: Int, id: String, privateMode: Boolean, promise: Promise) = withWeb(tag, promise) { view ->
    val state = Bundle()
    if (view.saveState(state) == null) false else {
      state.putInt("vdScrollX", view.scrollX); state.putInt("vdScrollY", view.scrollY)
      if (privateMode) {privateStates[id] = state; file(id).delete()} else {
        val parcel = Parcel.obtain()
        try {
          parcel.writeBundle(state)
          val target = android.util.AtomicFile(file(id))
          var stream: java.io.FileOutputStream? = null
          try {stream = target.startWrite(); stream.write(parcel.marshall()); target.finishWrite(stream)}
          catch (error: Exception) {target.failWrite(stream); throw error}
        } finally {parcel.recycle()}
      }
      true
    }
  }
  @ReactMethod fun restore(tag: Int, id: String, privateMode: Boolean, promise: Promise) = withWeb(tag, promise) { view ->
    val state = if (privateMode) privateStates[id] else {
      val target = file(id)
      if (!target.exists() || target.length() > 8 * 1024 * 1024) null else runCatching {
        val parcel = Parcel.obtain()
        try {val bytes = target.readBytes(); parcel.unmarshall(bytes, 0, bytes.size); parcel.setDataPosition(0); parcel.readBundle(context.classLoader)}
        finally {parcel.recycle()}
      }.getOrNull()
    }
    if (state == null) false else (view.restoreState(state) != null).also { restored ->
      if (restored) view.post {view.scrollTo(state.getInt("vdScrollX"), state.getInt("vdScrollY"))}
    }
  }
  @ReactMethod fun remove(id: String, promise: Promise) {
    runCatching {privateStates.remove(id); file(id).delete(); true}.fold(promise::resolve) {promise.reject("E_BROWSER_STATE", it)}
  }
  @ReactMethod fun clear(promise: Promise) {privateStates.clear(); directory.listFiles()?.forEach {it.delete()}; promise.resolve(true)}
  @ReactMethod fun addListener(name: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
}
