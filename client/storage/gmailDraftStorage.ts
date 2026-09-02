import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCoupons } from '../services/api';
import { getCouponCode } from './couponStorage';
import type { GmailDraftFields } from '../services/gmail';

// Local cache of extracted draft fields, keyed by Gmail message_id. Never synced to
// the server - the server only ever returns these transiently (see services/gmail.ts).
const DRAFT_PREFIX = 'gmail_draft_';
const DISMISSED_PREFIX = 'gmail_dismissed_';

export async function saveDraftFields(messageId: string, fields: GmailDraftFields): Promise<void> {
  await AsyncStorage.setItem(`${DRAFT_PREFIX}${messageId}`, JSON.stringify(fields));
}

export async function getDraftFields(messageId: string): Promise<GmailDraftFields | null> {
  const raw = await AsyncStorage.getItem(`${DRAFT_PREFIX}${messageId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function dismissDraft(messageId: string): Promise<void> {
  await AsyncStorage.setItem(`${DISMISSED_PREFIX}${messageId}`, '1');
}

export async function isDraftDismissed(messageId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(`${DISMISSED_PREFIX}${messageId}`)) === '1';
}

// Batch reads for rendering a whole candidate list without N sequential AsyncStorage round-trips.
export async function getCachedDrafts(messageIds: string[]): Promise<Map<string, GmailDraftFields>> {
  if (messageIds.length === 0) return new Map();
  const entries = await AsyncStorage.multiGet(messageIds.map(id => `${DRAFT_PREFIX}${id}`));
  const map = new Map<string, GmailDraftFields>();
  for (const [key, value] of entries) {
    if (value) map.set(key.slice(DRAFT_PREFIX.length), JSON.parse(value));
  }
  return map;
}

export async function getDismissedIds(messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const entries = await AsyncStorage.multiGet(messageIds.map(id => `${DISMISSED_PREFIX}${id}`));
  return new Set(
    entries.filter(([, value]) => value === '1').map(([key]) => key.slice(DISMISSED_PREFIX.length))
  );
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

// Codes already saved on this device, normalized for comparison against extracted
// draft codes - a coupon's code never syncs to the server, so this can only be a
// client-side check (see storage/couponStorage.ts).
export async function getLocalCouponCodes(): Promise<Set<string>> {
  const { data: coupons } = await getCoupons();
  const codes = await Promise.all(coupons.map(c => getCouponCode(c.coupon_id)));
  return new Set(codes.filter((c): c is string => !!c).map(normalizeCode));
}

export { normalizeCode };
