import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useState} from 'react';
import {Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View} from 'react-native';
import {AdsConsent} from 'react-native-google-mobile-ads';
import {ChevronRight, Cookie, Database, Download, Folder, Globe2, Info, LockKeyhole, RotateCcw, Search, ShieldCheck, Trash2, Wifi, X} from 'lucide-react-native';
import {SafeScrollView} from '../components/ScreenContainer';
import {useApp} from '../context/AppContext';
import {downloadManager} from '../native/DownloadManager';
import type {AppSettings} from '../types';
import {colors, radius, spacing} from '../theme';

type Choice = {
  title: string;
  key: keyof AppSettings;
  options: Array<{label: string; value: string | number}>;
} | null;

export function SettingsScreen() {
  const {settings, updateSettings, clearHistory, refreshDownloads} = useApp();
  const [choice, setChoice] = useState<Choice>(null);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  const chooseFolder = async () => {
    try {
      const folder = await downloadManager.chooseDestination();
      await updateSettings({destinationUri: folder.uri, destinationName: folder.name});
    } catch (error) {
      if (error instanceof Error && !/cancel/i.test(error.message)) Alert.alert('Folder unavailable', error.message);
    }
  };

  const clearBrowser = (kind: 'cookies' | 'cache') => Alert.alert(`Clear browser ${kind}?`, `Saved ${kind} will be removed from the built-in browser.`, [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Clear', style: 'destructive', onPress: () => downloadManager.clearBrowserData(kind).catch(error => Alert.alert('Could not clear data', String(error)))},
  ]);

  const clearAll = () => Alert.alert('Clear all local app data?', 'This permanently deletes download records, partial files, browser data, settings, and files downloaded by this app. This cannot be undone.', [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Delete everything', style: 'destructive', onPress: async () => {await downloadManager.clearAllData(); await AsyncStorage.clear(); await refreshDownloads(); Alert.alert('Local data cleared');}},
  ]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}><Text style={styles.title}>Settings</Text><Text style={styles.subtitle}>Downloads, browser, advertising, and privacy</Text></View>
      <SafeScrollView>
        <SettingsSection title="Downloads">
          <SettingRow icon={<Download color={colors.blue700} size={20} />} title="Default quality" value={qualityLabel(settings.defaultQuality)} onPress={() => setChoice({title: 'Default quality', key: 'defaultQuality', options: [{label: 'Ask Every Time', value: 'ask'}, {label: 'Best Available', value: 'best'}, {label: 'Balanced', value: 'balanced'}, {label: 'Smallest', value: 'smallest'}]})} />
          <SettingRow icon={<Database color={colors.blue700} size={20} />} title="Parallel downloads" value={`${settings.parallelDownloads}`} onPress={() => setChoice({title: 'Parallel downloads', key: 'parallelDownloads', options: [1, 2, 3, 4].map(value => ({label: `${value}`, value}))})} />
          <SettingRow icon={<Folder color={colors.blue700} size={20} />} title="Default folder" value={settings.destinationName} onPress={chooseFolder} />
          <ToggleRow icon={<Wifi color={colors.blue700} size={20} />} title="Wi-Fi only" description="Queue downloads until Wi-Fi is available" value={settings.wifiOnly} onChange={value => updateSettings({wifiOnly: value})} />
          <ToggleRow icon={<RotateCcw color={colors.blue700} size={20} />} title="Resume automatically" description="Retry safe resumable downloads after interruptions" value={settings.resumeAutomatically} onChange={value => updateSettings({resumeAutomatically: value})} />
          <ToggleRow icon={<ShieldCheck color={colors.blue700} size={20} />} title="Keep screen awake" description="Only while an active download is visible in the foreground" value={settings.keepScreenAwake} onChange={value => updateSettings({keepScreenAwake: value})} />
          <ToggleRow icon={<ShieldCheck color={colors.blue700} size={20} />} title="Smart filenames" description="Use page titles and actual quality" value={settings.smartFilename} onChange={value => updateSettings({smartFilename: value})} />
          <ToggleRow icon={<Database color={colors.blue700} size={20} />} title="Duplicate detection" description="Warn before downloading a known match" value={settings.duplicateDetection} onChange={value => updateSettings({duplicateDetection: value})} last />
        </SettingsSection>

        <SettingsSection title="Browser">
          <SettingRow icon={<Search color={colors.blue700} size={20} />} title="Search engine" value={engineLabel(settings.searchEngine)} onPress={() => setChoice({title: 'Search engine', key: 'searchEngine', options: [{label: 'Google', value: 'google'}, {label: 'Bing', value: 'bing'}, {label: 'DuckDuckGo', value: 'duckduckgo'}]})} />
          <ToggleRow icon={<LockKeyhole color={colors.blue700} size={20} />} title="Start privately" description="Do not save history in new browser sessions" value={settings.privateByDefault} onChange={value => updateSettings({privateByDefault: value})} />
          <SettingRow icon={<Globe2 color={colors.blue700} size={20} />} title="Clear browser history" onPress={() => Alert.alert('Clear browser history?', 'Saved local browsing history will be removed.', [{text: 'Cancel', style: 'cancel'}, {text: 'Clear', style: 'destructive', onPress: clearHistory}])} />
          <SettingRow icon={<Cookie color={colors.blue700} size={20} />} title="Clear cookies" onPress={() => clearBrowser('cookies')} />
          <SettingRow icon={<Trash2 color={colors.blue700} size={20} />} title="Clear browser cache" onPress={() => clearBrowser('cache')} last />
        </SettingsSection>

        <SettingsSection title="Advertising & Privacy">
          <SettingRow icon={<Info color={colors.blue700} size={20} />} title="Ad disclosure" value="Free with ads" onPress={() => Alert.alert('Advertising disclosure', 'The app is free and supported by Google AdMob. Ads never unlock downloads, quality, speed, playback, or tools. Ad requests can process advertising identifiers, approximate location, app interactions, and diagnostics depending on your consent and device settings.')} />
          <ToggleRow icon={<Database color={colors.blue700} size={20} />} title="Performance analytics" description="Send limited usage, download metadata, ad, and performance events to Old Alex Hub" value={settings.analyticsEnabled} onChange={async value => {await updateSettings({analyticsEnabled: value}); await downloadManager.setAnalyticsEnabled(value);}} />
          <ToggleRow icon={<Search color={colors.blue700} size={20} />} title="Search & website insights" description="Optional: include submitted search terms and visited domains in aggregate reports. Requires Performance analytics; private sessions are excluded." value={settings.usageInsightsEnabled} onChange={async value => {await updateSettings({usageInsightsEnabled: value}); await downloadManager.setUsageInsightsEnabled(value);}} />
          <SettingRow icon={<ShieldCheck color={colors.blue700} size={20} />} title="Privacy choices" onPress={() => AdsConsent.showPrivacyOptionsForm().catch(() => Alert.alert('Privacy choices unavailable', 'A privacy options form is not required or is temporarily unavailable.'))} />
          <SettingRow icon={<LockKeyhole color={colors.blue700} size={20} />} title="Privacy policy" onPress={() => setPrivacyVisible(true)} last />
        </SettingsSection>

        <SettingsSection title="About">
          <View style={styles.aboutRow}><Image source={require('../../assets/logo.png')} style={imageStyles.logo} /><View><Text style={styles.aboutName}>Video Downloader & Media Saver</Text><Text style={styles.aboutMeta}>Version 1.0.2 · Old Alex Hub</Text></View></View>
          <View style={styles.notice}><Text style={styles.noticeText}>Only download media you own, have permission to download, or that is made available for downloading by the content provider. Protected media is not supported.</Text></View>
          <SettingRow icon={<Trash2 color={colors.danger} size={20} />} title="Clear all local app data" danger onPress={clearAll} last />
        </SettingsSection>
      </SafeScrollView>
      <ChoiceModal choice={choice} current={choice ? settings[choice.key] : undefined} onClose={() => setChoice(null)} onSelect={async value => {if (choice) await updateSettings({[choice.key]: value} as Partial<AppSettings>); setChoice(null);}} />
      <PrivacyModal visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />
    </View>
  );
}

function qualityLabel(value: AppSettings['defaultQuality']) { return value === 'ask' ? 'Ask Every Time' : value === 'best' ? 'Best Available' : value[0].toUpperCase() + value.slice(1); }
function engineLabel(value: AppSettings['searchEngine']) { return value === 'duckduckgo' ? 'DuckDuckGo' : value[0].toUpperCase() + value.slice(1); }

function SettingsSection({title, children}: React.PropsWithChildren<{title: string}>) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionCard}>{children}</View></View>;
}

function SettingRow({icon, title, value, onPress, last, danger}: {icon: React.ReactNode; title: string; value?: string; onPress: () => void; last?: boolean; danger?: boolean}) {
  return <Pressable onPress={onPress} style={[styles.row, last && styles.last]}><View style={styles.rowIcon}>{icon}</View><Text style={[styles.rowTitle, danger && {color: colors.danger}]}>{title}</Text>{value ? <Text numberOfLines={1} style={styles.rowValue}>{value}</Text> : null}<ChevronRight color={colors.muted} size={18} /></Pressable>;
}

function ToggleRow({icon, title, description, value, onChange, last}: {icon: React.ReactNode; title: string; description: string; value: boolean; onChange: (value: boolean) => void; last?: boolean}) {
  return <View style={[styles.row, styles.toggleRow, last && styles.last]}><View style={styles.rowIcon}>{icon}</View><View style={styles.toggleCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDescription}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{false: '#CBD5E1', true: '#8DD9CC'}} thumbColor={value ? colors.success : colors.white} /></View>;
}

function ChoiceModal({choice, current, onClose, onSelect}: {choice: Choice; current: unknown; onClose: () => void; onSelect: (value: string | number) => void}) {
  return <Modal visible={Boolean(choice)} transparent animationType="slide" onRequestClose={onClose}><Pressable onPress={onClose} style={styles.backdrop}><View style={styles.choiceSheet} onStartShouldSetResponder={() => true}><View style={styles.choiceHeader}><Text style={styles.choiceTitle}>{choice?.title}</Text><Pressable onPress={onClose}><X color={colors.ink} size={22} /></Pressable></View>{choice?.options.map(option => <Pressable key={`${option.value}`} onPress={() => onSelect(option.value)} style={styles.choiceRow}><Text style={[styles.choiceText, option.value === current && styles.choiceSelected]}>{option.label}</Text>{option.value === current ? <View style={styles.dot} /> : null}</Pressable>)}</View></Pressable></Modal>;
}

function PrivacyModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><View style={styles.privacy}><View style={styles.choiceHeader}><Text style={styles.choiceTitle}>Privacy summary</Text><Pressable onPress={onClose}><X color={colors.ink} size={22} /></Pressable></View><ScrollView contentContainerStyle={styles.privacyContent}><Text style={styles.privacyHeading}>Local app data</Text><Text style={styles.privacyText}>Download records, browser history, bookmarks, media metadata, and app preferences are stored locally. Private browsing does not add pages to local history. Downloaded media stays on the device or in a folder you select.</Text><Text style={styles.privacyHeading}>Old Alex Hub analytics</Text><Text style={styles.privacyText}>When performance analytics is enabled, the app sends a random installation ID, app and device version, locale, time zone, download title and filename text, source domain, media type, quality, byte counts, result, timing, and ad impression events to vd.server.oldalexhub.com. A separate Search & website insights setting (off by default) sends submitted search terms and visited site domains for aggregate top search and site reports. Private browsing is excluded, and full page URLs, paths, and query strings are not sent. The server may derive approximate city and country from the request IP. Media files, page cookies, and full signed URLs are not sent. Analytics failures never block app features. You can disable either setting in Settings.</Text><Text style={styles.privacyHeading}>Advertising</Text><Text style={styles.privacyText}>Google AdMob supports the free app. Google advertising services may process advertising identifiers, approximate location, app interactions, diagnostics, and related advertising data depending on configuration, consent, and device settings.</Text><Text style={styles.privacyHeading}>No account</Text><Text style={styles.privacyText}>No Old Alex Hub account is required. Internet access is used for browsing, downloads, analytics, ads, and consent messages.</Text><Text style={styles.privacyHeading}>Your responsibility</Text><Text style={styles.privacyText}>Only download media you own, have permission to save, or that the provider makes available for downloading. The app does not bypass DRM, paywalls, subscriptions, authentication, or access controls.</Text><Text style={styles.privacyHeading}>Children</Text><Text style={styles.privacyText}>This utility is not directed to children under 13. Contact Old Alex Hub using the support address in the Play Store listing for privacy requests.</Text></ScrollView></View></Modal>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  header: {padding: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line},
  title: {fontSize: 25, fontWeight: '900', color: colors.ink},
  subtitle: {fontSize: 12, color: colors.muted, marginTop: 4},
  section: {marginBottom: spacing.xl},
  sectionTitle: {fontSize: 13, fontWeight: '900', color: colors.blue800, marginLeft: 5, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5},
  sectionCard: {backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden'},
  row: {minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  toggleRow: {paddingVertical: 8},
  last: {borderBottomWidth: 0},
  rowIcon: {width: 34},
  rowTitle: {flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink},
  rowValue: {fontSize: 11, color: colors.muted, maxWidth: '38%', marginRight: 4},
  toggleCopy: {flex: 1, paddingRight: spacing.md},
  rowDescription: {fontSize: 10, lineHeight: 15, color: colors.muted, marginTop: 3},
  aboutRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg},
  aboutName: {fontSize: 14, fontWeight: '900', color: colors.ink},
  aboutMeta: {fontSize: 11, color: colors.muted, marginTop: 4},
  notice: {marginHorizontal: spacing.md, marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.warningSoft, borderRadius: radius.md},
  noticeText: {fontSize: 11, lineHeight: 17, color: colors.warning},
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,16,43,0.5)'},
  choiceSheet: {backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 30},
  choiceHeader: {minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  choiceTitle: {fontSize: 21, fontWeight: '900', color: colors.ink},
  choiceRow: {height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  choiceText: {fontSize: 14, color: colors.ink},
  choiceSelected: {fontWeight: '900', color: colors.blue700},
  dot: {width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue700},
  privacy: {flex: 1, backgroundColor: colors.white, paddingTop: 20, paddingHorizontal: spacing.lg},
  privacyContent: {paddingBottom: 40},
  privacyHeading: {fontSize: 16, fontWeight: '900', color: colors.ink, marginTop: spacing.lg},
  privacyText: {fontSize: 13, lineHeight: 21, color: colors.muted, marginTop: spacing.sm},
});

const imageStyles = StyleSheet.create({
  logo: {width: 54, height: 54, borderRadius: 15},
});
