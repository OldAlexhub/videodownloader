import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {Check, CheckSquare2, Download, FileAudio, FileVideo, Folder, ImageIcon, Square, X} from 'lucide-react-native';
import type {AppSettings, DetectedAsset, DownloadSelection, MediaVariant} from '../types';
import {colors, radius, spacing} from '../theme';
import {formatBytes} from '../utils/format';
import {assetCountLabel, chooseVariant, variantUsable} from '../utils/media';
import {remoteConfig} from '../native/RemoteConfig';
import {SafeBottomSheet} from './ScreenContainer';

interface Props {
  visible: boolean;
  assets: DetectedAsset[];
  preferredQuality: AppSettings['preferredQuality'];
  destinationName: string;
  onChooseDestination: () => Promise<void>;
  onClose: () => void;
  onIncorrect: (asset: DetectedAsset) => void;
  onVariantSelected?: (variant: MediaVariant) => void;
  onDownload: (items: DownloadSelection[]) => Promise<unknown>;
}

function flowId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => {
    const random = Math.floor(Math.random() * 16);
    return (value === 'x' ? random : 8 + (random % 4)).toString(16);
  });
}

function filenameBase(asset: DetectedAsset): string {
  return (asset.title || 'Downloaded media').split('').map(character => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? ' ' : character).join('').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function describeAudio(item: MediaVariant): string {
  if (item.mediaType === 'audio') return item.language ? `Audio · ${item.language}` : 'Audio';
  if (item.mediaType === 'image') return 'Image';
  if (item.audioMode === 'separate') return 'Video + selected audio';
  if (item.audioMode === 'muxed' || item.hasAudio) return 'Video + audio';
  if (item.audioMode === 'none') return 'Video only';
  return 'Audio unknown';
}

function variantMeta(item: MediaVariant): string {
  const values = [item.container || 'Container unknown', item.detectionSource ? `Found by ${item.detectionSource}` : 'Source unknown', describeAudio(item)];
  if (item.videoCodec) values.push(item.videoCodec);
  if (item.bitrate) values.push(`${Math.round(item.bitrate / 1000)} kbps`);
  return values.join(' · ');
}

function downloadable(item: MediaVariant): boolean {
  return variantUsable(item) && !(remoteConfig.current().killSwitches.adaptiveDownloads && item.protocol !== 'progressive');
}

function recommended(items: MediaVariant[], preference: AppSettings['preferredQuality']): MediaVariant | undefined {
  const config = remoteConfig.current();
  return chooseVariant(items.filter(downloadable), preference, config.recommendation.balancedHeight, config.recommendation.requireAudio);
}

export function QualitySheet({visible, assets, preferredQuality, destinationName, onChooseDestination, onClose, onIncorrect, onVariantSelected, onDownload}: Props) {
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [filenames, setFilenames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const wasVisible = useRef(false);

  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    const primary = assets.find(asset => asset.variants.some(downloadable));
    if (!wasVisible.current) {
      wasVisible.current = true;
      setSelectedAssets(new Set(primary ? [primary.id] : []));
      setSelectedVariants(Object.fromEntries(assets.map(asset => [asset.id, recommended(asset.variants, preferredQuality)?.id || ''])));
      setFilenames(Object.fromEntries(assets.map(asset => [asset.id, filenameBase(asset)])));
      setBusy(false);
      return;
    }
    const currentIds = new Set(assets.map(asset => asset.id));
    setSelectedAssets(current => {
      const next = new Set([...current].filter(id => currentIds.has(id)));
      if (!next.size && primary) next.add(primary.id);
      return next;
    });
    setSelectedVariants(current => Object.fromEntries(assets.map(asset => {
      const selected = asset.variants.find(item => item.id === current[asset.id] && downloadable(item));
      return [asset.id, selected?.id || recommended(asset.variants, preferredQuality)?.id || ''];
    })));
    setFilenames(current => Object.fromEntries(assets.map(asset => [asset.id, current[asset.id] || filenameBase(asset)])));
  }, [assets, preferredQuality, visible]);

  const selections = useMemo(() => assets.flatMap(asset => {
    if (!selectedAssets.has(asset.id)) return [];
    const variant = asset.variants.find(item => item.id === selectedVariants[asset.id]);
    if (!variant || !downloadable(variant)) return [];
    return [{assetId: asset.id, variant, finalFilename: filenames[asset.id], flowId: flowId()}];
  }), [assets, filenames, selectedAssets, selectedVariants]);

  const toggleAsset = (asset: DetectedAsset) => {
    if (!asset.variants.some(downloadable)) return;
    setSelectedAssets(current => {
      const next = new Set(current);
      if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
      return next;
    });
  };

  const choosePreset = (preference: AppSettings['preferredQuality']) => {
    setSelectedVariants(Object.fromEntries(assets.map(asset => [asset.id, recommended(asset.variants, preference)?.id || ''])));
  };

  const submit = async () => {
    if (!selections.length || busy) return;
    setBusy(true);
    try {
      await onDownload(selections);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <Pressable accessibilityLabel="Close media selector" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeBottomSheet style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Choose what to download</Text>
              <Text style={styles.subtitle}>{assetCountLabel(assets)} · {assets.reduce((total, asset) => total + asset.variants.filter(downloadable).length, 0)} quality options</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}><X color={colors.ink} size={22} /></Pressable>
          </View>
          <View style={styles.presets}>
            <Preset label="Best" onPress={() => choosePreset('best')} />
            <Preset label="Balanced" onPress={() => choosePreset('balanced')} />
            <Preset label="Smallest" onPress={() => choosePreset('smallest')} />
          </View>
          <ScrollView contentContainerStyle={styles.assets} keyboardShouldPersistTaps="handled" style={styles.optionScroll}>
            {assets.map(asset => {
              const assetSelected = selectedAssets.has(asset.id);
              const TypeIcon = asset.mediaType === 'video' ? FileVideo : asset.mediaType === 'audio' ? FileAudio : ImageIcon;
              return (
                <View key={asset.id} style={[styles.asset, assetSelected && styles.assetActive]}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{checked: assetSelected}} onPress={() => toggleAsset(asset)} style={styles.assetHeader}>
                    {asset.thumbnailUrl ? <Image source={{uri: asset.thumbnailUrl}} style={styles.thumbnail} /> : <View style={styles.thumbnailFallback}><TypeIcon color={colors.blue600} size={27} /></View>}
                    <View style={styles.assetCopy}>
                      <Text numberOfLines={2} style={styles.assetTitle}>{asset.title}</Text>
                      <Text style={styles.assetSubtitle}>{asset.variants.length} {asset.variants.length === 1 ? 'option' : 'options'}</Text>
                    </View>
                    {assetSelected ? <CheckSquare2 color={colors.blue700} size={24} /> : <Square color={colors.muted} size={24} />}
                  </Pressable>
                  {assetSelected ? (
                    <>
                      <TextInput
                        accessibilityLabel={`Filename for ${asset.title}`}
                        onChangeText={value => setFilenames(current => ({...current, [asset.id]: value}))}
                        placeholder="Filename"
                        placeholderTextColor={colors.muted}
                        style={styles.filename}
                        value={filenames[asset.id] || ''}
                      />
                      {asset.variants.map(item => {
                        const active = item.id === selectedVariants[asset.id];
                        const usable = downloadable(item);
                        return (
                          <Pressable
                            accessibilityRole="radio"
                            accessibilityState={{selected: active, disabled: !usable}}
                            disabled={!usable}
                            key={item.id}
                            onPress={() => {setSelectedVariants(current => ({...current, [asset.id]: item.id})); onVariantSelected?.(item);}}
                            style={[styles.option, active && styles.optionActive, !usable && styles.disabled]}>
                            <View style={styles.optionCopy}>
                              <View style={styles.optionTitleRow}>
                                <Text style={styles.optionTitle}>{item.qualityLabel || 'Source quality'}</Text>
                                {item.inspectionState === 'probing' ? <Text style={styles.probing}>Scanning</Text> : null}
                              </View>
                              <Text style={styles.meta}>{variantMeta(item)}</Text>
                              <Text style={styles.size}>{item.estimatedBytes ? `Estimated ${formatBytes(item.estimatedBytes)}` : 'Size unknown until download starts'}{item.durationMs ? ` · ${Math.round(item.durationMs / 1000)} sec` : ''}</Text>
                              {!usable ? <Text style={styles.protected}>{remoteConfig.current().killSwitches.adaptiveDownloads && item.protocol !== 'progressive' ? 'Adaptive downloads are temporarily unavailable' : item.unsupportedReason || (item.isProtected ? 'Protected media cannot be downloaded' : 'This option is not supported')}</Text> : null}
                            </View>
                            <View style={[styles.radio, active && styles.radioActive]}>{active ? <Check color={colors.white} size={14} /> : null}</View>
                          </Pressable>
                        );
                      })}
                      <Pressable onPress={() => onIncorrect(asset)} style={styles.incorrect}><Text style={styles.incorrectText}>Incorrect result</Text></Pressable>
                    </>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          <Pressable onPress={onChooseDestination} style={styles.destination}><Folder color={colors.blue700} size={18} /><Text numberOfLines={1} style={styles.destinationText}>Save to {destinationName}</Text></Pressable>
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable disabled={!selections.length || busy} onPress={submit} style={[styles.download, (!selections.length || busy) && styles.disabled]}>
              <Download color={colors.white} size={19} />
              <Text style={styles.downloadText}>{busy ? 'Starting…' : selections.length > 1 ? `Download ${selections.length} items` : 'Download'}</Text>
            </Pressable>
          </View>
        </SafeBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Preset({label, onPress}: {label: string; onPress: () => void}) {
  return <Pressable onPress={onPress} style={styles.preset}><Text style={styles.presetText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,16,43,0.52)'},
  sheet: {maxHeight: '92%', backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8},
  handle: {alignSelf: 'center', width: 42, height: 4, backgroundColor: colors.line, borderRadius: 4, marginBottom: spacing.md},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
  headerCopy: {flex: 1},
  title: {fontSize: 19, lineHeight: 24, fontWeight: '900', color: colors.ink},
  subtitle: {fontSize: 12, color: colors.muted, marginTop: 3},
  close: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center'},
  presets: {flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
  preset: {flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.sky100},
  presetText: {fontSize: 12, fontWeight: '800', color: colors.blue700},
  optionScroll: {borderTopWidth: 1, borderTopColor: colors.line},
  assets: {padding: spacing.lg, gap: spacing.md},
  asset: {borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.white, overflow: 'hidden'},
  assetActive: {borderColor: colors.blue600, backgroundColor: '#F8FBFF'},
  assetHeader: {minHeight: 72, flexDirection: 'row', alignItems: 'center', padding: spacing.md},
  thumbnail: {width: 62, height: 48, borderRadius: radius.md, backgroundColor: colors.sky100},
  thumbnailFallback: {width: 62, height: 48, borderRadius: radius.md, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center'},
  assetCopy: {flex: 1, paddingHorizontal: spacing.md},
  assetTitle: {fontSize: 15, lineHeight: 20, fontWeight: '800', color: colors.ink},
  assetSubtitle: {fontSize: 11, color: colors.muted, marginTop: 3},
  filename: {height: 48, marginHorizontal: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.ink, backgroundColor: colors.white},
  option: {minHeight: 84, flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white},
  optionActive: {borderColor: colors.blue600, backgroundColor: '#F2F8FF'},
  optionCopy: {flex: 1, paddingRight: spacing.md},
  optionTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 7},
  optionTitle: {fontSize: 15, fontWeight: '900', color: colors.ink},
  probing: {fontSize: 10, fontWeight: '800', color: colors.warning, backgroundColor: '#FFF7E6', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.round},
  meta: {fontSize: 11, color: colors.muted, marginTop: 4, textTransform: 'capitalize'},
  size: {fontSize: 11, color: colors.muted, marginTop: 3},
  protected: {fontSize: 11, color: colors.danger, fontWeight: '700', marginTop: 4},
  radio: {width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center'},
  radioActive: {borderColor: colors.blue700, backgroundColor: colors.blue700},
  incorrect: {alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', marginLeft: spacing.md, marginBottom: spacing.sm},
  incorrectText: {fontSize: 11, fontWeight: '800', color: colors.muted},
  destination: {minHeight: 48, marginHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface},
  destinationText: {flex: 1, fontSize: 12, fontWeight: '800', color: colors.ink},
  footer: {flexDirection: 'row', padding: spacing.lg, gap: spacing.md},
  cancel: {minHeight: 50, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line},
  cancelText: {fontSize: 15, fontWeight: '800', color: colors.ink},
  download: {flex: 1, minHeight: 50, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.blue700},
  downloadText: {fontSize: 15, fontWeight: '800', color: colors.white},
  disabled: {opacity: 0.45},
});
