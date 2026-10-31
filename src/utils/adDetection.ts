// Exact domain/segment matches avoid excluding normal paths such as /downloads/.
export const AD_HOSTS = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'imasdk.googleapis.com', 'adsrvr.org', 'adnxs.com', 'adsafeprotected.com', 'moatads.com', 'spotxchange.com', 'spotx.tv', 'pubmatic.com', 'rubiconproject.com', 'advertising.com'];
export const AD_PATH = /(?:^|\/)(?:ads?|advertisements?|adserver|adserving|preroll|midroll|postroll|vast|vpaid)(?:[/._-]|$)/i;
export const AD_QUERY_KEYS = ['ad_type', 'adformat', 'ad_unit', 'adunit', 'adtagurl', 'vast_url', 'vpaid'];

export function isAdvertisingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return AD_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`)) ||
      AD_PATH.test(decodeURIComponent(url.pathname)) ||
      Array.from(url.searchParams.keys()).some(key => AD_QUERY_KEYS.includes(key.toLowerCase()));
  } catch { return true; }
}

export const AD_CONTAINER_SELECTOR = [
  'ins.adsbygoogle', '[id^="google_ads_"]', '[data-ad-slot]', '[data-ad-unit]',
  '[aria-label="Advertisement" i]', '[aria-label="Sponsored" i]',
  '.ad-container', '.ad-slot', '.advertisement', '.video-ads', '.ima-ad-container',
  '.vjs-ad-playing', '.jw-flag-ads', '.html5-video-player.ad-showing',
].join(',');
