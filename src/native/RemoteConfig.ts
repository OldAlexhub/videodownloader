import AsyncStorage from '@react-native-async-storage/async-storage';
import {downloadManager} from './DownloadManager';

export interface RemoteConfig {
  revision: string;
  expiresAt: string | null;
  detector: {minimumImagePixels: number; inspectionTimeoutMs: number};
  recommendation: {balancedHeight: number; requireAudio: boolean};
  telemetry: {sampleRate: number; batchSize: number};
  experiments: Record<string, boolean | number | string>;
  killSwitches: {adaptiveDownloads: boolean; interstitials?: boolean; enhancedDetection?: boolean};
  update: {force: boolean; minimumVersionCode: number};
}

export const SAFE_REMOTE_CONFIG: RemoteConfig = {
  revision: 'bundled-safe-defaults-v2',
  expiresAt: null,
  detector: {minimumImagePixels: 120_000, inspectionTimeoutMs: 10_000},
  recommendation: {balancedHeight: 720, requireAudio: true},
  telemetry: {sampleRate: 1, batchSize: 25},
  experiments: {},
  killSwitches: {adaptiveDownloads: false, interstitials: false, enhancedDetection: false},
  // Turn this on remotely only after the matching Play release is live.
  update: {force: false, minimumVersionCode: 7},
};

const STORAGE_KEY = 'remote-config-v2';
let active = SAFE_REMOTE_CONFIG;

function valid(value: unknown): value is RemoteConfig {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RemoteConfig>;
  if (typeof item.revision !== 'string' || !/^[a-z0-9_.-]{1,40}$/i.test(item.revision) || !item.detector || !item.recommendation || !item.telemetry || !item.killSwitches || !item.update) return false;
  if (item.expiresAt !== null && item.expiresAt !== undefined) {
    if (typeof item.expiresAt !== 'string') return false;
    const expiry = Date.parse(item.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  }
  if (!item.experiments || typeof item.experiments !== 'object' || Array.isArray(item.experiments)) return false;
  if (Object.values(item.experiments).some(setting => !['boolean', 'number', 'string'].includes(typeof setting))) return false;
  return Number.isFinite(item.detector.minimumImagePixels) && item.detector.minimumImagePixels >= 0
    && Number.isFinite(item.detector.inspectionTimeoutMs) && item.detector.inspectionTimeoutMs >= 1000
    && Number.isFinite(item.recommendation.balancedHeight) && item.recommendation.balancedHeight >= 144
    && typeof item.recommendation.requireAudio === 'boolean'
    && Number.isFinite(item.telemetry.sampleRate)
    && item.telemetry.sampleRate >= 0 && item.telemetry.sampleRate <= 1
    && Number.isInteger(item.telemetry.batchSize)
    && item.telemetry.batchSize >= 1 && item.telemetry.batchSize <= 50
    && ['interstitials', 'enhancedDetection'].every(key => (item.killSwitches as any)[key] === undefined || typeof (item.killSwitches as any)[key] === 'boolean')
    && typeof item.killSwitches.adaptiveDownloads === 'boolean'
    && typeof item.update.force === 'boolean'
    && Number.isInteger(item.update.minimumVersionCode)
    && item.update.minimumVersionCode >= 0;
}

export const remoteConfig = {
  current: () => {
    if (active.expiresAt && Date.parse(active.expiresAt) <= Date.now()) active = SAFE_REMOTE_CONFIG;
    return active;
  },
  load: async (): Promise<RemoteConfig> => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    let cached: {etag?: string; value?: unknown} = {};
    try { cached = stored ? JSON.parse(stored) : {}; } catch { /* Ignore corrupt cache. */ }
    const usableCache = valid(cached.value);
    active = usableCache ? cached.value as RemoteConfig : SAFE_REMOTE_CONFIG;
    await downloadManager.configureTelemetry(active.revision, active.telemetry.sampleRate, active.telemetry.batchSize).catch(() => undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('https://vd.server.oldalexhub.com/v2/config', {signal: controller.signal, headers: usableCache && cached.etag ? {'If-None-Match': cached.etag} : {}});
      if (response.status === 304) {
        return active;
      }
      if (!response.ok) return active;
      const value: unknown = await response.json();
      if (!valid(value)) return active;
      active = value;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({etag: response.headers.get('ETag') || undefined, value}));
    } catch {
      // Safe bundled or last-known-valid configuration remains active.
    } finally {clearTimeout(timeout);}
    await downloadManager.configureTelemetry(active.revision, active.telemetry.sampleRate, active.telemetry.batchSize).catch(() => undefined);
    return active;
  },
};
