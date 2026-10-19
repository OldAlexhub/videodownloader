import type {DetectedAsset, MediaVariant} from '../types';

function protocolOf(item: MediaVariant): NonNullable<MediaVariant['protocol']> {
  if (item.protocol) return item.protocol;
  if (item.extension.toLowerCase() === 'm3u8' || /mpegurl/i.test(item.mimeType)) return 'hls';
  if (item.extension.toLowerCase() === 'mpd' || /dash/i.test(item.mimeType)) return 'dash';
  return 'progressive';
}

function normalizedStem(url: string): string {
  try {
    const value = new URL(url);
    return value.pathname
      .replace(/\.(m3u8|mpd|mp4|m4v|webm|mov|mp3|m4a|aac|ogg|wav|flac|jpe?g|png|webp)$/i, '')
      .replace(/(?:^|[-_./])(2160|1440|1080|720|480|360|240)p?(?=$|[-_./])/i, '')
      .replace(/(?:^|[-_./])(high|medium|low|hd|sd|uhd|fhd)(?=$|[-_./])/ig, '')
      .replace(/\/+$/, '') || value.hostname;
  } catch {
    return url;
  }
}

export function assetKey(item: MediaVariant): string {
  if (item.assetId) return item.assetId;
  const explicit = item.groupKey && !item.groupKey.includes('|Detected media|') ? item.groupKey : '';
  if (explicit) return explicit;
  return `${item.documentId || item.pageUrl}|${item.mediaType}|${normalizedStem(item.sourceUrl)}`;
}

export function variantUsable(item: MediaVariant): boolean {
  return !item.isProtected && (item.inspectionState === undefined || item.inspectionState === 'ready') && item.supportState !== 'unsupported';
}

export function assetCountLabel(assets: DetectedAsset[]): string {
  const count = assets.length;
  const onlyType = count > 0 && assets.every(asset => asset.mediaType === assets[0].mediaType) ? assets[0].mediaType : undefined;
  if (onlyType === 'video') return `${count} ${count === 1 ? 'video' : 'videos'}`;
  if (onlyType === 'audio') return `${count} audio ${count === 1 ? 'track' : 'tracks'}`;
  if (onlyType === 'image') return `${count} ${count === 1 ? 'image' : 'images'}`;
  return `${count} ${count === 1 ? 'media item' : 'media items'}`;
}

function qualityScore(item: MediaVariant): number {
  const pixels = (item.width || 0) * (item.height || 0);
  return pixels || (item.height || 0) * 10_000 || item.bitrate || item.estimatedBytes || item.confidence;
}

export function chooseVariant(items: MediaVariant[], preference: 'best' | 'balanced' | 'smallest', balancedHeight = 720, requireAudio = true): MediaVariant | undefined {
  const usable = items.filter(variantUsable);
  if (!usable.length) return undefined;
  const withAudio = usable.filter(item => item.mediaType !== 'video' || item.audioMode === 'muxed' || item.audioMode === 'separate' || item.hasAudio);
  const pool = requireAudio && withAudio.length ? withAudio : usable;
  if (preference === 'best') {
    return [...pool].sort((a, b) => qualityScore(b) - qualityScore(a) || (b.bitrate || 0) - (a.bitrate || 0))[0];
  }
  if (preference === 'smallest') {
    return [...pool].sort((a, b) => {
      const aSize = a.estimatedBytes || Number.MAX_SAFE_INTEGER;
      const bSize = b.estimatedBytes || Number.MAX_SAFE_INTEGER;
      return aSize - bSize || qualityScore(a) - qualityScore(b);
    })[0];
  }
  return [...pool].sort((a, b) => {
    const aDistance = a.height ? Math.abs(a.height - balancedHeight) : 10_000;
    const bDistance = b.height ? Math.abs(b.height - balancedHeight) : 10_000;
    return aDistance - bDistance || Number(Boolean(b.estimatedBytes)) - Number(Boolean(a.estimatedBytes)) || (a.estimatedBytes || 0) - (b.estimatedBytes || 0);
  })[0];
}

export function groupMedia(items: MediaVariant[], documentId = ''): DetectedAsset[] {
  const groups = new Map<string, MediaVariant[]>();
  items
    .filter(item => !documentId || !item.documentId || item.documentId === documentId)
    .forEach(item => {
      const key = assetKey(item);
      groups.set(key, [...(groups.get(key) || []), {...item, protocol: protocolOf(item)}]);
    });
  return [...groups.entries()].map(([id, variants]) => {
    const sorted = [...variants].sort((a, b) => qualityScore(b) - qualityScore(a) || b.confidence - a.confidence);
    const representative = sorted[0];
    return {
      id,
      documentId: representative.documentId || documentId,
      title: representative.title || 'Detected media',
      mediaType: representative.mediaType,
      thumbnailUrl: sorted.find(item => item.thumbnailUrl)?.thumbnailUrl,
      durationMs: sorted.find(item => item.durationMs)?.durationMs,
      prominence: Math.max(...sorted.map(item => item.confidence + (item.thumbnailUrl ? 5 : 0))),
      variants: sorted,
    };
  }).sort((a, b) => b.prominence - a.prominence);
}

export function upsertVariant(current: MediaVariant[], incoming: MediaVariant): MediaVariant[] {
  const key = incoming.candidateKey || incoming.id;
  const existingIndex = current.findIndex(item => (item.candidateKey || item.id) === key || item.sourceUrl === incoming.sourceUrl && item.qualityLabel === incoming.qualityLabel);
  let next: MediaVariant[];
  if (existingIndex >= 0) {
    next = [...current];
    next[existingIndex] = {...next[existingIndex], ...incoming, confidence: Math.max(next[existingIndex].confidence, incoming.confidence)};
  } else {
    next = [...current, incoming];
  }
  return next
    .filter(item => !(item.mediaType === 'image' && item.width && item.height && item.width * item.height < 120000))
    .sort((a, b) => qualityScore(b) - qualityScore(a) || b.confidence - a.confidence)
    .slice(0, 80);
}
