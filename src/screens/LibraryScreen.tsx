import React, {useMemo, useState} from 'react';
import {Alert, Modal, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {Clock3, FileAudio, FileImage, FileVideo, Grid2X2, List, MoreVertical, Search, Share2, Play, Edit3, FolderInput, Trash2, Info} from 'lucide-react-native';
import {EmptyState} from '../components/EmptyState';
import {RenameDialog} from '../components/RenameDialog';
import {SafeScrollView} from '../components/ScreenContainer';
import {useApp} from '../context/AppContext';
import {downloadManager} from '../native/DownloadManager';
import type {DownloadItem, MediaType} from '../types';
import {colors, radius, spacing} from '../theme';
import {formatBytes, formatDate} from '../utils/format';

type Filter = 'all' | MediaType;
type SortKey = 'newest' | 'oldest' | 'name' | 'size';

export function LibraryScreen() {
  const {downloads, refreshDownloads, openBrowser} = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [grid, setGrid] = useState(true);
  const [selected, setSelected] = useState<DownloadItem>();
  const [rename, setRename] = useState<DownloadItem>();
  const completed = useMemo(() => downloads
    .filter(item => item.status === 'completed')
    .filter(item => filter === 'all' || item.mediaType === filter)
    .filter(item => !query || `${item.title} ${item.finalFilename}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'oldest') return (a.completedAt || 0) - (b.completedAt || 0);
      if (sort === 'name') return a.finalFilename.localeCompare(b.finalFilename);
      if (sort === 'size') return (b.actualBytes || 0) - (a.actualBytes || 0);
      return (b.completedAt || 0) - (a.completedAt || 0);
    }), [downloads, filter, query, sort]);

  const act = async (operation: () => Promise<unknown>) => {
    try { await operation(); await refreshDownloads(); } catch (error) { Alert.alert('Action unavailable', error instanceof Error ? error.message : 'Please try again.'); }
  };

  const move = async () => {
    if (!selected) return;
    try {
      const folder = await downloadManager.chooseDestination();
      await downloadManager.move(selected.id, folder.uri);
      setSelected(undefined);
      refreshDownloads();
    } catch (error) {
      if (error instanceof Error && !/cancel/i.test(error.message)) Alert.alert('Could not move file', error.message);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleRow}><View><Text style={styles.title}>Library</Text><Text style={styles.subtitle}>{downloads.filter(item => item.status === 'completed').length} saved items</Text></View><Pressable onPress={() => setGrid(value => !value)} style={styles.viewToggle}>{grid ? <List color={colors.blue700} size={20} /> : <Grid2X2 color={colors.blue700} size={20} />}</Pressable></View>
        <View style={styles.searchBar}><Search color={colors.muted} size={18} /><TextInput value={query} onChangeText={setQuery} placeholder="Search downloaded media" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
        <SafeScrollView horizontal contentContainerStyle={styles.filters} showsHorizontalScrollIndicator={false}>
          {(['all', 'video', 'audio', 'image'] as Filter[]).map(value => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value === 'all' ? 'All' : `${value[0].toUpperCase()}${value.slice(1)}s`}</Text></Pressable>)}
          <Pressable onPress={() => setSort(current => current === 'newest' ? 'oldest' : current === 'oldest' ? 'name' : current === 'name' ? 'size' : 'newest')} style={styles.sort}><Clock3 color={colors.blue700} size={15} /><Text style={styles.sortText}>{sort}</Text></Pressable>
        </SafeScrollView>
      </View>
      {completed.length === 0 ? <EmptyState title={query ? 'No matching media' : 'No downloaded media yet'} message={query ? 'Try another search or filter.' : 'Completed videos, audio, and images will be organized here.'} action={query ? undefined : 'Browse media'} onAction={query ? undefined : () => openBrowser()} /> : (
        <SafeScrollView contentContainerStyle={[styles.content, grid && styles.grid]}>
          {completed.map(item => <LibraryCard key={item.id} item={item} grid={grid} onOpen={() => act(() => downloadManager.open(item.id))} onMore={() => setSelected(item)} />)}
        </SafeScrollView>
      )}
      <LibraryActions item={selected} onClose={() => setSelected(undefined)} onOpen={() => selected && act(() => downloadManager.open(selected.id))} onShare={() => selected && act(() => downloadManager.share(selected.id))} onRename={() => {setRename(selected); setSelected(undefined);}} onMove={move} onDelete={() => selected && Alert.alert('Delete media?', 'This permanently removes the downloaded file.', [{text: 'Cancel', style: 'cancel'}, {text: 'Delete', style: 'destructive', onPress: () => {act(() => downloadManager.remove(selected.id, true)); setSelected(undefined);}}])} />
      <RenameDialog visible={Boolean(rename)} initialValue={rename?.finalFilename || ''} onCancel={() => setRename(undefined)} onSave={async value => {if (rename) await act(() => downloadManager.rename(rename.id, value)); setRename(undefined);}} />
    </View>
  );
}

function LibraryCard({item, grid, onOpen, onMore}: {item: DownloadItem; grid: boolean; onOpen: () => void; onMore: () => void}) {
  const Icon = item.mediaType === 'video' ? FileVideo : item.mediaType === 'audio' ? FileAudio : FileImage;
  return <Pressable onPress={onOpen} style={[styles.card, grid ? styles.cardGrid : styles.cardList]}><View style={[styles.preview, !grid && styles.previewList]}><Icon color={colors.blue600} size={grid ? 34 : 26} />{item.mediaType !== 'image' ? <View style={styles.play}><Play color={colors.white} fill={colors.white} size={12} /></View> : null}</View><View style={styles.cardCopy}><Text numberOfLines={2} style={styles.cardTitle}>{item.title || item.finalFilename}</Text><Text numberOfLines={1} style={styles.cardMeta}>{item.qualityLabel || item.extension.toUpperCase()} · {formatBytes(item.actualBytes)}</Text><Text style={styles.cardDate}>{formatDate(item.completedAt)}</Text></View><Pressable accessibilityLabel="Media actions" onPress={onMore} style={styles.more}><MoreVertical color={colors.muted} size={19} /></Pressable></Pressable>;
}

function LibraryActions({item, onClose, onOpen, onShare, onRename, onMove, onDelete}: {item?: DownloadItem; onClose: () => void; onOpen: () => void; onShare: () => void; onRename: () => void; onMove: () => void; onDelete: () => void}) {
  const action = (icon: React.ReactNode, text: string, handler: () => void, danger = false) => <Pressable onPress={handler} style={styles.action}><View style={styles.actionIcon}>{icon}</View><Text style={[styles.actionText, danger && {color: colors.danger}]}>{text}</Text></Pressable>;
  return <Modal visible={Boolean(item)} transparent animationType="slide" onRequestClose={onClose}><Pressable onPress={onClose} style={styles.backdrop}><View style={styles.sheet} onStartShouldSetResponder={() => true}><Text numberOfLines={2} style={styles.sheetTitle}>{item?.finalFilename}</Text>{action(<Play color={colors.blue700} />, item?.mediaType === 'image' ? 'Open' : 'Play', onOpen)}{action(<Share2 color={colors.blue700} />, 'Share', onShare)}{action(<Edit3 color={colors.blue700} />, 'Rename', onRename)}{action(<FolderInput color={colors.blue700} />, 'Move to folder', onMove)}{action(<Info color={colors.blue700} />, `${item?.mimeType} · ${formatBytes(item?.actualBytes)}`, () => undefined)}{action(<Trash2 color={colors.danger} />, 'Delete', onDelete, true)}</View></Pressable></Modal>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  header: {backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: spacing.lg, paddingTop: spacing.lg},
  titleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  title: {fontSize: 25, fontWeight: '900', color: colors.ink},
  subtitle: {fontSize: 12, color: colors.muted, marginTop: 3},
  viewToggle: {width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
  searchBar: {height: 45, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.md},
  searchInput: {flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0},
  filters: {paddingVertical: spacing.md, gap: 8},
  filter: {paddingHorizontal: 15, paddingVertical: 8, borderRadius: radius.round, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line},
  filterActive: {backgroundColor: colors.blue700, borderColor: colors.blue700},
  filterText: {fontSize: 12, fontWeight: '800', color: colors.muted},
  filterTextActive: {color: colors.white},
  sort: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radius.round, borderWidth: 1, borderColor: '#B9D4F0'},
  sortText: {fontSize: 11, fontWeight: '800', color: colors.blue700, textTransform: 'capitalize'},
  content: {padding: spacing.md},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md},
  card: {backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden'},
  cardGrid: {width: '47.9%'},
  cardList: {minHeight: 84, flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, padding: spacing.sm},
  preview: {height: 108, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
  previewList: {width: 75, height: 64, borderRadius: radius.md},
  play: {position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(5,50,120,0.78)', alignItems: 'center', justifyContent: 'center'},
  cardCopy: {flex: 1, padding: spacing.md},
  cardTitle: {fontSize: 13, lineHeight: 18, fontWeight: '800', color: colors.ink},
  cardMeta: {fontSize: 10, color: colors.muted, marginTop: 5},
  cardDate: {fontSize: 10, color: colors.muted, marginTop: 3},
  more: {position: 'absolute', right: 3, top: 3, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center'},
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,16,43,0.5)'},
  sheet: {backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 30},
  sheetTitle: {fontSize: 16, lineHeight: 22, fontWeight: '900', color: colors.ink, padding: spacing.sm, marginBottom: spacing.sm},
  action: {height: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  actionIcon: {width: 34, alignItems: 'center'},
  actionText: {fontSize: 15, fontWeight: '700', color: colors.ink},
});
