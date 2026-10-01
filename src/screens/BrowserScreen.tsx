import Clipboard from '@react-native-clipboard/clipboard';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
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
import {SafeScrollView} from '../components/ScreenContainer';
import {useApp} from '../context/AppContext';
import {colors, radius, spacing} from '../theme';
import {inferMediaFromUrl, MEDIA_DETECTOR_SCRIPT, normalizeAddress} from '../utils/browser';
import {downloadManager} from '../native/DownloadManager';

interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

const HOME = '';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36 VDMediaSaver/1.0';

export function BrowserScreen() {
  const webView = useRef<any>(null);
  const AndroidWebView = WebView as any;
  const {
    browserTarget,
    bookmarks,
    detectedMedia,
    addDetectedMedia,
    clearDetectedMedia,
    enqueueMedia,
    history,
    addHistory,
    toggleBookmark,
    settings,
    setActiveTab,
  } = useApp();
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
  const [error, setError] = useState<string>();

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
    setAddress(active.url);
    setPageTitle(active.title);
  }, [active.id, active.title, active.url]);

  const navigate = (input: string) => {
    const nextUrl = normalizeAddress(input, settings.searchEngine);
    if (!nextUrl) {
      return;
    }
    setError(undefined);
    clearDetectedMedia();
    setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: nextUrl} : tab));
    setAddress(nextUrl);
  };

  const updateNavigation = (navigation: WebViewNavigation) => {
    setAddress(navigation.url);
    setPageTitle(navigation.title || navigation.url);
    setCanGoBack(navigation.canGoBack);
    setCanGoForward(navigation.canGoForward);
    setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: navigation.url, title: navigation.title || navigation.url} : tab));
    if (!navigation.loading) {
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
      if (payload.type !== 'media') {
        return;
      }
      const headers: Record<string, string> = {};
      if (payload.meta?.type) headers['content-type'] = payload.meta.type;
      if (payload.meta?.contentLength) headers['content-length'] = payload.meta.contentLength;
      const found = inferMediaFromUrl(payload.url, active.url, payload.meta?.title || pageTitle, headers);
      if (found) {
        const enriched = {
          ...found,
          width: Number(payload.meta?.width) || found.width,
          height: Number(payload.meta?.height) || found.height,
          resolution: payload.meta?.height ? `${payload.meta.height}p` : found.resolution,
          qualityLabel: payload.meta?.height ? `${payload.meta.height}p` : found.qualityLabel,
          thumbnailUrl: payload.meta?.poster || undefined,
          confidence: found.confidence + (payload.meta?.active ? 20 : 0) + (payload.meta?.prominent ? 10 : 0),
        };
        if (found.isManifest) {
          downloadManager.inspectManifest(found.sourceUrl, active.url, enriched.title)
            .then(items => items.forEach(addDetectedMedia))
            .catch(error => {
              if (String(error).includes('Protected')) addDetectedMedia({...enriched, isProtected: true});
              else addDetectedMedia(enriched);
            });
        } else addDetectedMedia(enriched);
      }
    } catch {
      return;
    }
  };

  const newTab = () => {
    const id = `${Date.now()}`;
    setTabs(current => [...current, {id, url: HOME, title: 'New tab'}]);
    setActiveId(id);
    setAddress('');
    setTabsVisible(false);
    clearDetectedMedia();
  };

  const closeTab = (id: string) => {
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

  const pageItems = useMemo(() => detectedMedia.filter(item => item.pageUrl === active.url || detectedMedia.length === 1), [active.url, detectedMedia]);
  const saved = bookmarks.some(item => item.url === active.url);

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
          {privateMode ? <View style={styles.privateNotice}><LockKeyhole color={colors.success} size={17} /><Text style={styles.privateNoticeText}>Private session. Pages visited here are not added to local history.</Text></View> : null}
          <View style={styles.homeSearch}>
            <Search color={colors.muted} size={20} />
            <TextInput
              accessibilityLabel="Search or enter address"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setAddress}
              onSubmitEditing={() => navigate(address)}
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
        <TabsModal visible={tabsVisible} tabs={tabs} activeId={activeId} onClose={() => setTabsVisible(false)} onNew={newTab} onSelect={id => {setActiveId(id); setTabsVisible(false);}} onRemove={closeTab} />
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
            onSubmitEditing={() => navigate(address)}
            returnKeyType="go"
            selectTextOnFocus
            style={styles.addressInput}
            value={address}
          />
        </View>
        <Pressable onPress={() => webView.current?.reload()} style={styles.navButton}><RefreshCw color={colors.ink} size={19} /></Pressable>
      </View>
      {loading ? <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${Math.max(4, progress * 100)}%`}]} /></View> : null}
      {error ? (
        <View style={styles.errorState}><Globe2 color={colors.muted} size={38} /><Text style={styles.errorTitle}>Page could not be loaded</Text><Text style={styles.errorBody}>{error}</Text><Pressable onPress={() => webView.current?.reload()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>
      ) : (
        <AndroidWebView
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
          setSupportMultipleWindows={false}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          injectedJavaScript={MEDIA_DETECTOR_SCRIPT}
          onMessage={handleMessage}
          onNavigationStateChange={updateNavigation}
          onLoadStart={() => {setLoading(true); setError(undefined);}}
          onLoadProgress={(event: {nativeEvent: {progress: number}}) => setProgress(event.nativeEvent.progress)}
          onLoadEnd={() => setLoading(false)}
          onError={(event: {nativeEvent: {description?: string}}) => {setLoading(false); setError(event.nativeEvent.description || 'Check your connection and try again.');}}
          onHttpError={(event: {nativeEvent: {statusCode: number}}) => {if (event.nativeEvent.statusCode >= 400) setError(`The website returned error ${event.nativeEvent.statusCode}.`);}}
          onShouldStartLoadWithRequest={(request: {url: string; isTopFrame?: boolean}) => {
            if (!request.isTopFrame) {
              const candidate = inferMediaFromUrl(request.url, active.url, pageTitle);
              if (candidate) addDetectedMedia(candidate);
            }
            return true;
          }}
        />
      )}
      {pageItems.length > 0 ? (
        <Pressable onPress={() => setQualityVisible(true)} style={styles.mediaFound}>
          <Download color={colors.white} size={18} />
          <Text style={styles.mediaFoundText}>Media found · {pageItems.length}</Text>
        </Pressable>
      ) : null}
      <View style={styles.webToolbar}>
        <Pressable disabled={!canGoBack} onPress={() => webView.current?.goBack()} style={styles.webAction}><ArrowLeft color={canGoBack ? colors.ink : '#B8C3D1'} size={21} /></Pressable>
        <Pressable disabled={!canGoForward} onPress={() => webView.current?.goForward()} style={styles.webAction}><ArrowRight color={canGoForward ? colors.ink : '#B8C3D1'} size={21} /></Pressable>
        <Pressable onPress={() => {setTabs(current => current.map(tab => tab.id === activeId ? {...tab, url: HOME, title: 'New tab'} : tab)); setAddress(''); clearDetectedMedia();}} style={styles.webAction}><Home color={colors.ink} size={21} /></Pressable>
        <Pressable onPress={() => toggleBookmark(pageTitle, active.url)} style={styles.webAction}><Bookmark color={saved ? colors.blue700 : colors.ink} fill={saved ? colors.blue700 : 'transparent'} size={21} /></Pressable>
        <Pressable onPress={() => Share.share({message: active.url, title: pageTitle})} style={styles.webAction}><Share2 color={colors.ink} size={21} /></Pressable>
        <Pressable onPress={() => setTabsVisible(true)} style={styles.tabCount}><Text style={styles.tabCountText}>{tabs.length}</Text></Pressable>
      </View>
      <QualitySheet visible={qualityVisible} items={pageItems} onClose={() => setQualityVisible(false)} onDownload={item => enqueueMedia(item, undefined, USER_AGENT)} />
      <TabsModal visible={tabsVisible} tabs={tabs} activeId={activeId} onClose={() => setTabsVisible(false)} onNew={newTab} onSelect={id => {setActiveId(id); setTabsVisible(false);}} onRemove={closeTab} />
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
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><View style={styles.modalPage}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Open tabs</Text><Pressable onPress={onNew} style={styles.modalNew}><Plus color={colors.white} size={18} /><Text style={styles.modalNewText}>New tab</Text></Pressable></View><SafeScrollView>{tabs.map(tab => <Pressable key={tab.id} onPress={() => onSelect(tab.id)} style={[styles.tabCard, tab.id === activeId && styles.tabCardActive]}><Globe2 color={colors.blue700} size={20} /><View style={styles.tabCopy}><Text numberOfLines={1} style={styles.tabTitle}>{tab.title}</Text><Text numberOfLines={1} style={styles.tabUrl}>{tab.url || 'New tab'}</Text></View><Pressable accessibilityLabel="Close tab" onPress={() => onRemove(tab.id)} style={styles.closeTab}><X color={colors.muted} size={19} /></Pressable></Pressable>)}</SafeScrollView><Pressable onPress={onClose} style={styles.modalDone}><Text style={styles.modalDoneText}>Done</Text></Pressable></View></Modal>;
}

function ListModal({type, history, bookmarks, onClose, onOpen}: {type: 'history' | 'bookmarks' | null; history: ReturnType<typeof useApp>['history']; bookmarks: ReturnType<typeof useApp>['bookmarks']; onClose: () => void; onOpen: (url: string) => void}) {
  const items = type === 'history' ? history : bookmarks;
  return <Modal visible={Boolean(type)} animationType="slide" onRequestClose={onClose}><View style={styles.modalPage}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{type === 'history' ? 'History' : 'Bookmarks'}</Text><Pressable onPress={onClose} style={styles.close}><X color={colors.ink} size={22} /></Pressable></View><SafeScrollView>{items.length === 0 ? <Text style={styles.emptyList}>Nothing saved here yet.</Text> : items.map(item => <Pressable key={item.id} onPress={() => onOpen(item.url)} style={styles.linkRow}><Globe2 color={colors.blue600} size={18} /><View style={styles.tabCopy}><Text numberOfLines={1} style={styles.tabTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.tabUrl}>{item.url}</Text></View></Pressable>)}</SafeScrollView></View></Modal>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  homeContent: {padding: spacing.lg, paddingBottom: spacing.xl},
  brandRow: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl},
  logo: {width: 52, height: 52, borderRadius: 14},
  brandCopy: {flex: 1, paddingHorizontal: spacing.md},
  brand: {fontSize: 19, fontWeight: '900', color: colors.blue950},
  tagline: {fontSize: 12, color: colors.muted, marginTop: 2},
  privateButton: {width: 42, height: 42, borderRadius: 21, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
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
  addressRow: {height: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingHorizontal: 6, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  navButton: {width: 38, height: 38, alignItems: 'center', justifyContent: 'center'},
  addressBar: {flex: 1, height: 39, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line},
  addressInput: {flex: 1, fontSize: 13, color: colors.ink, paddingVertical: 0},
  progressTrack: {height: 2, backgroundColor: colors.sky100},
  progressFill: {height: 2, backgroundColor: colors.blue600},
  webView: {flex: 1, backgroundColor: colors.white},
  errorState: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32},
  errorTitle: {fontSize: 19, fontWeight: '800', color: colors.ink, marginTop: spacing.lg},
  errorBody: {fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.muted, marginTop: spacing.sm},
  retry: {marginTop: spacing.lg, backgroundColor: colors.blue700, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 11},
  retryText: {color: colors.white, fontWeight: '800'},
  mediaFound: {position: 'absolute', right: 14, bottom: 65, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.blue700, borderRadius: radius.round, paddingHorizontal: 16, paddingVertical: 12, shadowColor: colors.black, shadowOpacity: 0.25, shadowRadius: 8, elevation: 7},
  mediaFoundText: {fontSize: 13, fontWeight: '800', color: colors.white},
  webToolbar: {height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  webAction: {flex: 1, height: 48, alignItems: 'center', justifyContent: 'center'},
  tabCount: {width: 30, height: 30, borderWidth: 2, borderColor: colors.ink, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginHorizontal: 15},
  tabCountText: {fontSize: 12, fontWeight: '800', color: colors.ink},
  modalPage: {flex: 1, backgroundColor: colors.surface, paddingTop: 18},
  modalHeader: {height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg},
  modalTitle: {fontSize: 24, fontWeight: '900', color: colors.ink},
  modalNew: {flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: colors.blue700, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9},
  modalNewText: {fontSize: 13, color: colors.white, fontWeight: '800'},
  tabCard: {minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, marginBottom: 10},
  tabCardActive: {borderColor: colors.blue600, backgroundColor: '#F4F9FF'},
  tabCopy: {flex: 1},
  tabTitle: {fontSize: 14, fontWeight: '800', color: colors.ink},
  tabUrl: {fontSize: 11, color: colors.muted, marginTop: 3},
  closeTab: {padding: 8},
  close: {padding: 8},
  modalDone: {margin: spacing.lg, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.blue700},
  modalDoneText: {fontSize: 15, fontWeight: '800', color: colors.white},
  emptyList: {textAlign: 'center', color: colors.muted, marginTop: 60},
});
