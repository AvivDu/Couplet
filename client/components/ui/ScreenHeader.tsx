import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, glass, blur, spacing, fontFamily, fontSize, letterSpacingRatio } from '../../constants/theme';

interface ScreenHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: boolean;
  onBack?: () => void;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function ScreenHeader({ title, subtitle, back = false, onBack, leading, actions }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: spacing.s8 + insets.top }]}>
      <BlurView intensity={blur.l} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />
      {back && (
        <Pressable onPress={onBack} accessibilityLabel="Back" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
        </Pressable>
      )}
      {leading}
      <View style={styles.titleWrap}>
        {typeof title === 'string' ? <Text style={styles.title}>{title}</Text> : title}
        {subtitle != null && (typeof subtitle === 'string' ? <Text style={styles.subtitle}>{subtitle}</Text> : subtitle)}
      </View>
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s6,
    paddingHorizontal: spacing.gutterScreen,
    paddingBottom: spacing.s8,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineHair,
    overflow: 'hidden',
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: glass.thin },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.displayS, lineHeight: Math.round(fontSize.displayS * 1.18), letterSpacing: letterSpacingRatio.display * fontSize.displayS, color: colors.textStrong },
  subtitle: { marginTop: 2, fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.s5 },
});
