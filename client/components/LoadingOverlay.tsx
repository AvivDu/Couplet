import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal } from 'react-native';

const PHRASES = [
  'Hunting for the best deals...',
  'Clipping your savings...',
  'Unlocking your coupons...',
  'Checking the price tags...',
  'Securing your wallet...',
  'Finding your discounts...',
  'Loading your rewards...',
  'Almost there...',
];

export default function LoadingOverlay({ visible }: { visible: boolean }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setPhraseIndex(Math.floor(Math.random() * PHRASES.length));
    const interval = setInterval(() => {
      setPhraseIndex(i => (i + 1) % PHRASES.length);
    }, 600);
    return () => clearInterval(interval);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color="#E8604C" />
        <Text style={styles.phrase}>{PHRASES[phraseIndex]}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#F5F0E6',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  phrase: {
    fontSize: 16,
    color: '#1A2332',
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 48,
  },
});
