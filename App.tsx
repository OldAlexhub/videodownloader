import React, {useEffect} from 'react';
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
import {colors} from './src/theme';
import {downloadManager} from './src/native/DownloadManager';

function CurrentScreen() {
  const {activeTab} = useApp();
  if (activeTab === 'downloads') return <DownloadsScreen />;
  if (activeTab === 'library') return <LibraryScreen />;
  if (activeTab === 'tools') return <SmartToolsScreen />;
  if (activeTab === 'settings') return <SettingsScreen />;
  return <BrowserScreen />;
}

function App() {
  useEffect(() => {
    let mounted = true;
    AdsConsent.gatherConsent()
      .catch(() => AdsConsent.getConsentInfo())
      .then(info => {
        if (mounted && info.canRequestAds) {
          return mobileAds().initialize();
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
        <AppShell>
          <CurrentScreen />
        </AppShell>
      </AppProvider>
    </SafeAreaProvider>
  );
}

export default App;
