import React from 'react';
import { Pressable, View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, blur, radius, spacing, fontFamily, fontSize } from '../../constants/theme';

interface ChipProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  active?: boolean;
  onDismiss?: () => void;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Chip({ children, icon, active = false, onDismiss, onPress, style }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        { borderColor: active ? colors.coral400 : colors.lineStrong, backgroundColor: active ? 'rgba(232,96,76,.10)' : 'rgba(255,255,255,.4)' },
        style,
      ]}
    >
      <BlurView intensity={blur.s} tint="light" style={StyleSheet.absoluteFill} />
      {icon}
      <Text style={[styles.label, { color: active ? colors.coral400 : colors.textStrong, opacity: active ? 1 : 0.7 }]}>
        {children}
      </Text>
      {active && onDismiss && (
        <Pressable hitSlop={8} onPress={onDismiss}>
          <Ionicons name="close-circle" size={15} color={colors.coral400} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  label: { fontFamily: fontFamily.uiSemibold, fontSize: fontSize.caption },
});
