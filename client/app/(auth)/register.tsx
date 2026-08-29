import { useRouter, Link } from 'expo-router';
import { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Text } from '../../components/rn';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { register, confirmAndSignIn, finishSync, resendConfirmationCode } from '../../services/api';
import LoadingOverlay from '../../components/LoadingOverlay';
import ConfirmCodeStep from '../../components/ConfirmCodeStep';
import { friendlyCognitoError } from '../../utils/cognitoErrors';
import { isValidIsraeliPhone } from '../../utils/validation';
import AuroraBackground from '../../components/ui/AuroraBackground';
import GlassPanel from '../../components/ui/GlassPanel';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { colors, radius, spacing } from '../../constants/theme';

export default function RegisterScreen() {
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  async function handleRegister() {
    if (!email.trim() || !phone.trim() || !username.trim() || !password || !confirm) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!isValidIsraeliPhone(phone)) {
      Alert.alert('Invalid phone', 'Enter a valid phone number, e.g. 050-1234567.');
      return;
    }
    if (password !== confirm) return;
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      Alert.alert('Weak password', 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.');
      return;
    }

    setLoading(true);
    try {
      setEmail(email.trim().toLowerCase());
      setUsername(username.trim());
      setPhone(phone.trim());
      await register(email.trim().toLowerCase(), username.trim(), password, phone.trim());
      setStep('confirm');
    } catch (err: any) {
      Alert.alert('Registration failed', friendlyCognitoError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!code.trim()) {
      Alert.alert('Missing code', 'Please enter the verification code.');
      return;
    }
    setLoading(true);
    try {
      const { token, username: confirmedUsername } = await confirmAndSignIn(email, code.trim(), password);
      const data = await finishSync(email, confirmedUsername, phone);
      await signIn(token, {
        userId: data.userId,
        email: data.email,
        username: data.username,
        phone_number: data.phone_number,
      });
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Verification failed', friendlyCognitoError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    try {
      await resendConfirmationCode(email);
    } catch (err: any) {
      Alert.alert('Could not resend code', friendlyCognitoError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <LoadingOverlay visible={loading} />
      <AuroraBackground>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Sign Up</Text>
            <Text style={styles.subtitle}>
              {step === 'form' ? 'Create your Couplet account' : 'Enter the code we emailed you to finish signing up.'}
            </Text>

            <GlassPanel tint="thick" radius={radius['2xl']} padding={spacing.s10}>
              {step === 'form' ? (
                <>
                  <Input
                    label="Email"
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    wrapperStyle={styles.field}
                  />
                  <Input
                    label="Phone"
                    placeholder="050-1234567"
                    autoCapitalize="none"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    wrapperStyle={styles.field}
                  />
                  <Input
                    label="Username"
                    placeholder="Choose a username"
                    autoCapitalize="none"
                    value={username}
                    onChangeText={setUsername}
                    wrapperStyle={styles.field}
                  />
                  <Input
                    label="Password"
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    trailing={
                      <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    }
                    hint="Min 8 characters · uppercase · lowercase · number · symbol"
                    wrapperStyle={styles.field}
                  />
                  <Input
                    label="Confirm password"
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    value={confirm}
                    onChangeText={setConfirm}
                    trailing={
                      <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    }
                    invalid={confirm.length > 0 && password !== confirm}
                    hint={confirm.length > 0 ? (password === confirm ? 'Passwords match' : 'Passwords do not match') : undefined}
                    wrapperStyle={styles.field}
                  />

                  <Button
                    variant="primary"
                    size="l"
                    block
                    onPress={handleRegister}
                    disabled={loading || (confirm.length > 0 && password !== confirm)}
                    style={styles.submitBtn}
                  >
                    Create Account
                  </Button>
                </>
              ) : (
                <ConfirmCodeStep
                  email={email}
                  code={code}
                  setCode={setCode}
                  loading={loading}
                  onVerify={handleVerify}
                  onResend={handleResend}
                />
              )}

              <Link href="/(auth)/login" asChild>
                <TouchableOpacity style={styles.linkBtn}>
                  <Text style={styles.linkText}>
                    Already have an account? <Text style={styles.linkBold}>Log in</Text>
                  </Text>
                </TouchableOpacity>
              </Link>
            </GlassPanel>
          </ScrollView>
        </KeyboardAvoidingView>
      </AuroraBackground>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textStrong,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textBody,
    opacity: 0.7,
    marginBottom: 24,
  },
  field: { marginBottom: spacing.s7 },
  submitBtn: { marginTop: 12, marginBottom: 24 },
  linkBtn: { alignItems: 'center' },
  linkText: { color: colors.textStrong, fontSize: 14, opacity: 0.6 },
  linkBold: { color: colors.coral400, fontWeight: '700', opacity: 1 },
});
