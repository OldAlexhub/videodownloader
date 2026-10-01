import React, {useMemo, useState} from 'react';
import {Alert, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {Pause, Play, Share2, Trash2, Edit3, Info, XCircle} from 'lucide-react-native';
import {DownloadCard} from '../components/DownloadCard';
import {EmptyState} from '../components/EmptyState';
import {RenameDialog} from '../components/RenameDialog';
import {SafeScrollView} from '../components/ScreenContainer';
import {SectionHeader} from '../components/SectionHeader';
import {useApp} from '../context/AppContext';
import {downloadManager} from '../native/DownloadManager';
import type {DownloadItem} from '../types';
import {colors, radius, spacing} from '../theme';
import {formatBytes, formatDate} from '../utils/format';

export function DownloadsScreen() {
  const {downloads, refreshDownloads, openBrowser} = useApp();
  const [selected, setSelected] = useState<DownloadItem>();
  const [rename, setRename] = useState<DownloadItem>();
  const active = useMemo(() => downloads.filter(item => ['queued', 'preparing', 'downloading', 'paused', 'retrying', 'processing'].includes(item.status)), [downloads]);
  const completed = useMemo(() => downloads.filter(item => item.status === 'completed'), [downloads]);
  const failed = useMemo(() => downloads.filter(item => ['failed', 'cancelled'].includes(item.status)), [downloads]);

  const perform = async (action: () => Promise<unknown>) => {
    try { await action(); await refreshDownloads(); } catch (error) { Alert.alert('Action unavailable', error instanceof Error ? error.message : 'Please try again.'); }
  };

  const confirmCancel = (item: DownloadItem) => Alert.alert('Cancel download?', 'The partial file will be removed.', [
    {text: 'Keep downloading', style: 'cancel'},
    {text: 'Cancel download', style: 'destructive', onPress: () => perform(() => downloadManager.cancel(item.id))},
  ]);

  const resume = (item: DownloadItem) => {
    if (item.downloadedBytes > 0 && !item.supportsRange) {
      Alert.alert('Restart required', 'This server does not support resumable downloads. Restarting will discard the partial file.', [
        {text: 'Keep partial file', style: 'cancel'},
        {text: 'Restart', style: 'destructive', onPress: () => perform(() => downloadManager.restart(item.id))},
      ]);
      return;
    }
    perform(() => downloadManager.resume(item.id));
  };

  const card = (item: DownloadItem) => (
    <DownloadCard
      key={item.id}
      item={item}
      onPause={() => perform(() => downloadManager.pause(item.id))}
      onResume={() => resume(item)}
      onCancel={() => confirmCancel(item)}
      onOpen={() => perform(() => downloadManager.open(item.id))}
      onMore={() => setSelected(item)}
      onRetry={() => resume(item)}
    />
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}><View><Text style={styles.title}>Downloads</Text><Text style={styles.subtitle}>{active.length} active · {completed.length} completed</Text></View></View>
      {downloads.length === 0 ? <EmptyState title="No downloads yet" message="Detected media you save will appear here with live progress and controls." action="Browse media" onAction={() => openBrowser()} /> : (
        <SafeScrollView refreshControl={undefined}>
          {active.length > 0 ? (
            <>
              <SectionHeader title="Active" />
              <View style={styles.bulkRow}>
                <Pressable onPress={() => Promise.all(active.filter(item => item.status !== 'paused').map(item => downloadManager.pause(item.id))).then(refreshDownloads)} style={styles.bulkButton}><Pause color={colors.blue700} size={16} /><Text style={styles.bulkText}>Pause all</Text></Pressable>
                <Pressable onPress={() => Promise.all(active.filter(item => item.status === 'paused').map(item => downloadManager.resume(item.id))).then(refreshDownloads)} style={styles.bulkButton}><Play color={colors.blue700} size={16} /><Text style={styles.bulkText}>Resume all</Text></Pressable>
                <Pressable onPress={() => Alert.alert('Cancel queue?', 'All queued and active downloads will be cancelled.', [{text: 'Keep', style: 'cancel'}, {text: 'Cancel queue', style: 'destructive', onPress: () => Promise.all(active.map(item => downloadManager.cancel(item.id))).then(refreshDownloads)}])} style={styles.bulkButton}><XCircle color={colors.danger} size={16} /><Text style={[styles.bulkText, {color: colors.danger}]}>Cancel</Text></Pressable>
              </View>
              {active.map(card)}
            </>
          ) : null}
          {completed.length > 0 ? <><SectionHeader title="Completed" action="Clear history" onAction={() => Alert.alert('Clear completed history?', 'Downloaded files will remain on your device.', [{text: 'Cancel', style: 'cancel'}, {text: 'Clear', onPress: () => perform(downloadManager.clearCompleted)}])} />{completed.map(card)}</> : null}
          {failed.length > 0 ? <><SectionHeader title="Failed or cancelled" />{failed.map(card)}</> : null}
        </SafeScrollView>
      )}
      <ActionSheet item={selected} onClose={() => setSelected(undefined)} onOpen={() => selected && perform(() => downloadManager.open(selected.id))} onShare={() => selected && perform(() => downloadManager.share(selected.id))} onRename={() => {setRename(selected); setSelected(undefined);}} onDelete={() => selected && Alert.alert('Delete download?', 'This removes the downloaded file from your device.', [{text: 'Cancel', style: 'cancel'}, {text: 'Delete', style: 'destructive', onPress: () => {perform(() => downloadManager.remove(selected.id, true)); setSelected(undefined);}}])} />
      <RenameDialog visible={Boolean(rename)} initialValue={rename?.finalFilename || ''} onCancel={() => setRename(undefined)} onSave={async value => {if (rename) await perform(() => downloadManager.rename(rename.id, value)); setRename(undefined);}} />
    </View>
  );
}

function ActionSheet({item, onClose, onOpen, onShare, onRename, onDelete}: {item?: DownloadItem; onClose: () => void; onOpen: () => void; onShare: () => void; onRename: () => void; onDelete: () => void}) {
  return <Modal visible={Boolean(item)} transparent animationType="slide" onRequestClose={onClose}><Pressable onPress={onClose} style={styles.sheetBackdrop}><View style={styles.sheet} onStartShouldSetResponder={() => true}><Text numberOfLines={2} style={styles.sheetTitle}>{item?.finalFilename}</Text><SheetAction icon={<Play color={colors.blue700} />} label="Open or play" onPress={onOpen} /><SheetAction icon={<Share2 color={colors.blue700} />} label="Share" onPress={onShare} /><SheetAction icon={<Edit3 color={colors.blue700} />} label="Rename" onPress={onRename} /><SheetAction icon={<Info color={colors.blue700} />} label={`${formatBytes(item?.actualBytes)} · ${formatDate(item?.completedAt)}`} onPress={() => undefined} disabled /><SheetAction icon={<Trash2 color={colors.danger} />} label="Delete file" onPress={onDelete} danger /></View></Pressable></Modal>;
}

function SheetAction({icon, label, onPress, danger, disabled}: {icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean; disabled?: boolean}) {
  return <Pressable disabled={disabled} onPress={onPress} style={styles.sheetAction}>{icon}<Text style={[styles.sheetActionText, danger && {color: colors.danger}]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  header: {paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line},
  title: {fontSize: 25, fontWeight: '900', color: colors.ink},
  subtitle: {fontSize: 12, color: colors.muted, marginTop: 4},
  bulkRow: {flexDirection: 'row', gap: 7, marginBottom: spacing.md},
  bulkButton: {flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md},
  bulkText: {fontSize: 11, fontWeight: '800', color: colors.blue700},
  sheetBackdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,16,43,0.5)'},
  sheet: {backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 30},
  sheetTitle: {fontSize: 16, lineHeight: 22, fontWeight: '900', color: colors.ink, padding: spacing.sm, marginBottom: spacing.sm},
  sheetAction: {minHeight: 52, flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingHorizontal: spacing.md},
  sheetActionText: {fontSize: 15, fontWeight: '700', color: colors.ink},
});
