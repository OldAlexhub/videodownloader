import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import type {DetectedMedia, DownloadItem, DownloadSelection} from '../types';
import {cleanFilename} from '../utils/format';

interface EnqueueOptions {
  media: DetectedMedia;
  cookie?: string;
  userAgent?: string;
  destinationUri?: string;
  wifiOnly?: boolean;
  parallelDownloads?: number;
  resumeAutomatically?: boolean;
  smartFilename?: boolean;
  finalFilename?: string;
  flowId?: string;
}

interface NativeDownloadManagerShape {
  listDownloads(): Promise<DownloadItem[]>;
  enqueueDownload(payload: Record<string, unknown>): Promise<string>;
  enqueueDownloads?(payloads: Array<Record<string, unknown>>): Promise<string[]>;
  pauseDownload(id: string): Promise<boolean>;
  resumeDownload(id: string): Promise<boolean>;
  restartDownload(id: string): Promise<boolean>;
  cancelDownload(id: string): Promise<boolean>;
  deleteDownload(id: string, deleteFile: boolean): Promise<boolean>;
  renameDownload(id: string, name: string): Promise<string>;
  openDownload(id: string): Promise<boolean>;
  shareDownload(id: string): Promise<boolean>;
  moveDownload(id: string, destinationUri: string): Promise<string>;
  chooseDestination(): Promise<{uri: string; name: string}>;
  clearCompleted(): Promise<number>;
  clearTemporaryFiles(): Promise<number>;
  getStorageStats(): Promise<{videos: number; audio: number; images: number; temporary: number}>;
  getInitialSharedUrl(): Promise<string | null>;
  clearBrowserData(kind: string): Promise<boolean>;
  clearAllData(): Promise<boolean>;
  setAnalyticsEnabled(enabled: boolean): Promise<boolean>;
  setUsageInsightsEnabled(enabled: boolean): Promise<boolean>;
  trackEvent(name: string, properties: Record<string, string | number | boolean>): Promise<boolean>;
  trackUsageInsight(name: 'search_performed' | 'site_visited', properties: Record<string, string>): Promise<boolean>;
  inspectManifest(sourceUrl: string, pageUrl: string, title: string): Promise<DetectedMedia[]>;
  inspectCandidates?(candidates: DetectedMedia[]): Promise<Array<Partial<DetectedMedia> & {candidateKey: string}>>;
  setKeepScreenAwake(enabled: boolean): Promise<boolean>;
  deleteServerAnalytics?(): Promise<boolean>;
  configureTelemetry?(revision: string, sampleRate: number, batchSize: number): Promise<boolean>;
  getAppVersionInfo(): Promise<{versionCode: number; versionName: string; packageName: string}>;
}

const nativeModule = NativeModules.VDDownloadManager as NativeDownloadManagerShape | undefined;

function requireNative(): NativeDownloadManagerShape {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('The Android download service is unavailable.');
  }
  return nativeModule;
}

export const downloadManager = {
  list: () => requireNative().listDownloads(),
  enqueue: ({media, cookie, userAgent, destinationUri, wifiOnly, parallelDownloads, resumeAutomatically, smartFilename, finalFilename, flowId}: EnqueueOptions) => {
    const sourceBase = (() => {
      try { return decodeURIComponent(new URL(media.sourceUrl).pathname.split('/').pop() || 'download').replace(/\.[a-z0-9]{2,8}$/i, ''); }
      catch { return 'download'; }
    })();
    const suggested = finalFilename?.replace(/\.[a-z0-9]{2,8}$/i, '') || (smartFilename === false ? sourceBase : media.qualityLabel && media.qualityLabel !== 'Source'
      ? `${media.title} - ${media.qualityLabel}`
      : media.title);
    return requireNative().enqueueDownload({
      ...media,
      finalFilename: cleanFilename(suggested, media.extension),
      cookie: cookie || '',
      userAgent: userAgent || '',
      referer: media.pageUrl,
      destinationUri: destinationUri || '',
      wifiOnly: Boolean(wifiOnly),
      parallelDownloads: parallelDownloads || 2,
      resumeAutomatically: resumeAutomatically !== false,
      assetId: media.assetId || media.groupKey,
      variantId: media.id,
      protocol: media.protocol || (media.extension === 'm3u8' ? 'hls' : media.extension === 'mpd' ? 'dash' : 'progressive'),
      videoCodec: media.videoCodec || '',
      audioCodec: media.audioCodec || '',
      audioMode: media.audioMode || (media.hasAudio ? 'muxed' : 'unknown'),
      durationMs: media.durationMs || 0,
      selectionToken: media.selectionToken || '',
      flowId: flowId || '',
    });
  },
  enqueueSelections: async (selections: DownloadSelection[], options: Omit<EnqueueOptions, 'media' | 'finalFilename' | 'flowId'> = {}) => {
    const manager = requireNative();
    const payloads = selections.map(selection => {
      const media = selection.variant;
      const sourceBase = (() => {
        try { return decodeURIComponent(new URL(media.sourceUrl).pathname.split('/').pop() || 'download').replace(/\.[a-z0-9]{2,8}$/i, ''); }
        catch { return 'download'; }
      })();
      const suggested = selection.finalFilename?.replace(/\.[a-z0-9]{2,8}$/i, '') || (options.smartFilename === false ? sourceBase : `${media.title}${media.qualityLabel && media.qualityLabel !== 'Source' ? ` - ${media.qualityLabel}` : ''}`);
      return {
        ...media,
        finalFilename: cleanFilename(suggested, media.extension),
        cookie: options.cookie || '',
        userAgent: options.userAgent || '',
        referer: media.pageUrl,
        destinationUri: selection.destinationUri || options.destinationUri || '',
        wifiOnly: Boolean(options.wifiOnly),
        parallelDownloads: options.parallelDownloads || 2,
        resumeAutomatically: options.resumeAutomatically !== false,
        assetId: selection.assetId,
        variantId: media.id,
        protocol: media.protocol || (media.extension === 'm3u8' ? 'hls' : media.extension === 'mpd' ? 'dash' : 'progressive'),
        videoCodec: media.videoCodec || '',
        audioCodec: media.audioCodec || '',
        audioMode: media.audioMode || (media.hasAudio ? 'muxed' : 'unknown'),
        durationMs: media.durationMs || 0,
        selectionToken: media.selectionToken || '',
        flowId: selection.flowId,
      };
    });
    if (manager.enqueueDownloads) return manager.enqueueDownloads(payloads);
    return Promise.all(payloads.map(payload => manager.enqueueDownload(payload)));
  },
  pause: (id: string) => requireNative().pauseDownload(id),
  resume: (id: string) => requireNative().resumeDownload(id),
  restart: (id: string) => requireNative().restartDownload(id),
  cancel: (id: string) => requireNative().cancelDownload(id),
  remove: (id: string, deleteFile = false) => requireNative().deleteDownload(id, deleteFile),
  rename: (id: string, name: string) => requireNative().renameDownload(id, name),
  open: (id: string) => requireNative().openDownload(id),
  share: (id: string) => requireNative().shareDownload(id),
  move: (id: string, destinationUri: string) => requireNative().moveDownload(id, destinationUri),
  chooseDestination: () => requireNative().chooseDestination(),
  clearCompleted: () => requireNative().clearCompleted(),
  clearTemporaryFiles: () => requireNative().clearTemporaryFiles(),
  storageStats: () => requireNative().getStorageStats(),
  initialSharedUrl: () => requireNative().getInitialSharedUrl(),
  clearBrowserData: (kind: 'cookies' | 'cache' | 'all') => requireNative().clearBrowserData(kind),
  clearAllData: () => requireNative().clearAllData(),
  setAnalyticsEnabled: (enabled: boolean) => requireNative().setAnalyticsEnabled(enabled),
  setUsageInsightsEnabled: (enabled: boolean) => requireNative().setUsageInsightsEnabled(enabled),
  trackEvent: (name: string, properties: Record<string, string | number | boolean> = {}) => requireNative().trackEvent(name, properties),
  trackUsageInsight: (name: 'search_performed' | 'site_visited', properties: Record<string, string>) => requireNative().trackUsageInsight(name, properties),
  inspectManifest: (sourceUrl: string, pageUrl: string, title: string) => requireNative().inspectManifest(sourceUrl, pageUrl, title),
  inspectCandidates: (candidates: DetectedMedia[]) => requireNative().inspectCandidates?.(candidates) ?? Promise.resolve([]),
  setKeepScreenAwake: (enabled: boolean) => requireNative().setKeepScreenAwake(enabled),
  deleteServerAnalytics: () => requireNative().deleteServerAnalytics?.() ?? Promise.resolve(false),
  configureTelemetry: (revision: string, sampleRate: number, batchSize: number) => requireNative().configureTelemetry?.(revision, sampleRate, batchSize) ?? Promise.resolve(false),
  appVersionInfo: () => requireNative().getAppVersionInfo(),
  subscribeToUpdates: (listener: () => void) => {
    const manager = requireNative() as NativeDownloadManagerShape & object;
    const emitter = new NativeEventEmitter(manager as never);
    const subscription = emitter.addListener('VDDownloadChanged', listener);
    return () => subscription.remove();
  },
};
