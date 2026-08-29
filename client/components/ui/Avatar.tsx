import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius, fontFamily } from '../../constants/theme';

export type AvatarSize = 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';

const SZ: Record<AvatarSize, number> = { xs: 24, s: 32, m: 40, l: 44, xl: 48, xxl: 72 };

interface AvatarProps {
  initials?: string;
  src?: string | null;
  size?: AvatarSize | number;
  color?: string;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Avatar({ initials = '', src, size = 'm', color = colors.coral400, ring = false, style }: AvatarProps) {
  const d = typeof size === 'number' ? size : SZ[size];

  return (
    <View
      style={[
        {
          width: d,
          height: d,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: src ? colors.cream300 : color,
          overflow: 'hidden',
        },
        ring && styles.ring,
        style,
      ]}
    >
      {src ? (
        <Image source={{ uri: src }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Text style={{ fontFamily: fontFamily.uiBlack, fontSize: Math.round(d * 0.36), color: '#fff', letterSpacing: 0.5 }}>
          {initials.toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    borderColor: '#fff',
    // Approximates the CSS double-ring (white gap + coral halo) with a single coral border.
    shadowColor: '#E76F51',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
});
