import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  cognitoSignUp,
  cognitoSignIn,
  cognitoConfirmSignUp,
  cognitoResendConfirmationCode,
  cognitoForgotPassword,
  cognitoConfirmPassword,
} from './cognito';

function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).manifest?.debuggerHost ??
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;

  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : null;

  if (host) {
    return `http://${host}:3000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }

  return 'http://localhost:3000';
}

export const BASE_URL = resolveBaseUrl();

// WebSocket API base (wss://<id>.execute-api.<region>.amazonaws.com/<stage>).
// Lives on AWS, so there is no local-dev fallback - set EXPO_PUBLIC_WS_URL to
// enable live notifications + coupon relay. When unset the socket simply never
// connects and the app falls back to poll-on-focus, so nothing breaks in dev.
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? null;

export function buildNotificationsSocketUrl(token: string): string | null {
  if (!WS_URL) return null;
  const sep = WS_URL.includes('?') ? '&' : '?';
  return `${WS_URL}${sep}token=${encodeURIComponent(token)}`;
}

export const api = axios.create({ baseURL: BASE_URL });

// In-memory token cache - avoids a SecureStore disk read on every API call.
// Populated on first interceptor miss, explicitly set on login/register, cleared on signOut.
let tokenCache: string | null = null;
export function setTokenCache(token: string | null) { tokenCache = token; }

// Registered by AuthContext so the interceptor can trigger signOut on 401.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

api.interceptors.request.use(async config => {
  if (tokenCache === null) {
    tokenCache = await SecureStore.getItemAsync('authToken');
  }
  if (tokenCache) config.headers.Authorization = `Bearer ${tokenCache}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    return Promise.reject(error);
  }
);

// Auth
type AuthUserData = { userId: string; username: string; email: string; phone_number?: string; profile_image?: string | null };

const syncUser = (email: string, username: string, phone_number: string) =>
  api.post<AuthUserData>('/auth/sync', { email, username, phone_number });

// Creates the user metadata record after a Cognito signup is confirmed.
// Exported as its own step so the login-time confirmation-recovery flow can
// retry it independently of confirming the signup code.
export async function finishSync(email: string, username: string, phone_number: string) {
  const { data } = await syncUser(email, username, phone_number);
  return data;
}

// Resolves a phone number to its account email via the public endpoint.
// Returns null if no account owns that phone (404).
export async function resolvePhone(phone: string): Promise<string | null> {
  try {
    const { data } = await api.get<{ email: string }>(
      `/auth/resolve?phone=${encodeURIComponent(phone)}`
    );
    return data.email;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

// Creates the Cognito account only. The account is left UNCONFIRMED - the
// caller must confirm the emailed code (confirmAndSignIn) before the user
// can sign in or be synced to our DB.
export async function register(email: string, username: string, password: string, phone: string) {
  // Phone uniqueness isn't enforced by Cognito (it's our own field), so check
  // before creating the Cognito user to avoid an orphaned account.
  const existingEmail = await resolvePhone(phone);
  if (existingEmail) {
    throw new Error('That phone number is already in use.');
  }
  await cognitoSignUp(email, password, username);
}

export async function resendConfirmationCode(email: string): Promise<void> {
  await cognitoResendConfirmationCode(email);
}

// Confirms a Cognito signup code and signs the now-confirmed user in.
// Does not touch our DB - call finishSync separately to create/fetch the
// user metadata record.
export async function confirmAndSignIn(email: string, code: string, password: string) {
  await cognitoConfirmSignUp(email, code);
  const { token, username } = await cognitoSignIn(email, password);
  setTokenCache(token);
  await SecureStore.setItemAsync('authToken', token);
  return { token, username };
}

export async function login(identifier: string, password: string) {
  // Cognito's username is the email. If the user typed a phone number, resolve
  // it to the owning email first, then sign in with that.
  let email = identifier;
  if (!identifier.includes('@')) {
    const resolved = await resolvePhone(identifier);
    if (!resolved) {
      throw new Error('No account found for that phone number.');
    }
    email = resolved;
  }

  const { token } = await cognitoSignIn(email, password);
  setTokenCache(token);
  // Persist token and fetch user metadata in parallel - the network call
  // uses the token directly so it doesn't depend on the disk write completing.
  const [, { data }] = await Promise.all([
    SecureStore.setItemAsync('authToken', token),
    api.get<AuthUserData>('/auth/me',
      { headers: { Authorization: `Bearer ${token}` } }
    ),
  ]);
  return { data: { token, ...data } };
}

export async function requestPasswordReset(email: string): Promise<void> {
  await cognitoForgotPassword(email);
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  await cognitoConfirmPassword(email, code, newPassword);
}

export const getMe = () => api.get<AuthUserData>('/auth/me');

// Coupons (metadata only)
export interface CouponMeta {
  coupon_id: string;
  owner_id: string;
  category: string;
  store_name: string;
  expiration_date: string | null;
  balance: number | null;
  status: string;
  created_at: string;
  redeemable_stores?: string[];
  giftcard_url?: string | null;
}

export const getCoupons = () => api.get<CouponMeta[]>('/coupons');

export const createCoupon = (data: {
  category: string;
  store_name: string;
  expiration_date?: string;
  balance?: number;
  giftcard_url?: string;
}) => api.post<CouponMeta>('/coupons', data);

export const updateCoupon = (id: string, data: Partial<CouponMeta>) =>
  api.patch<CouponMeta>(`/coupons/${id}`, data);

export const deleteCoupon = (id: string) => api.delete(`/coupons/${id}`);

// Redemption sends the *amount* (or redeem_all), never a client-computed
// absolute balance - the server applies it atomically so two members
// redeeming the same shared coupon at once can't overdraw it.
export type RedeemAction = { redeem_all: true } | { amount: number };

export const redeemOwnCoupon = (couponId: string, action: RedeemAction) =>
  api.post<CouponMeta>(`/coupons/${couponId}/redeem`, action);

// Any group member (not just the owner) can redeem a coupon shared to a group.
export const redeemGroupCoupon = (groupId: string, couponId: string, action: RedeemAction) =>
  api.post<CouponMeta>(`/groups/${groupId}/coupons/${couponId}/redeem`, action);

export interface StoreLocation {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  openNow: boolean | null;
  rating: number | null;
  distanceKm: number | null;
}

export const getCouponLocations = (couponId: string, lat: number, lng: number) =>
  api.get<StoreLocation[]>(`/coupons/${couponId}/locations?lat=${lat}&lng=${lng}`);

// Groups
export interface GroupMeta {
  group_id: string;
  name: string;
  admin_user_id: string;
  user_id_list: string[];
  coupon_id_list: string[];
  created_at: string;
  image?: string | null; // small base64 data-URL avatar, shared with all members
}

export interface GroupMember {
  user_id: string;
  username: string;
  email: string;
  phone_number?: string;
  image?: string | null;
}

export interface GroupCoupon {
  coupon_id: string;
  owner_id: string;
  category: string;
  store_name: string;
  expiration_date: string | null;
  balance: number | null;
  status: string;
  giftcard_url?: string | null;
}

export interface GroupDetail extends GroupMeta {
  members: GroupMember[];
  pending_members: GroupMember[];
  coupons: GroupCoupon[];
}

export interface GroupInvitation {
  group_id: string;
  name: string;
  admin_user_id: string;
}

export const getGroups = () => api.get<GroupMeta[]>('/groups');
export const createGroup = (name: string) => api.post<GroupMeta>('/groups', { name });
export const getGroup = (id: string) => api.get<GroupDetail>(`/groups/${id}`);
export const addMember = (groupId: string, identifier: string) =>
  api.post<GroupMeta>(`/groups/${groupId}/members`, { identifier });
export const removeMember = (groupId: string, userId: string) =>
  api.delete(`/groups/${groupId}/members/${userId}`);
export interface ShareResult extends GroupMeta {
  // Recipients who were connected at share time - the sharer's client should
  // negotiate a WebRTC data channel with each of these to deliver the code
  // directly; offline recipients get it via the DB fallback instead.
  online_recipient_ids: string[];
}

// codeUpdated: this is a redelivery of an edited code to a group the coupon
// is already shared with, not a first share - see the server route for what
// that changes (silent, no "New coupon" notification).
export const shareToGroup = (groupId: string, couponId: string, code?: string | null, codeUpdated?: boolean) =>
  api.post<ShareResult>(`/groups/${groupId}/coupons/${couponId}`, {
    ...(code ? { coupon_code: code } : {}),
    ...(codeUpdated ? { code_updated: true } : {}),
  });

// Which groups a coupon is currently shared to - used to know where to
// redeliver an edited code, since the code itself never touches the server
// and so the server can't detect the edit on its own.
export const getCouponGroups = (couponId: string) =>
  api.get<{ group_id: string; name: string }[]>(`/coupons/${couponId}/groups`);

// Sharer-triggered fallback when a WebRTC P2P negotiation to an online
// recipient failed - persists the code (encrypted, TTL'd) server-side, same
// mechanism as the offline fallback.
export const rescueCode = (groupId: string, couponId: string, recipientUserId: string, code: string) =>
  api.post(`/groups/${groupId}/coupons/${couponId}/rescue-code`, {
    recipient_user_id: recipientUserId,
    coupon_code: code,
  });
export const revokeFromGroup = (groupId: string, couponId: string) =>
  api.delete(`/groups/${groupId}/coupons/${couponId}`);
export const leaveGroup = (groupId: string) =>
  api.delete(`/groups/${groupId}/members/me`);
export const renameGroup = (groupId: string, name: string) =>
  api.put<GroupMeta>(`/groups/${groupId}/name`, { name });
export const setGroupPhoto = (groupId: string, image: string) =>
  api.put<GroupMeta>(`/groups/${groupId}/photo`, { image });
export const deleteGroup = (groupId: string) =>
  api.delete(`/groups/${groupId}`);
export const searchUsers = (query: string) =>
  api.get<GroupMember[]>(`/users/search?q=${encodeURIComponent(query)}`);

export interface ContactMatch {
  user_id: string;
  username: string;
  email: string;
  phone_number: string;
}

export async function matchContacts(phones: string[]): Promise<ContactMatch[]> {
  const { data } = await api.post<ContactMatch[]>('/users/match-contacts', { phones });
  return data;
}

export interface ServerNotification {
  user_id: string;
  notification_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  group_id?: string;
  group_name?: string;
  coupon_id?: string;
  coupon_code?: string;
}

export const getNotifications = () => api.get<ServerNotification[]>('/notifications');
export const markNotificationsRead = () => api.patch('/notifications/read-all');
export const deleteNotification = (notificationId: string) => api.delete(`/notifications/${notificationId}`);
// Clears a consumed fallback code (offline delivery or P2P rescue) once saved locally.
export const clearNotificationCode = (notificationId: string) => api.delete(`/notifications/${notificationId}/code`);

export async function updateProfile(updates: { username?: string; phone_number?: string }) {
  const { data } = await api.patch<AuthUserData>('/auth/me', updates);
  return data;
}

export async function uploadProfileImage(dataUrl: string) {
  const { data } = await api.put<AuthUserData>('/auth/me/photo', { image: dataUrl });
  return data;
}

export const getInvitations = () => api.get<GroupInvitation[]>('/invitations');
export const acceptInvitation = (groupId: string) =>
  api.post(`/groups/${groupId}/members/accept`);
export const declineInvitation = (groupId: string) =>
  api.delete(`/groups/${groupId}/invitations/me`);
export const cancelInvitation = (groupId: string, userId: string) =>
  api.delete(`/groups/${groupId}/pending/${userId}`);
