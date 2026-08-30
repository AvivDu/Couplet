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
import { login, getMe, confirmAndSignIn, finishSync, resendConfirmationCode } from '../../services/api';
import LoadingOverlay from '../../components/LoadingOverlay';
import CoupletLogo from '../../components/CoupletLogo';
import ConfirmCodeStep from '../../components/ConfirmCodeStep';
import { friendlyCognitoError } from '../../utils/cognitoErrors';
import { isValidIsraeliPhone } from '../../utils/validation';
import AuroraBackground from '../../components/ui/AuroraBackground';
import GlassPanel from '../../components/ui/GlassPanel';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { colors, radius, spacing, fontFamily, fontSize } from '../../constants/theme';

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
        // entering the code) - finish confirmation here instead of leaving
        // them stuck, since Cognito won't let them register that email again.
        const email = identifier.trim().toLowerCase();
        setIdentifier(email);
        try {
          await resendConfirmationCode(email);
        } catch {
          // Ignore - the user can still tap "Resend" from the confirm step.
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
          // Signup was interrupted before /auth/sync ever ran - we have the
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
      <AuroraBackground>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <CoupletLogo size="medium" showTagline />
            </View>

            <GlassPanel tint="thick" radius={radius['2xl']} padding={spacing.s10}>
              {step === 'form' && (
                <>
                  <Input
                    label="Email or phone"
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    value={identifier}
                    onChangeText={setIdentifier}
                    returnKeyType="next"
                    wrapperStyle={styles.field}
                  />
                  <Input
                    label="Password"
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    trailing={
                      <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    }
                    wrapperStyle={styles.field}
                  />

                  <Link href="/(auth)/forgot-password" asChild>
                    <TouchableOpacity style={styles.forgotBtn}>
                      <Text style={styles.forgotText}>Forgot password?</Text>
                    </TouchableOpacity>
                  </Link>

                  <Button variant="primary" size="l" block onPress={handleLogin} disabled={loading} style={styles.submitBtn}>
                    Log In
                  </Button>

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
                  <Text style={styles.subtitle}>Your email isn't verified yet - enter the code we just sent you.</Text>
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
                  <Text style={styles.subtitle}>Almost done - what's your phone number?</Text>
                  <Input
                    label="Phone"
                    placeholder="050-1234567"
                    autoCapitalize="none"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    wrapperStyle={styles.field}
                  />
                  <Button variant="primary" size="l" block onPress={handleFinishPhone} disabled={loading} style={styles.submitBtn}>
                    Continue
                  </Button>
                </>
              )}
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
  brand: {
    alignItems: 'center',
    paddingBottom: 32,
  },
  subtitle: {
    fontFamily: fontFamily.ui,
    fontSize: fontSize.body,
    color: colors.textBody,
    opacity: 0.7,
    marginBottom: 24,
  },
  field: { marginBottom: spacing.s7 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20 },
  forgotText: { color: colors.textStrong, fontSize: 13, opacity: 0.6 },
  submitBtn: { marginBottom: 24 },
  linkBtn: { alignItems: 'center' },
  linkText: { fontFamily: fontFamily.ui, color: colors.textStrong, fontSize: fontSize.bodyS, opacity: 0.6 },
  linkBold: { fontFamily: fontFamily.uiBold, color: colors.coral400, opacity: 1 },
});
