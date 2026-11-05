package com.oldalexhub.videodownloader

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class BrowserDeviceTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val base = InstrumentationRegistry.getArguments().getString("fixtureUrl")
  class Bridge {
    val messages = CopyOnWriteArrayList<JSONObject>()
    @JavascriptInterface fun postMessage(value: String) {messages.add(JSONObject(value))}
  }
  private fun eventually(message: String, condition: () -> Boolean) {
    val deadline = System.currentTimeMillis() + 12000
    while (System.currentTimeMillis() < deadline) {if (condition()) return; Thread.sleep(100)}
    assertTrue(message, condition())
  }
  private fun withBrowser(path: String, test: (WebView, Bridge) -> Unit) {
    assumeTrue("Pass -e fixtureUrl http://127.0.0.1:8097 with the QA server running", base != null)
    val bridge = Bridge()
    lateinit var web: WebView
    val loaded = CountDownLatch(1)
    val script = instrumentation.context.assets.open("detector.js").bufferedReader().use {it.readText()}
    instrumentation.runOnMainSync {
      web = WebView(instrumentation.targetContext)
      web.settings.javaScriptEnabled = true
      web.addJavascriptInterface(bridge, "qaBridge")
      val injected = "window.ReactNativeWebView=qaBridge;" + script
      if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) WebViewCompat.addDocumentStartJavaScript(web, injected, setOf("*"))
      web.webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String) {view.evaluateJavascript(injected, null); loaded.countDown()}
      }
      web.loadUrl(base + path)
    }
    try {
      assertTrue("Fixture did not load", loaded.await(15, TimeUnit.SECONDS))
      test(web, bridge)
    } finally {instrumentation.runOnMainSync {web.destroy()}}
  }
  private fun run(web: WebView, script: String) {instrumentation.runOnMainSync {web.evaluateJavascript(script, null)}}
  @Test fun repeatedObservationsKeepTheActualPlayerAndQualities() = withBrowser("/single") {_, bridge ->
    eventually("Player sources were not observed") {bridge.messages.count {it.optString("type") == "media" && it.optJSONObject("meta")?.optString("elementId")?.isNotBlank() == true} >= 2}
    val sources = bridge.messages.filter {it.optString("type") == "media" && it.optJSONObject("meta")?.optString("elementId")?.isNotBlank() == true}
    assertEquals(1, sources.map {it.getJSONObject("meta").getString("elementId")}.distinct().size)
    assertTrue(sources.any {it.optString("url").endsWith("/content.mp4")})
    assertTrue(sources.any {it.optString("url").endsWith("/high.mp4")})
  }
  @Test fun prerollContentAndMidrollAreScopedToTheReusedPlayer() = withBrowser("/ads") {web, bridge ->
    eventually("Preroll was not rejected") {bridge.messages.any {it.optString("type") == "mediaRejected" && it.optString("url").endsWith("/promo.mp4")}}
    assertFalse(bridge.messages.any {it.optString("type") == "media" && it.optJSONObject("meta")?.optString("elementId")?.isNotBlank() == true && it.optString("url").endsWith("/promo.mp4")})
    run(web, "container.className='';player.src='/media/content.mp4';window.dispatchEvent(new Event('vdms:rescan'));")
    eventually("Content did not replace preroll") {bridge.messages.any {it.optString("type") == "media" && it.optString("url").endsWith("/content.mp4")}}
    bridge.messages.clear()
    run(web, "container.className='vjs-ad-playing';player.src='/media/promo.mp4';window.dispatchEvent(new Event('vdms:rescan'));")
    eventually("Midroll was not rejected") {bridge.messages.any {it.optString("type") == "mediaRejected"}}
    assertFalse(bridge.messages.any {it.optString("type") == "media" && it.optJSONObject("meta")?.optString("elementId")?.isNotBlank() == true && it.optString("url").endsWith("/promo.mp4")})
    run(web, "container.className='';player.src='/media/content.mp4';window.dispatchEvent(new Event('vdms:rescan'));")
    eventually("Content remained blocked after midroll") {bridge.messages.any {it.optString("type") == "media" && it.optString("url").endsWith("/content.mp4")}}
  }
  @Test fun genuineMultiplePlayersRemainDistinct() = withBrowser("/multiple") {_, bridge ->
    eventually("Two players were not observed") {bridge.messages.filter {it.optString("type") == "media"}.mapNotNull {it.optJSONObject("meta")?.optString("elementId")?.takeIf(String::isNotBlank)}.distinct().size == 2}
  }
  @Test fun embeddedFrameCarriesItsOwnIdentity() = withBrowser("/embedded") {_, bridge ->
    assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
    eventually("Embedded player was not observed") {bridge.messages.any {it.optString("type") == "media" && it.optString("frameId").startsWith("frame-")}}
  }
  @Test fun webViewNavigationStateRestoresBackHistory() = withBrowser("/single") {web, _ ->
    run(web, "location.href='/multiple';")
    eventually("Second page not reached") {var yes = false; instrumentation.runOnMainSync {yes = web.url?.endsWith("/multiple") == true && web.progress == 100}; yes}
    val saved = Bundle()
    instrumentation.runOnMainSync {assertNotNull(web.saveState(saved))}
    lateinit var restored: WebView
    instrumentation.runOnMainSync {restored = WebView(instrumentation.targetContext); assertNotNull(restored.restoreState(saved)); assertTrue(restored.canGoBack()); restored.goBack()}
    try {eventually("Restored history lost the parent page") {var yes = false; instrumentation.runOnMainSync {yes = restored.url?.endsWith("/single") == true}; yes}}
    finally {instrumentation.runOnMainSync {restored.destroy()}}
  }
}
