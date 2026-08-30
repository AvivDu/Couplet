import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './rn';
import Input from './ui/Input';
import Button from './ui/Button';
import { colors, fontFamily, fontSize, spacing } from '../constants/theme';

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
      <Input
        label="Verification code"
        placeholder="123456"
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
        wrapperStyle={styles.field}
      />

      <Button variant="primary" size="l" block onPress={onVerify} disabled={loading} style={styles.submitBtn}>
        {verifyLabel}
      </Button>
      <TouchableOpacity style={styles.linkBtn} onPress={onResend} disabled={loading}>
        <Text style={styles.linkText}>
          Didn't get a code? <Text style={styles.linkBold}>Resend</Text>
        </Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  sentHint: { fontFamily: fontFamily.uiSemibold, fontSize: 12, color: colors.stateSuccess, marginBottom: 16 },
  field: { marginBottom: spacing.s7 },
  submitBtn: { marginBottom: 24 },
  linkBtn: { alignItems: 'center', marginBottom: 12 },
  linkText: { color: colors.textStrong, fontSize: 14, opacity: 0.6 },
  linkBold: { color: colors.coral400, fontWeight: '700', opacity: 1 },
});
