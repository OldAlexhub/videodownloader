import {TestIds} from 'react-native-google-mobile-ads';

const production = {
  appId: 'ca-app-pub-7831002909037560~8100766073',
  banner: 'ca-app-pub-7831002909037560/6900288488',
  interstitial: 'ca-app-pub-7831002909037560/5474602730',
  native: 'ca-app-pub-7831002909037560/3016883795',
};

export const adConfig = {
  appId: production.appId,
  banner: __DEV__ ? TestIds.ADAPTIVE_BANNER : production.banner,
  interstitial: __DEV__ ? TestIds.INTERSTITIAL : production.interstitial,
  native: __DEV__ ? TestIds.NATIVE : production.native,
  minimumActionsBetweenInterstitials: 3,
  minimumInterstitialIntervalMs: 8 * 60 * 1000,
  maximumInterstitialsPerSession: 4,
};
