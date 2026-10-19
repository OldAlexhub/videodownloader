import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {BannerAd, BannerAdSize} from 'react-native-google-mobile-ads';
import {adConfig} from '../config/ads';
import {colors} from '../theme';
import {downloadManager} from '../native/DownloadManager';
import {useAdsReady} from './AdConsentContext';

export function SafeAdContainer() {
  const adsReady = useAdsReady();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (adsReady) downloadManager.trackEvent('ad_request', {format: 'banner', placement: 'bottom_bar'}).catch(() => undefined);
  }, [adsReady]);
  if (!adsReady) return null;
  return (
    <View style={visible ? styles.loaded : styles.collapsed} pointerEvents={visible ? 'auto' : 'none'}>
      <BannerAd
        unitId={adConfig.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{requestNonPersonalizedAdsOnly: false}}
        onAdLoaded={() => {setVisible(true); downloadManager.trackEvent('ad_load', {format: 'banner', placement: 'bottom_bar'}).catch(() => undefined);}}
        onAdImpression={() => downloadManager.trackEvent('ad_impression', {format: 'banner', placement: 'bottom_bar'}).catch(() => undefined)}
        onAdFailedToLoad={error => {setVisible(false); downloadManager.trackEvent('ad_failure', {format: 'banner', placement: 'bottom_bar', errorCode: String(error.code || 'unknown').replace(/[^a-z0-9_.-]/gi, '_')}).catch(() => undefined);}}
        onPaid={paid => downloadManager.trackEvent('ad_paid', {format: 'banner', placement: 'bottom_bar', currency: paid.currency, micros: Number(paid.valueMicros || Math.round(paid.value * 1_000_000))}).catch(() => undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loaded: {minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  collapsed: {height: 0, overflow: 'hidden'},
});
