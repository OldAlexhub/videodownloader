import React, {PropsWithChildren, ReactNode} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Bot, Download, Globe2, Library, Settings} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {TabKey} from '../types';
import {colors} from '../theme';
import {useApp} from '../context/AppContext';
import {SafeAdContainer} from '../ads/SafeAdContainer';
import {interstitialController} from '../ads/interstitial';

const tabs: Array<{key: TabKey; label: string; icon: (color: string) => ReactNode}> = [
  {key: 'browser', label: 'Browser', icon: color => <Globe2 color={color} size={21} />},
  {key: 'downloads', label: 'Downloads', icon: color => <Download color={color} size={21} />},
  {key: 'library', label: 'Library', icon: color => <Library color={color} size={21} />},
  {key: 'tools', label: 'Tools', icon: color => <Bot color={color} size={21} />},
  {key: 'settings', label: 'Settings', icon: color => <Settings color={color} size={21} />},
];

export function AppShell({children}: PropsWithChildren) {
  const {activeTab, setActiveTab, downloads} = useApp();
  const insets = useSafeAreaInsets();
  const showBanner = activeTab !== 'browser';
  return (
    <View style={[styles.shell, {paddingTop: insets.top}]}>
      <View style={styles.content}>{children}</View>
      {showBanner ? <SafeAdContainer /> : null}
      <View style={[styles.bottomBar, {paddingBottom: insets.bottom}]}>
        {tabs.map(tab => {
          const active = tab.key === activeTab;
          const tint = active ? colors.blue700 : colors.muted;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              key={tab.key}
              onPress={() => {
                const naturalBreak = activeTab !== tab.key && (activeTab === 'downloads' || activeTab === 'library');
                if (naturalBreak) {
                  const completed = downloads.filter(item => item.status === 'completed').length;
                  interstitialController.naturalBreak(completed >= 2).finally(() => setActiveTab(tab.key));
                } else setActiveTab(tab.key);
              }}
              style={styles.tab}>
              <View style={[styles.iconWrap, active && styles.activeIcon]}>{tab.icon(tint)}</View>
              <Text numberOfLines={1} style={[styles.tabLabel, {color: tint}]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {flex: 1, backgroundColor: colors.white},
  content: {flex: 1, backgroundColor: colors.surface},
  bottomBar: {minHeight: 64, flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  tab: {flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 7, paddingHorizontal: 2},
  iconWrap: {width: 36, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  activeIcon: {backgroundColor: colors.sky100},
  tabLabel: {fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 1},
});
