import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, letterSpacingRatio, motion } from '../../constants/theme';

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

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.timing(anim, { toValue: 1, duration: motion.durBase, useNativeDriver: true }).start();
    } else if (visible) {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setVisible(false));
    }
  }, [open]);

  if (!visible) return null;

  const screenHeight = Dimensions.get('window').height;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          <BlurView intensity={blur.s} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.scrimTint]} />
        </Animated.View>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] }) }],
            },
          ]}
        >
          <BlurView intensity={blur.l} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.sheetTint]} />
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
      </View>
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
