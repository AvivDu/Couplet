import { useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoWrap}>
        <View style={[styles.ticket, styles.ticketBack]} />
        <View style={[styles.ticket, styles.ticketFront]} />
      </View>

      <Text style={styles.title}>Welcome to Couplet!</Text>
      <Text style={styles.tagline}>Your wallet, happier.</Text>

      <TouchableOpacity style={styles.btn} onPress={() => router.push('/(auth)/login')}>
        <Text style={styles.btnText}>Log In / Sign Up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  ticket: {
    position: 'absolute',
    width: 68,
    height: 28,
    borderRadius: 8,
  },
  ticketBack: {
    backgroundColor: '#1A2332',
    transform: [{ rotate: '40deg' }],
    top: 10,
    right: 4,
  },
  ticketFront: {
    backgroundColor: '#E8604C',
    transform: [{ rotate: '-30deg' }],
    bottom: 10,
    left: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A2332',
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#1A2332',
    textAlign: 'center',
    marginBottom: 48,
    opacity: 0.6,
  },
  btn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
