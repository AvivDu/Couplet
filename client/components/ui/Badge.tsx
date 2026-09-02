import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius, fontFamily, fontSize } from '../../constants/theme';

export type BadgeTone = 'brand' | 'ink' | 'glass' | 'success' | 'warn' | 'danger';

const TONE: Record<BadgeTone, { background: string; color: string }> = {
  brand: { background: 'rgba(232,96,76,.12)', color: colors.coral400 },
  ink: { background: 'rgba(26,35,50,.15)', color: colors.ink700 },
  glass: { background: 'rgba(255,255,255,.74)', color: colors.textStrong },
  success: { background: 'rgba(46,139,87,.14)', color: colors.stateSuccess },
  warn: { background: 'rgba(199,123,48,.14)', color: colors.stateWarn },
  danger: { background: colors.stateDangerQuiet, color: colors.stateDanger },
};

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Badge({ children, tone = 'brand', uppercase = false, style }: BadgeProps) {
  const skin = TONE[tone];
  return (
    <View style={[styles.base, { backgroundColor: skin.background, borderRadius: uppercase ? radius.xs : radius.s }, style]}>
      <Text
        style={[
          styles.label,
          { color: skin.color, letterSpacing: uppercase ? 0.5 : 0, textTransform: uppercase ? 'uppercase' : 'none' },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 8 },
  label: { fontFamily: fontFamily.uiBold, fontSize: fontSize.nano, lineHeight: fontSize.nano * 1.5 },
});
