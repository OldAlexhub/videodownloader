import AsyncStorage from '@react-native-async-storage/async-storage';
import {AdEventType, InterstitialAd} from 'react-native-google-mobile-ads';
import {adConfig} from '../config/ads';
import {downloadManager} from '../native/DownloadManager';

const STORAGE_KEY = '@vdms/ads/interstitial/v1';

class InterstitialController {
  private ad = InterstitialAd.createForAdRequest(adConfig.interstitial);
  private loaded = false;
  private showing = false;
  private sessionShows = 0;
  private actions = 0;
  private lastShown = 0;
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.actions = Number(parsed.actions) || 0;
        this.lastShown = Number(parsed.lastShown) || 0;
      } catch {
        // Invalid frequency state is safely reset.
      }
    }
    this.ad.addAdEventListener(AdEventType.LOADED, () => { this.loaded = true; downloadManager.trackEvent('ad_load', {format: 'interstitial', placement: 'natural_transition'}).catch(() => undefined); });
    this.ad.addAdEventListener(AdEventType.CLOSED, () => {
      this.showing = false;
      this.loaded = false;
      this.ad.load();
    });
    this.ad.addAdEventListener(AdEventType.ERROR, error => {
      this.showing = false;
      this.loaded = false;
      downloadManager.trackEvent('ad_failure', {format: 'interstitial', placement: 'natural_transition', errorCode: String(error.code || 'unknown').replace(/[^a-z0-9_.-]/gi, '_')}).catch(() => undefined);
    });
    this.ad.addAdEventListener(AdEventType.IMPRESSION, () => {
      downloadManager.trackEvent('ad_impression', {format: 'interstitial', placement: 'natural_transition'}).catch(() => undefined);
    });
    this.ad.addAdEventListener(AdEventType.PAID, paid => {
      downloadManager.trackEvent('ad_paid', {format: 'interstitial', placement: 'natural_transition', currency: paid.currency, micros: Number(paid.valueMicros || Math.round(paid.value * 1_000_000))}).catch(() => undefined);
    });
    downloadManager.trackEvent('ad_request', {format: 'interstitial', placement: 'natural_transition'}).catch(() => undefined);
    this.ad.load();
  }

  async naturalBreak(hasCompletedFirstSession: boolean): Promise<boolean> {
    this.actions += 1;
    await this.persist();
    const eligible = hasCompletedFirstSession &&
      this.loaded &&
      !this.showing &&
      this.actions >= adConfig.minimumActionsBetweenInterstitials &&
      Date.now() - this.lastShown >= adConfig.minimumInterstitialIntervalMs &&
      this.sessionShows < adConfig.maximumInterstitialsPerSession;
    if (!eligible) return false;
    this.showing = true;
    this.sessionShows += 1;
    this.actions = 0;
    this.lastShown = Date.now();
    await this.persist();
    this.ad.show().catch(() => {
      this.showing = false;
      this.loaded = false;
    });
    return true;
  }

  private persist() {
    return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({actions: this.actions, lastShown: this.lastShown}));
  }
}

export const interstitialController = new InterstitialController();
