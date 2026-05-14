import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import CoupletLogo from './CoupletLogo';

interface Props {
  isLoading: boolean;
  onComplete: () => void;
}

const MIN_DISPLAY_MS = 1200;

export default function SplashScreen({ isLoading, onComplete }: Props) {
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.9)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const [minDone, setMinDone] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(scale,  { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => setMinDone(true), MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isLoading && minDone) {
      Animated.timing(fadeOut, { toValue: 0, duration: 350, useNativeDriver: true })
        .start(() => onComplete());
    }
  }, [isLoading, minDone]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Animated.View style={{ opacity: fadeIn, transform: [{ scale }] }}>
        <CoupletLogo size="large" showTagline />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F0E6',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
