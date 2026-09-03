import React from 'react';
import { View, TextInput, Pressable, StyleSheet, TextInputProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, elevation } from '../../constants/theme';

interface SearchFieldProps extends TextInputProps {
  value?: string;
  onClear?: () => void;
}

export default function SearchField({ value = '', onClear, placeholder = 'Search coupons...', style, ...rest }: SearchFieldProps) {
  return (
    <View style={styles.root}>
      <BlurView pointerEvents="none" intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint]} />
      <Ionicons name="search-outline" size={16} color={colors.textMuted} />
      <TextInput
        style={[styles.input, style]}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        {...rest}
      />
      {value.length > 0 && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={15} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: glass.edge,
    overflow: 'hidden',
    ...(elevation.hair as object),
  },
  tint: { backgroundColor: glass.thick },
  input: { flex: 1, minWidth: 0, fontFamily: fontFamily.ui, fontSize: fontSize.body, color: colors.textStrong, padding: 0 },
});
