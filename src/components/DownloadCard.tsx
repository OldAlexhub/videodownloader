import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {CircleAlert, FileAudio, FileImage, FileVideo, MoreVertical, Pause, Play, RotateCcw, X} from 'lucide-react-native';
import type {DownloadItem} from '../types';
import {colors, radius, spacing} from '../theme';
import {formatBytes, formatEta, formatSpeed} from '../utils/format';

interface Props {
  item: DownloadItem;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onMore: () => void;
  onRetry: () => void;
}

export function DownloadCard({item, onPause, onResume, onCancel, onOpen, onMore, onRetry}: Props) {
  const Icon = item.mediaType === 'video' ? FileVideo : item.mediaType === 'audio' ? FileAudio : FileImage;
  const active = ['queued', 'preparing', 'downloading', 'retrying', 'processing', 'paused'].includes(item.status);
  const progress = Math.max(0, Math.min(100, item.progress || 0));
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.icon}><Icon color={colors.blue700} size={24} /></View>
        <View style={styles.copy}>
          <Text numberOfLines={2} style={styles.title}>{item.finalFilename || item.title}</Text>
          <Text style={styles.meta}>{item.qualityLabel || item.extension.toUpperCase()} · {item.status.replace(/\b\w/g, value => value.toUpperCase())}</Text>
        </View>
        {active ? (
          <Pressable accessibilityLabel="Cancel download" onPress={onCancel} style={styles.smallAction}><X color={colors.muted} size={20} /></Pressable>
        ) : (
          <Pressable accessibilityLabel="More actions" onPress={onMore} style={styles.smallAction}><MoreVertical color={colors.muted} size={20} /></Pressable>
        )}
      </View>
      {active ? (
        <>
          <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${progress}%`}]} /></View>
          <View style={styles.progressInfo}>
            <Text style={styles.percent}>{Math.round(progress)}%</Text>
            <Text style={styles.transfer}>{formatBytes(item.downloadedBytes)}{item.estimatedBytes > 0 ? ` / ${formatBytes(item.estimatedBytes)}` : ''}</Text>
          </View>
          <View style={styles.bottomRow}>
            <View><Text style={styles.speed}>{item.status === 'paused' ? 'Paused' : formatSpeed(item.speedBytesPerSecond)}</Text><Text style={styles.eta}>ETA {formatEta(item.etaSeconds)}</Text></View>
            {item.status === 'paused' ? (
              <Pressable onPress={onResume} style={styles.primaryAction}><Play color={colors.white} size={17} /><Text style={styles.primaryText}>Resume</Text></Pressable>
            ) : (
              <Pressable onPress={onPause} style={styles.secondaryAction}><Pause color={colors.blue700} size={17} /><Text style={styles.secondaryText}>Pause</Text></Pressable>
            )}
          </View>
        </>
      ) : item.status === 'failed' ? (
        <View style={styles.failure}>
          <CircleAlert color={colors.danger} size={18} />
          <Text style={styles.failureText}>{item.failureMessage || 'The download could not be completed.'}</Text>
          <Pressable onPress={onRetry} style={styles.retry}><RotateCcw color={colors.danger} size={16} /><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : (
        <View style={styles.completedRow}>
          <Text style={styles.completedMeta}>{formatBytes(item.actualBytes || item.downloadedBytes)}</Text>
          <Pressable onPress={onOpen} style={styles.primaryAction}><Play color={colors.white} size={17} /><Text style={styles.primaryText}>{item.mediaType === 'image' ? 'Open' : 'Play'}</Text></Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md},
  topRow: {flexDirection: 'row', alignItems: 'center'},
  icon: {width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
  copy: {flex: 1, paddingHorizontal: spacing.md},
  title: {fontSize: 14, lineHeight: 19, fontWeight: '800', color: colors.ink},
  meta: {fontSize: 11, color: colors.muted, marginTop: 4},
  smallAction: {padding: spacing.sm},
  progressTrack: {height: 7, borderRadius: 4, backgroundColor: '#E5EDF5', overflow: 'hidden', marginTop: spacing.md},
  progressFill: {height: 7, borderRadius: 4, backgroundColor: colors.teal500},
  progressInfo: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 6},
  percent: {fontSize: 12, fontWeight: '800', color: colors.ink},
  transfer: {fontSize: 11, color: colors.muted},
  bottomRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md},
  speed: {fontSize: 13, fontWeight: '800', color: colors.ink},
  eta: {fontSize: 11, color: colors.muted, marginTop: 2},
  primaryAction: {minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.blue700, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: 'center'},
  primaryText: {fontSize: 12, fontWeight: '800', color: colors.white},
  secondaryAction: {minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#BBD3EF', borderRadius: radius.md, paddingHorizontal: 14, justifyContent: 'center'},
  secondaryText: {fontSize: 12, fontWeight: '800', color: colors.blue700},
  completedRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md},
  completedMeta: {fontSize: 12, color: colors.muted},
  failure: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft},
  failureText: {flex: 1, fontSize: 12, lineHeight: 17, color: colors.danger},
  retry: {flexDirection: 'row', gap: 5, alignItems: 'center', padding: 6},
  retryText: {fontSize: 12, fontWeight: '800', color: colors.danger},
});
