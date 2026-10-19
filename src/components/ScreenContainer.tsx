import React, {PropsWithChildren} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, ScrollViewProps, StyleSheet, View, ViewProps} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.container, {paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

export function SafeModalScreen({children, style, ...props}: PropsWithChildren<ViewProps>) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.container, style, {paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right}]} {...props}>{children}</View>;
}

export function SafeBottomSheet({children, style, ...props}: PropsWithChildren<ViewProps>) {
  const insets = useSafeAreaInsets();
  const flat = StyleSheet.flatten(style) || {};
  const number = (value: unknown) => typeof value === 'number' ? value : 0;
  const horizontal = number(flat.paddingHorizontal ?? flat.padding);
  const vertical = number(flat.paddingVertical ?? flat.padding);
  const left = number(flat.paddingLeft) || horizontal;
  const right = number(flat.paddingRight) || horizontal;
  const bottom = number(flat.paddingBottom) || vertical;
  return (
    <View
      style={[style, {
        paddingBottom: bottom + (bottom ? insets.bottom : Math.max(insets.bottom, 16)),
        paddingLeft: left + insets.left,
        paddingRight: right + insets.right,
      }]}
      {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.surface},
  scrollContent: {padding: 16, paddingBottom: 24},
});
