import {NativeModules, Platform} from 'react-native';
import type {DetectedMedia, DownloadItem} from '../types';
import {cleanFilename} from '../utils/format';

interface EnqueueOptions {
  media: DetectedMedia;
  cookie?: string;
  userAgent?: string;
  destinationUri?: string;
  wifiOnly?: boolean;
}

interface NativeDownloadManagerShape {
  listDownloads(): Promise<DownloadItem[]>;
  enqueueDownload(payload: Record<string, unknown>): Promise<string>;
  pauseDownload(id: string): Promise<boolean>;
  resumeDownload(id: string): Promise<boolean>;
  cancelDownload(id: string): Promise<boolean>;
  deleteDownload(id: string, deleteFile: boolean): Promise<boolean>;
  renameDownload(id: string, name: string): Promise<string>;
  openDownload(id: string): Promise<boolean>;
  shareDownload(id: string): Promise<boolean>;
  chooseDestination(): Promise<{uri: string; name: string}>;
  clearCompleted(): Promise<number>;
  clearTemporaryFiles(): Promise<number>;
  getStorageStats(): Promise<{videos: number; audio: number; images: number; temporary: number}>;
  getInitialSharedUrl(): Promise<string | null>;
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
  enqueue: ({media, cookie, userAgent, destinationUri, wifiOnly}: EnqueueOptions) => {
    const suggested = media.qualityLabel && media.qualityLabel !== 'Source'
      ? `${media.title} - ${media.qualityLabel}`
      : media.title;
    return requireNative().enqueueDownload({
      ...media,
      finalFilename: cleanFilename(suggested, media.extension),
      cookie: cookie || '',
      userAgent: userAgent || '',
      referer: media.pageUrl,
      destinationUri: destinationUri || '',
      wifiOnly: Boolean(wifiOnly),
    });
  },
  pause: (id: string) => requireNative().pauseDownload(id),
  resume: (id: string) => requireNative().resumeDownload(id),
  cancel: (id: string) => requireNative().cancelDownload(id),
  remove: (id: string, deleteFile = false) => requireNative().deleteDownload(id, deleteFile),
  rename: (id: string, name: string) => requireNative().renameDownload(id, name),
  open: (id: string) => requireNative().openDownload(id),
  share: (id: string) => requireNative().shareDownload(id),
  chooseDestination: () => requireNative().chooseDestination(),
  clearCompleted: () => requireNative().clearCompleted(),
  clearTemporaryFiles: () => requireNative().clearTemporaryFiles(),
  storageStats: () => requireNative().getStorageStats(),
  initialSharedUrl: () => requireNative().getInitialSharedUrl(),
};
