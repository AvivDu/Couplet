import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './AuthContext';
import { buildNotificationsSocketUrl, deleteNotification } from '../services/api';
import { saveCouponCode } from '../storage/couponStorage';
import NotificationBanner, { type BannerData } from '../components/NotificationBanner';

interface NotificationsContextType {
  // Bumped on every live event so screens can re-run their own load() to refresh.
  revision: number;
  // Ephemeral coupon-code relay (Stage 1 toward P2P): sends the code device→device
  // over the WebSocket. No-op if the socket isn't connected (HTTP bandage covers it).
  sendCouponTransfer: (toUserIds: string[], couponId: string, code: string) => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

const PING_INTERVAL_MS = 5 * 60 * 1000; // keep the connection under API GW's 10-min idle timeout
const MAX_BACKOFF_MS = 30 * 1000;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [banner, setBanner] = useState<BannerData | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  // Where to navigate when a given notification banner is tapped + the server id to delete.
  const bannerNavRef = useRef<Record<string, { groupId?: string; serverId?: string }>>({});

  const bump = useCallback(() => setRevision(r => r + 1), []);

  const clearTimers = useCallback(() => {
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
  }, []);

  const handleMessage = useCallback(async (raw: string) => {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.event === 'notification' && msg.notification) {
      const n = msg.notification;
      const bannerId = `notif-${n.notification_id}`;
      bannerNavRef.current[bannerId] = { groupId: n.group_id, serverId: n.notification_id };
      setBanner({ id: bannerId, title: n.title, body: n.body, icon: 'notifications' });
      bump();
      return;
    }

    if (msg.event === 'coupon_transfer' && msg.coupon_id && msg.code) {
      // Ephemeral P2P-style delivery: persist the code to local storage only.
      await saveCouponCode(msg.coupon_id, msg.code);
      const bannerId = `transfer-${msg.coupon_id}-${Date.now()}`;
      bannerNavRef.current[bannerId] = {};
      setBanner({ id: bannerId, title: 'Coupon received', body: 'A shared coupon was added to your wallet.', icon: 'gift' });
      bump();
      return;
    }
  }, [bump]);

  const connect = useCallback(() => {
    if (!token) return;
    const url = buildNotificationsSocketUrl(token);
    if (!url) return; // WS not configured — fall back to poll-on-focus
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    intentionalCloseRef.current = false;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'ping' }));
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (e) => { handleMessage(typeof e.data === 'string' ? e.data : ''); };

    ws.onclose = () => {
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      if (intentionalCloseRef.current || !token) return;
      // Exponential backoff reconnect while the app is foreground + authenticated.
      const delay = Math.min(1000 * 2 ** attemptsRef.current, MAX_BACKOFF_MS);
      attemptsRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => { try { ws.close(); } catch {} };
  }, [token, handleMessage]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearTimers();
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
  }, [clearTimers]);

  // Open/close the socket with the auth lifecycle.
  useEffect(() => {
    if (token) connect();
    else disconnect();
    return () => disconnect();
  }, [token, connect, disconnect]);

  // Reconnect when returning to the foreground; drop the socket in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') { attemptsRef.current = 0; connect(); }
      else if (state === 'background') disconnect();
    });
    return () => sub.remove();
  }, [connect, disconnect]);

  const sendCouponTransfer = useCallback((toUserIds: string[], couponId: string, code: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!toUserIds.length || !code) return;
    ws.send(JSON.stringify({ action: 'coupon_transfer', toUserIds, coupon_id: couponId, code }));
  }, []);

  const handleBannerPress = useCallback((data: BannerData) => {
    const nav = bannerNavRef.current[data.id];
    setBanner(null);
    if (!nav) return;
    if (nav.serverId) deleteNotification(nav.serverId).catch(() => {});
    if (nav.groupId) router.push(`/group/${nav.groupId}`);
    if (nav.serverId) bump(); // refresh lists so the dismissed notification disappears
  }, [router, bump]);

  return (
    <NotificationsContext.Provider value={{ revision, sendCouponTransfer }}>
      {children}
      <NotificationBanner data={banner} onPress={handleBannerPress} onDismiss={() => setBanner(null)} />
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
