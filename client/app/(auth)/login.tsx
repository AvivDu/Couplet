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
import { Text, TextInput } from '../../components/rn';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { login, getMe, confirmAndSignIn, finishSync, resendConfirmationCode } from '../../services/api';
import LoadingOverlay from '../../components/LoadingOverlay';
import CoupletLogo from '../../components/CoupletLogo';
import ConfirmCodeStep from '../../components/ConfirmCodeStep';
import { friendlyCognitoError } from '../../utils/cognitoErrors';
import { isValidIsraeliPhone } from '../../utils/validation';

export default function LoginScreen() {
  const [step, setStep] = useState<'form' | 'confirm' | 'phone'>('form');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  // Set once confirmAndSignIn succeeds, in case the phone step is needed
  // before the session can actually be finalized.
  const [pending, setPending] = useState<{ token: string; username: string } | null>(null);

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email or phone and password.');
      return;
    }
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 0)); // yield JS thread so overlay renders before SRP computation starts
    try {
      // Only lowercase emails; phone numbers are passed through as typed.
      const id = identifier.trim();
      const email = id.includes('@') ? id.toLowerCase() : id;
      const { data } = await login(email, password);
      await signIn(data.token, {
        userId: data.userId,
        email: data.email,
        username: data.username,
        phone_number: data.phone_number,
        profile_image: data.profile_image ?? null,
      });
      router.replace('/(tabs)');
    } catch (err: any) {
      if (err?.code === 'UserNotConfirmedException') {
        // Signup was never confirmed (e.g. the user closed the app before
        // entering the code) — finish confirmation here instead of leaving
        // them stuck, since Cognito won't let them register that email again.
        const email = identifier.trim().toLowerCase();
        setIdentifier(email);
        try {
          await resendConfirmationCode(email);
        } catch {
          // Ignore — the user can still tap "Resend" from the confirm step.
        }
        setStep('confirm');
        setLoading(false);
        return;
      }
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong. Please try again.';
      Alert.alert('Login failed', msg);
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
      const email = identifier.trim().toLowerCase();
      const { token, username } = await confirmAndSignIn(email, code.trim(), password);
      try {
        const { data } = await getMe();
        await signIn(token, {
          userId: data.userId,
          email: data.email,
          username: data.username,
          phone_number: data.phone_number,
          profile_image: data.profile_image ?? null,
        });
        router.replace('/(tabs)');
      } catch (err: any) {
        if (err?.response?.status === 404) {
          // Signup was interrupted before /auth/sync ever ran — we have the
          // Cognito account confirmed now, just missing the phone number.
          setPending({ token, username });
          setStep('phone');
          return;
        }
        throw err;
      }
    } catch (err: any) {
      Alert.alert('Verification failed', friendlyCognitoError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    try {
      await resendConfirmationCode(identifier.trim().toLowerCase());
    } catch (err: any) {
      Alert.alert('Could not resend code', friendlyCognitoError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleFinishPhone() {
    if (!pending) return;
    if (!isValidIsraeliPhone(phone)) {
      Alert.alert('Invalid phone', 'Enter a valid phone number, e.g. 050-1234567.');
      return;
    }
    setLoading(true);
    try {
      const email = identifier.trim().toLowerCase();
      const data = await finishSync(email, pending.username, phone.trim());
      await signIn(pending.token, {
        userId: data.userId,
        email: data.email,
        username: data.username,
        phone_number: data.phone_number,
      });
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong. Please try again.';
      Alert.alert('Could not finish signup', msg);
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
          <View style={styles.brand}>
            <CoupletLogo size="medium" showTagline />
          </View>

          {step === 'form' && (
            <>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Email or phone"
                  placeholderTextColor="#A8997A"
                  autoCapitalize="none"
                  value={identifier}
                  onChangeText={setIdentifier}
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

              <Link href="/(auth)/forgot-password" asChild>
                <TouchableOpacity style={styles.forgotBtn}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </Link>

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
            </>
          )}

          {step === 'confirm' && (
            <>
              <Text style={styles.subtitle}>Your email isn't verified yet — enter the code we just sent you.</Text>
              <ConfirmCodeStep
                email={identifier}
                code={code}
                setCode={setCode}
                loading={loading}
                onVerify={handleVerify}
                onResend={handleResend}
              />
            </>
          )}

          {step === 'phone' && (
            <>
              <Text style={styles.subtitle}>Almost done — what's your phone number?</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Phone"
                  placeholderTextColor="#A8997A"
                  autoCapitalize="none"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>
              <TouchableOpacity style={styles.btn} onPress={handleFinishPhone} disabled={loading}>
                <Text style={styles.btnText}>Continue</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },
  inner: { flexGrow: 1, paddingHorizontal: 32, paddingBottom: 40 },
  brand: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: 48,
  },
  subtitle: {
    fontSize: 15,
    color: '#1A2332',
    opacity: 0.5,
    marginBottom: 24,
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
  forgotBtn: { alignSelf: 'flex-end', marginTop: -20, marginBottom: 20 },
  forgotText: { color: '#1A2332', fontSize: 13, opacity: 0.6 },
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
