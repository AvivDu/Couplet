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
import { requestPasswordReset, confirmPasswordReset } from '../../services/api';
import LoadingOverlay from '../../components/LoadingOverlay';
import { friendlyCognitoError } from '../../utils/cognitoErrors';
import AuroraBackground from '../../components/ui/AuroraBackground';
import GlassPanel from '../../components/ui/GlassPanel';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { colors, radius, spacing, fontFamily, fontSize } from '../../constants/theme';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRequestCode() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const normalized = trimmed.toLowerCase();
      await requestPasswordReset(normalized);
      setEmail(normalized);
      setStep('confirm');
    } catch (err: any) {
      Alert.alert('Could not send code', friendlyCognitoError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset() {
    if (!code.trim() || !newPassword || !confirmPassword) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (newPassword !== confirmPassword) return;
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      Alert.alert('Weak password', 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(email, code.trim(), newPassword);
      Alert.alert('Password reset', 'You can now log in with your new password.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (err: any) {
      Alert.alert('Reset failed', friendlyCognitoError(err));
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
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              {step === 'request'
                ? "Enter your email and we'll send you a code."
                : 'Enter the code we emailed you and choose a new password.'}
            </Text>

            <GlassPanel tint="thick" radius={radius['2xl']} padding={spacing.s10}>
              {step === 'request' ? (
                <>
                  <Input
                    label="Email"
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    returnKeyType="go"
                    onSubmitEditing={handleRequestCode}
                    wrapperStyle={styles.field}
                  />
                  <Button variant="primary" size="l" block onPress={handleRequestCode} disabled={loading} style={styles.submitBtn}>
                    Send Code
                  </Button>
                </>
              ) : (
                <>
                  <Text style={styles.sentHint}>Code sent to {email}</Text>
                  <Input
                    label="Verification code"
                    placeholder="123456"
                    keyboardType="number-pad"
                    value={code}
                    onChangeText={setCode}
                    wrapperStyle={styles.field}
                  />
                  <Input
                    label="New password"
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    trailing={
                      <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    }
                    hint="Min 8 characters · uppercase · lowercase · number · symbol"
                    wrapperStyle={styles.field}
                  />
                  <Input
                    label="Confirm new password"
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    trailing={
                      <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    }
                    invalid={confirmPassword.length > 0 && newPassword !== confirmPassword}
                    hint={confirmPassword.length > 0 ? (newPassword === confirmPassword ? 'Passwords match' : 'Passwords do not match') : undefined}
                    wrapperStyle={styles.field}
                  />

                  <Button
                    variant="primary"
                    size="l"
                    block
                    onPress={handleConfirmReset}
                    disabled={loading || (confirmPassword.length > 0 && newPassword !== confirmPassword)}
                    style={styles.submitBtn}
                  >
                    Reset Password
                  </Button>
                  <TouchableOpacity style={styles.linkBtn} onPress={handleRequestCode} disabled={loading}>
                    <Text style={styles.linkText}>
                      Didn't get a code? <Text style={styles.linkBold}>Resend</Text>
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <Link href="/(auth)/login" asChild>
                <TouchableOpacity style={styles.linkBtn}>
                  <Text style={styles.linkText}>
                    Remember your password? <Text style={styles.linkBold}>Log in</Text>
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
    fontFamily: fontFamily.display,
    fontSize: fontSize.displayM,
    color: colors.textStrong,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fontFamily.ui,
    fontSize: fontSize.body,
    color: colors.textBody,
    opacity: 0.7,
    marginBottom: 24,
  },
  field: { marginBottom: spacing.s7 },
  submitBtn: { marginTop: 12, marginBottom: 24 },
  sentHint: { fontFamily: fontFamily.uiSemibold, fontSize: fontSize.micro, color: colors.stateSuccess, marginBottom: 16 },
  linkBtn: { alignItems: 'center', marginBottom: 12 },
  linkText: { fontFamily: fontFamily.ui, color: colors.textStrong, fontSize: fontSize.bodyS, opacity: 0.6 },
  linkBold: { fontFamily: fontFamily.uiBold, color: colors.coral400, opacity: 1 },
});
