import React, {ReactNode} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {FolderDown} from 'lucide-react-native';
import {colors, radius, spacing} from '../theme';

interface Props {
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({title, message, action, onAction, icon}: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.icon}>{icon || <FolderDown color={colors.blue600} size={34} />}</View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.button}>
          <Text style={styles.buttonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {alignItems: 'center', paddingHorizontal: 30, paddingVertical: 48},
  icon: {width: 68, height: 68, borderRadius: radius.xl, backgroundColor: colors.sky100, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg},
  title: {fontSize: 19, lineHeight: 25, fontWeight: '800', color: colors.ink, textAlign: 'center'},
  message: {fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: 'center', marginTop: spacing.sm, maxWidth: 320},
  button: {marginTop: spacing.xl, borderRadius: radius.md, backgroundColor: colors.blue700, paddingHorizontal: 20, paddingVertical: 12},
  buttonText: {fontSize: 14, fontWeight: '800', color: colors.white},
});
