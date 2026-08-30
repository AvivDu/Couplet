import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import GlassEdge from './GlassEdge';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, letterSpacingRatio, motion, easing } from '../../constants/theme';
import { useReducedMotion, duration } from '../../hooks/useReducedMotion';

interface SheetProps {
  title?: string;
  open: boolean;
  onClose: () => void;
  /** iOS-only: fires after the Modal has fully closed (native onDismiss) — use
   * this instead of onClose when something must wait for the sheet to be
   * completely gone (e.g. presenting another modal/picker right after). */
  onDismiss?: () => void;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

// Generalizes the Sort/Filter sheet animation pattern already used on the
// Home and Group screens: backdrop fades in place, sheet slides up
// independently, both animated off a single Animated.Value.
export default function Sheet({ title, open, onClose, onDismiss, footer, children }: SheetProps) {
  const [visible, setVisible] = useState(open);
  const anim = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.timing(anim, { toValue: 1, duration: duration(motion.durBase, reduced), easing: easing.settle, useNativeDriver: true }).start();
    } else if (visible) {
      Animated.timing(anim, { toValue: 0, duration: duration(motion.durFast, reduced), easing: easing.out, useNativeDriver: true }).start(() => setVisible(false));
    }
  }, [open]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} onDismiss={onDismiss}>
      {/* The sheet is bottom-anchored, so shrinking this full-screen overlay by the
          keyboard height is what lifts it clear - a KeyboardAvoidingView on the sheet's
          own content can't work, since the sheet sizes to its content. */}
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          <BlurView intensity={blur.s} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.scrimTint]} />
        </Animated.View>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
            },
          ]}
        >
          <BlurView intensity={blur.l} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.sheetTint]} />
          <GlassEdge />
          <LinearGradient
            pointerEvents="none"
            colors={glass.sheenColors as unknown as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.content}>
            <View style={styles.handle} />
            {title && <Text style={styles.title}>{title}</Text>}
            {children}
            {footer && <View style={styles.footer}>{footer}</View>}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  scrimTint: { backgroundColor: 'rgba(26,35,50,.4)' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
  sheetTint: { backgroundColor: glass.thick },
  content: {
    paddingTop: spacing.s8,
    paddingHorizontal: spacing.gutterScreen,
    paddingBottom: spacing.s16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cream400,
    alignSelf: 'center',
    marginBottom: spacing.s8,
  },
  title: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.micro,
    letterSpacing: letterSpacingRatio.label * fontSize.micro,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: spacing.s4,
  },
  footer: { marginTop: spacing.s10 },
});
