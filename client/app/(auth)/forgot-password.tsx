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
import { requestPasswordReset, confirmPasswordReset } from '../../services/api';
import LoadingOverlay from '../../components/LoadingOverlay';
import { friendlyCognitoError } from '../../utils/cognitoErrors';

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

          {step === 'request' ? (
            <>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#A8997A"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="go"
                  onSubmitEditing={handleRequestCode}
                />
              </View>
              <TouchableOpacity style={styles.btn} onPress={handleRequestCode} disabled={loading}>
                <Text style={styles.btnText}>Send Code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.hint, { color: '#4CAF50', marginTop: 0 }]}>Code sent to {email}</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Verification code"
                  placeholderTextColor="#A8997A"
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={setCode}
                />
              </View>
              <View style={styles.inputWrap}>
                <TextInput
                  style={[styles.input, { paddingRight: 40 }]}
                  placeholder="New password"
                  placeholderTextColor="#A8997A"
                  secureTextEntry={!showPassword}
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#A8997A" />
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Min 8 characters · uppercase · lowercase · number · symbol</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={[styles.input, { paddingRight: 40 }]}
                  placeholder="Confirm new password"
                  placeholderTextColor="#A8997A"
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#A8997A" />
                </TouchableOpacity>
              </View>
              {confirmPassword.length > 0 && (
                <Text style={[styles.hint, { color: newPassword === confirmPassword ? '#4CAF50' : '#E8604C' }]}>
                  {newPassword === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                </Text>
              )}

              <TouchableOpacity
                style={styles.btn}
                onPress={handleConfirmReset}
                disabled={loading || (confirmPassword.length > 0 && newPassword !== confirmPassword)}
              >
                <Text style={styles.btnText}>Reset Password</Text>
              </TouchableOpacity>
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
  linkBtn: { alignItems: 'center', marginBottom: 12 },
  linkText: { color: '#1A2332', fontSize: 14, opacity: 0.6 },
  linkBold: { color: '#E8604C', fontWeight: '700', opacity: 1 },
  hint: { fontSize: 12, color: '#A8997A', marginBottom: 16, marginTop: -16 },
});
