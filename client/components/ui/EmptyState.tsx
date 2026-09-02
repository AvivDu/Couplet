import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, elevation } from '../../constants/theme';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon = 'pricetags-outline', title, hint, action }: EmptyStateProps) {
  return (
    <View style={styles.root}>
      <View style={[styles.medallion, elevation.panel as object]}>
        <BlurView intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.regular }]} />
        <Ionicons name={icon} size={38} color={colors.coral300} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.s5, paddingVertical: spacing.s20, paddingHorizontal: spacing.s10 },
  medallion: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: glass.edge,
    overflow: 'hidden',
  },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.subheading, color: colors.textStrong, textAlign: 'center' },
  hint: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center', maxWidth: 280 },
  action: { marginTop: spacing.s4 },
});
