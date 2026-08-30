import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { glass, blur, radius, spacing, elevation } from '../../constants/theme';

export type GlassTint = 'thin' | 'regular' | 'thick' | 'ink' | 'brand';
export type GlassElevation = 'none' | 'card' | 'panel' | 'float';

const TINT_BG: Record<GlassTint, string> = {
  thin: glass.thin,
  regular: glass.regular,
  thick: glass.thick,
  ink: glass.ink,
  brand: glass.brand,
};

const TINT_EDGE: Record<GlassTint, string> = {
  thin: glass.edge,
  regular: glass.edge,
  thick: glass.edge,
  ink: glass.edgeInk,
  brand: 'rgba(232,96,76,.28)',
};

const ELEVATION_STYLE: Record<GlassElevation, ViewStyle | undefined> = {
  none: undefined,
  card: elevation.card as ViewStyle,
  panel: elevation.panel as ViewStyle,
  float: elevation.float as ViewStyle,
};

interface GlassPanelProps {
  tint?: GlassTint;
  radius?: number;
  padding?: number;
  /** Diagonal specular highlight. Turn off only when nesting glass in glass. */
  sheen?: boolean;
  elevation?: GlassElevation;
  blurIntensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export default function GlassPanel({
  tint = 'regular',
  radius: radiusProp = radius['2xl'],
  padding = spacing.s10,
  sheen = true,
  elevation: elevationProp = 'panel',
  blurIntensity = blur.m,
  style,
  children,
}: GlassPanelProps) {
  const isInk = tint === 'ink';

  return (
    <View
      style={[
        {
          borderRadius: radiusProp,
          borderWidth: 1,
          borderColor: TINT_EDGE[tint],
          overflow: 'hidden',
        },
        ELEVATION_STYLE[elevationProp],
        style,
      ]}
    >
      <BlurView intensity={blurIntensity} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TINT_BG[tint] }]} />
      {sheen && (
        <LinearGradient
          pointerEvents="none"
          colors={isInk ? (glass.sheenInkColors as unknown as [string, string, string]) : (glass.sheenColors as unknown as [string, string, string])}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {!isInk && (
        <View pointerEvents="none" style={[styles.topHighlight, { backgroundColor: glass.innerTop }]} />
      )}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});
