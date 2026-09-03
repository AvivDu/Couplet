import React from 'react';
import { Pressable, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, blur, radius, elevation } from '../../constants/theme';

export type IconButtonVariant = 'glass' | 'solid' | 'bare';
export type IconButtonSize = 's' | 'm' | 'l';

const SZ: Record<IconButtonSize, number> = { s: 32, m: 36, l: 44 };

interface IconButtonProps {
  children: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
  badge?: boolean;
  label?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function IconButton({
  children, variant = 'glass', size = 'm', active = false, badge = false, label, onPress, style,
}: IconButtonProps) {
  const d = SZ[size];

  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        { width: d, height: d, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
        skinStyle(variant, active),
        style,
      ]}
    >
      {variant === 'glass' && !active && <BlurView pointerEvents="none" intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />}
      {variant === 'solid' && (
        <LinearGradient pointerEvents="none" colors={['#EE6E58', colors.coral500]} style={StyleSheet.absoluteFill} />
      )}
      {children}
      {badge && <View style={styles.badgeDot} />}
    </Pressable>
  );
}

function skinStyle(variant: IconButtonVariant, active: boolean): ViewStyle {
  if (variant === 'bare') {
    return { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'transparent' };
  }
  if (variant === 'solid') {
    return { borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', ...(elevation.brand as ViewStyle) };
  }
  // glass
  if (active) {
    return { backgroundColor: colors.coral400, borderWidth: 1, borderColor: 'rgba(255,255,255,.3)', ...(elevation.brand as ViewStyle) };
  }
  return { backgroundColor: glass.thick, borderWidth: 1, borderColor: glass.edge, ...(elevation.hair as ViewStyle) };
}

const styles = StyleSheet.create({
  badgeDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.coral400,
    borderWidth: 2,
    borderColor: colors.cream050,
  },
});
