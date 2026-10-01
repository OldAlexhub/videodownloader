import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {BannerAd, BannerAdSize} from 'react-native-google-mobile-ads';
import {adConfig} from '../config/ads';
import {colors} from '../theme';
import {downloadManager} from '../native/DownloadManager';
import {useAdsReady} from './AdConsentContext';

export function SafeAdContainer() {
  const adsReady = useAdsReady();
  const [visible, setVisible] = useState(false);
  if (!adsReady) return null;
  return (
    <View style={visible ? styles.loaded : styles.collapsed} pointerEvents={visible ? 'auto' : 'none'}>
      <BannerAd
        unitId={adConfig.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{requestNonPersonalizedAdsOnly: false}}
        onAdLoaded={() => setVisible(true)}
        onAdImpression={() => downloadManager.trackEvent('ad_impression', {format: 'banner', placement: 'bottom_bar'}).catch(() => undefined)}
        onAdFailedToLoad={() => setVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loaded: {minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  collapsed: {height: 0, overflow: 'hidden'},
});
