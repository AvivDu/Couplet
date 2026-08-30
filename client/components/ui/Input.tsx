import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle, StyleProp, TextInputProps } from 'react-native';
import GlassEdge from './GlassEdge';
import { BlurView } from 'expo-blur';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, letterSpacingRatio, motion } from '../../constants/theme';

export type InputVariant = 'glass' | 'underline';

interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  variant?: InputVariant;
  invalid?: boolean;
  wrapperStyle?: StyleProp<ViewStyle>;
}

export default function Input({
  label, hint, icon, trailing, variant = 'glass', invalid = false, wrapperStyle, style, autoFocus, ...rest
}: InputProps) {
  const inputRef = useRef<TextInput>(null);

  // Deferred on purpose. Every autoFocus in the app sits inside a Sheet, and a native
  // autoFocus raises the keyboard while the Modal is still presenting - the Sheet's
  // KeyboardAvoidingView then never measures a stable frame, so the sheet stays pinned
  // under the keyboard. Focusing after the present + slide-up gives it something to
  // measure. Matches the sheet's own open duration.
  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => inputRef.current?.focus(), motion.durBase + 80);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  const isGlass = variant === 'glass';
  const borderColor = invalid ? colors.stateDanger : (isGlass ? glass.edge : colors.lineStrong);

  return (
    <View style={wrapperStyle}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.fieldRow,
          isGlass
            ? { paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.m, borderWidth: 1, borderColor, overflow: 'hidden' }
            : { paddingVertical: 10, borderBottomWidth: 1.5, borderBottomColor: borderColor },
        ]}
      >
        {isGlass && <BlurView intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />}
        {isGlass && <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.thick }]} />}
        {isGlass && <GlassEdge />}
        {icon && <View style={styles.icon}>{icon}</View>}
        <TextInput
          ref={inputRef}
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          {...rest}
        />
        {trailing}
      </View>
      {hint && <Text style={[styles.hint, invalid && { color: colors.stateDanger }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.micro,
    letterSpacing: letterSpacingRatio.label * fontSize.micro,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: spacing.s3,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s4 },
  icon: { opacity: 0.85 },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamily.ui,
    fontSize: fontSize.body,
    color: colors.textStrong,
    padding: 0,
  },
  hint: {
    marginTop: spacing.s3,
    fontFamily: fontFamily.ui,
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
});
