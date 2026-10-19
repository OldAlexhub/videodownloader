import React, {useEffect, useState} from 'react';
import {AppState, Linking, Modal, Pressable, StatusBar, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import {remoteConfig} from './src/native/RemoteConfig';
import {SafeModalScreen, SafeScrollView} from './src/components/ScreenContainer';
import {requiresForcedUpdate} from './src/utils/update';

const PLAY_STORE_APP_URL = 'market://details?id=com.oldalexhub.videodownloader';
const PLAY_STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=com.oldalexhub.videodownloader';

function CurrentScreen() {
  const {activeTab} = useApp();

  useEffect(() => {
    const enteredAt = Date.now();
    return () => {
      downloadManager.trackEvent('screen_engagement', {screen: activeTab, durationMs: Date.now() - enteredAt}).catch(() => undefined);
    };
  }, [activeTab]);

  return (
    <>
      <View style={[styles.browserContainer, activeTab !== 'browser' && styles.hidden]}>
        <BrowserScreen />
      </View>
      {activeTab === 'downloads' ? <DownloadsScreen /> : null}
      {activeTab === 'library' ? <LibraryScreen /> : null}
      {activeTab === 'tools' ? <SmartToolsScreen /> : null}
      {activeTab === 'settings' ? <SettingsScreen /> : null}
    </>
  );
}

function AnalyticsDisclosure() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('v2-analytics-disclosure').then(value => setVisible(value !== 'seen')).catch(() => undefined);
  }, []);
  if (!visible) return null;
  return (
    <View accessibilityRole="summary" style={styles.disclosure}>
      <Text style={styles.disclosureText}>Anonymous performance, playback, and browser insights are on. No media, cookies, filenames, or full URLs are sent. Change either setting anytime.</Text>
      <Pressable onPress={() => {setVisible(false); AsyncStorage.setItem('v2-analytics-disclosure', 'seen').catch(() => undefined);}} style={styles.disclosureButton}><Text style={styles.disclosureButtonText}>Got it</Text></Pressable>
    </View>
  );
}

function ForceUpdateModal({visible}: {visible: boolean}) {
  const [openingStore, setOpeningStore] = useState(false);
  const [storeError, setStoreError] = useState(false);

  const openStore = async () => {
    setOpeningStore(true);
    setStoreError(false);
    try {
      await Linking.openURL(PLAY_STORE_APP_URL);
    } catch {
      try {
        await Linking.openURL(PLAY_STORE_WEB_URL);
      } catch {
        setStoreError(true);
      }
    } finally {
      setOpeningStore(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={() => undefined}
      statusBarTranslucent
      visible={visible}>
      <SafeModalScreen accessibilityViewIsModal style={styles.updateScreen}>
        <SafeScrollView contentContainerStyle={styles.updateScroll}>
          <View style={styles.updateCard}>
            <Text style={styles.updateEyebrow}>NEW VERSION AVAILABLE</Text>
            <Text accessibilityRole="header" style={styles.updateTitle}>Update required</Text>
            <Text style={styles.updateMessage}>A newer version is ready with important reliability and download improvements. Update from Google Play to keep using the app.</Text>
            {storeError ? <Text accessibilityRole="alert" selectable style={styles.updateError}>Google Play could not be opened. Visit {PLAY_STORE_WEB_URL}</Text> : null}
            <Pressable
              accessibilityHint="Opens this app's Google Play listing"
              accessibilityRole="button"
              disabled={openingStore}
              onPress={openStore}
              style={({pressed}) => [styles.updateButton, (pressed || openingStore) && styles.updateButtonPressed]}>
              <Text style={styles.updateButtonText}>{openingStore ? 'Opening Google Play…' : 'Update on Google Play'}</Text>
            </Pressable>
          </View>
        </SafeScrollView>
      </SafeModalScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  browserContainer: {flex: 1},
  hidden: {display: 'none'},
  disclosure: {position: 'absolute', zIndex: 20, top: 8, left: 12, right: 12, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 6, paddingVertical: 7, borderRadius: 14, backgroundColor: '#08295D', elevation: 8},
  disclosureText: {flex: 1, color: '#EAF3FF', fontSize: 11, lineHeight: 16},
  disclosureButton: {minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center'},
  disclosureButtonText: {color: '#FFFFFF', fontSize: 12, fontWeight: '900'},
  updateScreen: {backgroundColor: '#F2F7FF'},
  updateScroll: {flexGrow: 1, justifyContent: 'center', padding: 24},
  updateCard: {alignSelf: 'stretch', padding: 24, borderRadius: 24, backgroundColor: '#FFFFFF', elevation: 8},
  updateEyebrow: {color: '#2563EB', fontSize: 12, fontWeight: '900', letterSpacing: 0.8},
  updateTitle: {marginTop: 8, color: '#10213D', fontSize: 28, lineHeight: 34, fontWeight: '900'},
  updateMessage: {marginTop: 12, color: '#52627A', fontSize: 16, lineHeight: 24},
  updateError: {marginTop: 12, color: '#B42318', fontSize: 13, lineHeight: 19},
  updateButton: {minHeight: 52, marginTop: 24, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#155EEF'},
  updateButtonPressed: {opacity: 0.72},
  updateButtonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '900'},
});

function App() {
  const [adsReady, setAdsReady] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  useEffect(() => {
    let mounted = true;
    let sessionStartedAt = Date.now();
    let currentAppState = AppState.currentState;
    let updateCheck: Promise<void> | null = null;
    const checkForRequiredUpdate = () => {
      if (updateCheck) return;
      updateCheck = Promise.all([remoteConfig.load(), downloadManager.appVersionInfo()])
        .then(([config, app]) => {
          if (mounted) setForceUpdate(requiresForcedUpdate(app.versionCode, config.update));
        })
        .catch(() => undefined)
        .finally(() => { updateCheck = null; });
    };
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
    downloadManager.trackEvent('session_started', {entryPoint: 'cold_start'}).catch(() => undefined);
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      const wasActive = currentAppState === 'active';
      const isActive = nextState === 'active';
      currentAppState = nextState;
      if (!wasActive && isActive) {
        sessionStartedAt = Date.now();
        downloadManager.trackEvent('session_started', {entryPoint: 'resume'}).catch(() => undefined);
        checkForRequiredUpdate();
      } else if (wasActive && !isActive) {
        downloadManager.trackEvent('session_ended', {durationMs: Date.now() - sessionStartedAt, exitReason: nextState}).catch(() => undefined);
      }
    });
    checkForRequiredUpdate();
    return () => {
      mounted = false;
      appStateSubscription.remove();
      downloadManager.trackEvent('session_ended', {durationMs: Date.now() - sessionStartedAt, exitReason: 'unmount'}).catch(() => undefined);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppProvider>
        <AdConsentProvider ready={adsReady}>
          <AppShell>
            <CurrentScreen />
            <AnalyticsDisclosure />
          </AppShell>
        </AdConsentProvider>
      </AppProvider>
      <ForceUpdateModal visible={forceUpdate} />
    </SafeAreaProvider>
  );
}

export default App;
