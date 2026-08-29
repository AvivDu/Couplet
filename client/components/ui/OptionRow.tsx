import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontFamily, fontSize } from '../../constants/theme';

interface OptionRowProps {
  label: string;
  icon?: React.ReactNode;
  selected?: boolean;
  divider?: boolean;
  /** Red label — for destructive rows like "Delete Group"/"Leave Group". */
  destructive?: boolean;
  /** Trailing node (e.g. a chevron) for navigation rows. Ignored when selected
   * (the checkmark takes that slot). */
  trailing?: React.ReactNode;
  onPress?: () => void;
}

export default function OptionRow({ label, icon, selected = false, divider = true, destructive = false, trailing, onPress }: OptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        divider && styles.divider,
        selected && { backgroundColor: 'rgba(232,96,76,.06)', borderRadius: radius.m },
      ]}
    >
      <View style={styles.left}>
        {icon}
        <Text
          style={[
            styles.label,
            selected && { color: colors.coral400, fontFamily: fontFamily.uiBold },
            destructive && { color: colors.stateDanger },
          ]}
        >
          {label}
        </Text>
      </View>
      {selected ? <Ionicons name="checkmark" size={18} color={colors.coral400} /> : trailing}
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
