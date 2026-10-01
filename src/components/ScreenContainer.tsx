import React, {PropsWithChildren} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, ScrollViewProps, StyleSheet, View, ViewProps} from 'react-native';
import {colors} from '../theme';

export function ScreenContainer({children, style, ...props}: PropsWithChildren<ViewProps>) {
  return <View style={[styles.container, style]} {...props}>{children}</View>;
}

export function SafeScrollView({children, contentContainerStyle, ...props}: PropsWithChildren<ScrollViewProps>) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      {...props}>
      {children}
    </ScrollView>
  );
}

export function KeyboardSafeScreen({children}: PropsWithChildren) {
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.surface},
  scrollContent: {padding: 16, paddingBottom: 24},
});
