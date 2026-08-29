import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { Text } from './rn';
import AuroraBackground from './ui/AuroraBackground';
import { colors, spacing } from '../constants/theme';

const PHRASES = [
  'Hunting for the best deals...',
  'Clipping your savings...',
  'Unlocking your coupons...',
  'Checking the price tags...',
  'Roni = Candy',
  'Doron = Strech',
  'Aviv = King',
  'Securing your wallet...',
  'Finding your discounts...',
  'Loading your rewards...',
  'More awesome features coming soon!',
  'Almost there...',
];

export default function LoadingOverlay({ visible }: { visible: boolean }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setPhraseIndex(Math.floor(Math.random() * PHRASES.length));
    const interval = setInterval(() => {
      setPhraseIndex(i => (i + 1) % PHRASES.length);
    }, 500);
    return () => clearInterval(interval);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <AuroraBackground>
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.coral400} />
          <Text style={styles.phrase}>{PHRASES[phraseIndex]}</Text>
        </View>
      </AuroraBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.s12,
  },
  phrase: {
    fontSize: 16,
    color: colors.textStrong,
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 48,
  },
});
