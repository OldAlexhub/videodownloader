import React, {useEffect, useState} from 'react';
import {StatusBar} from 'react-native';
import mobileAds, {AdsConsent} from 'react-native-google-mobile-ads';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AppShell} from './src/components/AppShell';
import {AppProvider, useApp} from './src/context/AppContext';
import {BrowserScreen} from './src/screens/BrowserScreen';
import {DownloadsScreen} from './src/screens/DownloadsScreen';
import {LibraryScreen} from './src/screens/LibraryScreen';
import {SettingsScreen} from './src/screens/SettingsScreen';
import {SmartToolsScreen} from './src/screens/SmartToolsScreen';
import {downloadManager} from './src/native/DownloadManager';
import {interstitialController} from './src/ads/interstitial';
import {AdConsentProvider} from './src/ads/AdConsentContext';

function CurrentScreen() {
  const {activeTab} = useApp();
  if (activeTab === 'downloads') return <DownloadsScreen />;
  if (activeTab === 'library') return <LibraryScreen />;
  if (activeTab === 'tools') return <SmartToolsScreen />;
  if (activeTab === 'settings') return <SettingsScreen />;
  return <BrowserScreen />;
}

function App() {
  const [adsReady, setAdsReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    AdsConsent.gatherConsent()
      .catch(() => AdsConsent.getConsentInfo())
      .then(info => {
        if (mounted && info.canRequestAds) {
          return mobileAds().initialize().then(() => {
            setAdsReady(true);
            return interstitialController.initialize();
          });
        }
      })
      .catch(() => undefined);
    downloadManager.trackEvent('app_open', {}).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppProvider>
        <AdConsentProvider ready={adsReady}>
          <AppShell>
            <CurrentScreen />
          </AppShell>
        </AdConsentProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

export default App;
