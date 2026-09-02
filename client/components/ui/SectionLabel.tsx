import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontFamily, fontSize, letterSpacingRatio } from '../../constants/theme';

interface SectionLabelProps {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
}

export default function SectionLabel({ children, count, action }: SectionLabelProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>
        {children}
        {count != null ? ` · ${count}` : ''}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s6,
    paddingHorizontal: spacing.gutterScreen,
    paddingVertical: spacing.s5,
  },
  label: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.caption,
    letterSpacing: letterSpacingRatio.label * fontSize.caption,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
});
