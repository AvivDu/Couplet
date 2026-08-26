import { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../components/rn';
import {
  connectGmail, connectGmailViaBrowser, scanGmail, getGmailCandidates, getGmailStatus,
  extractGmailCandidate, isGmailOAuthAvailable, type GmailCandidate, type GmailDraftFields,
} from '../services/gmail';
import {
  saveDraftFields, getCachedDrafts, getDismissedIds, dismissDraft, getLocalCouponCodes, normalizeCode,
} from '../storage/gmailDraftStorage';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../constants/categories';

// Best-effort keyword guess so a matching category card is pre-selected on the Add
// Coupon screen - falls back to leaving the category unset (user must pick) rather
// than guessing wrong, matching the screen's existing required-field validation.
const CATEGORY_KEYWORDS: { label: string; test: RegExp }[] = [
  { label: 'Food', test: /restaurant|pizza|burger|caf[eé]|coffee|food|מסעדה|פיצה|קפה|אוכל/i },
  { label: 'Groceries', test: /grocery|groceries|supermarket|סופר|מכולת/i },
  { label: 'Fashion', test: /fashion|clothing|shoes|apparel|אופנה|בגדים|נעליים/i },
  { label: 'Electronics', test: /electronics|computer|laptop|phone|אלקטרוניקה|מחשב/i },
  { label: 'Beauty', test: /beauty|cosmetics|spa|יופי|קוסמטיקה/i },
  { label: 'Travel', test: /travel|flight|hotel|טיסה|מלון|נסיעות/i },
  { label: 'Sport', test: /sport|fitness|gym|ספורט|כושר/i },
];

function guessCategory(text: string): string | undefined {
  return CATEGORY_KEYWORDS.find(c => c.test.test(text))?.label;
}

const BACKFILL_CONCURRENCY = 4;

export default function GmailScanScreen() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<GmailCandidate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, GmailDraftFields>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [localCodes, setLocalCodes] = useState<Set<string>>(new Set());
  const [backfilling, setBackfilling] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fills in `drafts` for a candidate list: fresh extractions from a scan response
  // take priority, then the local on-device cache, then a background backfill call
  // per remaining candidate (bounded concurrency) - never re-hits the server for a
  // candidate we've already extracted before.
  const hydrateDrafts = useCallback(async (
    list: GmailCandidate[],
    fresh?: (GmailCandidate & { draft?: GmailDraftFields })[]
  ) => {
    const ids = list.map(c => c.message_id);
    const [dismissedIds, cached, codes] = await Promise.all([
      getDismissedIds(ids),
      getCachedDrafts(ids),
      getLocalCouponCodes(),
    ]);
    setDismissed(dismissedIds);
    setLocalCodes(codes);

    const freshMap = new Map(fresh?.filter(c => c.draft).map(c => [c.message_id, c.draft!]) ?? []);
    const resolved: Record<string, GmailDraftFields> = {};
    const toBackfill: string[] = [];
    for (const id of ids) {
      const found = freshMap.get(id) ?? cached.get(id);
      if (found) resolved[id] = found;
      else toBackfill.push(id);
    }
    setDrafts(prev => ({ ...prev, ...resolved }));
    await Promise.all(
      [...freshMap.entries()].map(([id, draft]) => cached.has(id) ? null : saveDraftFields(id, draft))
    );

    if (toBackfill.length > 0) backfill(toBackfill);
  }, []);

  async function backfill(ids: string[]) {
    setBackfilling(true);
    const queue = [...ids];
    async function worker() {
      let id: string | undefined;
      while ((id = queue.shift())) {
        try {
          const { data } = await extractGmailCandidate(id);
          await saveDraftFields(id, data);
          setDrafts(prev => ({ ...prev, [id!]: data }));
        } catch {
          // Leave unresolved - the row just stays hidden until a future scan/backfill succeeds.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(BACKFILL_CONCURRENCY, ids.length) }, worker));
    setBackfilling(false);
  }

  const loadCandidates = useCallback(async () => {
    try {
      const { data } = await getGmailCandidates();
      setCandidates(data);
      await hydrateDrafts(data);
    } catch {
      // No connection yet, or a transient error - the empty state covers both.
    } finally {
      setLoading(false);
    }
  }, [hydrateDrafts]);

  const refreshConnectionStatus = useCallback(async () => {
    try {
      const status = await getGmailStatus();
      if (status.connected) setConnectedEmail(status.gmail_email);
    } catch {
      // Best-effort background check - ignore transient failures.
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadCandidates();
    refreshConnectionStatus();
  }, [loadCandidates, refreshConnectionStatus]));

  // The browser-bridge (Expo Go) connect flow finishes on the backend, not in the
  // app, so returning-to-foreground is the only signal we get that it may be done -
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
        // Not connected yet (user backed out or hasn't finished) - not an error,
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
      const plain = data.map(({ draft, ...c }) => c);
      setCandidates(plain);
      await hydrateDrafts(plain, data);
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

  async function handleDismiss(messageId: string) {
    await dismissDraft(messageId);
    setDismissed(prev => new Set(prev).add(messageId));
  }

  function openAddCoupon(candidate: GmailCandidate, draft: GmailDraftFields) {
    const category = guessCategory(`${candidate.subject} ${draft.store ?? ''}`);
    router.push({
      pathname: '/(tabs)/add',
      params: {
        fromGmail: '1',
        messageId: candidate.message_id,
        ...(draft.code ? { code: draft.code } : {}),
        ...(draft.store ? { store: draft.store } : {}),
        ...(category ? { category } : {}),
        ...(draft.expiration ? { expiration: draft.expiration } : {}),
        ...(draft.amount != null ? { amount: String(draft.amount) } : {}),
      },
    });
  }

  function handleDraftPress(candidate: GmailCandidate, draft: GmailDraftFields) {
    Alert.alert(
      'Create a coupon?',
      `We found a possible coupon in this email from ${draft.store || candidate.from}. Create a new coupon from it?`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => handleDismiss(candidate.message_id) },
        { text: 'Create coupon', onPress: () => openAddCoupon(candidate, draft) },
      ]
    );
  }

  function formatDate(dateHeader: string) {
    const d = new Date(dateHeader);
    return isNaN(d.getTime()) ? dateHeader : d.toLocaleDateString();
  }

  const visibleCandidates = candidates.filter(c => {
    if (dismissed.has(c.message_id)) return false;
    const draft = drafts[c.message_id];
    if (!draft?.code) return false;
    return !localCodes.has(normalizeCode(draft.code));
  });

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
          data={visibleCandidates}
          keyExtractor={c => c.message_id}
          contentContainerStyle={visibleCandidates.length === 0 ? styles.emptyContainer : styles.list}
          renderItem={({ item }) => {
            const draft = drafts[item.message_id]!;
            const category = guessCategory(`${item.subject} ${draft.store ?? ''}`);
            const icon = (category ? CATEGORY_ICONS[category] : null) ?? 'pricetag-outline';
            const color = category ? CATEGORY_COLORS[category] : '#EDE8DC';
            return (
              <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => handleDraftPress(item, draft)}>
                <View style={styles.rowTop}>
                  <View style={[styles.rowIcon, { backgroundColor: color }]}>
                    <Ionicons name={icon as any} size={20} color="#1A2332" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowStore} numberOfLines={1}>{draft.store || item.from}</Text>
                    <Text style={styles.rowSubject} numberOfLines={1}>{item.subject || '(no subject)'}</Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>New</Text>
                  </View>
                </View>
                <Text style={styles.rowHint}>
                  Received {formatDate(item.date)} - tap to create a coupon from this email.
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📬</Text>
              {candidates.length === 0 ? (
                <>
                  <Text style={styles.emptyText}>No candidates yet</Text>
                  <Text style={styles.emptyHint}>Connect Gmail, then tap "Scan now" to look for coupon emails.</Text>
                </>
              ) : backfilling ? (
                <>
                  <Text style={styles.emptyText}>Reading your emails…</Text>
                  <Text style={styles.emptyHint}>Looking for coupon codes - this only takes a moment.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>No new coupons found</Text>
                  <Text style={styles.emptyHint}>Everything we found is either already in your wallet or didn't look like a coupon.</Text>
                </>
              )}
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
    gap: 8,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowStore: { fontSize: 15, fontWeight: '700', color: '#1A2332' },
  rowSubject: { fontSize: 13, color: '#1A2332', opacity: 0.6, marginTop: 2 },
  rowHint: { fontSize: 12, color: '#1A2332', opacity: 0.45 },
  badge: {
    backgroundColor: '#E8604C',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 44 },
  emptyText: { fontSize: 17, fontWeight: '700', color: '#1A2332' },
  emptyHint: { fontSize: 13, color: '#1A2332', opacity: 0.5, textAlign: 'center' },
});
