import type {DownloadItem} from '../types';

export function originalDownloadLink(item?: Pick<DownloadItem, 'pageUrl' | 'sourceUrl'>): string | undefined {
  for (const value of [item?.pageUrl, item?.sourceUrl]) {
    try {
      const url = new URL(value || '');
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch { /* Older records can have an empty page URL. */ }
  }
  return undefined;
}

export function deletionRequestUrl(reference: string): string {
  const body = `Please delete the server data associated with my Video Downloader installation.\n\nAnonymous installation reference: ${reference}\n\nPlease confirm when deletion is complete.`;
  return `mailto:info@oldalexhub.com?subject=${encodeURIComponent('Video Downloader data deletion request')}&body=${encodeURIComponent(body)}`;
}

export function dataRequestUrl(purpose: 'access' | 'delete', details: string): string {
  return `mailto:info@oldalexhub.com?subject=${encodeURIComponent(`Video Downloader data ${purpose === 'access' ? 'access' : 'deletion'} request`)}&body=${encodeURIComponent(details)}`;
}
