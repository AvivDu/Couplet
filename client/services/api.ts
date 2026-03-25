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

api.interceptors.request.use(async config => {
  if (tokenCache === null) {
    tokenCache = await SecureStore.getItemAsync('authToken');
  }
  if (tokenCache) config.headers.Authorization = `Bearer ${tokenCache}`;
  return config;
});

// Auth
const syncUser = (email: string, username: string) =>
  api.post<{ userId: string; username: string; email: string }>('/auth/sync', { email, username });

export async function register(email: string, username: string, password: string) {
  const token = await cognitoSignUp(email, password, username);
  setTokenCache(token);
  await SecureStore.setItemAsync('authToken', token);
  const { data } = await syncUser(email, username);
  return { data: { token, ...data } };
}

export async function login(email: string, password: string) {
  const token = await cognitoSignIn(email, password);
  setTokenCache(token);
  // Persist token and fetch user metadata in parallel — the network call
  // uses the token directly so it doesn't depend on the disk write completing.
  const [, { data }] = await Promise.all([
    SecureStore.setItemAsync('authToken', token),
    api.get<{ userId: string; username: string; email: string }>('/auth/me',
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
  coupons: GroupCoupon[];
}

export const getGroups = () => api.get<GroupMeta[]>('/groups');
export const createGroup = (name: string) => api.post<GroupMeta>('/groups', { name });
export const getGroup = (id: string) => api.get<GroupDetail>(`/groups/${id}`);
export const addMember = (groupId: string, identifier: string) =>
  api.post<GroupMeta>(`/groups/${groupId}/members`, { identifier });
export const removeMember = (groupId: string, userId: string) =>
  api.delete(`/groups/${groupId}/members/${userId}`);
export const shareToGroup = (groupId: string, couponId: string) =>
  api.post<GroupMeta>(`/groups/${groupId}/coupons/${couponId}`);
export const revokeFromGroup = (groupId: string, couponId: string) =>
  api.delete(`/groups/${groupId}/coupons/${couponId}`);
export const searchUsers = (query: string) =>
  api.get<GroupMember[]>(`/users/search?q=${encodeURIComponent(query)}`);
