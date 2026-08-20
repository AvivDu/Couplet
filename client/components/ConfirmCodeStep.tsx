import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, TextInput } from './rn';

interface ConfirmCodeStepProps {
  email: string;
  code: string;
  setCode: (code: string) => void;
  loading: boolean;
  onVerify: () => void;
  onResend: () => void;
  verifyLabel?: string;
}

export default function ConfirmCodeStep({
  email,
  code,
  setCode,
  loading,
  onVerify,
  onResend,
  verifyLabel = 'Verify',
}: ConfirmCodeStepProps) {
  return (
    <>
      <Text style={styles.sentHint}>Code sent to {email}</Text>
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

      <TouchableOpacity style={styles.btn} onPress={onVerify} disabled={loading}>
        <Text style={styles.btnText}>{verifyLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkBtn} onPress={onResend} disabled={loading}>
        <Text style={styles.linkText}>
          Didn't get a code? <Text style={styles.linkBold}>Resend</Text>
        </Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  sentHint: { fontSize: 12, color: '#4CAF50', marginBottom: 16 },
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
});
