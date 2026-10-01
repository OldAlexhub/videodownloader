import React, {useEffect, useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
  NativeAdEventType,
} from 'react-native-google-mobile-ads';
import {adConfig} from '../config/ads';
import {colors, radius, spacing} from '../theme';
import {downloadManager} from '../native/DownloadManager';

export function NativeSponsoredCard() {
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);

  useEffect(() => {
    let mounted = true;
    let loadedAd: NativeAd | null = null;
    NativeAd.createForAdRequest(adConfig.native, {requestNonPersonalizedAdsOnly: false})
      .then(ad => {
        loadedAd = ad;
        ad.addAdEventListener(NativeAdEventType.IMPRESSION, () => {
          downloadManager.trackEvent('ad_impression', {format: 'native', placement: 'browser_home'}).catch(() => undefined);
        });
        if (mounted) {
          setNativeAd(ad);
        } else {
          ad.destroy();
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      loadedAd?.destroy();
    };
  }, []);

  if (!nativeAd) {
    return null;
  }

  return (
    <NativeAdView nativeAd={nativeAd} style={styles.card}>
      <View style={styles.sponsoredRow}>
        <Text style={styles.sponsored}>Sponsored</Text>
      </View>
      <View style={styles.contentRow}>
        {nativeAd.icon ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{uri: nativeAd.icon.url}} style={styles.icon} />
          </NativeAsset>
        ) : null}
        <View style={styles.copy}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text numberOfLines={2} style={styles.headline}>{nativeAd.headline}</Text>
          </NativeAsset>
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text numberOfLines={2} style={styles.body}>{nativeAd.body}</Text>
          </NativeAsset>
        </View>
      </View>
      {nativeAd.mediaContent ? <NativeMediaView style={styles.media} resizeMode="cover" /> : null}
      <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
        <View style={styles.cta}><Text style={styles.ctaText}>{nativeAd.callToAction}</Text></View>
      </NativeAsset>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: {backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, marginVertical: spacing.md, overflow: 'hidden'},
  sponsoredRow: {flexDirection: 'row', marginBottom: spacing.sm},
  sponsored: {fontSize: 10, fontWeight: '800', color: colors.warning, borderWidth: 1, borderColor: '#E7C67D', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2},
  contentRow: {flexDirection: 'row', alignItems: 'center'},
  icon: {width: 44, height: 44, borderRadius: 10, marginRight: spacing.md},
  copy: {flex: 1},
  headline: {fontSize: 15, lineHeight: 20, fontWeight: '800', color: colors.ink},
  body: {fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2},
  media: {height: 150, borderRadius: radius.md, marginTop: spacing.md},
  cta: {marginTop: spacing.md, backgroundColor: colors.blue700, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center'},
  ctaText: {fontSize: 13, fontWeight: '800', color: colors.white},
});
