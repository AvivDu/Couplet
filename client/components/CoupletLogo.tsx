import React from 'react';
import { View, Text } from 'react-native';
import CSymbol from './CSymbol';

type LogoSize = 'small' | 'medium' | 'large';

const SIZES: Record<LogoSize, { sym: number; font: number; gap: number; tag: number }> = {
  small:  { sym: 42,  font: 22, gap: 3, tag: 10 },
  medium: { sym: 58,  font: 30, gap: 4, tag: 12 },
  large:  { sym: 78,  font: 40, gap: 6, tag: 14 },
};

interface Props {
  size?: LogoSize;
  showTagline?: boolean;
}

export default function CoupletLogo({ size = 'medium', showTagline = true }: Props) {
  const { sym, font, gap, tag } = SIZES[size];

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <CSymbol size={sym} />
        <View style={{ width: gap }} />
        <Text
          style={{
            fontSize: font,
            fontWeight: '900',
            color: '#1A2332',
            letterSpacing: font * 0.07,
            includeFontPadding: false,
          }}
        >
          OUPLET
        </Text>
      </View>

      {showTagline && (
        <Text
          style={{
            fontSize: tag,
            color: '#1A2332',
            opacity: 0.55,
            letterSpacing: 1.0,
            marginTop: sym * 0.06,
            textAlign: 'center',
          }}
        >
          All your coupons. In one place.
        </Text>
      )}
    </View>
  );
}
