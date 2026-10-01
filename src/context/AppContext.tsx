import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Alert, AppState} from 'react-native';
import type {
  AppSettings,
  Bookmark,
  BrowserHistoryItem,
  DetectedMedia,
  DownloadItem,
  TabKey,
} from '../types';
import {DEFAULT_SETTINGS} from '../types';
import {downloadManager} from '../native/DownloadManager';

const STORAGE = {
  settings: '@vdms/settings/v1',
  history: '@vdms/history/v1',
  bookmarks: '@vdms/bookmarks/v1',
};

interface AppContextValue {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  browserTarget?: string;
  openBrowser: (url?: string) => void;
  downloads: DownloadItem[];
  refreshDownloads: () => Promise<void>;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  history: BrowserHistoryItem[];
  addHistory: (title: string, url: string, isPrivate: boolean) => Promise<void>;
  clearHistory: () => Promise<void>;
  bookmarks: Bookmark[];
  toggleBookmark: (title: string, url: string) => Promise<void>;
  detectedMedia: DetectedMedia[];
  addDetectedMedia: (item: DetectedMedia) => void;
  clearDetectedMedia: () => void;
  enqueueMedia: (item: DetectedMedia, cookie?: string, userAgent?: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function parseStored<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function AppProvider({children}: PropsWithChildren) {
  const [activeTab, setActiveTab] = useState<TabKey>('browser');
  const [browserTarget, setBrowserTarget] = useState<string>();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<BrowserHistoryItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [detectedMedia, setDetectedMedia] = useState<DetectedMedia[]>([]);
  const refreshInFlight = useRef(false);

  const refreshDownloads = useCallback(async () => {
    if (refreshInFlight.current) {
      return;
    }
    refreshInFlight.current = true;
    try {
      setDownloads(await downloadManager.list());
    } catch (error) {
      if (__DEV__) {
        console.warn('Unable to read downloads', error);
      }
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE.settings),
      AsyncStorage.getItem(STORAGE.history),
      AsyncStorage.getItem(STORAGE.bookmarks),
    ]).then(([storedSettings, storedHistory, storedBookmarks]) => {
      setSettings({...DEFAULT_SETTINGS, ...parseStored(storedSettings, {})});
      setHistory(parseStored(storedHistory, []));
      setBookmarks(parseStored(storedBookmarks, []));
    });
    refreshDownloads();
    downloadManager.initialSharedUrl().then(url => {
      if (url) {
        setBrowserTarget(url);
        setActiveTab('browser');
      }
    }).catch(() => undefined);
  }, [refreshDownloads]);

  useEffect(() => {
    const timer = setInterval(refreshDownloads, 1200);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshDownloads();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refreshDownloads]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(current => {
      const next = {...current, ...patch};
      AsyncStorage.setItem(STORAGE.settings, JSON.stringify(next));
      return next;
    });
  }, []);

  const addHistory = useCallback(async (title: string, url: string, isPrivate: boolean) => {
    if (isPrivate || !/^https?:\/\//i.test(url)) {
      return;
    }
    setHistory(current => {
      const next = [
        {id: `${Date.now()}-${url}`, title: title || url, url, visitedAt: Date.now()},
        ...current.filter(item => item.url !== url),
      ].slice(0, 250);
      AsyncStorage.setItem(STORAGE.history, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(STORAGE.history);
  }, []);

  const toggleBookmark = useCallback(async (title: string, url: string) => {
    setBookmarks(current => {
      const exists = current.some(item => item.url === url);
      const next = exists
        ? current.filter(item => item.url !== url)
        : [{id: `${Date.now()}-${url}`, title: title || url, url, createdAt: Date.now()}, ...current];
      AsyncStorage.setItem(STORAGE.bookmarks, JSON.stringify(next));
      return next;
    });
  }, []);

  const addDetectedMedia = useCallback((incoming: DetectedMedia) => {
    setDetectedMedia(current => {
      const existingIndex = current.findIndex(item =>
        item.sourceUrl === incoming.sourceUrl ||
        (item.groupKey === incoming.groupKey &&
          item.qualityLabel === incoming.qualityLabel &&
          item.mimeType === incoming.mimeType),
      );
      if (existingIndex >= 0) {
        const existing = current[existingIndex];
        if (incoming.confidence <= existing.confidence) {
          return current;
        }
        const next = [...current];
        next[existingIndex] = {...existing, ...incoming};
        return next;
      }
      return [...current, incoming]
        .filter(item => !(item.mediaType === 'image' && item.width && item.height && item.width * item.height < 120000))
        .sort((a, b) => (b.height || 0) - (a.height || 0) || b.confidence - a.confidence)
        .slice(0, 40);
    });
  }, []);

  const clearDetectedMedia = useCallback(() => setDetectedMedia([]), []);

  const enqueueMedia = useCallback(async (
    item: DetectedMedia,
    cookie?: string,
    userAgent?: string,
  ) => {
    if (item.isProtected) {
      Alert.alert('Protected media', 'Protected media cannot be downloaded.');
      return;
    }
    if (settings.duplicateDetection) {
      const duplicate = downloads.find(download =>
        download.status === 'completed' &&
        (download.sourceUrl === item.sourceUrl ||
          (item.estimatedBytes && download.actualBytes === item.estimatedBytes && download.title === item.title)),
      );
      if (duplicate) {
        return new Promise<void>(resolve => {
          Alert.alert('This file already exists', duplicate.finalFilename, [
            {text: 'Cancel', style: 'cancel', onPress: () => resolve()},
            {text: 'Open existing', onPress: () => { downloadManager.open(duplicate.id); resolve(); }},
            {text: 'Download another copy', onPress: async () => {
              await downloadManager.enqueue({media: item, cookie, userAgent, destinationUri: settings.destinationUri, wifiOnly: settings.wifiOnly});
              await refreshDownloads();
              resolve();
            }},
          ]);
        });
      }
    }
    await downloadManager.enqueue({
      media: item,
      cookie,
      userAgent,
      destinationUri: settings.destinationUri,
      wifiOnly: settings.wifiOnly,
    });
    await refreshDownloads();
    setActiveTab('downloads');
  }, [downloads, refreshDownloads, settings]);

  const openBrowser = useCallback((url?: string) => {
    setBrowserTarget(url ? `${url}${url.includes('#') ? '&' : '#'}vdms=${Date.now()}` : undefined);
    setActiveTab('browser');
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    activeTab,
    setActiveTab,
    browserTarget,
    openBrowser,
    downloads,
    refreshDownloads,
    settings,
    updateSettings,
    history,
    addHistory,
    clearHistory,
    bookmarks,
    toggleBookmark,
    detectedMedia,
    addDetectedMedia,
    clearDetectedMedia,
    enqueueMedia,
  }), [
    activeTab, browserTarget, downloads, settings, history, bookmarks, detectedMedia,
    refreshDownloads, updateSettings, addHistory, clearHistory, toggleBookmark,
    addDetectedMedia, clearDetectedMedia, enqueueMedia, openBrowser,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return value;
}
