import { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../components/rn';
import { connectGmail, connectGmailViaBrowser, scanGmail, getGmailCandidates, getGmailStatus, isGmailOAuthAvailable, type GmailCandidate } from '../services/gmail';

export default function GmailScanScreen() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<GmailCandidate[]>([]);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCandidates = useCallback(async () => {
    try {
      const { data } = await getGmailCandidates();
      setCandidates(data);
    } catch {
      // No connection yet, or a transient error — the empty state covers both.
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshConnectionStatus = useCallback(async () => {
    try {
      const status = await getGmailStatus();
      if (status.connected) setConnectedEmail(status.gmail_email);
    } catch {
      // Best-effort background check — ignore transient failures.
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadCandidates();
    refreshConnectionStatus();
  }, [loadCandidates, refreshConnectionStatus]));

  // The browser-bridge (Expo Go) connect flow finishes on the backend, not in the
  // app, so returning-to-foreground is the only signal we get that it may be done —
  // useFocusEffect alone misses the common case of switching back via the app-switcher
  // instead of the in-app browser's own "Done" button.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') { refreshConnectionStatus(); loadCandidates(); }
    });
    return () => sub.remove();
  }, [refreshConnectionStatus, loadCandidates]);

  async function handleConnect() {
    setConnecting(true);
    try {
      if (isGmailOAuthAvailable) {
        const { gmail_email } = await connectGmail();
        setConnectedEmail(gmail_email);
        await handleScan();
      } else {
        await connectGmailViaBrowser();
        const status = await getGmailStatus();
        if (status.connected) {
          setConnectedEmail(status.gmail_email);
          await handleScan();
        }
        // Not connected yet (user backed out or hasn't finished) — not an error,
        // just leave the button as-is; focus/AppState checks will pick it up later.
      }
    } catch (err: any) {
      Alert.alert('Could not connect Gmail', err?.response?.data?.error ?? err?.message ?? 'Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    try {
      const { data } = await scanGmail();
      setCandidates(data);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        Alert.alert('Gmail not connected', 'Tap "Connect Gmail" first.');
      } else {
        Alert.alert('Scan failed', err?.response?.data?.error ?? 'Please try again.');
      }
    } finally {
      setScanning(false);
    }
  }

  function formatDate(dateHeader: string) {
    const d = new Date(dateHeader);
    return isNaN(d.getTime()) ? dateHeader : d.toLocaleDateString();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="#1A2332" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gmail Scanner</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.connectBtn}
          onPress={handleConnect}
          disabled={connecting}
          activeOpacity={0.8}
        >
          {connecting ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="mail-outline" size={18} color="#fff" />
              <Text style={styles.connectBtnText}>{connectedEmail ? `Connected: ${connectedEmail}` : 'Connect Gmail'}</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.scanBtn} onPress={handleScan} disabled={scanning} activeOpacity={0.8}>
          {scanning ? <ActivityIndicator color="#E8604C" /> : (
            <>
              <Ionicons name="search-outline" size={16} color="#E8604C" />
              <Text style={styles.scanBtnText}>Scan now</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#E8604C" />
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={c => c.message_id}
          contentContainerStyle={candidates.length === 0 ? styles.emptyContainer : styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowSubject} numberOfLines={1}>{item.subject || '(no subject)'}</Text>
              <Text style={styles.rowFrom} numberOfLines={1}>{item.from}</Text>
              <Text style={styles.rowHint}>
                Received on {formatDate(item.date)} from {item.from} — may contain a coupon.
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📬</Text>
              <Text style={styles.emptyText}>No candidates yet</Text>
              <Text style={styles.emptyHint}>Connect Gmail, then tap "Scan now" to look for coupon emails.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1A2332' },
  actions: { paddingHorizontal: 20, gap: 10, marginBottom: 8 },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E8604C',
    borderRadius: 14,
    paddingVertical: 13,
  },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8604C',
    paddingVertical: 11,
  },
  scanBtnText: { color: '#E8604C', fontWeight: '700', fontSize: 14 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  row: {
    backgroundColor: '#EDE8DC',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  rowSubject: { fontSize: 15, fontWeight: '700', color: '#1A2332' },
  rowFrom: { fontSize: 13, color: '#1A2332', opacity: 0.6 },
  rowHint: { fontSize: 12, color: '#1A2332', opacity: 0.45, marginTop: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 44 },
  emptyText: { fontSize: 17, fontWeight: '700', color: '#1A2332' },
  emptyHint: { fontSize: 13, color: '#1A2332', opacity: 0.5, textAlign: 'center' },
});
