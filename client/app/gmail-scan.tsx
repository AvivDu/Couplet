import { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
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
import GmailEmailPreview from '../components/GmailEmailPreview';
import AuroraBackground from '../components/ui/AuroraBackground';
import ScreenHeader from '../components/ui/ScreenHeader';
import GlassPanel from '../components/ui/GlassPanel';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { colors, radius, spacing, fontFamily, fontSize } from '../constants/theme';

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
  const [previewCandidate, setPreviewCandidate] = useState<{ candidate: GmailCandidate; draft: GmailDraftFields } | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

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

  // Once a candidate is cached, hydrateDrafts never re-hits the server for it -
  // that's normally right (avoid re-extracting on every load), but it also means a
  // "no code found" result is stuck forever even after a server-side extraction fix
  // ships, unless the user gets a way to explicitly ask for another look.
  async function handleRetryExtraction(messageId: string) {
    setRetrying(prev => new Set(prev).add(messageId));
    try {
      const { data } = await extractGmailCandidate(messageId);
      await saveDraftFields(messageId, data);
      setDrafts(prev => ({ ...prev, [messageId]: data }));
    } catch {
      Alert.alert('Could not re-check this email', 'Please try again in a moment.');
    } finally {
      setRetrying(prev => { const next = new Set(prev); next.delete(messageId); return next; });
    }
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
        ...(draft.giftUrl ? { giftUrl: draft.giftUrl } : {}),
      },
    });
  }

  // Opens the email preview instead of a blind confirm alert - lets the user read
  // the actual email and judge for themselves before creating a coupon from it.
  // Closing the preview without creating leaves the candidate as-is (not dismissed);
  // permanently hiding it is the row's separate, explicit delete button.
  function handleDraftPress(candidate: GmailCandidate, draft: GmailDraftFields) {
    setPreviewCandidate({ candidate, draft });
  }

  function handleDeleteCandidate(candidate: GmailCandidate) {
    Alert.alert(
      'Remove this candidate?',
      'This email won\'t be suggested as a coupon again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => handleDismiss(candidate.message_id) },
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
    // Not yet extracted (still backfilling) - stays hidden until resolved either way.
    if (!draft) return false;
    // Resolved but no code found - still worth surfacing as a manual-entry candidate,
    // rather than silently dropping it (indistinguishable from "nothing found").
    if (!draft.code) return true;
    return !localCodes.has(normalizeCode(draft.code));
  });

  const emptyHint = candidates.length === 0
    ? 'Connect Gmail, then tap "Scan now" to look for coupon emails.'
    : backfilling
      ? 'Looking for coupon codes - this only takes a moment.'
      : "Everything we found is either already in your wallet or didn't look like a coupon.";
  const emptyTitle = candidates.length === 0
    ? 'No candidates yet'
    : backfilling
      ? 'Reading your emails…'
      : 'No new coupons found';

  return (
    <AuroraBackground>
      <ScreenHeader back onBack={() => router.back()} title="Gmail Scanner" />

      <View style={styles.actions}>
        <Button
          variant="primary"
          block
          onPress={handleConnect}
          disabled={connecting}
          icon={connecting ? undefined : <Ionicons name="mail-outline" size={18} color="#fff" />}
        >
          {connecting ? <ActivityIndicator color="#fff" /> : (connectedEmail ? `Connected: ${connectedEmail}` : 'Connect Gmail')}
        </Button>
        <Button
          variant="outline"
          block
          onPress={handleScan}
          disabled={scanning}
          icon={scanning ? undefined : <Ionicons name="search-outline" size={16} color={colors.coral500} />}
        >
          {scanning ? <ActivityIndicator color={colors.coral500} /> : 'Scan now'}
        </Button>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.coral400} />
      ) : (
        <FlatList
          data={visibleCandidates}
          keyExtractor={c => c.message_id}
          contentContainerStyle={visibleCandidates.length === 0 ? styles.emptyContainer : styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.s5 }} />}
          renderItem={({ item }) => {
            const draft = drafts[item.message_id]!;
            const hasCode = !!draft.code;
            const hasGiftUrl = !hasCode && !!draft.giftUrl;
            const isGuess = hasCode && draft.codeConfidence === 'guess';
            const isRetrying = retrying.has(item.message_id);
            const category = guessCategory(`${item.subject} ${draft.store ?? ''}`);
            const icon = (category ? CATEGORY_ICONS[category] : null) ?? 'pricetag-outline';
            const color = category ? CATEGORY_COLORS[category] : '#EDE8DC';
            return (
              <TouchableOpacity activeOpacity={0.85} onPress={() => handleDraftPress(item, draft)}>
                <GlassPanel tint="regular" radius={radius.l} padding={spacing.s7} sheen={false}>
                  <View style={styles.rowTop}>
                    <View style={[styles.rowIcon, { backgroundColor: color }]}>
                      <Ionicons name={icon as any} size={20} color={colors.textStrong} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowStore} numberOfLines={1}>{draft.store || item.from}</Text>
                      <Text style={styles.rowSubject} numberOfLines={1}>{item.subject || '(no subject)'}</Text>
                    </View>
                    <Badge tone={hasCode ? (isGuess ? 'glass' : 'brand') : hasGiftUrl ? 'brand' : 'glass'} uppercase>
                      {hasCode ? (isGuess ? 'Check code' : 'New') : hasGiftUrl ? 'Gift link' : 'No code found'}
                    </Badge>
                    {!hasCode && !hasGiftUrl && (
                      <TouchableOpacity
                        onPress={() => handleRetryExtraction(item.message_id)}
                        disabled={isRetrying}
                        hitSlop={8}
                      >
                        {isRetrying
                          ? <ActivityIndicator size="small" color={colors.textMuted} />
                          : <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />}
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleDeleteCandidate(item)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.rowHint}>
                    {hasCode
                      ? isGuess
                        ? `Received ${formatDate(item.date)} - we're not fully sure about this code, tap to check it against the email.`
                        : `Received ${formatDate(item.date)} - tap to create a coupon from this email.`
                      : hasGiftUrl
                        ? `Received ${formatDate(item.date)} - this looks like a digital gift card link, tap to create a coupon from it.`
                        : "We found an email that looks like a coupon but couldn't detect the code - tap to fill it in manually."}
                  </Text>
                </GlassPanel>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<EmptyState icon="mail-open-outline" title={emptyTitle} hint={emptyHint} />}
        />
      )}

      <GmailEmailPreview
        visible={!!previewCandidate}
        candidate={previewCandidate?.candidate ?? null}
        draft={previewCandidate?.draft ?? null}
        onClose={() => setPreviewCandidate(null)}
        onCreateCoupon={() => {
          if (!previewCandidate) return;
          openAddCoupon(previewCandidate.candidate, previewCandidate.draft);
          setPreviewCandidate(null);
        }}
      />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  actions: { paddingHorizontal: spacing.gutterScreen, gap: spacing.s6, marginBottom: spacing.s5, marginTop: spacing.s5 },
  list: { paddingHorizontal: spacing.gutterScreen, paddingBottom: 40 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.s6 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowStore: { fontFamily: fontFamily.uiBold, fontSize: fontSize.body, color: colors.textStrong },
  rowSubject: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  rowHint: { fontFamily: fontFamily.ui, fontSize: fontSize.micro, color: colors.textMuted, marginTop: spacing.s5 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
