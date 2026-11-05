import React, {useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, View} from 'react-native';
import {BannerAd, BannerAdSize} from 'react-native-google-mobile-ads';
import {adConfig} from '../config/ads';
import {colors} from '../theme';
import {downloadManager} from '../native/DownloadManager';
import {useAdsReady} from './AdConsentContext';
const requestOptions = {requestNonPersonalizedAdsOnly: false};

export function SafeAdContainer({placement = 'downloads'}: {placement?: string}) {
  const adsReady = useAdsReady();
  const [visible, setVisible] = useState(true);
  const banner = useRef<BannerAd>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failures = useRef(0);
  const retry = () => {
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      if (AppState.currentState === 'active') { setVisible(true); banner.current?.load(); }
      else retry();
    }, Math.min(300_000, 30_000 * 2 ** Math.min(failures.current++, 4)));
  };
  useEffect(() => {
    return () => clearTimeout(retryTimer.current);
  }, [adsReady, placement]);
  if (!adsReady) return null;
  return (
    <View style={visible ? styles.loaded : styles.collapsed} pointerEvents={visible ? 'auto' : 'none'}>
      <BannerAd
        ref={banner}
        unitId={adConfig.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={requestOptions}
        onAdLoaded={() => {
          clearTimeout(retryTimer.current); failures.current = 0; setVisible(true);
          // The SDK refreshes banners internally. Count each observed request outcome,
          // including automatic refreshes, instead of counting only the first mount.
          downloadManager.trackEvent('ad_request', {format: 'banner', placement}).catch(() => undefined);
          downloadManager.trackEvent('ad_load', {format: 'banner', placement}).catch(() => undefined);
        }}
        onAdImpression={() => downloadManager.trackEvent('ad_impression', {format: 'banner', placement}).catch(() => undefined)}
        onAdFailedToLoad={error => {
          setVisible(false);
          downloadManager.trackEvent('ad_request', {format: 'banner', placement}).catch(() => undefined);
          downloadManager.trackEvent('ad_failure', {format: 'banner', placement, errorCode: String(error.code || 'unknown').replace(/[^a-z0-9_.-]/gi, '_')}).catch(() => undefined);
          retry();
        }}
        onPaid={paid => downloadManager.trackEvent('ad_paid', {format: 'banner', placement, currency: paid.currency, precision: paid.precision, cohort: 'baseline', micros: Number(paid.valueMicros || Math.round(paid.value * 1_000_000))}).catch(() => undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loaded: {minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  collapsed: {height: 0, overflow: 'hidden'},
});
