import type {DetectedMedia} from '../types';

const SEARCH_URLS = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
};

export function normalizeAddress(
  input: string,
  engine: keyof typeof SEARCH_URLS,
): string {
  const value = input.trim();
  if (!value) {
    return '';
  }
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    return value;
  }
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(value)) {
    return `http://${value}`;
  }
  if (/^[^\s]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return `${SEARCH_URLS[engine]}${encodeURIComponent(value)}`;
}

export function submittedSearchTerm(input: string): string | undefined {
  const value = input.trim();
  if (!value || /^[a-z][a-z\d+.-]*:\/\//i.test(value) ||
    /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(value) ||
    /^[^\s]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(value)) {
    return undefined;
  }
  return value.slice(0, 80);
}

export function inferMediaFromUrl(
  url: string,
  pageUrl: string,
  title: string,
  headers: Record<string, string> = {},
): DetectedMedia | null {
  if (!/^https?:\/\//i.test(url) || /^blob:|^data:/i.test(url)) {
    return null;
  }
  const clean = url.split('?')[0].split('#')[0];
  const extensionMatch = clean.match(/\.([a-z0-9]{2,5})$/i);
  const extension = extensionMatch?.[1]?.toLowerCase() || '';
  const contentType = (headers['content-type'] || '').split(';')[0].toLowerCase();
  const manifest = extension === 'm3u8' || extension === 'mpd';
  const videoExtensions = ['mp4', 'm4v', 'webm', 'mov'];
  const audioExtensions = ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac'];
  const imageExtensions = ['jpg', 'jpeg', 'png', 'webp'];
  let mediaType: DetectedMedia['mediaType'] | null = null;
  if (manifest || videoExtensions.includes(extension) || contentType.startsWith('video/')) {
    mediaType = 'video';
  } else if (audioExtensions.includes(extension) || contentType.startsWith('audio/')) {
    mediaType = 'audio';
  } else if (imageExtensions.includes(extension) || contentType.startsWith('image/')) {
    mediaType = 'image';
  }
  if (!mediaType) {
    return null;
  }
  const lowerUrl = url.toLowerCase();
  if (/sprite|favicon|icon|logo|avatar|emoji|pixel|tracking|beacon|ads?[/._-]/i.test(lowerUrl)) {
    return null;
  }
  const size = Number(headers['content-length'] || 0);
  if (mediaType === 'image' && size > 0 && size < 100_000) {
    return null;
  }
  const resolutionMatch = lowerUrl.match(/(?:^|[^\d])(2160|1440|1080|720|480|360|240)p?(?:[^\d]|$)/);
  const height = resolutionMatch ? Number(resolutionMatch[1]) : undefined;
  const mimeType = contentType ||
    (manifest ? (extension === 'm3u8' ? 'application/vnd.apple.mpegurl' : 'application/dash+xml') :
      `${mediaType}/${extension === 'm4a' ? 'mp4' : extension || (mediaType === 'image' ? 'jpeg' : 'mp4')}`);
  const groupKey = `${new URL(pageUrl || url).hostname}|${title.trim().toLowerCase() || 'media'}|${mediaType}`;
  return {
    id: `${url}|${height || 0}`,
    groupKey,
    sourceUrl: url,
    pageUrl,
    title: title || 'Detected media',
    mimeType,
    extension: manifest ? extension : extension || (mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'mp3' : 'jpg'),
    mediaType,
    protocol: extension === 'm3u8' ? 'hls' : extension === 'mpd' ? 'dash' : 'progressive',
    container: extension ? extension.toUpperCase() : undefined,
    audioMode: mediaType === 'audio' ? 'muxed' : mediaType === 'video' ? 'unknown' : 'none',
    qualityLabel: height ? `${height}p` : manifest ? 'Adaptive stream' : mediaType === 'audio' ? 'Audio' : 'Source',
    resolution: height ? `${height}p` : undefined,
    height,
    estimatedBytes: size || undefined,
    hasAudio: mediaType === 'audio' ? true : undefined,
    isManifest: manifest,
    confidence: contentType ? 90 : extension ? 70 : 40,
  };
}

export const WEBSITE_AD_BLOCKER_SCRIPT = `
(function () {
  if (window.__VDMS_WEBSITE_AD_BLOCKER__) return true;
  window.__VDMS_WEBSITE_AD_BLOCKER__ = true;

  window.open = function () { return null; };

  const adSelectors = [
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="adservice.google.com"]',
    'ins.adsbygoogle',
    '[id^="google_ads_"]',
    '[class*="adsbygoogle"]',
    '[class*="advertisement"]',
    '[id*="advertisement"]',
    '[class*="ad-slot"]',
    '[id*="ad-slot"]',
    '[aria-label="Advertisement"]',
    '[aria-label="advertisement"]',
    '[aria-label="Sponsored"]',
    '[aria-label="sponsored"]',
    '[class*="ad-overlay"]',
    '[id*="ad-overlay"]'
  ].join(',');
  const removeCommonAdSlots = () => {
    document.querySelectorAll(adSelectors).forEach(element => element.remove());
  };
  removeCommonAdSlots();
  new MutationObserver(removeCommonAdSlots).observe(document.documentElement || document, {childList:true, subtree:true});
  return true;
})();
`;

export const MEDIA_DETECTOR_SCRIPT = `
(function () {
  if (window.__VDMS_INSTALLED__) return true;
  window.__VDMS_INSTALLED__ = true;
  const sent = new Map();
  const elementIds = new WeakMap();
  let elementSequence = 0;
  if (navigator.requestMediaKeySystemAccess) {
    const originalMediaKeys = navigator.requestMediaKeySystemAccess.bind(navigator);
    navigator.requestMediaKeySystemAccess = function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'protected'}));
      return originalMediaKeys.apply(navigator, arguments);
    };
  }
  const emit = (url, meta) => {
    if (!url || !/^https?:/i.test(url)) return;
    const details = meta || {};
    const signature = JSON.stringify([details.elementId || '', details.type || '', details.width || 0, details.height || 0, Math.round(details.duration || 0), details.active || false, details.poster || '']);
    if (sent.get(url) === signature) return;
    sent.set(url, signature);
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'media', url:url, meta:meta || {}}));
  };
  let holdTimer = null;
  let holdStart = null;
  let holdFired = false;
  let lastContextAt = 0;
  const contextDetails = (rawTarget) => {
    const element = rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget && rawTarget.parentElement;
    if (!element || !element.closest) return null;
    const link = element.closest('a[href]');
    const media = link ? null : element.closest('img[src],video[src],audio[src],source[src]');
    const target = link || media;
    if (!target) return null;
    const tag = target.tagName.toLowerCase();
    const source = link ? link.href : (target.currentSrc || target.src || target.getAttribute('src'));
    let url = '';
    try { url = new URL(source, document.baseURI).href; } catch (_) { return null; }
    if (!/^https?:/i.test(url)) return null;
    const kind = link ? 'link' : (tag === 'img' ? 'image' : tag === 'audio' ? 'audio' : 'video');
    const title = (link ? link.textContent : target.getAttribute('alt') || target.getAttribute('title') || document.title || url).trim().slice(0, 180);
    return {type:'context', url:url, title:title || url, kind:kind};
  };
  const cancelHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    holdStart = null;
  };
  const showContext = (details) => {
    if (!details) return;
    lastContextAt = Date.now();
    window.ReactNativeWebView.postMessage(JSON.stringify(details));
  };
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    const details = contextDetails(event.target);
    if (!details) return;
    cancelHold();
    holdFired = false;
    holdStart = {x:event.touches[0].clientX, y:event.touches[0].clientY};
    holdTimer = setTimeout(() => {
      holdFired = true;
      showContext(details);
    }, 650);
  }, {capture:true, passive:true});
  document.addEventListener('touchmove', (event) => {
    if (!holdStart || event.touches.length !== 1) return;
    if (Math.abs(event.touches[0].clientX - holdStart.x) > 12 || Math.abs(event.touches[0].clientY - holdStart.y) > 12) cancelHold();
  }, {capture:true, passive:true});
  document.addEventListener('touchend', (event) => {
    cancelHold();
    if (holdFired) {
      event.preventDefault();
      event.stopPropagation();
      holdFired = false;
    }
  }, {capture:true, passive:false});
  document.addEventListener('touchcancel', cancelHold, {capture:true, passive:true});
  document.addEventListener('contextmenu', (event) => {
    const details = contextDetails(event.target);
    if (!details) return;
    event.preventDefault();
    event.stopPropagation();
    cancelHold();
    if (Date.now() - lastContextAt > 800) showContext(details);
  }, true);
  const inspect = () => {
    document.querySelectorAll('video,audio').forEach((node) => {
      if (!elementIds.has(node)) elementIds.set(node, 'media-' + (++elementSequence));
      const rect = node.getBoundingClientRect();
      const meta = {
        elementId: elementIds.get(node),
        source: 'element',
        tag: node.tagName.toLowerCase(),
        title: node.getAttribute('title') || document.title,
        poster: node.getAttribute('poster') || '',
        width: node.videoWidth || Math.round(rect.width),
        height: node.videoHeight || Math.round(rect.height),
        duration: Number.isFinite(node.duration) ? node.duration : 0,
        active: !node.paused,
        prominent: rect.width * rect.height > ((window.__VDMS_CONFIG__ && window.__VDMS_CONFIG__.minimumImagePixels) || 120000)
      };
      emit(node.currentSrc || node.src, meta);
      node.querySelectorAll('source').forEach((source) => emit(source.src, {...meta, source:'source', type:source.type || ''}));
    });
  };
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function () {
      const request = arguments[0];
      const url = typeof request === 'string' ? request : request && request.url;
      const result = originalFetch.apply(this, arguments);
      result.then((response) => {
        const type = response.headers.get('content-type') || '';
        if (/^(video|audio|image)\\//i.test(type) || /mpegurl|dash\\+xml/i.test(type)) {
          emit(response.url || url, {source:'fetch', type:type, contentLength:response.headers.get('content-length') || ''});
        }
      }).catch(() => {});
      return result;
    };
  }
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__vdmsUrl = url;
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', () => {
      const type = this.getResponseHeader('content-type') || '';
      if (/^(video|audio|image)\\//i.test(type) || /mpegurl|dash\\+xml/i.test(type)) {
        emit(this.responseURL || this.__vdmsUrl, {source:'xhr', type:type, contentLength:this.getResponseHeader('content-length') || ''});
      }
    });
    return send.apply(this, arguments);
  };
  const playback = new WeakMap();
  const playbackState = (node) => {
    let state = playback.get(node);
    if (!state) {
      state = {activeSince:0, watchedMs:0, pauses:0, seeks:0, buffers:0, lastSent:0};
      playback.set(node, state);
    }
    return state;
  };
  const accruePlayback = (node) => {
    const state = playbackState(node);
    if (state.activeSince) {
      state.watchedMs += Math.max(0, performance.now() - state.activeSince);
      state.activeSince = 0;
    }
    return state;
  };
  const emitPlayback = (node, reason) => {
    const state = accruePlayback(node);
    if (!state.watchedMs && !state.pauses && !state.seeks && !state.buffers) return;
    const now = Date.now();
    if (reason === state.lastReason && now - state.lastSent < 750) return;
    state.lastReason = reason;
    state.lastSent = now;
    const duration = Number.isFinite(node.duration) ? node.duration : 0;
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'webPlayback', summary:{
      mediaType:node.tagName.toLowerCase(), durationMs:Math.round(duration * 1000), activeWatchedMs:Math.round(state.watchedMs),
      completionPercent:duration > 0 ? Math.min(100, Math.round((node.currentTime / duration) * 100)) : 0,
      pauseCount:state.pauses, seekCount:state.seeks, bufferCount:state.buffers, speed:node.playbackRate || 1, exitReason:reason
    }}));
  };
  const instrumentPlayback = (node) => {
    const state = playbackState(node);
    if (state.instrumented) return;
    state.instrumented = true;
    node.addEventListener('playing', () => { const current = playbackState(node); if (!current.activeSince) current.activeSince = performance.now(); });
    node.addEventListener('pause', () => { const current = accruePlayback(node); if (!node.ended) current.pauses++; emitPlayback(node, 'pause'); });
    node.addEventListener('seeking', () => { playbackState(node).seeks++; });
    node.addEventListener('waiting', () => { accruePlayback(node).buffers++; });
    node.addEventListener('ended', () => emitPlayback(node, 'ended'));
  };
  const originalInspect = inspect;
  const inspectAndInstrument = () => {
    originalInspect();
    document.querySelectorAll('video,audio').forEach(instrumentPlayback);
  };
  window.addEventListener('pagehide', () => document.querySelectorAll('video,audio').forEach(node => emitPlayback(node, 'navigation')));
  new MutationObserver(inspectAndInstrument).observe(document.documentElement || document, {childList:true, subtree:true, attributes:true, attributeFilter:['src']});
  document.addEventListener('loadedmetadata', inspectAndInstrument, true);
  setInterval(inspectAndInstrument, 2500);
  inspectAndInstrument();
  true;
})();
`;
