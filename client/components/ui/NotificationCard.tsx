import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_COLORS } from '../../constants/categories';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, elevation } from '../../constants/theme';

export type NotificationKind = 'coupon' | 'social';

interface NotificationCardProps {
  title: string;
  body: string;
  kind?: NotificationKind;
  /** Colors the 8px left stripe on coupon notifications. */
  category?: string;
  /** Read rows lose the glass sheen and drop to a muted flat fill. */
  read?: boolean;
  actions?: React.ReactNode;
  /** Shows a trailing chevron for tap-to-navigate rows. */
  navigable?: boolean;
}

export default function NotificationCard({
  title, body, kind = 'coupon', category, read = false, actions, navigable = false,
}: NotificationCardProps) {
  const stripe = kind === 'coupon' ? (CATEGORY_COLORS[category ?? ''] ?? CATEGORY_COLORS.Other) : CATEGORY_COLORS.All;
  const icon = kind === 'coupon' ? 'time-outline' : 'people-outline';

  return (
    <View style={[styles.root, read ? styles.readBorder : (elevation.panel as object)]}>
      {!read && <BlurView pointerEvents="none" intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: read ? 'rgba(247,242,234,.72)' : glass.thick }]} />
      <View style={[styles.stripe, { backgroundColor: stripe }]} />
      <View style={styles.body}>
        <Ionicons name={icon} size={22} color={colors.coral400} />
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub}>{body}</Text>
          {actions && <View style={styles.actions}>{actions}</View>}
        </View>
        {navigable && <Ionicons name="chevron-forward" size={18} color={colors.cream400} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: glass.edge,
    overflow: 'hidden',
  },
  readBorder: { borderColor: 'rgba(214,204,186,.8)' },
  stripe: { width: 8 },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s7,
    paddingVertical: spacing.s9,
    paddingHorizontal: spacing.s8,
  },
  textBlock: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamily.uiBlack, fontSize: fontSize.bodyS, color: colors.textStrong, marginBottom: 3 },
  sub: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.ink500, lineHeight: fontSize.caption * 1.38 },
  actions: { flexDirection: 'row', gap: spacing.s4, marginTop: spacing.s5 },
});
