import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Update this to your machine's local IP when testing on a real device
// e.g. "http://192.168.1.x:3000" — for simulator "http://localhost:3000" works
export const BASE_URL = 'http://localhost:3000';

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
