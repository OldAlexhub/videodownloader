import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme';

export function SectionHeader({title, action, onAction}: {title: string; action?: string; onAction?: () => void}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action && onAction ? <Pressable onPress={onAction}><Text style={styles.action}>{action}</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {fontSize: 18, fontWeight: '800', color: colors.ink},
  action: {fontSize: 13, fontWeight: '700', color: colors.blue700, padding: 8},
});
