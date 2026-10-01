import React, {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {colors, radius, spacing} from '../theme';

interface Props {
  visible: boolean;
  initialValue: string;
  onCancel: () => void;
  onSave: (value: string) => Promise<void> | void;
}

export function RenameDialog({visible, initialValue, onCancel, onSave}: Props) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(initialValue), [initialValue, visible]);
  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try { await onSave(value.trim()); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Rename file</Text>
          <Text style={styles.help}>Keep the file extension so other apps can recognize the media type.</Text>
          <TextInput autoFocus selectTextOnFocus value={value} onChangeText={setValue} style={styles.input} />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
            <Pressable disabled={!value.trim() || busy} onPress={save} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(3,16,43,0.55)'},
  dialog: {width: '100%', maxWidth: 420, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.xl},
  title: {fontSize: 20, fontWeight: '900', color: colors.ink},
  help: {fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.sm},
  input: {height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.ink, marginTop: spacing.lg},
  actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg},
  secondary: {paddingHorizontal: 18, paddingVertical: 12},
  secondaryText: {fontWeight: '800', color: colors.muted},
  primary: {paddingHorizontal: 22, paddingVertical: 12, backgroundColor: colors.blue700, borderRadius: radius.md},
  primaryText: {fontWeight: '800', color: colors.white},
});
