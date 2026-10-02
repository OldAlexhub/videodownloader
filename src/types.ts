export type TabKey = 'browser' | 'downloads' | 'library' | 'tools' | 'settings';

export type DownloadStatus =
  | 'queued'
  | 'preparing'
  | 'downloading'
  | 'paused'
  | 'retrying'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MediaType = 'video' | 'audio' | 'image';

export interface DetectedMedia {
  id: string;
  groupKey: string;
  sourceUrl: string;
  pageUrl: string;
  title: string;
  mimeType: string;
  extension: string;
  mediaType: MediaType;
  qualityLabel: string;
  resolution?: string;
  width?: number;
  height?: number;
  estimatedBytes?: number;
  thumbnailUrl?: string;
  videoCodec?: string;
  audioCodec?: string;
  hasAudio?: boolean;
  isManifest?: boolean;
  isProtected?: boolean;
  confidence: number;
  headers?: Record<string, string>;
}

export interface DownloadItem {
  id: string;
  sourceUrl: string;
  pageUrl: string;
  title: string;
  originalFilename: string;
  finalFilename: string;
  mimeType: string;
  extension: string;
  mediaType: MediaType;
  resolution?: string;
  qualityLabel?: string;
  estimatedBytes: number;
  actualBytes: number;
  downloadedBytes: number;
  progress: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
  supportsRange: boolean;
  etag?: string;
  lastModified?: string;
  status: DownloadStatus;
  localUri?: string;
  thumbnailUri?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  failureCode?: string;
  failureMessage?: string;
  hash?: string;
  hiddenFromDownloads?: boolean;
}

export interface BrowserHistoryItem {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface AppSettings {
  defaultQuality: 'ask' | 'best' | 'balanced' | 'smallest';
  parallelDownloads: 1 | 2 | 3 | 4;
  wifiOnly: boolean;
  resumeAutomatically: boolean;
  keepScreenAwake: boolean;
  smartFilename: boolean;
  duplicateDetection: boolean;
  searchEngine: 'google' | 'bing' | 'duckduckgo';
  privateByDefault: boolean;
  destinationName: string;
  destinationUri?: string;
  analyticsEnabled: boolean;
  usageInsightsEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultQuality: 'ask',
  parallelDownloads: 2,
  wifiOnly: false,
  resumeAutomatically: true,
  keepScreenAwake: false,
  smartFilename: true,
  duplicateDetection: true,
  searchEngine: 'google',
  privateByDefault: false,
  destinationName: 'Video Downloader & Media Saver',
  analyticsEnabled: true,
  usageInsightsEnabled: true,
};
