import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, letterSpacingRatio } from '../../constants/theme';

export type CouponCodeFormat = 'code' | 'barcode' | 'qr';

interface CouponCodePanelProps {
  code: string;
  format?: CouponCodeFormat;
  store?: string;
  /** For format='barcode'|'qr': the locally-stored image URI to render instead of a placeholder. */
  imageUri?: string | null;
  note?: string;
}

export default function CouponCodePanel({
  code, format = 'code', store, imageUri, note = 'Stored only on this device',
}: CouponCodePanelProps) {
  return (
    <View style={styles.root}>
      <BlurView intensity={blur.l} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.thick }]} />
      <LinearGradient
        pointerEvents="none"
        colors={glass.sheenColors as unknown as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        {store && <Text style={styles.store}>{store}</Text>}

        {format === 'code' && <Text style={styles.code}>{code}</Text>}

        {format !== 'code' && imageUri && (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        )}
        {format !== 'code' && (
          <Text style={styles.codeSmall}>{code}</Text>
        )}

        <View style={styles.perforation} />
        <View style={styles.noteRow}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radius['2xl'], borderWidth: 1, borderColor: glass.edge, overflow: 'hidden' },
  content: { alignItems: 'center', gap: spacing.s6, paddingVertical: spacing.s12, paddingHorizontal: spacing.s10 },
  store: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.micro,
    letterSpacing: letterSpacingRatio.label * fontSize.micro,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  code: { fontFamily: fontFamily.mono, fontSize: fontSize.code, letterSpacing: 0.14 * fontSize.code, color: colors.textStrong },
  codeSmall: { fontFamily: fontFamily.monoMedium, fontSize: fontSize.caption, letterSpacing: 0.12 * fontSize.caption, color: colors.textBody },
  image: { width: '100%', height: 140 },
  perforation: { width: '100%', height: 1, backgroundColor: colors.lineStrong, opacity: 0.5 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  noteText: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted },
});
