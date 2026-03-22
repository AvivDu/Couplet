import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setTokenCache } from '../services/api';

interface AuthUser {
  userId: string;
  email: string;
  username: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync('authToken'),
          SecureStore.getItemAsync('authUser'),
        ]);
        if (storedToken && storedUser) {
          setTokenCache(storedToken);
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as AuthUser);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function signIn(newToken: string, newUser: AuthUser) {
    await Promise.all([
      SecureStore.setItemAsync('authToken', newToken),
      SecureStore.setItemAsync('authUser', JSON.stringify(newUser)),
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

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
