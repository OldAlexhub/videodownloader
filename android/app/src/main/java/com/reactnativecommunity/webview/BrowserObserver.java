package com.reactnativecommunity.webview;

import android.graphics.Bitmap;
import android.net.http.SslError;
import android.webkit.*;
import java.util.UUID;
import java.util.Collections;
import java.util.WeakHashMap;

/** Adds passive URL observations without fetching resources twice or replacing RNC navigation behavior. */
public final class BrowserObserver extends WebViewClient {
  public interface Listener { void resource(String url, String page, String document); }
  private static final java.util.Set<WebView> attached = Collections.newSetFromMap(new WeakHashMap<>());
  private final RNCWebViewClient delegate;
  private final Listener listener;
  private volatile String page = "";
  private volatile String document = "";
  private BrowserObserver(RNCWebViewClient delegate, Listener listener) {this.delegate = delegate; this.listener = listener;}
  public static String back(WebView view) {
    if (view instanceof RNCWebView) {
      WebChromeClient chrome = ((RNCWebView)view).mWebChromeClient;
      if (chrome instanceof RNCWebChromeClient && ((RNCWebChromeClient)chrome).mVideoView != null) {chrome.onHideCustomView(); return "fullscreen";}
    }
    if (view.canGoBack()) {view.goBack(); return "history";}
    return "root";
  }
  public static void attach(RNCWebView view, Listener listener) {
    if (attached.add(view)) view.setWebViewClient(new BrowserObserver(view.getRNCWebViewClient(), listener));
  }
  @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
    page = url; document = UUID.randomUUID().toString();
    view.evaluateJavascript("window.__VDMS_NATIVE_DOCUMENT__=" + org.json.JSONObject.quote(document) + ";true;", null);
    listener.resource("", page, document);
    delegate.onPageStarted(view, url, icon);
  }
  @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
    String url = request.getUrl().toString();
    if (url.length() <= 8192 && url.matches("(?i)https?://.*\\.(mp4|webm|m4v|mov|m3u8|mpd|mp3|m4a|ogg|wav)([?#].*)?")) listener.resource(url, page, document);
    return delegate.shouldInterceptRequest(view, request);
  }
  @Override public void onPageFinished(WebView v, String u) {delegate.onPageFinished(v,u);}
  @Override public void doUpdateVisitedHistory(WebView v,String u,boolean reload) {page = u; delegate.doUpdateVisitedHistory(v,u,reload);}
  @Override public boolean shouldOverrideUrlLoading(WebView v,String u) {return delegate.shouldOverrideUrlLoading(v,u);}
  @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r) {return delegate.shouldOverrideUrlLoading(v,r);}
  @Override public void onReceivedHttpAuthRequest(WebView v,HttpAuthHandler h,String host,String realm) {delegate.onReceivedHttpAuthRequest(v,h,host,realm);}
  @Override public void onReceivedSslError(WebView v,SslErrorHandler h,SslError e) {delegate.onReceivedSslError(v,h,e);}
  @Override public void onReceivedError(WebView v,int code,String description,String url) {delegate.onReceivedError(v,code,description,url);}
  @Override public void onReceivedHttpError(WebView v,WebResourceRequest r,WebResourceResponse response) {delegate.onReceivedHttpError(v,r,response);}
  @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail) {return delegate.onRenderProcessGone(v,detail);}
}
