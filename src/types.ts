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

export type SourceProtocol = 'progressive' | 'hls' | 'dash';
export type AudioMode = 'muxed' | 'separate' | 'none' | 'unknown';
export type MediaInspectionState = 'probing' | 'ready' | 'unsupported' | 'protected' | 'expired';
export type DetectionSource = 'element' | 'source' | 'fetch' | 'xhr' | 'navigation' | 'manifest' | 'link';

export interface RawMediaCandidate {
  candidateKey: string;
  sourceUrl: string;
  pageUrl: string;
  documentId: string;
  elementId?: string;
  parentManifestUrl?: string;
  title: string;
  mimeType?: string;
  contentLength?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  posterUrl?: string;
  detectionSource: DetectionSource;
  active?: boolean;
  prominent?: boolean;
}

export interface MediaVariant {
  id: string;
  candidateKey?: string;
  assetId?: string;
  groupKey: string;
  sourceUrl: string;
  pageUrl: string;
  documentId?: string;
  title: string;
  mimeType: string;
  extension: string;
  mediaType: MediaType;
  protocol?: SourceProtocol;
  container?: string;
  bitrate?: number;
  durationMs?: number;
  audioMode?: AudioMode;
  inspectionState?: MediaInspectionState;
  supportState?: 'supported' | 'unsupported';
  unsupportedReason?: string;
  detectionSource?: DetectionSource;
  selectionToken?: string;
  language?: string;
  frameRate?: number;
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

/** @deprecated Kept as a compatibility alias for the native bridge. */
export type DetectedMedia = MediaVariant;

export interface DetectedAsset {
  id: string;
  documentId: string;
  title: string;
  mediaType: MediaType;
  thumbnailUrl?: string;
  durationMs?: number;
  prominence: number;
  variants: MediaVariant[];
}

export interface DownloadSelection {
  assetId: string;
  variant: MediaVariant;
  finalFilename?: string;
  destinationUri?: string;
  flowId: string;
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
  assetId?: string;
  variantId?: string;
  protocol?: SourceProtocol;
  videoCodec?: string;
  audioCodec?: string;
  audioMode?: AudioMode;
  durationMs?: number;
  flowId?: string;
  processingStage?: string;
  playbackPositionMs?: number;
  watchedPercent?: number;
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
  preferredQuality: 'best' | 'balanced' | 'smallest';
  parallelDownloads: 1 | 2 | 3 | 4;
  wifiOnly: boolean;
  resumeAutomatically: boolean;
  keepScreenAwake: boolean;
  smartFilename: boolean;
  duplicateDetection: boolean;
  searchEngine: 'google' | 'bing' | 'duckduckgo';
  privateByDefault: boolean;
  blockWebsiteAds: boolean;
  destinationName: string;
  destinationUri?: string;
  analyticsEnabled: boolean;
  usageInsightsEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  preferredQuality: 'balanced',
  parallelDownloads: 2,
  wifiOnly: false,
  resumeAutomatically: true,
  keepScreenAwake: false,
  smartFilename: true,
  duplicateDetection: true,
  searchEngine: 'google',
  privateByDefault: false,
  blockWebsiteAds: true,
  destinationName: 'Video Downloader & Media Saver',
  analyticsEnabled: true,
  usageInsightsEnabled: true,
};
