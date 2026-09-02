import React from 'react';
import { Pressable, Text, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_COLORS } from '../../constants/categories';
import { colors, glass, blur, radius, spacing, fontFamily, elevation } from '../../constants/theme';

interface CategoryTileProps {
  label: string;
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function CategoryTile({ label, category, icon, active = false, onPress, style }: CategoryTileProps) {
  const tint = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.root,
        { borderColor: active ? tint : glass.edge },
        active ? (elevation.raised as object) : (elevation.hair as object),
        style,
      ]}
    >
      {!active && <BlurView intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: active ? tint : glass.regular }]} />
      <LinearGradient
        pointerEvents="none"
        colors={glass.sheenColors as unknown as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name={icon} size={26} color={active ? '#444444' : colors.textStrong} />
      <Text style={[styles.label, { color: active ? '#444444' : colors.textStrong, opacity: active ? 1 : 0.7 }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 80,
    height: 80,
    borderRadius: radius.l,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    overflow: 'hidden',
  },
  label: { fontFamily: fontFamily.uiSemibold, fontSize: 10, textAlign: 'center', paddingHorizontal: 4 },
});
