import React from 'react';
import { Pressable, Switch, Text, View, StyleSheet } from 'react-native';
import { colors, spacing, fontFamily, fontSize } from '../../constants/theme';

interface ToggleRowProps {
  label: string;
  icon?: React.ReactNode;
  value: boolean;
  onValueChange: (value: boolean) => void;
  divider?: boolean;
}

export default function ToggleRow({ label, icon, value, onValueChange, divider = true }: ToggleRowProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.left}>
        {icon}
        <Text style={[styles.label, value && { color: colors.coral400, fontFamily: fontFamily.uiBold }]}>
          {label}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.lineSoft, true: 'rgba(232,96,76,.45)' }}
        thumbColor={value ? colors.coral400 : '#fff'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s6,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.s6 },
  label: { fontFamily: fontFamily.ui, fontSize: fontSize.body, color: colors.textStrong },
});
