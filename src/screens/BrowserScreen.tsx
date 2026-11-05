import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  BackHandler,
  AppState,
  findNodeHandle,
  Image,
  Linking,
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
import {assetCountLabel, groupMedia, variantUsable, upsertVariant, primaryVariant} from '../utils/media';

import {isAdvertisingUrl} from '../utils/adDetection';
import type {MediaVariant} from '../types';
import {browserSession} from '../native/BrowserSession';
import {BrowserTab, closingTab, newBrowserTab, persistableSession, restoreTabs, SESSION_KEY, COMPATIBILITY_KEY} from '../browser/session';

interface ContextTarget {
  url: string;
  title: string;
  kind: 'link' | 'image' | 'video' | 'audio';
}

const HOME = '';

type TabProps = {
  tab: BrowserTab; tabs: BrowserTab[]; selected: boolean;
  setTabs: React.Dispatch<React.SetStateAction<BrowserTab[]>>;
  select: (id: string) => void; close: (id: string) => void;
  externalTarget?: string; consumeTarget: () => void;
  register: (id: string, save: (() => Promise<boolean>) | null) => void;
};

export function BrowserScreen() {
  const {browserResetKey, browserTarget, settings} = useApp();
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [{...newBrowserTab(settings.privateByDefault), id: 'initial'}]);
  const [activeId, setActiveId] = useState('initial');
  const [live, setLive] = useState(['initial']);
  const liveRef = useRef(live); liveRef.current = live;
  const selectedRef = useRef(activeId); selectedRef.current = activeId;
  const [navigationTarget, setNavigationTarget] = useState<{id:string; url:string}>();
  const deliveredTarget = useRef<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const savers = useRef(new Map<string, () => Promise<boolean>>());
  const switching = useRef(Promise.resolve());
  const resetRef = useRef(browserResetKey);
  const register = useCallback((id: string, save: (() => Promise<boolean>) | null) => {
    if (save) savers.current.set(id, save); else savers.current.delete(id);
  }, []);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SESSION_KEY).then(value => {
      if (!alive) return;
      const restored = restoreTabs(value);
      if (restored) {setTabs(restored.tabs); setActiveId(restored.activeId); setLive([restored.activeId]);}
    }).catch(() => undefined).finally(() => {if (alive) setHydrated(true);});
    return () => {alive = false;};
  }, []);
  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(SESSION_KEY, persistableSession(tabs, activeId)).catch(() => undefined);
  }, [tabs, activeId, hydrated]);
  useEffect(() => {
    if (resetRef.current === browserResetKey) return;
    resetRef.current = browserResetKey;
    const tab = newBrowserTab();
    setTabs([tab]); setActiveId(tab.id); setLive([tab.id]);
    browserSession.clear().catch(() => undefined);
  }, [browserResetKey]);
  useEffect(() => {
    if (hydrated && browserTarget && deliveredTarget.current !== browserTarget) {
      deliveredTarget.current = browserTarget;
      setNavigationTarget({id: activeId, url: browserTarget});
    }
  }, [hydrated, browserTarget, activeId]);
  const select = (id: string) => {
    switching.current = switching.current.then(async () => {
      // Save before removing a view: unmounting first loses the native back stack.
      const currentLive = liveRef.current;
      if (!currentLive.includes(id) && currentLive.length >= 3) {
        const victim = currentLive.find(value => value !== selectedRef.current) || currentLive[0];
        const saved = await savers.current.get(victim)?.();
        if (saved === false) {Alert.alert('Tab could not be saved', 'Close a tab before opening another. Your page has been kept.'); return;}
        setLive(current => [...current.filter(value => value !== victim && value !== id), id]);
      } else setLive(current => [...current.filter(value => value !== id), id]);
      setActiveId(id);
    }).catch(() => Alert.alert('Tab unavailable', 'Please try again. Your current page has been kept.'));
  };
  const close = (id: string) => {
    const next = closingTab(tabs, id, activeId);
    browserSession.remove(id).catch(() => undefined);
    setTabs(next.tabs);
    setLive(current => current.filter(value => value !== id));
    select(next.activeId);
  };
  if (!hydrated) return <View style={styles.screen}><Text style={styles.heroBody}>Restoring your browser...</Text></View>;
  return <View style={styles.screen}>{tabs.filter(tab => live.includes(tab.id)).map(tab =>
    <View key={tab.id} style={tab.id === activeId ? styles.screen : styles.inactiveTab} accessibilityElementsHidden={tab.id !== activeId} importantForAccessibility={tab.id === activeId ? 'auto' : 'no-hide-descendants'}>
      <BrowserTabScreen tab={tab} tabs={tabs} selected={tab.id === activeId} setTabs={setTabs} select={select} close={close} register={register} externalTarget={navigationTarget?.id === tab.id ? navigationTarget.url : undefined} consumeTarget={() => setNavigationTarget(undefined)} />
    </View>)}</View>;
}

function BrowserTabScreen({tab: active, tabs, selected, setTabs, select, close, register, externalTarget, consumeTarget}: TabProps) {
  const webView = useRef<any>(null);
  const scriptRef = useRef('');
  const nativeContainer = useRef<React.ElementRef<typeof View>>(null);
  const AndroidWebView = WebView as any;
  const {bookmarks, enqueueSelections, history, addHistory, toggleBookmark, settings, activeTab, setActiveTab, updateSettings} = useApp();
  const activeId = active.id;
  const [detectedMedia, setDetectedMedia] = useState<MediaVariant[]>([]);
  const addDetectedMedia = useCallback((item: MediaVariant) => setDetectedMedia(current => upsertVariant(current, item)), []);
  const clearDetectedMedia = useCallback(() => setDetectedMedia([]), []);
  const rejectDetectedMedia = useCallback((url: string) => setDetectedMedia(current => current.filter(item => item.sourceUrl !== url)), []);
  const blockerSetting = useRef(settings.blockWebsiteAds);
  const [commandUrl, setCommandUrl] = useState<string | undefined>(undefined);
  const [viewGeneration, setViewGeneration] = useState(0);
  const restored = useRef(false);
  const save = useCallback(async () => {
    const tag = findNodeHandle(nativeContainer.current);
    return tag ? browserSession.save(tag, activeId, Boolean(active.privateMode)) : true;
  }, [activeId, active.privateMode]);
  useEffect(() => {register(activeId, save); return () => register(activeId, null);}, [activeId, register, save]);
  useEffect(() => {
    if (!active.url || restored.current) return;
    const tag = findNodeHandle(nativeContainer.current);
    restored.current = true;
    if (!tag) {setCommandUrl(active.url); return;}
    browserSession.attach(tag, activeId).then(() => browserSession.configureScript(tag, scriptRef.current)).then(() => browserSession.restore(tag, activeId, Boolean(active.privateMode)))
      .then((found: boolean) => {if (!found) setCommandUrl(active.url);}).catch(() => setCommandUrl(active.url));
  }, [active.url, activeId, active.privateMode, viewGeneration]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {if (state !== 'active') save().catch(() => undefined);});
    return () => listener.remove();
  }, [save]);
  useEffect(() => {
    if (!selected) webView.current?.injectJavaScript('document.querySelectorAll("video,audio").forEach(n=>n.pause());true;');
  }, [selected]);
  const [address, setAddress] = useState('');
  const [pageTitle, setPageTitle] = useState('New tab');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const privateMode = Boolean(active.privateMode);
  const setPrivateMode = (value: boolean | ((previous: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(privateMode) : value;
    setTabs(current => current.map(tab => tab.id === activeId ? {...tab, privateMode: next} : tab));
    browserSession.remove(activeId).catch(() => undefined);
  };
  const [qualityVisible, setQualityVisible] = useState(false);
  const [tabsVisible, setTabsVisible] = useState(false);
  const [libraryVisible, setLibraryVisible] = useState<'history' | 'bookmarks' | null>(null);
  const [contextTarget, setContextTarget] = useState<ContextTarget>();
  const [error, setError] = useState<string>();
  const [httpStatus, setHttpStatus] = useState<number>();
  const [compatibilitySites, setCompatibilitySites] = useState<Set<string>>(() => new Set());
  const compatibilityReload = useRef(false);
  let siteOrigin = '';
  try { siteOrigin = new URL(active.url).origin; } catch { /* New tab. */ }
  const compatibilityMode = compatibilitySites.has(siteOrigin);
  const documentSequence = useRef(0);
  const initialDocumentId = `${activeId}:0`;
  const [documentId, setDocumentId] = useState(initialDocumentId);
  const documentIdRef = useRef(initialDocumentId);
  const lastReportedVisit = useRef<{tabId: string; url: string} | undefined>(undefined);
  const playerGenerations = useRef(new Map<string, number>());
  const nativeDocument = useRef('');
  const topDocumentTime = useRef(0);
  const frameDocuments = useRef(new Map<string, string>());
  const rejectedMedia = useRef(new Set<string>());
  const manuallyRejected = useRef(new Set<string>());
  const inspectedManifests = useRef(new Set<string>());
  const inspectedCandidates = useRef(new Set<string>());
  const lastStartedUrl = useRef('');
  const [scanningCount, setScanningCount] = useState(0);
  const scanStartedAt = useRef(0);
  const completedScanDocument = useRef('');
  const detectorBootstrap = `window.__VDMS_CONFIG__=${JSON.stringify({minimumImagePixels: remoteConfig.current().detector.minimumImagePixels})};true;`;
  const detectorScript = remoteConfig.current().killSwitches?.enhancedDetection ? '' : MEDIA_DETECTOR_SCRIPT;
  const injectedScript = settings.blockWebsiteAds && !compatibilityMode
    ? `${detectorBootstrap}\n${WEBSITE_AD_BLOCKER_SCRIPT}\n${detectorScript}`
    : `${detectorBootstrap}\n${detectorScript}`;

  scriptRef.current = injectedScript;
  useEffect(() => {
    const tag = findNodeHandle(nativeContainer.current);
    if (tag) browserSession.configureScript(tag, injectedScript).catch(() => undefined);
  }, [injectedScript]);

  const startDocument = useCallback((tabId = activeId) => {
    setHttpStatus(undefined);
    setError(undefined);
    downloadManager.cancelInspections(documentIdRef.current).catch(() => undefined);
    documentSequence.current += 1;
    const nextDocumentId = `${tabId}:${documentSequence.current}`;
    documentIdRef.current = nextDocumentId;
    setDocumentId(nextDocumentId);
    playerGenerations.current.clear();
    rejectedMedia.current.clear();
    manuallyRejected.current.clear();
    inspectedManifests.current.clear();
    inspectedCandidates.current.clear();
    setScanningCount(0);
    scanStartedAt.current = 0;
    completedScanDocument.current = '';
    clearDetectedMedia();
  }, [activeId, clearDetectedMedia]);

  useEffect(() => {
    if (!compatibilityReload.current) return;
    compatibilityReload.current = false;
    startDocument();
    const tag = findNodeHandle(nativeContainer.current);
    (tag ? browserSession.configureScript(tag, scriptRef.current) : Promise.resolve()).finally(() => webView.current?.reload());
  }, [compatibilitySites, startDocument]);

  const toggleCompatibility = () => {
    if (!siteOrigin) return;
    compatibilityReload.current = true;
    setCompatibilitySites(current => {
      const next = new Set(current);
      if (next.has(siteOrigin)) next.delete(siteOrigin);
      else next.add(siteOrigin);
      if (!privateMode) AsyncStorage.setItem(COMPATIBILITY_KEY, JSON.stringify([...next])).catch(() => undefined);
      return next;
    });
  };
  const openExternalBrowser = () => {
    if (!/^https?:\/\//i.test(active.url)) return;
    Linking.openURL(active.url).catch(() => Alert.alert('Browser unavailable', 'Install or enable a web browser, then try again.'));
  };

  useEffect(() => {
    if (!externalTarget || !selected) {
      return;
    }
    const target = externalTarget.replace(/([#&])vdms=\d+$/, '');
    navigate(target);
    consumeTarget();
    // browserTarget intentionally represents an external navigation event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTarget]);

  useEffect(() => {
    AsyncStorage.getItem(COMPATIBILITY_KEY).then(value => {
      try { const sites = JSON.parse(value || '[]'); if (Array.isArray(sites)) setCompatibilitySites(new Set(sites.filter(site => typeof site === 'string'))); } catch { /* Ignore invalid preferences. */ }
    }).catch(() => undefined);
  }, []);

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
    setCommandUrl(nextUrl);
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
    setCanGoBack(Boolean(navigation.canGoBack));
    setCanGoForward(Boolean(navigation.canGoForward));
    setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: navigation.url, title: navigation.title || navigation.url} : tab));
    if (!navigation.loading) {
      save().catch(() => undefined);
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
      if (payload.documentTime && payload.documentTime < topDocumentTime.current) return;
      if (payload.type === 'documentStarted') {
        if (payload.frameId === 'main') {
          if (frameDocuments.current.get('main') && frameDocuments.current.get('main') !== payload.documentToken) {
            startDocument(); frameDocuments.current.clear();
          }
          topDocumentTime.current = payload.documentTime || 0;
        }
        frameDocuments.current.set(payload.frameId || 'main', payload.documentToken);
        return;
      }
      if (payload.documentToken && frameDocuments.current.get(payload.frameId || 'main') !== payload.documentToken) return;
      if (payload.type === 'media' && manuallyRejected.current.has(payload.url)) return;
      if (payload.type === 'media' && payload.meta?.elementId && !isAdvertisingUrl(payload.url)) rejectedMedia.current.delete(payload.url);
      if (payload.type === 'mediaRejected' && typeof payload.url === 'string') {
        rejectedMedia.current.add(payload.url);
        rejectDetectedMedia(payload.url);
        return;
      }
      if (payload.type === 'media' && rejectedMedia.current.has(payload.url)) return;
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
        const generation = Number(payload.meta?.generation) || 0;
        if (elementId) {
          if ((playerGenerations.current.get(elementId) || 0) > generation) return;
          playerGenerations.current.set(elementId, generation);
          setDetectedMedia(current => current.filter(item => item.playerId !== elementId || item.playbackGeneration === generation));
        }
        const currentPlayer = () => !elementId || playerGenerations.current.get(elementId) === generation;
        const assetId = elementId
          ? `${candidateDocumentId}:player:${elementId}:${generation}`
          : `${candidateDocumentId}:resource:${found.sourceUrl}`;
        const enriched = {
          ...found,
          candidateKey: `${candidateDocumentId}:${found.sourceUrl}`,
          assetId,
          groupKey: assetId,
          playerId: elementId || undefined,
          frameId: String(payload.frameId || 'main'),
          playbackGeneration: generation,
          classification: elementId ? 'content' as const : 'uncertain' as const,
          evidence: [elementId ? 'player-source' : 'resource-observation'],
          documentId: candidateDocumentId,
          width: Number(payload.meta?.width) || found.width,
          height: Number(payload.meta?.height) || found.height,
          resolution: payload.meta?.height ? `${payload.meta.height}p` : found.resolution,
          qualityLabel: payload.meta?.height ? `${payload.meta.height}p` : found.qualityLabel,
          thumbnailUrl: payload.meta?.poster || undefined,
          durationMs: Number(payload.meta?.duration) > 0 ? Math.round(Number(payload.meta.duration) * 1000) : found.durationMs,
          audioMode: found.audioMode,
          detectionSource: (payload.meta?.source || (found.isManifest ? 'manifest' : 'element')) as typeof found.detectionSource,
          inspectionState: 'probing' as const,
          confidence: found.confidence + (payload.meta?.active ? 20 : 0) + (payload.meta?.prominent ? 10 : 0),
        };
        if (found.isManifest) {
          const manifestKey = `${candidateDocumentId}:${found.sourceUrl}:${elementId}:${generation}`;
          if (inspectedManifests.current.has(manifestKey)) return;
          inspectedManifests.current.add(manifestKey);
          addDetectedMedia(enriched);
          setScanningCount(count => count + 1);
          downloadManager.inspectManifest(found.sourceUrl, active.url, enriched.title, candidateDocumentId)
            .then(items => {
              if (candidateDocumentId !== documentIdRef.current || !currentPlayer() || rejectedMedia.current.has(found.sourceUrl)) return;
              items.forEach((item, index) => addDetectedMedia({
                ...enriched,
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
              if (candidateDocumentId !== documentIdRef.current || !currentPlayer() || rejectedMedia.current.has(found.sourceUrl)) return;
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
          const probeKey = `${candidateDocumentId}:${found.sourceUrl}:${elementId}:${generation}`;
          if (inspectedCandidates.current.has(probeKey)) {
            setDetectedMedia(current => current.map(item => item.sourceUrl === enriched.sourceUrl && enriched.playerId ? {...item, assetId: enriched.assetId, groupKey: enriched.assetId, playerId: enriched.playerId, classification: 'content'} : item));
            return;
          }
          inspectedCandidates.current.add(probeKey);
          addDetectedMedia({...enriched, inspectionState: 'probing'});
          setScanningCount(count => count + 1);
          downloadManager.inspectCandidates([enriched]).then(results => {
            if (candidateDocumentId !== documentIdRef.current || !currentPlayer() || rejectedMedia.current.has(found.sourceUrl)) return;
            const probed = results[0];
            addDetectedMedia(probed ? {...enriched, ...probed} : {...enriched, inspectionState: 'uncertain', unsupportedReason: 'Media could not be verified'});
          }).catch(() => {
            if (candidateDocumentId === documentIdRef.current && currentPlayer() && !rejectedMedia.current.has(found.sourceUrl)) addDetectedMedia({...enriched, inspectionState: 'uncertain', unsupportedReason: 'Inspection failed. Reload the page and try again.'});
          }).finally(() => {
            if (candidateDocumentId === documentIdRef.current) setScanningCount(count => Math.max(0, count - 1));
          });
        }
      }
    } catch {
      return;
    }
  };

  const messageHandler = useRef(handleMessage);
  messageHandler.current = handleMessage;
  useEffect(() => browserSession.subscribe(observation => {
    if (observation.tabId !== activeId) return;
    if (!observation.url) {
      if (nativeDocument.current !== observation.documentId) startDocument();
      nativeDocument.current = observation.documentId;
      lastStartedUrl.current = observation.pageUrl;
      return;
    }
    if (observation.documentId !== nativeDocument.current) return;
    messageHandler.current({nativeEvent: {data: JSON.stringify({type:'media', url:observation.url, meta:{source:'native'}})}} as WebViewMessageEvent);
  }), [activeId, startDocument]);
  useEffect(() => () => {downloadManager.cancelInspections(documentIdRef.current).catch(() => undefined);}, []);

  const openNewTab = (url = HOME, title = 'New tab') => {
    if (tabs.length >= 30) {Alert.alert('Tab limit reached', 'Close a tab to open another.'); return;}
    const tab = {...newBrowserTab(privateMode), url, title, parentId: url ? activeId : undefined};
    setTabs(current => [...current, tab]);
    setTabsVisible(false);
    select(tab.id);
  };
  const newTab = () => openNewTab();
  const closeTab = (id: string) => {setTabsVisible(false); close(id);};
  const selectTab = (id: string) => {setTabsVisible(false); select(id);};

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

  const goBack = useCallback(async () => {
    const tag = findNodeHandle(nativeContainer.current);
    const result = tag ? await browserSession.back(tag).catch(() => 'unavailable') : 'unavailable';
    if (result === 'fullscreen' || result === 'history') return;
    if (result === 'unavailable' && canGoBack) {webView.current?.goBack(); return;}
    if (active.parentId) {close(activeId); return;}
    restored.current = false; setCommandUrl(undefined);
    browserSession.remove(activeId).catch(() => undefined);
    setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: HOME, title:'New tab'} : tab));
    setAddress(''); setPageTitle('New tab'); setCanGoBack(false); setCanGoForward(false); startDocument();
  }, [active.parentId, activeId, canGoBack, close, setTabs, startDocument]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!selected || activeTab !== 'browser') {
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
      if (active.url || active.parentId) {goBack(); return true;}
      return false;
    });
    return () => subscription.remove();
  }, [goBack, selected, active.parentId, close, active.url, activeId, activeTab, canGoBack, contextTarget, libraryVisible, qualityVisible, startDocument, tabsVisible]);

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
            <View style={styles.brandCopy}><Text style={styles.brand}>Video Downloader</Text><Text style={styles.tagline}>Your videos. Ready offline.</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={privateMode ? "Turn off private browsing" : "Start private browsing"} onPress={() => setPrivateMode(value => !value)} style={[styles.privateButton, privateMode && styles.privateActive]}>
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
            <Text style={styles.heroTitle}>Find the video. Keep the moment.</Text>
            <Text style={styles.heroBody}>{'1  Open a page and start its video.\n2  Preview the verified result.\n3  Save it in your preferred quality.'}</Text>
            <Text style={styles.legal}>Save content you own or have permission to download. All qualities and tools are free.</Text>
          </View>
          {bookmarks.length > 0 ? (
            <View style={styles.homeSection}>
              <Text style={styles.sectionTitle}>Bookmarks</Text>
              {bookmarks.slice(0, 4).map(item => <Pressable key={item.id} onPress={() => navigate(item.url)} style={styles.linkRow}><Globe2 color={colors.blue600} size={17} /><Text numberOfLines={1} style={styles.linkText}>{item.title}</Text></Pressable>)}
            </View>
          ) : null}
          {selected && activeTab === 'browser' ? <NativeSponsoredCard /> : null}
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
        <Pressable accessibilityLabel="Go back" onPress={goBack} style={styles.navButton}><ArrowLeft color={canGoBack ? colors.ink : '#B8C3D1'} size={20} /></Pressable>
        <View style={styles.addressBar}>
          <LockKeyhole color={active.url.startsWith('https://') ? colors.success : colors.warning} size={14} />
          <TextInput
            accessibilityLabel="Page address"
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
        <Pressable accessibilityLabel="Reload page" onPress={() => webView.current?.reload()} style={styles.navButton}><RefreshCw color={colors.ink} size={19} /></Pressable>
      </View>
      {loading ? <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${Math.max(4, progress * 100)}%`}]} /></View> : null}
      {httpStatus || compatibilityMode ? (
        <View testID="browser-recovery-notice" style={styles.recoveryNotice}>
          <View style={styles.recoveryHeading}>
            <Text style={styles.recoveryTitle}>{httpStatus ? `Website response: ${httpStatus}` : 'Site compatibility mode'}</Text>
            {httpStatus ? <Pressable accessibilityLabel="Dismiss website response notice" onPress={() => setHttpStatus(undefined)}><X color={colors.muted} size={18} /></Pressable> : null}
          </View>
          <Text style={styles.recoveryBody}>{compatibilityMode ? 'Website filtering is paused. Media detection remains available.' : 'The website is still visible below. Complete any verification it shows, or try compatibility mode if it stays stuck.'}</Text>
          <View style={styles.recoveryActions}>
            <Pressable accessibilityRole="button" onPress={() => webView.current?.reload()}><Text style={styles.recoveryAction}>Retry</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={toggleCompatibility}><Text style={styles.recoveryAction}>{compatibilityMode ? 'Restore filtering' : 'Try compatibility mode'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={openExternalBrowser}><Text style={styles.recoveryAction}>Open in browser</Text></Pressable>
          </View>
        </View>
      ) : null}
      <View ref={nativeContainer} collapsable={false} style={styles.webView}><AndroidWebView
          key={`${active.id}:${viewGeneration}`}
          ref={webView}
          source={commandUrl ? {uri: commandUrl} : undefined}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled={!privateMode}
          cacheEnabled={!privateMode}
          thirdPartyCookiesEnabled={!privateMode}
          sharedCookiesEnabled={!privateMode}
          incognito={privateMode}
          setSupportMultipleWindows
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          injectedJavaScriptBeforeContentLoaded={injectedScript}
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
            setHttpStatus(undefined);
          }}
          onLoadProgress={(event: {nativeEvent: {progress: number}}) => setProgress(event.nativeEvent.progress)}
          onLoadEnd={() => {setLoading(false); webView.current?.injectJavaScript("window.dispatchEvent(new Event('vdms:rescan'));true;"); save().catch(() => undefined);}}
          onRenderProcessGone={() => {startDocument(); restored.current = false; setCommandUrl(undefined); setViewGeneration(value => value + 1); setError('The browser stopped. Your saved page is being restored.');}}
          onError={(event: {nativeEvent: {description?: string}}) => {setLoading(false); setError(event.nativeEvent.description || 'Check your connection and try again.');}}
          // HTTP errors can contain a usable page or an interactive browser check.
          // Keep that response rendered; only transport failures get an overlay.
          onHttpError={(event: {nativeEvent: {statusCode: number; url?: string}}) => {if ((!event.nativeEvent.url || event.nativeEvent.url === active.url) && event.nativeEvent.statusCode >= 400) setHttpStatus(event.nativeEvent.statusCode);}}
          onOpenWindow={(event: {nativeEvent: {targetUrl?: string}}) => {
            const targetUrl = event.nativeEvent.targetUrl || '';
            if (/^https?:\/\//i.test(targetUrl)) openNewTab(targetUrl, targetUrl);
          }}
          onShouldStartLoadWithRequest={(request: {url: string; isTopFrame?: boolean}) => {
            if (!/^https?:\/\//i.test(request.url)) {
              if (/^(about:blank|blob:)/i.test(request.url)) return true;
              if (request.isTopFrame !== false && /^(mailto:|tel:|intent:)/i.test(request.url)) Alert.alert('Open another app?', 'This link opens outside Video Downloader.', [{text:'Cancel', style:'cancel'}, {text:'Open', onPress: () => Linking.openURL(request.url).catch(() => Alert.alert('App unavailable', 'No installed app can open this link.'))}]);
              return false;
            }
            if (settings.blockWebsiteAds && !compatibilityMode && isAdvertisingUrl(request.url)) return false;
            handleMessage({nativeEvent: {data: JSON.stringify({type:'media', url:request.url, meta:{source:'navigation'}})}} as WebViewMessageEvent);
            return true;
          }}
        /></View>
      {error ? (
        <View testID="browser-network-error" style={styles.errorState}><Globe2 color={colors.muted} size={38} /><Text style={styles.errorTitle}>Page could not be loaded</Text><Text style={styles.errorBody}>{error}</Text><Pressable onPress={() => {setError(undefined); webView.current?.reload();}} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable><Pressable onPress={openExternalBrowser} style={styles.externalRecovery}><Text style={styles.recoveryAction}>Open in browser</Text></Pressable></View>
      ) : null}
      {pageAssets.length > 0 || scanningCount > 0 ? (
        <Pressable onPress={openDetectedMedia} style={styles.mediaFound}>
          <Download color={colors.white} size={18} />
          <Text style={styles.mediaFoundText}>{scanningCount > 0 ? 'Verifying media…' : `${assetCountLabel(pageAssets.filter(asset => asset.variants.some(primaryVariant)))} ready · View results`}</Text>
        </Pressable>
      ) : null}
      <View style={styles.webToolbar}>
        <Pressable accessibilityLabel="Go back" onPress={goBack} style={styles.webAction}><ArrowLeft color={canGoBack ? colors.ink : '#B8C3D1'} size={21} /></Pressable>
        <Pressable accessibilityLabel="Go forward" disabled={!canGoForward} onPress={() => webView.current?.goForward()} style={styles.webAction}><ArrowRight color={canGoForward ? colors.ink : '#B8C3D1'} size={21} /></Pressable>
        <Pressable onPress={() => {restored.current = false; setCommandUrl(undefined); browserSession.remove(activeId).catch(() => undefined); setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: HOME, title: 'New tab'} : tab)); setAddress(''); startDocument();}} style={styles.webAction}><Home color={colors.ink} size={21} /></Pressable>
        <Pressable accessibilityLabel={saved ? "Remove bookmark" : "Bookmark page"} onPress={() => toggleBookmark(pageTitle, active.url)} style={styles.webAction}><Bookmark color={saved ? colors.blue700 : colors.ink} fill={saved ? colors.blue700 : 'transparent'} size={21} /></Pressable>
        <Pressable accessibilityLabel="Share page" onPress={() => Share.share({message: active.url, title: pageTitle})} style={styles.webAction}><Share2 color={colors.ink} size={21} /></Pressable>
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
        onIncorrect={asset => {
          asset.variants.forEach(item => {manuallyRejected.current.add(item.sourceUrl); rejectedMedia.current.add(item.sourceUrl); rejectDetectedMedia(item.sourceUrl);});
          if (!privateMode && settings.analyticsEnabled) downloadManager.trackEvent('media_result_incorrect', {
            assetCount: pageAssets.length,
            variantCount: pageItems.length,
            detectorVersion: '2.0',
          }).catch(() => undefined);
          Alert.alert('Feedback noted', privateMode || !settings.analyticsEnabled ? 'Nothing was sent because analytics is off for this session.' : 'Anonymous detector details were queued. No page or media URL was included.');
        }}
        onPreview={variant => {downloadManager.preview(variant).catch(() => Alert.alert('Preview unavailable', 'Play this video on the original page to verify it.'));}}
        onRetry={asset => {asset.variants.forEach(item => {
          inspectedCandidates.current.clear();
          inspectedManifests.current.delete(`${documentIdRef.current}:${item.sourceUrl}`);
          handleMessage({nativeEvent:{data:JSON.stringify({type:'media', url:item.sourceUrl, meta:{elementId:item.playerId, generation:item.playbackGeneration, source:item.detectionSource}})}} as WebViewMessageEvent);
        });}}
        onVariantSelected={variant => {
          if (!privateMode && settings.analyticsEnabled) downloadManager.trackEvent('variant_selected', {
            protocol: variant.protocol || 'progressive',
            height: variant.height || 0,
            bitrate: variant.bitrate || 0,
            audioMode: variant.audioMode || 'unknown',
            preset: settings.preferredQuality,
          }).catch(() => undefined);
        }}
        onDownload={selections => enqueueSelections(selections, undefined, privateMode)}
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
            const scopedAssetId = `${candidateDocumentId}:context:${contextMedia.sourceUrl}`;
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
                if (candidateDocumentId === documentIdRef.current) addDetectedMedia(items[0] ? {...scoped, ...items[0]} : {...scoped, inspectionState: 'uncertain'});
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
  return <View style={styles.webToolbar}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open tabs" onPress={onTabs} style={styles.webAction}><Text style={styles.quickLabel}>{tabs} open {tabs === 1 ? 'tab' : 'tabs'}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="New tab" onPress={onNew} style={[styles.webAction, styles.newTabAction]}><Plus color={colors.blue700} size={22} /><Text style={styles.quickLabel}>New tab</Text></Pressable>
  </View>;
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
  inactiveTab: {display: 'none'},
  newTabAction: {flexDirection: 'row', gap: 8},
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
  heroBody: {fontSize: 15, lineHeight: 27, color: '#D8E7FF', marginTop: spacing.sm},
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
  recoveryNotice: {paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#EEF4FF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  recoveryHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  recoveryTitle: {fontSize: 13, fontWeight: '700', color: colors.ink},
  recoveryBody: {fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 4},
  recoveryActions: {flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8},
  recoveryAction: {fontSize: 12, fontWeight: '700', color: colors.blue700, paddingVertical: 5},
  externalRecovery: {marginTop: 12},
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
