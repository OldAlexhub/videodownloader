import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {BannerAd, BannerAdSize} from 'react-native-google-mobile-ads';
import {adConfig} from '../config/ads';
import {colors} from '../theme';

export function SafeAdContainer() {
  const [visible, setVisible] = useState(false);
  return (
    <View style={visible ? styles.loaded : styles.collapsed} pointerEvents={visible ? 'auto' : 'none'}>
      <BannerAd
        unitId={adConfig.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{requestNonPersonalizedAdsOnly: false}}
        onAdLoaded={() => setVisible(true)}
        onAdFailedToLoad={() => setVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loaded: {minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  collapsed: {height: 0, overflow: 'hidden'},
});
