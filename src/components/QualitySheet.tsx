import React, {useMemo, useState} from 'react';
import {Image, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Check, Download, FileAudio, FileVideo, ImageIcon, X} from 'lucide-react-native';
import type {DetectedMedia} from '../types';
import {colors, radius, spacing} from '../theme';
import {formatBytes} from '../utils/format';

interface Props {
  visible: boolean;
  items: DetectedMedia[];
  onClose: () => void;
  onDownload: (item: DetectedMedia) => Promise<void>;
}

function recommendation(items: DetectedMedia[]): DetectedMedia | undefined {
  const video = items.filter(item => item.mediaType === 'video' && !item.isProtected);
  return video.find(item => item.height === 720) ||
    [...video].filter(item => (item.height || 0) <= 1080).sort((a, b) => (b.height || 0) - (a.height || 0))[0] ||
    video[0] || items.find(item => !item.isProtected);
}

export function QualitySheet({visible, items, onClose, onDownload}: Props) {
  const recommended = useMemo(() => recommendation(items), [items]);
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const selected = items.find(item => item.id === selectedId) || recommended;
  const first = items[0];

  const submit = async () => {
    if (!selected || busy) {
      return;
    }
    setBusy(true);
    try {
      await onDownload(selected);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close media selector" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            {first?.thumbnailUrl ? <Image source={{uri: first.thumbnailUrl}} style={styles.thumbnail} /> : (
              <View style={styles.thumbnailFallback}><FileVideo color={colors.blue600} size={28} /></View>
            )}
            <View style={styles.headerCopy}>
              <Text numberOfLines={2} style={styles.title}>{first?.title || 'Detected media'}</Text>
              <Text style={styles.subtitle}>{items.length} available {items.length === 1 ? 'option' : 'options'}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}><X color={colors.ink} size={21} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.options} style={styles.optionScroll}>
            {items.map(item => {
              const active = item.id === selected?.id;
              const Icon = item.mediaType === 'video' ? FileVideo : item.mediaType === 'audio' ? FileAudio : ImageIcon;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{selected: active, disabled: item.isProtected}}
                  disabled={item.isProtected}
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  style={[styles.option, active && styles.optionActive, item.isProtected && styles.disabled]}>
                  <View style={styles.typeIcon}><Icon color={colors.blue700} size={22} /></View>
                  <View style={styles.optionCopy}>
                    <View style={styles.optionTitleRow}>
                      <Text style={styles.optionTitle}>{item.qualityLabel}</Text>
                      {item.id === recommended?.id ? <Text style={styles.badge}>Recommended</Text> : null}
                    </View>
                    <Text style={styles.meta}>
                      {item.extension.toUpperCase()} · {item.hasAudio ? 'Video + Audio' : item.mediaType === 'audio' ? 'Audio' : item.mediaType}
                    </Text>
                    <Text style={styles.size}>{item.estimatedBytes ? `Estimated size ${formatBytes(item.estimatedBytes)}` : 'File size determined when download starts'}</Text>
                    {item.isProtected ? <Text style={styles.protected}>Protected media cannot be downloaded</Text> : null}
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>{active ? <Check color={colors.white} size={14} /> : null}</View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable disabled={!selected || busy} onPress={submit} style={[styles.download, (!selected || busy) && styles.disabled]}>
              <Download color={colors.white} size={19} />
              <Text style={styles.downloadText}>{busy ? 'Starting…' : 'Download'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,16,43,0.52)'},
  sheet: {maxHeight: '86%', backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8},
  handle: {alignSelf: 'center', width: 42, height: 4, backgroundColor: colors.line, borderRadius: 4, marginBottom: spacing.md},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
  thumbnail: {width: 62, height: 48, borderRadius: radius.md, backgroundColor: colors.sky100},
  thumbnailFallback: {width: 62, height: 48, borderRadius: radius.md, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
  headerCopy: {flex: 1, paddingHorizontal: spacing.md},
  title: {fontSize: 16, lineHeight: 21, fontWeight: '800', color: colors.ink},
  subtitle: {fontSize: 12, color: colors.muted, marginTop: 3},
  close: {padding: spacing.sm},
  optionScroll: {borderTopWidth: 1, borderTopColor: colors.line},
  options: {padding: spacing.lg, gap: 10},
  option: {flexDirection: 'row', padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.white},
  optionActive: {borderColor: colors.blue600, backgroundColor: '#F2F8FF'},
  disabled: {opacity: 0.5},
  typeIcon: {width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
  optionCopy: {flex: 1, paddingHorizontal: spacing.md},
  optionTitleRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7},
  optionTitle: {fontSize: 16, fontWeight: '800', color: colors.ink},
  badge: {fontSize: 10, fontWeight: '800', color: colors.success, backgroundColor: colors.successSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.round},
  meta: {fontSize: 12, color: colors.muted, marginTop: 4, textTransform: 'capitalize'},
  size: {fontSize: 12, color: colors.muted, marginTop: 2},
  protected: {fontSize: 12, color: colors.danger, fontWeight: '700', marginTop: 4},
  radio: {width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', alignSelf: 'center'},
  radioActive: {borderColor: colors.blue700, backgroundColor: colors.blue700},
  footer: {flexDirection: 'row', padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, gap: spacing.md},
  cancel: {minHeight: 48, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line},
  cancelText: {fontSize: 15, fontWeight: '800', color: colors.ink},
  download: {flex: 1, minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.blue700},
  downloadText: {fontSize: 15, fontWeight: '800', color: colors.white},
});
