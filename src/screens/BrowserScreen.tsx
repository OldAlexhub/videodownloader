import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Copy,
  Download,
  Globe2,
  History,
  Home,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import {WebView, WebViewMessageEvent, WebViewNavigation} from 'react-native-webview';
import {NativeSponsoredCard} from '../ads/NativeSponsoredCard';
import {QualitySheet} from '../components/QualitySheet';
import {SafeBottomSheet, SafeModalScreen, SafeScrollView} from '../components/ScreenContainer';
import {useApp} from '../context/AppContext';
import {colors, radius, spacing} from '../theme';
import {inferMediaFromUrl, MEDIA_DETECTOR_SCRIPT, normalizeAddress, submittedSearchTerm, WEBSITE_AD_BLOCKER_SCRIPT} from '../utils/browser';
import {downloadManager} from '../native/DownloadManager';
import {remoteConfig} from '../native/RemoteConfig';
import {assetCountLabel, groupMedia, variantUsable} from '../utils/media';

interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

interface ContextTarget {
  url: string;
  title: string;
  kind: 'link' | 'image' | 'video' | 'audio';
}

const HOME = '';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36 VDMediaSaver/2.0.0';

export function BrowserScreen() {
  const webView = useRef<any>(null);
  const lastReportedVisit = useRef<{tabId: string; url: string} | undefined>(undefined);
  const AndroidWebView = WebView as any;
  const {
    browserTarget,
    browserResetKey,
    bookmarks,
    detectedMedia,
    addDetectedMedia,
    clearDetectedMedia,
    enqueueSelections,
    history,
    addHistory,
    toggleBookmark,
    settings,
    activeTab,
    setActiveTab,
    updateSettings,
  } = useApp();
  const browserResetKeyRef = useRef(browserResetKey);
  const blockerSetting = useRef(settings.blockWebsiteAds);
  const [tabs, setTabs] = useState<BrowserTab[]>([{id: 'initial', url: HOME, title: 'New tab'}]);
  const [activeId, setActiveId] = useState('initial');
  const active = tabs.find(tab => tab.id === activeId) || tabs[0];
  const [address, setAddress] = useState('');
  const [pageTitle, setPageTitle] = useState('New tab');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [privateMode, setPrivateMode] = useState(settings.privateByDefault);
  const [qualityVisible, setQualityVisible] = useState(false);
  const [tabsVisible, setTabsVisible] = useState(false);
  const [libraryVisible, setLibraryVisible] = useState<'history' | 'bookmarks' | null>(null);
  const [contextTarget, setContextTarget] = useState<ContextTarget>();
  const [error, setError] = useState<string>();
  const documentSequence = useRef(0);
  const initialDocumentId = 'initial:0';
  const [documentId, setDocumentId] = useState(initialDocumentId);
  const documentIdRef = useRef(initialDocumentId);
  const inspectedManifests = useRef(new Set<string>());
  const inspectedCandidates = useRef(new Set<string>());
  const lastStartedUrl = useRef('');
  const [scanningCount, setScanningCount] = useState(0);
  const scanStartedAt = useRef(0);
  const completedScanDocument = useRef('');
  const detectorBootstrap = `window.__VDMS_CONFIG__=${JSON.stringify({minimumImagePixels: remoteConfig.current().detector.minimumImagePixels})};true;`;
  const injectedScript = settings.blockWebsiteAds
    ? `${detectorBootstrap}\n${WEBSITE_AD_BLOCKER_SCRIPT}\n${MEDIA_DETECTOR_SCRIPT}`
    : `${detectorBootstrap}\n${MEDIA_DETECTOR_SCRIPT}`;

  const startDocument = useCallback((tabId = activeId) => {
    documentSequence.current += 1;
    const nextDocumentId = `${tabId}:${documentSequence.current}`;
    documentIdRef.current = nextDocumentId;
    setDocumentId(nextDocumentId);
    inspectedManifests.current.clear();
    inspectedCandidates.current.clear();
    setScanningCount(0);
    scanStartedAt.current = 0;
    completedScanDocument.current = '';
    clearDetectedMedia();
  }, [activeId, clearDetectedMedia]);

  useEffect(() => {
    if (!browserTarget) {
      return;
    }
    const target = browserTarget.replace(/([#&])vdms=\d+$/, '');
    navigate(target);
    // browserTarget intentionally represents an external navigation event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserTarget]);

  useEffect(() => {
    setPrivateMode(settings.privateByDefault);
  }, [settings.privateByDefault]);

  useEffect(() => {
    if (browserResetKeyRef.current === browserResetKey) {
      return;
    }
    browserResetKeyRef.current = browserResetKey;
    setTabs([{id: 'initial', url: HOME, title: 'New tab'}]);
    setActiveId('initial');
    setAddress('');
    setPageTitle('New tab');
    setCanGoBack(false);
    setCanGoForward(false);
    setProgress(0);
    setLoading(false);
    setPrivateMode(false);
    setQualityVisible(false);
    setTabsVisible(false);
    setLibraryVisible(null);
    setContextTarget(undefined);
    setError(undefined);
    lastReportedVisit.current = undefined;
    clearDetectedMedia();
  }, [browserResetKey, clearDetectedMedia]);

  useEffect(() => {
    if (blockerSetting.current === settings.blockWebsiteAds) {
      return;
    }
    blockerSetting.current = settings.blockWebsiteAds;
    if (active.url) {
      webView.current?.reload();
    }
  }, [active.url, settings.blockWebsiteAds]);

  useEffect(() => {
    setAddress(active.url);
    setPageTitle(active.title);
  }, [active.id, active.title, active.url]);

  const navigate = (input: string) => {
    const nextUrl = normalizeAddress(input, settings.searchEngine);
    if (!nextUrl) {
      return;
    }
    setError(undefined);
    startDocument();
    setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: nextUrl} : tab));
    setAddress(nextUrl);
  };

  const submitAddress = (input: string) => {
    const term = submittedSearchTerm(input);
    if (term && !privateMode && settings.analyticsEnabled && settings.usageInsightsEnabled) {
      downloadManager.trackUsageInsight('search_performed', {term}).catch(() => undefined);
    }
    navigate(input);
  };

  const updateNavigation = (navigation: WebViewNavigation) => {
    setAddress(navigation.url);
    setPageTitle(navigation.title || navigation.url);
    setCanGoBack(navigation.canGoBack);
    setCanGoForward(navigation.canGoForward);
    setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: navigation.url, title: navigation.title || navigation.url} : tab));
    if (!navigation.loading) {
      if (!privateMode && settings.analyticsEnabled && settings.usageInsightsEnabled && /^https?:\/\//i.test(navigation.url)) {
        const previous = lastReportedVisit.current;
        if (previous?.tabId !== activeId || previous.url !== navigation.url) {
          lastReportedVisit.current = {tabId: activeId, url: navigation.url};
          try {
            const siteHost = new URL(navigation.url).hostname.toLowerCase();
            if (siteHost) downloadManager.trackUsageInsight('site_visited', {siteHost}).catch(() => undefined);
          } catch {
            // Ignore malformed WebView navigation URLs.
          }
        }
      }
      addHistory(navigation.title, navigation.url, privateMode);
    }
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload.type === 'protected') {
        Alert.alert('Protected media', 'Protected media cannot be downloaded.');
        return;
      }
      if (payload.type === 'context') {
        if (/^https?:\/\//i.test(payload.url) && ['link', 'image', 'video', 'audio'].includes(payload.kind)) {
          setContextTarget({
            url: payload.url,
            title: String(payload.title || payload.url).slice(0, 180),
            kind: payload.kind,
          });
        }
        return;
      }
      if (payload.type === 'webPlayback') {
        if (!privateMode && settings.analyticsEnabled) {
          let sourceDomain = '';
          try { sourceDomain = new URL(active.url).hostname.toLowerCase(); } catch { /* Ignore invalid page URLs. */ }
          const summary = payload.summary || {};
          downloadManager.trackEvent('web_playback_summary', {
            sourceDomain,
            mediaType: String(summary.mediaType || 'video'),
            durationMs: Number(summary.durationMs) || 0,
            activeWatchedMs: Number(summary.activeWatchedMs) || 0,
            completionPercent: Number(summary.completionPercent) || 0,
            pauseCount: Number(summary.pauseCount) || 0,
            seekCount: Number(summary.seekCount) || 0,
            bufferCount: Number(summary.bufferCount) || 0,
            speed: Number(summary.speed) || 1,
            exitReason: String(summary.exitReason || 'unknown'),
          }).catch(() => undefined);
        }
        return;
      }
      if (payload.type !== 'media') {
        return;
      }
      const headers: Record<string, string> = {};
      if (payload.meta?.type) headers['content-type'] = payload.meta.type;
      if (payload.meta?.contentLength) headers['content-length'] = payload.meta.contentLength;
      const found = inferMediaFromUrl(payload.url, active.url, payload.meta?.title || pageTitle, headers);
      if (found) {
        if (!scanStartedAt.current) {
          scanStartedAt.current = Date.now();
          if (!privateMode && settings.analyticsEnabled) {
            let sourceDomain = '';
            try { sourceDomain = new URL(active.url).hostname.toLowerCase(); } catch { /* Ignore invalid URLs. */ }
            downloadManager.trackEvent('scan_started', {sourceDomain}).catch(() => undefined);
          }
        }
        const candidateDocumentId = documentIdRef.current;
        const elementId = String(payload.meta?.elementId || '').slice(0, 120);
        const relationship = String(payload.meta?.manifestParent || payload.meta?.poster || '').slice(0, 240);
        const assetId = elementId
          ? `${candidateDocumentId}:element:${elementId}`
          : found.isManifest
            ? `${candidateDocumentId}:manifest:${found.sourceUrl.split('?')[0]}`
            : `${candidateDocumentId}:source:${found.sourceUrl.split('?')[0]}`;
        const enriched = {
          ...found,
          candidateKey: `${candidateDocumentId}:${found.sourceUrl}`,
          assetId,
          groupKey: `${assetId}:${relationship}`,
          documentId: candidateDocumentId,
          width: Number(payload.meta?.width) || found.width,
          height: Number(payload.meta?.height) || found.height,
          resolution: payload.meta?.height ? `${payload.meta.height}p` : found.resolution,
          qualityLabel: payload.meta?.height ? `${payload.meta.height}p` : found.qualityLabel,
          thumbnailUrl: payload.meta?.poster || undefined,
          durationMs: Number(payload.meta?.duration) > 0 ? Math.round(Number(payload.meta.duration) * 1000) : found.durationMs,
          audioMode: payload.meta?.muted ? 'none' as const : found.audioMode,
          detectionSource: (payload.meta?.source || (found.isManifest ? 'manifest' : 'element')) as typeof found.detectionSource,
          inspectionState: found.isManifest ? 'probing' as const : 'ready' as const,
          confidence: found.confidence + (payload.meta?.active ? 20 : 0) + (payload.meta?.prominent ? 10 : 0),
        };
        if (found.isManifest) {
          const manifestKey = `${candidateDocumentId}:${found.sourceUrl}`;
          if (inspectedManifests.current.has(manifestKey)) return;
          inspectedManifests.current.add(manifestKey);
          addDetectedMedia(enriched);
          setScanningCount(count => count + 1);
          downloadManager.inspectManifest(found.sourceUrl, active.url, enriched.title)
            .then(items => {
              if (candidateDocumentId !== documentIdRef.current) return;
              items.forEach((item, index) => addDetectedMedia({
                ...item,
                candidateKey: index === 0 ? enriched.candidateKey : `${manifestKey}:variant:${item.selectionToken || index}`,
                assetId,
                groupKey: assetId,
                documentId: candidateDocumentId,
                detectionSource: 'manifest',
                inspectionState: 'ready',
              }));
            })
            .catch(manifestError => {
              if (candidateDocumentId !== documentIdRef.current) return;
              const message = String(manifestError);
              addDetectedMedia({
                ...enriched,
                inspectionState: 'unsupported',
                isProtected: /protected|drm|encrypted/i.test(message),
                supportState: 'unsupported',
                unsupportedReason: /live/i.test(message) ? 'Live streams are not supported' : /protected|drm|encrypted/i.test(message) ? 'Protected media is not supported' : 'This stream could not be inspected',
              });
            })
            .finally(() => {
              if (candidateDocumentId === documentIdRef.current) setScanningCount(count => Math.max(0, count - 1));
            });
        } else {
          const probeKey = `${candidateDocumentId}:${found.sourceUrl}`;
          if (inspectedCandidates.current.has(probeKey)) {
            addDetectedMedia(enriched);
            return;
          }
          inspectedCandidates.current.add(probeKey);
          addDetectedMedia({...enriched, inspectionState: 'probing'});
          setScanningCount(count => count + 1);
          downloadManager.inspectCandidates([enriched]).then(results => {
            if (candidateDocumentId !== documentIdRef.current) return;
            const probed = results[0];
            addDetectedMedia(probed ? {...enriched, ...probed} : {...enriched, inspectionState: 'ready'});
          }).catch(() => {
            if (candidateDocumentId === documentIdRef.current) addDetectedMedia({...enriched, inspectionState: 'ready'});
          }).finally(() => {
            if (candidateDocumentId === documentIdRef.current) setScanningCount(count => Math.max(0, count - 1));
          });
        }
      }
    } catch {
      return;
    }
  };

  const openNewTab = (url = HOME, title = 'New tab') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTabs(current => [...current, {id, url, title}]);
    setActiveId(id);
    setAddress(url);
    setPageTitle(title);
    setCanGoBack(false);
    setCanGoForward(false);
    setError(undefined);
    setTabsVisible(false);
    startDocument(id);
  };

  const newTab = () => openNewTab();

  const closeTab = (id: string) => {
    if (id === activeId) {
      setCanGoBack(false);
      setCanGoForward(false);
      setError(undefined);
      startDocument(id);
    }
    setTabs(current => {
      const remaining = current.filter(tab => tab.id !== id);
      if (remaining.length === 0) {
        const replacement = {id: `${Date.now()}`, url: HOME, title: 'New tab'};
        setActiveId(replacement.id);
        return [replacement];
      }
      if (id === activeId) {
        setActiveId(remaining[remaining.length - 1].id);
      }
      return remaining;
    });
  };

  const selectTab = (id: string) => {
    setActiveId(id);
    setCanGoBack(false);
    setCanGoForward(false);
    setError(undefined);
    setTabsVisible(false);
    startDocument(id);
  };

  const pageItems = useMemo(() => detectedMedia.filter(item => item.documentId === documentId), [detectedMedia, documentId]);
  const pageAssets = useMemo(() => groupMedia(pageItems, documentId), [documentId, pageItems]);
  const saved = bookmarks.some(item => item.url === active.url);
  const contextMedia = useMemo(() => contextTarget
    ? inferMediaFromUrl(contextTarget.url, active.url, contextTarget.title || pageTitle)
    : null, [active.url, contextTarget, pageTitle]);

  useEffect(() => {
    if (scanningCount !== 0 || !scanStartedAt.current || pageAssets.length === 0 || completedScanDocument.current === documentId) return;
    completedScanDocument.current = documentId;
    if (privateMode || !settings.analyticsEnabled) return;
    let sourceDomain = '';
    try { sourceDomain = new URL(active.url).hostname.toLowerCase(); } catch { /* Ignore invalid URLs. */ }
    downloadManager.trackEvent('scan_completed', {
      sourceDomain,
      assetCount: pageAssets.length,
      variantCount: pageItems.filter(variantUsable).length,
      rejectedCount: pageItems.filter(item => !variantUsable(item) && item.inspectionState !== 'probing').length,
      inspectionLatencyMs: Date.now() - scanStartedAt.current,
    }).catch(() => undefined);
  }, [active.url, documentId, pageAssets, pageItems, privateMode, scanningCount, settings.analyticsEnabled]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeTab !== 'browser') {
        return false;
      }
      if (contextTarget) {
        setContextTarget(undefined);
        return true;
      }
      if (qualityVisible) {
        setQualityVisible(false);
        return true;
      }
      if (tabsVisible) {
        setTabsVisible(false);
        return true;
      }
      if (libraryVisible) {
        setLibraryVisible(null);
        return true;
      }
      if (active.url && canGoBack) {
        webView.current?.goBack();
        return true;
      }
      if (active.url) {
        setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: HOME, title: 'New tab'} : tab));
        setAddress('');
        setPageTitle('New tab');
        setCanGoBack(false);
        setCanGoForward(false);
        setError(undefined);
        startDocument();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [active.url, activeId, activeTab, canGoBack, contextTarget, libraryVisible, qualityVisible, startDocument, tabsVisible]);

  const openDetectedMedia = () => {
    if (!privateMode && settings.analyticsEnabled) downloadManager.trackEvent('picker_opened', {assetCount: pageAssets.length, variantCount: pageItems.filter(variantUsable).length}).catch(() => undefined);
    setQualityVisible(true);
  };

  if (!active.url) {
    return (
      <View style={styles.screen}>
        <SafeScrollView contentContainerStyle={styles.homeContent}>
          <View style={styles.brandRow}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} />
            <View style={styles.brandCopy}><Text style={styles.brand}>Video Downloader</Text><Text style={styles.tagline}>Detect. Choose. Download.</Text></View>
            <Pressable onPress={() => setPrivateMode(value => !value)} style={[styles.privateButton, privateMode && styles.privateActive]}>
              <ShieldCheck color={privateMode ? colors.white : colors.blue700} size={19} />
            </Pressable>
          </View>
          {privateMode ? <View style={styles.privateNotice}><LockKeyhole color={colors.success} size={17} /><Text style={styles.privateNoticeText}>Private session. History and browser analytics are not recorded.</Text></View> : null}
          <View style={styles.homeSearch}>
            <Search color={colors.muted} size={20} />
            <TextInput
              accessibilityLabel="Search or enter address"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setAddress}
              onSubmitEditing={() => submitAddress(address)}
              placeholder="Search or enter web address"
              placeholderTextColor={colors.muted}
              returnKeyType="go"
              style={styles.homeInput}
              value={address}
            />
          </View>
          <View style={styles.quickRow}>
            <QuickAction icon={<Download color={colors.blue700} size={21} />} label="Paste link" onPress={async () => {const value = await Clipboard.getString(); setAddress(value); navigate(value);}} />
            <QuickAction icon={<Download color={colors.blue700} size={21} />} label="Downloads" onPress={() => setActiveTab('downloads')} />
            <QuickAction icon={<History color={colors.blue700} size={21} />} label="History" onPress={() => setLibraryVisible('history')} />
            <QuickAction icon={<Bookmark color={colors.blue700} size={21} />} label="Bookmarks" onPress={() => setLibraryVisible('bookmarks')} />
          </View>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}><Globe2 color={colors.teal500} size={28} /></View>
            <Text style={styles.heroTitle}>Download media from supported websites</Text>
            <Text style={styles.heroBody}>Browse to media you are authorized to save. Available downloadable media will appear automatically.</Text>
            <Text style={styles.legal}>Only download media you own, have permission to download, or that the content provider makes available for downloading.</Text>
          </View>
          {bookmarks.length > 0 ? (
            <View style={styles.homeSection}>
              <Text style={styles.sectionTitle}>Bookmarks</Text>
              {bookmarks.slice(0, 4).map(item => <Pressable key={item.id} onPress={() => navigate(item.url)} style={styles.linkRow}><Globe2 color={colors.blue600} size={17} /><Text numberOfLines={1} style={styles.linkText}>{item.title}</Text></Pressable>)}
            </View>
          ) : null}
          <NativeSponsoredCard />
        </SafeScrollView>
        <BrowserToolbar tabs={tabs.length} onTabs={() => setTabsVisible(true)} onNew={newTab} />
        <ListModal type={libraryVisible} history={history} bookmarks={bookmarks} onClose={() => setLibraryVisible(null)} onOpen={url => {setLibraryVisible(null); navigate(url);}} />
        <TabsModal visible={tabsVisible} tabs={tabs} activeId={activeId} onClose={() => setTabsVisible(false)} onNew={newTab} onSelect={selectTab} onRemove={closeTab} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.addressRow}>
        <Pressable disabled={!canGoBack} onPress={() => webView.current?.goBack()} style={styles.navButton}><ArrowLeft color={canGoBack ? colors.ink : '#B8C3D1'} size={20} /></Pressable>
        <View style={styles.addressBar}>
          <LockKeyhole color={active.url.startsWith('https://') ? colors.success : colors.warning} size={14} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setAddress}
            onFocus={() => setAddress(active.url)}
            onSubmitEditing={() => submitAddress(address)}
            returnKeyType="go"
            selectTextOnFocus
            style={styles.addressInput}
            value={address}
          />
        </View>
        <Pressable onPress={() => webView.current?.reload()} style={styles.navButton}><RefreshCw color={colors.ink} size={19} /></Pressable>
      </View>
      {loading ? <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${Math.max(4, progress * 100)}%`}]} /></View> : null}
      <AndroidWebView
          key={active.id}
          ref={webView}
          source={{uri: active.url}}
          style={styles.webView}
          userAgent={USER_AGENT}
          javaScriptEnabled
          domStorageEnabled={!privateMode}
          cacheEnabled={!privateMode}
          thirdPartyCookiesEnabled={!privateMode}
          sharedCookiesEnabled={!privateMode}
          incognito={privateMode}
          setSupportMultipleWindows
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          injectedJavaScriptBeforeContentLoaded={settings.blockWebsiteAds ? WEBSITE_AD_BLOCKER_SCRIPT : undefined}
          injectedJavaScript={injectedScript}
          onMessage={handleMessage}
          onNavigationStateChange={updateNavigation}
          onLoadStart={(event: {nativeEvent: {url?: string}}) => {
            const startedUrl = event.nativeEvent.url || active.url;
            if (startedUrl !== lastStartedUrl.current) {
              lastStartedUrl.current = startedUrl;
              startDocument();
            }
            setLoading(true);
            setError(undefined);
          }}
          onLoadProgress={(event: {nativeEvent: {progress: number}}) => setProgress(event.nativeEvent.progress)}
          onLoadEnd={() => setLoading(false)}
          onError={(event: {nativeEvent: {description?: string}}) => {setLoading(false); setError(event.nativeEvent.description || 'Check your connection and try again.');}}
          onHttpError={(event: {nativeEvent: {statusCode: number}}) => {if (event.nativeEvent.statusCode >= 400) setError(`The website returned error ${event.nativeEvent.statusCode}.`);}}
          onOpenWindow={(event: {nativeEvent: {targetUrl?: string}}) => {
            const targetUrl = event.nativeEvent.targetUrl || '';
            if (/^https?:\/\//i.test(targetUrl)) openNewTab(targetUrl, targetUrl);
          }}
          onShouldStartLoadWithRequest={(request: {url: string; isTopFrame?: boolean}) => {
            const candidate = inferMediaFromUrl(request.url, active.url, pageTitle);
            if (candidate) {
              const candidateDocumentId = documentIdRef.current;
              const scopedAssetId = `${candidateDocumentId}:navigation:${candidate.sourceUrl.split('?')[0]}`;
              const scoped = {
                ...candidate,
                candidateKey: `${candidateDocumentId}:${candidate.sourceUrl}`,
                assetId: scopedAssetId,
                groupKey: scopedAssetId,
                documentId: candidateDocumentId,
                detectionSource: 'navigation',
                inspectionState: 'probing',
              } as const;
              addDetectedMedia(scoped);
              const inspectionKey = `${candidateDocumentId}:${candidate.sourceUrl}`;
              if (candidate.isManifest && !inspectedManifests.current.has(inspectionKey)) {
                inspectedManifests.current.add(inspectionKey);
                setScanningCount(count => count + 1);
                downloadManager.inspectManifest(candidate.sourceUrl, active.url, pageTitle).then(items => {
                  if (candidateDocumentId !== documentIdRef.current) return;
                  items.forEach((item, index) => addDetectedMedia({...item, candidateKey: index === 0 ? scoped.candidateKey : `${inspectionKey}:variant:${item.selectionToken || index}`, assetId: scopedAssetId, groupKey: scopedAssetId, documentId: candidateDocumentId, detectionSource: 'manifest', inspectionState: 'ready'}));
                }).catch(manifestFailure => {
                  if (candidateDocumentId === documentIdRef.current) addDetectedMedia({...scoped, inspectionState: 'unsupported', supportState: 'unsupported', unsupportedReason: /live/i.test(String(manifestFailure)) ? 'Live streams are not supported' : /protected|drm|encrypted/i.test(String(manifestFailure)) ? 'Protected media is not supported' : 'This stream could not be inspected'});
                }).finally(() => {
                  if (candidateDocumentId === documentIdRef.current) setScanningCount(count => Math.max(0, count - 1));
                });
              } else if (!candidate.isManifest && !inspectedCandidates.current.has(inspectionKey)) {
                inspectedCandidates.current.add(inspectionKey);
                setScanningCount(count => count + 1);
                downloadManager.inspectCandidates([scoped]).then(results => {
                  if (candidateDocumentId === documentIdRef.current) addDetectedMedia(results[0] ? {...scoped, ...results[0]} : scoped);
                }).finally(() => {
                  if (candidateDocumentId === documentIdRef.current) setScanningCount(count => Math.max(0, count - 1));
                });
              }
            }
            return true;
          }}
        />
      {error ? (
        <View style={styles.errorState}><Globe2 color={colors.muted} size={38} /><Text style={styles.errorTitle}>Page could not be loaded</Text><Text style={styles.errorBody}>{error}</Text><Pressable onPress={() => {setError(undefined); webView.current?.reload();}} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>
      ) : null}
      {pageAssets.length > 0 || scanningCount > 0 ? (
        <Pressable onPress={openDetectedMedia} style={styles.mediaFound}>
          <Download color={colors.white} size={18} />
          <Text style={styles.mediaFoundText}>{scanningCount > 0 ? 'Scanning media…' : `${assetCountLabel(pageAssets)} · ${pageItems.filter(variantUsable).length} quality options`}</Text>
        </Pressable>
      ) : null}
      <View style={styles.webToolbar}>
        <Pressable disabled={!canGoBack} onPress={() => webView.current?.goBack()} style={styles.webAction}><ArrowLeft color={canGoBack ? colors.ink : '#B8C3D1'} size={21} /></Pressable>
        <Pressable disabled={!canGoForward} onPress={() => webView.current?.goForward()} style={styles.webAction}><ArrowRight color={canGoForward ? colors.ink : '#B8C3D1'} size={21} /></Pressable>
        <Pressable onPress={() => {setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: HOME, title: 'New tab'} : tab)); setAddress(''); startDocument();}} style={styles.webAction}><Home color={colors.ink} size={21} /></Pressable>
        <Pressable onPress={() => toggleBookmark(pageTitle, active.url)} style={styles.webAction}><Bookmark color={saved ? colors.blue700 : colors.ink} fill={saved ? colors.blue700 : 'transparent'} size={21} /></Pressable>
        <Pressable onPress={() => Share.share({message: active.url, title: pageTitle})} style={styles.webAction}><Share2 color={colors.ink} size={21} /></Pressable>
        <Pressable onPress={() => setTabsVisible(true)} style={styles.tabCount}><Text style={styles.tabCountText}>{tabs.length}</Text></Pressable>
      </View>
      <QualitySheet
        visible={qualityVisible}
        assets={pageAssets}
        preferredQuality={settings.preferredQuality}
        destinationName={settings.destinationName}
        onChooseDestination={async () => {
          const destination = await downloadManager.chooseDestination();
          if (destination) updateSettings({destinationUri: destination.uri, destinationName: destination.name});
        }}
        onClose={() => setQualityVisible(false)}
        onIncorrect={() => {
          if (!privateMode && settings.analyticsEnabled) downloadManager.trackEvent('media_result_incorrect', {
            assetCount: pageAssets.length,
            variantCount: pageItems.length,
            detectorVersion: '2.0',
          }).catch(() => undefined);
          Alert.alert('Feedback noted', privateMode || !settings.analyticsEnabled ? 'Nothing was sent because analytics is off for this session.' : 'Anonymous detector details were queued. No page or media URL was included.');
        }}
        onVariantSelected={variant => {
          if (!privateMode && settings.analyticsEnabled) downloadManager.trackEvent('variant_selected', {
            protocol: variant.protocol || 'progressive',
            height: variant.height || 0,
            bitrate: variant.bitrate || 0,
            audioMode: variant.audioMode || 'unknown',
            preset: settings.preferredQuality,
          }).catch(() => undefined);
        }}
        onDownload={selections => enqueueSelections(selections, USER_AGENT)}
      />
      <TabsModal visible={tabsVisible} tabs={tabs} activeId={activeId} onClose={() => setTabsVisible(false)} onNew={newTab} onSelect={selectTab} onRemove={closeTab} />
      {contextTarget ? (
        <ContextMenu
          target={contextTarget}
          bookmarked={bookmarks.some(item => item.url === contextTarget.url)}
          downloadable={Boolean(contextMedia)}
          onClose={() => setContextTarget(undefined)}
          onOpen={() => {const target = contextTarget; setContextTarget(undefined); navigate(target.url);}}
          onNewTab={() => {const target = contextTarget; setContextTarget(undefined); openNewTab(target.url, target.title);}}
          onCopy={() => {Clipboard.setString(contextTarget.url); setContextTarget(undefined);}}
          onShare={() => {const target = contextTarget; setContextTarget(undefined); Share.share({message: target.url, title: target.title});}}
          onBookmark={() => {const target = contextTarget; setContextTarget(undefined); toggleBookmark(target.title, target.url);}}
          onDownload={() => {
            if (!contextMedia) return;
            setContextTarget(undefined);
            const candidateDocumentId = documentIdRef.current;
            const scopedAssetId = `${candidateDocumentId}:context:${contextMedia.sourceUrl.split('?')[0]}`;
            const scoped = {
              ...contextMedia,
              candidateKey: `${candidateDocumentId}:${contextMedia.sourceUrl}`,
              assetId: scopedAssetId,
              groupKey: scopedAssetId,
              documentId: candidateDocumentId,
              detectionSource: 'link',
              inspectionState: 'probing',
            } as const;
            addDetectedMedia(scoped);
            setQualityVisible(true);
            setScanningCount(count => count + 1);
            const inspection = contextMedia.isManifest
              ? downloadManager.inspectManifest(contextMedia.sourceUrl, active.url, contextMedia.title).then(items => {
                if (candidateDocumentId !== documentIdRef.current) return;
                items.forEach((item, index) => addDetectedMedia({...item, candidateKey: index === 0 ? scoped.candidateKey : `${scoped.candidateKey}:variant:${item.selectionToken || index}`, assetId: scopedAssetId, groupKey: scopedAssetId, documentId: candidateDocumentId, detectionSource: 'manifest', inspectionState: 'ready'}));
              })
              : downloadManager.inspectCandidates([scoped]).then(items => {
                if (candidateDocumentId === documentIdRef.current) addDetectedMedia(items[0] ? {...scoped, ...items[0]} : {...scoped, inspectionState: 'ready'});
              });
            inspection.catch(inspectionFailure => {
              if (candidateDocumentId === documentIdRef.current) addDetectedMedia({...scoped, inspectionState: 'unsupported', supportState: 'unsupported', unsupportedReason: /live/i.test(String(inspectionFailure)) ? 'Live streams are not supported' : /protected|drm|encrypted/i.test(String(inspectionFailure)) ? 'Protected media is not supported' : 'This media could not be inspected'});
            }).finally(() => {
              if (candidateDocumentId === documentIdRef.current) setScanningCount(count => Math.max(0, count - 1));
            });
          }}
        />
      ) : null}
    </View>
  );
}

function QuickAction({icon, label, onPress}: {icon: React.ReactNode; label: string; onPress: () => void}) {
  return <Pressable onPress={onPress} style={styles.quickAction}><View style={styles.quickIcon}>{icon}</View><Text style={styles.quickLabel}>{label}</Text></Pressable>;
}

function BrowserToolbar({tabs, onTabs, onNew}: {tabs: number; onTabs: () => void; onNew: () => void}) {
  return <View style={styles.webToolbar}><View style={styles.webAction}><Home color={colors.blue700} size={21} /></View><View style={styles.webAction}><ArrowLeft color="#B8C3D1" size={21} /></View><Pressable onPress={onNew} style={styles.webAction}><Plus color={colors.ink} size={22} /></Pressable><Pressable onPress={onTabs} style={styles.tabCount}><Text style={styles.tabCountText}>{tabs}</Text></Pressable><Pressable onPress={onTabs} style={styles.webAction}><MoreHorizontal color={colors.ink} size={22} /></Pressable></View>;
}

function TabsModal({visible, tabs, activeId, onClose, onNew, onSelect, onRemove}: {visible: boolean; tabs: BrowserTab[]; activeId: string; onClose: () => void; onNew: () => void; onSelect: (id: string) => void; onRemove: (id: string) => void}) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent><SafeModalScreen style={styles.modalPage}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Open tabs</Text><Pressable onPress={onNew} style={styles.modalNew}><Plus color={colors.white} size={18} /><Text style={styles.modalNewText}>New tab</Text></Pressable></View><SafeScrollView>{tabs.map(tab => <Pressable key={tab.id} onPress={() => onSelect(tab.id)} style={[styles.tabCard, tab.id === activeId && styles.tabCardActive]}><Globe2 color={colors.blue700} size={20} /><View style={styles.tabCopy}><Text numberOfLines={1} style={styles.tabTitle}>{tab.title}</Text><Text numberOfLines={1} style={styles.tabUrl}>{tab.url || 'New tab'}</Text></View><Pressable accessibilityLabel="Close tab" onPress={() => onRemove(tab.id)} style={styles.closeTab}><X color={colors.muted} size={19} /></Pressable></Pressable>)}</SafeScrollView><Pressable onPress={onClose} style={styles.modalDone}><Text style={styles.modalDoneText}>Done</Text></Pressable></SafeModalScreen></Modal>;
}

function ListModal({type, history, bookmarks, onClose, onOpen}: {type: 'history' | 'bookmarks' | null; history: ReturnType<typeof useApp>['history']; bookmarks: ReturnType<typeof useApp>['bookmarks']; onClose: () => void; onOpen: (url: string) => void}) {
  const items = type === 'history' ? history : bookmarks;
  return <Modal visible={Boolean(type)} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent><SafeModalScreen style={styles.modalPage}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{type === 'history' ? 'History' : 'Bookmarks'}</Text><Pressable onPress={onClose} style={styles.close}><X color={colors.ink} size={22} /></Pressable></View><SafeScrollView>{items.length === 0 ? <Text style={styles.emptyList}>Nothing saved here yet.</Text> : items.map(item => <Pressable key={item.id} onPress={() => onOpen(item.url)} style={styles.linkRow}><Globe2 color={colors.blue600} size={18} /><View style={styles.tabCopy}><Text numberOfLines={1} style={styles.tabTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.tabUrl}>{item.url}</Text></View></Pressable>)}</SafeScrollView></SafeModalScreen></Modal>;
}

function ContextMenu({target, bookmarked, downloadable, onClose, onOpen, onNewTab, onCopy, onShare, onBookmark, onDownload}: {
  target: ContextTarget;
  bookmarked: boolean;
  downloadable: boolean;
  onClose: () => void;
  onOpen: () => void;
  onNewTab: () => void;
  onCopy: () => void;
  onShare: () => void;
  onBookmark: () => void;
  onDownload: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.contextOverlay}>
        <Pressable accessibilityLabel="Close link menu" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeBottomSheet style={styles.contextSheet}>
          <View style={styles.contextHeader}>
            <View style={styles.contextIcon}><Globe2 color={colors.blue700} size={19} /></View>
            <View style={styles.contextCopy}>
              <Text numberOfLines={1} style={styles.contextTitle}>{target.title}</Text>
              <Text numberOfLines={2} style={styles.contextUrl}>{target.url}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}><X color={colors.ink} size={21} /></Pressable>
          </View>
          <ContextAction icon={<Globe2 color={colors.ink} size={20} />} label="Open" onPress={onOpen} />
          <ContextAction icon={<Plus color={colors.ink} size={21} />} label="Open in new tab" onPress={onNewTab} />
          {downloadable ? <ContextAction icon={<Download color={colors.blue700} size={20} />} label="Download media" onPress={onDownload} /> : null}
          <ContextAction icon={<Copy color={colors.ink} size={20} />} label="Copy address" onPress={onCopy} />
          <ContextAction icon={<Share2 color={colors.ink} size={20} />} label="Share" onPress={onShare} />
          <ContextAction icon={<Bookmark color={colors.ink} size={20} />} label={bookmarked ? 'Remove bookmark' : 'Add bookmark'} onPress={onBookmark} last />
        </SafeBottomSheet>
      </View>
    </Modal>
  );
}

function ContextAction({icon, label, onPress, last = false}: {icon: React.ReactNode; label: string; onPress: () => void; last?: boolean}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.contextAction, last && styles.contextActionLast]}>{icon}<Text style={styles.contextActionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  homeContent: {padding: spacing.lg, paddingBottom: spacing.xl},
  brandRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl},
  logo: {width: 52, height: 52, borderRadius: 14},
  brandCopy: {flex: 1, paddingHorizontal: spacing.md},
  brand: {fontSize: 19, fontWeight: '900', color: colors.blue950},
  tagline: {fontSize: 12, color: colors.muted, marginTop: 2},
  privateButton: {width: 48, height: 48, borderRadius: 24, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
  privateActive: {backgroundColor: colors.success},
  privateNotice: {flexDirection: 'row', gap: 8, borderRadius: radius.md, backgroundColor: colors.successSoft, padding: spacing.md, marginBottom: spacing.md},
  privateNoticeText: {flex: 1, fontSize: 12, lineHeight: 17, color: colors.success},
  homeSearch: {height: 56, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: '#C8D8E9', paddingHorizontal: spacing.lg, shadowColor: colors.blue950, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3},
  homeInput: {flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 0},
  quickRow: {flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.xl},
  quickAction: {width: '24%', alignItems: 'center'},
  quickIcon: {width: 45, height: 45, borderRadius: 16, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
  quickLabel: {fontSize: 11, color: colors.ink, fontWeight: '700', textAlign: 'center', marginTop: 7},
  heroCard: {backgroundColor: colors.blue950, borderRadius: radius.xl, padding: spacing.xl},
  heroIcon: {width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(17,199,233,0.13)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md},
  heroTitle: {fontSize: 20, lineHeight: 26, fontWeight: '900', color: colors.white},
  heroBody: {fontSize: 14, lineHeight: 21, color: '#D8E7FF', marginTop: spacing.sm},
  legal: {fontSize: 11, lineHeight: 17, color: '#AFC7E8', marginTop: spacing.md},
  homeSection: {marginTop: spacing.xl},
  sectionTitle: {fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm},
  linkRow: {minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: 8, borderWidth: 1, borderColor: colors.line},
  linkText: {flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink},
  addressRow: {height: 56, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingHorizontal: 2, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  navButton: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center'},
  addressBar: {flex: 1, height: 39, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line},
  addressInput: {flex: 1, fontSize: 13, color: colors.ink, paddingVertical: 0},
  progressTrack: {height: 2, backgroundColor: colors.sky100},
  progressFill: {height: 2, backgroundColor: colors.blue600},
  webView: {flex: 1, backgroundColor: colors.white},
  errorState: {position: 'absolute', top: 54, right: 0, bottom: 54, left: 0, zIndex: 3, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.surface},
  errorTitle: {fontSize: 19, fontWeight: '800', color: colors.ink, marginTop: spacing.lg},
  errorBody: {fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.muted, marginTop: spacing.sm},
  retry: {marginTop: spacing.lg, backgroundColor: colors.blue700, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 11},
  retryText: {color: colors.white, fontWeight: '800'},
  mediaFound: {position: 'absolute', right: 14, bottom: 65, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.blue700, borderRadius: radius.round, paddingHorizontal: 16, paddingVertical: 12, shadowColor: colors.black, shadowOpacity: 0.25, shadowRadius: 8, elevation: 7},
  mediaFoundText: {fontSize: 13, fontWeight: '800', color: colors.white},
  webToolbar: {height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  webAction: {flex: 1, height: 48, alignItems: 'center', justifyContent: 'center'},
  tabCount: {width: 48, height: 48, borderWidth: 2, borderColor: colors.ink, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6},
  tabCountText: {fontSize: 12, fontWeight: '800', color: colors.ink},
  modalPage: {flex: 1, backgroundColor: colors.surface},
  modalHeader: {height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg},
  modalTitle: {fontSize: 24, fontWeight: '900', color: colors.ink},
  modalNew: {minHeight: 48, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: colors.blue700, borderRadius: radius.md, paddingHorizontal: 12},
  modalNewText: {fontSize: 13, color: colors.white, fontWeight: '800'},
  tabCard: {minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, marginBottom: 10},
  tabCardActive: {borderColor: colors.blue600, backgroundColor: '#F4F9FF'},
  tabCopy: {flex: 1},
  tabTitle: {fontSize: 14, fontWeight: '800', color: colors.ink},
  tabUrl: {fontSize: 11, color: colors.muted, marginTop: 3},
  closeTab: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center'},
  close: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center'},
  modalDone: {margin: spacing.lg, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.blue700},
  modalDoneText: {fontSize: 15, fontWeight: '800', color: colors.white},
  emptyList: {textAlign: 'center', color: colors.muted, marginTop: 60},
  contextOverlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3, 18, 38, 0.38)'},
  contextSheet: {backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.lg},
  contextHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  contextIcon: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sky100},
  contextCopy: {flex: 1},
  contextTitle: {fontSize: 15, fontWeight: '800', color: colors.ink},
  contextUrl: {fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 3},
  contextAction: {height: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  contextActionLast: {borderBottomWidth: 0},
  contextActionText: {fontSize: 15, fontWeight: '700', color: colors.ink},
});
