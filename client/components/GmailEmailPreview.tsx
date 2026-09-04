import { useEffect, useState, useCallback } from 'react';
import { Modal, View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from './rn';
import { getGmailCandidateBody, type GmailCandidate, type GmailDraftFields } from '../services/gmail';

interface GmailEmailPreviewProps {
  visible: boolean;
  candidate: GmailCandidate | null;
  draft: GmailDraftFields | null;
  onClose: () => void;
  onCreateCoupon: () => void;
}

// Lets the user read the actual email before creating a coupon from it, instead of
// trusting the extracted fields blind. Body is fetched fresh each time it opens -
// never cached client-side, matching the server's "transient only" treatment of it.
export default function GmailEmailPreview({ visible, candidate, draft, onClose, onCreateCoupon }: GmailEmailPreviewProps) {
  const [body, setBody] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadBody = useCallback(async () => {
    if (!candidate) return;
    setLoading(true);
    setError(false);
    try {
      const { data } = await getGmailCandidateBody(candidate.message_id);
      setBody(data.body);
      setTruncated(data.truncated);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [candidate]);

  useEffect(() => {
    if (visible && candidate) {
      setBody(null);
      loadBody();
    }
  }, [visible, candidate, loadBody]);

  if (!candidate || !draft) return null;

  function formatDate(dateHeader: string) {
    const d = new Date(dateHeader);
    return isNaN(d.getTime()) ? dateHeader : d.toLocaleDateString();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕  Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.subject}>{candidate.subject || '(no subject)'}</Text>
          <Text style={styles.meta} numberOfLines={1}>{candidate.from}</Text>
          <Text style={styles.meta}>{formatDate(candidate.date)}</Text>

          {draft.code && draft.codeConfidence === 'guess' && (
            <Text style={styles.lowConfidenceHint}>
              We're not fully sure about this code - check it against the email below before saving.
            </Text>
          )}

          <View style={styles.fieldsRow}>
            <View style={styles.fieldChip}>
              <Text style={styles.fieldLabel}>CODE</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>{draft.code ?? '—'}</Text>
            </View>
            <View style={styles.fieldChip}>
              <Text style={styles.fieldLabel}>STORE</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>{draft.store ?? '—'}</Text>
            </View>
            <View style={styles.fieldChip}>
              <Text style={styles.fieldLabel}>BALANCE</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>{draft.amount != null ? `₪${draft.amount}` : '—'}</Text>
            </View>
            <View style={styles.fieldChip}>
              <Text style={styles.fieldLabel}>EXPIRES</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>{draft.expiration ?? '—'}</Text>
            </View>
            {draft.giftUrl && (
              <View style={[styles.fieldChip, { minWidth: '100%' }]}>
                <Text style={styles.fieldLabel}>GIFT CARD LINK</Text>
                <Text style={styles.fieldValue} numberOfLines={1}>{draft.giftUrl}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {loading ? (
            <ActivityIndicator color="#E8604C" style={{ marginTop: 24 }} />
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Could not load this email's content. You can still create the coupon from the fields above.</Text>
              <TouchableOpacity onPress={loadBody} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.body}>{body}</Text>
              {truncated && <Text style={styles.truncatedHint}>(email truncated)</Text>}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.createBtn} onPress={onCreateCoupon} activeOpacity={0.85}>
            <Text style={styles.createBtnText}>Create coupon</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  closeBtn: { paddingVertical: 4 },
  closeText: { fontSize: 15, color: '#1A2332', fontWeight: '600', opacity: 0.6 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  subject: { fontSize: 19, fontWeight: '800', color: '#1A2332', marginBottom: 6 },
  meta: { fontSize: 13, color: '#A8997A', fontWeight: '500' },
  lowConfidenceHint: { fontSize: 12, color: '#E8604C', fontWeight: '600', marginTop: 10 },
  fieldsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  fieldChip: {
    backgroundColor: '#EDE8DC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: '30%',
    flexGrow: 1,
  },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#A8997A', letterSpacing: 0.5 },
  fieldValue: { fontSize: 14, fontWeight: '700', color: '#1A2332', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E0D8CA', marginTop: 20, marginBottom: 16 },
  body: { fontSize: 14, color: '#1A2332', lineHeight: 21 },
  truncatedHint: { fontSize: 12, color: '#A8997A', marginTop: 12, fontStyle: 'italic' },
  errorBox: { alignItems: 'center', gap: 10, marginTop: 24 },
  errorText: { fontSize: 14, color: '#1A2332', opacity: 0.6, textAlign: 'center' },
  retryBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  retryBtnText: { color: '#E8604C', fontWeight: '700', fontSize: 14 },
  footer: { padding: 20, paddingBottom: 32 },
  createBtn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
