import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Set EXPO_PUBLIC_API_URL in your .env file.
// For local dev: http://localhost:3000 (simulator) or http://<your-ip>:3000 (real device)
// For production: your deployed server URL (e.g. https://cuplet.onrender.com)
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(async config => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const register = (email: string, username: string, password: string) =>
  api.post('/auth/register', { email, username, password });

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password });

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
