import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Text } from '../../components/rn';
import { useRouter } from 'expo-router';
import CSymbol from '../../components/CSymbol';

const C_SIZE = 78;
const FONT_SIZE = 40;
const GAP = 6;
const OUPLET = ['O', 'U', 'P', 'L', 'E', 'T'] as const;

export default function WelcomeScreen() {
  const router = useRouter();

  // Animation state
  const cOpacity    = useRef(new Animated.Value(0)).current;
  const cScale      = useRef(new Animated.Value(2)).current;
  const cTranslateX = useRef(new Animated.Value(0)).current;

  const charOpacities = useRef(OUPLET.map(() => new Animated.Value(0))).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const btnOpacity     = useRef(new Animated.Value(0)).current;

  // Measured once from the rendered logo row
  const [rowMeasured, setRowMeasured] = useState(false);

  function onLogoRowLayout(e: { nativeEvent: { layout: { width: number } } }) {
    if (rowMeasured) return;
    const rowW = e.nativeEvent.layout.width;
    // Offset that, when added, moves C from its flex position to screen center.
    // With transform order [scale, translateX]: translation is not multiplied by scale.
    const offset = (rowW - C_SIZE) / 2;
    cTranslateX.setValue(offset);
    // Reveal C only after initial position is set to avoid flash
    Animated.timing(cOpacity, { toValue: 1, duration: 0, useNativeDriver: true }).start();
    setRowMeasured(true);
  }

  useEffect(() => {
    if (!rowMeasured) return;

    // Phase 1 → Phase 2: after 500 ms, C slides left + scales down
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(cScale, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(cTranslateX, {
          toValue: 0,
          duration: 550,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Phase 3: type out O-U-P-L-E-T
        Animated.stagger(
          70,
          charOpacities.map(o =>
            Animated.timing(o, { toValue: 1, duration: 40, useNativeDriver: true }),
          ),
        ).start(() => {
          // Phase 4: tagline fades in
          Animated.timing(taglineOpacity, {
            toValue: 1,
            duration: 550,
            useNativeDriver: true,
          }).start(() => {
            // Button appears
            Animated.timing(btnOpacity, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }).start();
          });
        });
      });
    }, 500);

    return () => clearTimeout(t);
  }, [rowMeasured]);

  return (
    <View style={styles.container}>
      <View style={styles.logoArea}>
        {/* Logo row — measured once to compute centering offset */}
        <View style={styles.logoRow} onLayout={onLogoRowLayout}>
          {/* Animated C: starts large + centered, slides left and shrinks */}
          <Animated.View
            style={{
              opacity: cOpacity,
              transform: [{ scale: cScale }, { translateX: cTranslateX }],
            }}
          >
            <CSymbol size={C_SIZE} />
          </Animated.View>

          <View style={{ width: GAP }} />

          {/* OUPLET — each letter types in individually */}
          <View style={styles.textRow}>
            {OUPLET.map((char, i) => (
              <Animated.Text
                key={i}
                style={[styles.oupletChar, { opacity: charOpacities[i] }]}
              >
                {char}
              </Animated.Text>
            ))}
          </View>
        </View>

        {/* Tagline — Phase 4 */}
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          All your coupons. In one place.
        </Animated.Text>
      </View>

      {/* CTA — appears after full animation */}
      <Animated.View style={[styles.btnWrap, { opacity: btnOpacity }]}>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.btnText}>Log In / Sign Up</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E6',
    alignItems: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginTop: '28%',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  oupletChar: {
    fontSize: FONT_SIZE,
    fontWeight: '900',
    color: '#1A2332',
    letterSpacing: FONT_SIZE * 0.07,
    includeFontPadding: false,
  },
  tagline: {
    fontSize: 14,
    color: '#1A2332',
    opacity: 0.55,
    letterSpacing: 1.0,
    marginTop: C_SIZE * 0.08,
    textAlign: 'center',
  },
  btnWrap: {
    position: 'absolute',
    bottom: 60,
    left: 32,
    right: 32,
  },
  btn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
