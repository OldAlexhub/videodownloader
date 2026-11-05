import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';
import {AdEventType, InterstitialAd} from 'react-native-google-mobile-ads';
import {remoteConfig} from '../native/RemoteConfig';
import {adConfig} from '../config/ads';
import {downloadManager} from '../native/DownloadManager';

const STORAGE_KEY = '@vdms/ads/interstitial/v1';

class InterstitialController {
  private allowed = false;
  private dismissal?: (shown: boolean) => void;
  private pending = false;
  readonly sessionStartedAt = Date.now();
  setAllowed(allowed: boolean) {this.allowed = allowed; if (!allowed) {clearTimeout(this.retryTimer); this.loaded = false;} else this.load();}
  private ad = InterstitialAd.createForAdRequest(adConfig.interstitial);
  private loaded = false;
  private showing = false;
  private sessionShows = 0;
  private actions = 0;
  private lastShown = 0;
  private initialized = false;
  private loading = false;
  private loadedAt = 0;
  private failures = 0;
  private retryAt = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;

  private load() {
    if (!this.allowed || remoteConfig.current().killSwitches?.interstitials || !this.initialized || this.loading || this.loaded || this.showing || Date.now() < this.retryAt || AppState.currentState !== 'active' || this.sessionShows >= adConfig.maximumInterstitialsPerSession) return;
    clearTimeout(this.retryTimer);
    this.loading = true;
    downloadManager.trackEvent('ad_request', {format: 'interstitial', placement: 'natural_transition'}).catch(() => undefined);
    this.ad.load();
  }

  private retry() {
    clearTimeout(this.retryTimer);
    const delay = Math.min(300_000, 30_000 * 2 ** Math.min(this.failures++, 4));
    this.retryAt = Date.now() + delay;
    this.retryTimer = setTimeout(() => this.load(), delay);
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.actions = 0;
        this.lastShown = Number(parsed.lastShown) || 0;
      } catch {
        // Invalid frequency state is safely reset.
      }
    }
    this.ad.addAdEventListener(AdEventType.LOADED, () => { this.loading = false; this.failures = 0; this.loadedAt = Date.now(); this.loaded = true; downloadManager.trackEvent('ad_load', {format: 'interstitial', placement: 'natural_transition'}).catch(() => undefined); });
    this.ad.addAdEventListener(AdEventType.CLOSED, () => {
      this.showing = false;
      this.loaded = false;
      this.dismissal?.(true); this.dismissal = undefined; this.pending = false;
      this.load();
    });
    this.ad.addAdEventListener(AdEventType.ERROR, error => {
      this.showing = false;
      this.loaded = false;
      this.loading = false;
      this.dismissal?.(false); this.dismissal = undefined; this.pending = false;
      downloadManager.trackEvent('ad_failure', {format: 'interstitial', placement: 'natural_transition', errorCode: String(error.code || 'unknown').replace(/[^a-z0-9_.-]/gi, '_')}).catch(() => undefined);
      this.retry();
    });
    this.ad.addAdEventListener(AdEventType.IMPRESSION, () => {
      this.sessionShows += 1; this.actions = 0; this.lastShown = Date.now(); this.persist().catch(() => undefined);
      downloadManager.trackEvent('ad_impression', {format: 'interstitial', placement: 'natural_transition'}).catch(() => undefined);
    });
    this.ad.addAdEventListener(AdEventType.PAID, paid => {
      downloadManager.trackEvent('ad_paid', {format: 'interstitial', placement: 'natural_transition', currency: paid.currency, precision: paid.precision, cohort: 'baseline', micros: Number(paid.valueMicros || Math.round(paid.value * 1_000_000))}).catch(() => undefined);
    });
    AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (Date.now() - this.loadedAt > 55 * 60 * 1000) this.loaded = false;
        this.load();
      }
    });
    this.load();
  }

  async naturalBreak(hasCompletedFirstSession: boolean): Promise<boolean> {
    if (!this.allowed || !this.initialized || this.pending || this.showing || remoteConfig.current().killSwitches?.interstitials || AppState.currentState !== 'active') return false;
    if (this.loaded && Date.now() - this.loadedAt > 55 * 60 * 1000) this.loaded = false;
    if (!this.loaded) this.load();
    this.actions += 1;
    const eligible = hasCompletedFirstSession &&
      this.loaded &&
      !this.showing &&
      this.actions >= adConfig.minimumActionsBetweenInterstitials &&
      Date.now() - this.lastShown >= adConfig.minimumInterstitialIntervalMs &&
      this.sessionShows < adConfig.maximumInterstitialsPerSession;
    if (!eligible) return false;
    this.pending = true;
    this.showing = true;
    return new Promise<boolean>(resolve => {
      this.dismissal = resolve;
      Promise.resolve().then(() => this.ad.show()).catch(() => {
        this.showing = false; this.loaded = false; this.pending = false;
        this.dismissal?.(false); this.dismissal = undefined; this.retry();
      });
    });
  }

  private persist() {
    return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({actions: this.actions, lastShown: this.lastShown}));
  }
}

export const interstitialController = new InterstitialController();
