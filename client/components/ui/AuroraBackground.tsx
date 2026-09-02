import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

// Port of --mesh-aurora (tokens/glass.css): four soft radial blooms, built
// from the app's own category pastels, over a cream base. RN has no native
// radial-gradient, so each bloom is an absolutely-positioned SVG ellipse.
interface Bloom {
  key: string;
  color: string;
  peakOpacity: number;
  fadeAt: number; // 0-1, where the color reaches transparent
  widthPct: number;
  heightPct: number;
  leftPct: number; // center position, 0-1
  topPct: number;
}

const BLOOMS: Bloom[] = [
  { key: 'coral', color: '#E8604C', peakOpacity: 0.38, fadeAt: 0.55, widthPct: 1.2, heightPct: 0.9, leftPct: 0.08, topPct: -0.1 },
  { key: 'sky', color: '#CCEEFF', peakOpacity: 0.85, fadeAt: 0.58, widthPct: 0.9, heightPct: 0.7, leftPct: 0.96, topPct: 0.04 },
  { key: 'lavender', color: '#E6E6FA', peakOpacity: 0.9, fadeAt: 0.6, widthPct: 0.8, heightPct: 0.7, leftPct: 0.88, topPct: 0.96 },
  { key: 'peach', color: '#FFDAB9', peakOpacity: 0.9, fadeAt: 0.62, widthPct: 0.85, heightPct: 0.65, leftPct: 0.04, topPct: 0.92 },
];

interface Props {
  children?: React.ReactNode;
  style?: any;
}

export default function AuroraBackground({ children, style }: Props) {
  const { width, height } = Dimensions.get('window');

  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={['#FBF8F1', '#F5F0E6']}
        style={StyleSheet.absoluteFill}
      />
      {BLOOMS.map(b => {
        const bw = width * b.widthPct;
        const bh = height * b.heightPct;
        return (
          <View
            key={b.key}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: bw,
              height: bh,
              left: width * b.leftPct - bw / 2,
              top: height * b.topPct - bh / 2,
            }}
          >
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id={b.key} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={b.color} stopOpacity={b.peakOpacity} />
                  <Stop offset={b.fadeAt} stopColor={b.color} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect width="100%" height="100%" fill={`url(#${b.key})`} />
            </Svg>
          </View>
        );
      })}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F0E6', overflow: 'hidden' },
  content: { flex: 1 },
});
