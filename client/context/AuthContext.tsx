import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getMe, setTokenCache, setUnauthorizedHandler } from '../services/api';
import { saveUserAvatar, getUserAvatar } from '../storage/couponStorage';

interface AuthUser {
  userId: string;
  email: string;
  username: string;
  phone_number?: string;
  profile_image?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser, cachedAvatar] = await Promise.all([
          SecureStore.getItemAsync('authToken'),
          SecureStore.getItemAsync('authUser'),
          getUserAvatar(),
        ]);
        if (storedToken && storedUser) {
          setTokenCache(storedToken);
          setToken(storedToken);
          const parsed = JSON.parse(storedUser) as AuthUser;
          setUser({ ...parsed, profile_image: cachedAvatar ?? null });

          // Background-sync from server so profile changes made on another device
          // (e.g. a new profile photo) are reflected without requiring a re-login.
          getMe().then(({ data }) => {
            if (data.profile_image) saveUserAvatar(data.profile_image);
            setUser(prev => prev ? { ...prev, ...data } : prev);
          }).catch(() => {});
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function signIn(newToken: string, newUser: AuthUser) {
    const { profile_image, ...secureFields } = newUser;
    await Promise.all([
      SecureStore.setItemAsync('authToken', newToken),
      SecureStore.setItemAsync('authUser', JSON.stringify(secureFields)),
      profile_image ? saveUserAvatar(profile_image) : Promise.resolve(),
    ]);
    setToken(newToken);
    setUser(newUser);
  }

  async function signOut() {
    setTokenCache(null);
    await Promise.all([
      SecureStore.deleteItemAsync('authToken'),
      SecureStore.deleteItemAsync('authUser'),
    ]);
    setToken(null);
    setUser(null);
  }

  function updateUser(updates: Partial<AuthUser>) {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
    if (updates.profile_image !== undefined) {
      if (updates.profile_image) saveUserAvatar(updates.profile_image);
    }
    const { profile_image: _pi, ...secureUpdates } = updates;
    if (Object.keys(secureUpdates).length > 0) {
      SecureStore.getItemAsync('authUser').then(raw => {
        if (raw) {
          const parsed = JSON.parse(raw);
          SecureStore.setItemAsync('authUser', JSON.stringify({ ...parsed, ...secureUpdates }));
        }
      });
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
