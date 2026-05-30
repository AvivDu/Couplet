import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { cognitoSignUp, cognitoSignIn } from './cognito';

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

const api = axios.create({ baseURL: BASE_URL });

// In-memory token cache — avoids a SecureStore disk read on every API call.
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
type AuthUserData = { userId: string; username: string; email: string; phone_number?: string };

const syncUser = (email: string, username: string, phone_number: string) =>
  api.post<AuthUserData>('/auth/sync', { email, username, phone_number });

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

export async function register(email: string, username: string, password: string, phone: string) {
  // Phone uniqueness isn't enforced by Cognito (it's our own field), so check
  // before creating the Cognito user to avoid an orphaned account.
  const existingEmail = await resolvePhone(phone);
  if (existingEmail) {
    throw new Error('That phone number is already in use.');
  }
  const token = await cognitoSignUp(email, password, username);
  setTokenCache(token);
  await SecureStore.setItemAsync('authToken', token);
  const { data } = await syncUser(email, username, phone);
  return { data: { token, ...data } };
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

  const token = await cognitoSignIn(email, password);
  setTokenCache(token);
  // Persist token and fetch user metadata in parallel — the network call
  // uses the token directly so it doesn't depend on the disk write completing.
  const [, { data }] = await Promise.all([
    SecureStore.setItemAsync('authToken', token),
    api.get<AuthUserData>('/auth/me',
      { headers: { Authorization: `Bearer ${token}` } }
    ),
  ]);
  return { data: { token, ...data } };
}

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
}

export const getCoupons = () => api.get<CouponMeta[]>('/coupons');

export const createCoupon = (data: {
  category: string;
  store_name: string;
  expiration_date?: string;
  balance?: number;
}) => api.post<CouponMeta>('/coupons', data);

export const updateCoupon = (id: string, data: Partial<CouponMeta>) =>
  api.patch<CouponMeta>(`/coupons/${id}`, data);

export const deleteCoupon = (id: string) => api.delete(`/coupons/${id}`);

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
}

export interface GroupMember {
  user_id: string;
  username: string;
  email: string;
  phone_number?: string;
}

export interface GroupCoupon {
  coupon_id: string;
  owner_id: string;
  category: string;
  store_name: string;
  expiration_date: string | null;
  balance: number | null;
  status: string;
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
export const shareToGroup = (groupId: string, couponId: string, code?: string | null) =>
  api.post<GroupMeta>(`/groups/${groupId}/coupons/${couponId}`, code ? { coupon_code: code } : {});
export const revokeFromGroup = (groupId: string, couponId: string) =>
  api.delete(`/groups/${groupId}/coupons/${couponId}`);
export const leaveGroup = (groupId: string) =>
  api.delete(`/groups/${groupId}/members/me`);
export const renameGroup = (groupId: string, name: string) =>
  api.put<GroupMeta>(`/groups/${groupId}/name`, { name });
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

export async function resolvePhone(phone: string): Promise<string | null> {
  try {
    const { data } = await api.get<{ email: string }>(`/auth/resolve?phone=${encodeURIComponent(phone)}`);
    return data.email;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function updateProfile(updates: { username?: string; phone_number?: string }) {
  const { data } = await api.patch<AuthUserData>('/auth/me', updates);
  return data;
}

export const getInvitations = () => api.get<GroupInvitation[]>('/invitations');
export const acceptInvitation = (groupId: string) =>
  api.post(`/groups/${groupId}/members/accept`);
export const declineInvitation = (groupId: string) =>
  api.delete(`/groups/${groupId}/invitations/me`);
export const cancelInvitation = (groupId: string, userId: string) =>
  api.delete(`/groups/${groupId}/pending/${userId}`);
