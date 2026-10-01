import React, {useEffect, useMemo, useState} from 'react';
import {Alert, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {CopyCheck, Database, FileCheck2, FileVideo, Gauge, HardDrive, Search, Sparkles, Trash2, X} from 'lucide-react-native';
import {EmptyState} from '../components/EmptyState';
import {SafeScrollView} from '../components/ScreenContainer';
import {useApp} from '../context/AppContext';
import {downloadManager} from '../native/DownloadManager';
import type {DownloadItem} from '../types';
import {colors, radius, spacing} from '../theme';
import {formatBytes} from '../utils/format';

interface StorageStats {videos: number; audio: number; images: number; temporary: number}

export function SmartToolsScreen() {
  const {downloads, settings, updateSettings, detectedMedia, refreshDownloads} = useApp();
  const [storage, setStorage] = useState<StorageStats>({videos: 0, audio: 0, images: 0, temporary: 0});
  const [duplicatesVisible, setDuplicatesVisible] = useState(false);
  const completed = downloads.filter(item => item.status === 'completed');
  const duplicates = useMemo(() => findDuplicates(completed), [completed]);
  const recommendation = useMemo(() => {
    const video = detectedMedia.filter(item => item.mediaType === 'video' && !item.isProtected);
    const balanced = video.find(item => item.height === 720) || [...video].sort((a, b) => Math.abs((a.height || 720) - 720) - Math.abs((b.height || 720) - 720))[0];
    const best = [...video].sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    if (!balanced) return undefined;
    const saving = best?.estimatedBytes && balanced.estimatedBytes ? Math.max(0, Math.round((1 - balanced.estimatedBytes / best.estimatedBytes) * 100)) : undefined;
    return {item: balanced, reason: saving && saving > 0 ? `Good quality with about ${saving}% less storage than ${best.qualityLabel}.` : 'A practical balance of source quality and storage use.'};
  }, [detectedMedia]);

  const refreshStorage = () => downloadManager.storageStats().then(setStorage).catch(() => undefined);
  useEffect(() => { refreshStorage(); }, [downloads]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}><Text style={styles.title}>Smart Tools</Text><Text style={styles.subtitle}>Transparent, on-device helpers for your media library</Text></View>
      <SafeScrollView>
        <View style={styles.featureCard}>
          <View style={styles.featureIcon}><CopyCheck color={colors.teal500} size={27} /></View>
          <View style={styles.featureCopy}><Text style={styles.featureTitle}>Duplicate Finder</Text><Text style={styles.featureBody}>Checks exact hashes, source URLs, and file sizes stored on this device.</Text></View>
          <Pressable onPress={() => setDuplicatesVisible(true)} style={styles.openButton}><Text style={styles.openButtonText}>{duplicates.length ? `${duplicates.length} found` : 'Scan'}</Text></Pressable>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIcon}><Sparkles color={colors.blue700} size={27} /></View>
          <View style={styles.featureCopy}><Text style={styles.featureTitle}>Smart File Naming</Text><Text style={styles.featureBody}>Uses the page title and actual quality, then removes unsafe filename characters.</Text></View>
          <Pressable onPress={() => updateSettings({smartFilename: !settings.smartFilename})} style={[styles.statePill, settings.smartFilename && styles.statePillOn]}><Text style={[styles.stateText, settings.smartFilename && styles.stateTextOn]}>{settings.smartFilename ? 'On' : 'Off'}</Text></Pressable>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIcon}><Gauge color={colors.blue700} size={27} /></View>
          <View style={styles.featureCopy}><Text style={styles.featureTitle}>Quality Recommendation</Text><Text style={styles.featureBody}>{recommendation ? `Recommended: ${recommendation.item.qualityLabel}. ${recommendation.reason}` : 'Open a supported media page to compare the qualities that page actually exposes.'}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Storage overview</Text>
        <View style={styles.storageCard}>
          <StorageRow icon={<FileVideo color={colors.blue700} size={19} />} label="Videos" value={storage.videos} />
          <StorageRow icon={<Database color={colors.teal500} size={19} />} label="Audio" value={storage.audio} />
          <StorageRow icon={<FileCheck2 color={colors.blue600} size={19} />} label="Images" value={storage.images} />
          <StorageRow icon={<HardDrive color={colors.warning} size={19} />} label="Temporary files" value={storage.temporary} />
          <Pressable onPress={() => Alert.alert('Clear temporary files?', 'Only completed or abandoned download fragments are removed. Your downloaded media stays in place.', [{text: 'Cancel', style: 'cancel'}, {text: 'Clear', onPress: async () => {await downloadManager.clearTemporaryFiles(); refreshStorage();}}])} style={styles.clearButton}><Trash2 color={colors.danger} size={17} /><Text style={styles.clearText}>Clear temporary files</Text></Pressable>
        </View>
      </SafeScrollView>
      <DuplicateModal visible={duplicatesVisible} groups={duplicates} onClose={() => setDuplicatesVisible(false)} onOpen={item => downloadManager.open(item.id)} onDelete={item => Alert.alert('Delete duplicate?', item.finalFilename, [{text: 'Cancel', style: 'cancel'}, {text: 'Delete', style: 'destructive', onPress: async () => {await downloadManager.remove(item.id, true); await refreshDownloads();}}])} />
    </View>
  );
}

function findDuplicates(items: DownloadItem[]): DownloadItem[][] {
  const groups = new Map<string, DownloadItem[]>();
  items.forEach(item => {
    const key = item.hash ? `hash:${item.hash}` : `source:${item.sourceUrl}|${item.actualBytes}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return [...groups.values()].filter(group => group.length > 1);
}

function StorageRow({icon, label, value}: {icon: React.ReactNode; label: string; value: number}) {
  return <View style={styles.storageRow}>{icon}<Text style={styles.storageLabel}>{label}</Text><Text style={styles.storageValue}>{formatBytes(value)}</Text></View>;
}

function DuplicateModal({visible, groups, onClose, onOpen, onDelete}: {visible: boolean; groups: DownloadItem[][]; onClose: () => void; onOpen: (item: DownloadItem) => void; onDelete: (item: DownloadItem) => void}) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><View style={styles.modal}><View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Duplicate Finder</Text><Text style={styles.modalSubtitle}>No files are removed automatically.</Text></View><Pressable onPress={onClose} style={styles.close}><X color={colors.ink} size={22} /></Pressable></View>{groups.length === 0 ? <EmptyState icon={<Search color={colors.blue600} size={32} />} title="No likely duplicates" message="The completed library does not contain matching hashes or source and size pairs." /> : <SafeScrollView>{groups.map((group, index) => <View key={`${group[0].id}-${index}`} style={styles.duplicateGroup}><Text style={styles.duplicateTitle}>Matching group · {group.length} files</Text>{group.map(item => <View key={item.id} style={styles.duplicateRow}><View style={styles.featureCopy}><Text numberOfLines={1} style={styles.fileName}>{item.finalFilename}</Text><Text style={styles.fileMeta}>{formatBytes(item.actualBytes)}</Text></View><Pressable onPress={() => onOpen(item)} style={styles.smallButton}><Text style={styles.smallButtonText}>Open</Text></Pressable><Pressable onPress={() => onDelete(item)} style={styles.deleteButton}><Trash2 color={colors.danger} size={17} /></Pressable></View>)}</View>)}</SafeScrollView>}</View></Modal>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  header: {padding: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line},
  title: {fontSize: 25, fontWeight: '900', color: colors.ink},
  subtitle: {fontSize: 12, color: colors.muted, marginTop: 4},
  featureCard: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md},
  featureIcon: {width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sky100},
  featureCopy: {flex: 1, paddingHorizontal: spacing.md},
  featureTitle: {fontSize: 15, fontWeight: '900', color: colors.ink},
  featureBody: {fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3},
  openButton: {backgroundColor: colors.blue700, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.md},
  openButtonText: {fontSize: 11, fontWeight: '800', color: colors.white},
  statePill: {paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.round, backgroundColor: colors.surface},
  statePillOn: {backgroundColor: colors.successSoft},
  stateText: {fontSize: 11, fontWeight: '800', color: colors.muted},
  stateTextOn: {color: colors.success},
  sectionTitle: {fontSize: 18, fontWeight: '900', color: colors.ink, marginTop: spacing.sm, marginBottom: spacing.md},
  storageCard: {backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md},
  storageRow: {height: 43, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  storageLabel: {flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink},
  storageValue: {fontSize: 12, color: colors.muted},
  clearButton: {height: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft},
  clearText: {fontSize: 12, fontWeight: '800', color: colors.danger},
  modal: {flex: 1, backgroundColor: colors.surface, paddingTop: 20},
  modalHeader: {height: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg},
  modalTitle: {fontSize: 23, fontWeight: '900', color: colors.ink},
  modalSubtitle: {fontSize: 11, color: colors.muted, marginTop: 3},
  close: {padding: spacing.sm},
  duplicateGroup: {backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md},
  duplicateTitle: {fontSize: 13, fontWeight: '900', color: colors.ink, marginBottom: spacing.sm},
  duplicateRow: {minHeight: 58, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  fileName: {fontSize: 12, fontWeight: '700', color: colors.ink},
  fileMeta: {fontSize: 10, color: colors.muted, marginTop: 3},
  smallButton: {paddingHorizontal: 10, paddingVertical: 7},
  smallButtonText: {fontSize: 11, fontWeight: '800', color: colors.blue700},
  deleteButton: {padding: 8},
});
