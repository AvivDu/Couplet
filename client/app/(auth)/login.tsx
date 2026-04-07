import { useRouter, Link } from 'expo-router';
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { login } from '../../services/api';
import LoadingOverlay from '../../components/LoadingOverlay';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 0)); // yield JS thread so overlay renders before SRP computation starts
    try {
      const { data } = await login(email.trim().toLowerCase(), password);
      await signIn(data.token, {
        userId: data.userId,
        email: data.email,
        username: data.username,
      });
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong. Please try again.';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <LoadingOverlay visible={loading} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Log In</Text>
          <Text style={styles.subtitle}>Good to see you again</Text>

          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#A8997A"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { paddingRight: 40 }]}
              placeholder="Password"
              placeholderTextColor="#A8997A"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#A8997A" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
            <Text style={styles.btnText}>Log In</Text>
          </TouchableOpacity>

          <Link href="/(auth)/register" asChild>
            <TouchableOpacity style={styles.linkBtn}>
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.linkBold}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1A2332',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#1A2332',
    opacity: 0.5,
    marginBottom: 40,
  },
  inputWrap: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#C4B8A0',
    marginBottom: 28,
  },
  input: {
    paddingVertical: 10,
    fontSize: 16,
    color: '#1A2332',
    backgroundColor: 'transparent',
  },
  eyeBtn: { position: 'absolute', right: 0, bottom: 8 },
  btn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { alignItems: 'center' },
  linkText: { color: '#1A2332', fontSize: 14, opacity: 0.6 },
  linkBold: { color: '#E8604C', fontWeight: '700', opacity: 1 },
});
