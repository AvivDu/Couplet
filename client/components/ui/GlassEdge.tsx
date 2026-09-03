import { StyleSheet, View } from 'react-native';
import { glass } from '../../constants/theme';

// The 1px specular highlight along the top of a glass surface (--e-inner-top).
// The spec pairs it with the edge border on EVERY glass surface: the border on its
// own reads as translucent plastic, the highlight is what makes it read as glass.
// RN has no inset box-shadow, so it's a hairline View - the technique the handoff
// names, and the one GlassPanel already used.
export default function GlassEdge({ ink = false }: { ink?: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.edge, { backgroundColor: ink ? glass.edgeInk : glass.innerTop }]}
    />
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
});
