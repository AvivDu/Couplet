import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';
import GlassEdge from './GlassEdge';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, blur, radius, spacing, elevation, fontFamily, motion } from '../../constants/theme';

export type ButtonVariant = 'primary' | 'glass' | 'outline' | 'ghost' | 'quiet' | 'danger';
export type ButtonSize = 's' | 'm' | 'l';

const PAD: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number; minHeight: number }> = {
  s: { paddingVertical: 8, paddingHorizontal: 16, fontSize: 13, minHeight: 34 },
  m: { paddingVertical: 12, paddingHorizontal: 22, fontSize: 15, minHeight: 44 },
  l: { paddingVertical: 18, paddingHorizontal: 26, fontSize: 17, minHeight: 60 },
};

interface ButtonProps {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  children, variant = 'primary', size = 'm', block = false, disabled = false,
  icon, trailingIcon, onPress, style,
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const pad = PAD[size];

  const pressIn = () => Animated.timing(scale, { toValue: motion.pressScale, duration: motion.durInstant, useNativeDriver: true }).start();
  const pressOut = () => Animated.timing(scale, { toValue: 1, duration: motion.durInstant, useNativeDriver: true }).start();

  const textColor = {
    primary: colors.textOnBrand,
    glass: colors.textStrong,
    outline: colors.coral500,
    ghost: colors.textStrong,
    quiet: colors.coral500,
    danger: colors.stateDanger,
  }[variant];

  const content = (
    <Animated.View
      style={[
        styles.base,
        { paddingVertical: pad.paddingVertical, paddingHorizontal: pad.paddingHorizontal, minHeight: pad.minHeight },
        block && styles.block,
        variantStyle(variant),
        disabled && styles.disabled,
        { transform: [{ scale }] },
        style,
      ]}
    >
      {variant === 'primary' && (
        <LinearGradient
          colors={['#EE6E58', colors.coral400, colors.coral500]}
          locations={[0, 0.52, 1]}
          style={StyleSheet.absoluteFill}
        />
      )}
      {variant === 'glass' && (
        <BlurView intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />
      )}
      {variant === 'glass' && <GlassEdge />}
      {icon}
      {typeof children === 'string' ? (
        <Text style={[styles.label, { color: textColor, fontSize: pad.fontSize }]}>{children}</Text>
      ) : children}
      {trailingIcon}
    </Animated.View>
  );

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : pressIn}
      onPressOut={disabled ? undefined : pressOut}
      disabled={disabled}
      style={block ? styles.block : undefined}
    >
      {content}
    </Pressable>
  );
}

function variantStyle(variant: ButtonVariant): ViewStyle {
  switch (variant) {
    case 'primary':
      return { borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', overflow: 'hidden', ...(elevation.brand as ViewStyle) };
    case 'glass':
      return { borderRadius: radius.pill, borderWidth: 1, borderColor: glass.edge, backgroundColor: glass.thick, overflow: 'hidden', ...(elevation.panel as ViewStyle) };
    case 'outline':
      return { borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.coral400, backgroundColor: 'rgba(255,255,255,.24)' };
    case 'ghost':
      return { borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent' };
    case 'quiet':
      return { borderRadius: radius.s, borderWidth: 1, borderColor: 'transparent', backgroundColor: colors.brandQuiet };
    case 'danger':
      return { borderRadius: radius.s, borderWidth: 1, borderColor: 'transparent', backgroundColor: colors.stateDangerQuiet };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s6,
  },
  block: { width: '100%' },
  label: { fontFamily: fontFamily.uiBold, letterSpacing: 0.2 },
  disabled: { opacity: 0.5 },
});
