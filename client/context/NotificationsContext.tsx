import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './AuthContext';
import { buildNotificationsSocketUrl, deleteNotification, getNotifications } from '../services/api';
import { saveCouponCode } from '../storage/couponStorage';
import { configureNotifications, presentLocalNotification, Notifications } from '../services/notifications';
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
const CATCHUP_OS_CAP = 3; // at most this many individual OS notifications on catch-up; rest summarized

// Minimal shape the dispatch pipeline needs from a server notification.
type DispatchNotif = { notification_id: string; title: string; body: string; group_id?: string };

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
  // Where to navigate when a given in-app banner is tapped + the server id to delete.
  const bannerNavRef = useRef<Record<string, { groupId?: string; serverId?: string }>>({});
  // De-dup across the live socket and the catch-up poll; baseline avoids OS-spam on cold start.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const baselineSetRef = useRef(false);

  const bump = useCallback(() => setRevision(r => r + 1), []);

  const clearTimers = useCallback(() => {
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
  }, []);

  // Shared "dismiss + navigate" used by both the in-app banner tap and the OS notification tap.
  const dismissAndNavigate = useCallback((serverId?: string, groupId?: string) => {
    if (serverId) { deleteNotification(serverId).catch(() => {}); }
    if (groupId) router.push(`/group/${groupId}`);
    if (serverId) bump(); // refresh lists so the dismissed notification disappears
  }, [router, bump]);

  // Single entry point for surfacing a server notification. Routes to the in-app
  // banner when the app is on-screen, or a real OS notification otherwise (or when
  // forced, e.g. catch-up of items missed while away). De-duped by notification id.
  const dispatchServerNotification = useCallback((n: DispatchNotif, opts: { forceOS: boolean }) => {
    if (seenIdsRef.current.has(n.notification_id)) return;
    seenIdsRef.current.add(n.notification_id);

    const useOS = opts.forceOS || AppState.currentState !== 'active';
    if (useOS) {
      presentLocalNotification({
        title: n.title,
        body: n.body,
        data: { serverId: n.notification_id, groupId: n.group_id },
      });
    } else {
      const bannerId = `notif-${n.notification_id}`;
      bannerNavRef.current[bannerId] = { groupId: n.group_id, serverId: n.notification_id };
      setBanner({ id: bannerId, title: n.title, body: n.body, icon: 'notifications' });
    }
    bump();
  }, [bump]);

  const handleMessage = useCallback(async (raw: string) => {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.event === 'notification' && msg.notification) {
      dispatchServerNotification(msg.notification, { forceOS: false });
      return;
    }

    if (msg.event === 'coupon_transfer' && msg.coupon_id && msg.code) {
      // Ephemeral P2P-style delivery: persist the code to local storage only.
      await saveCouponCode(msg.coupon_id, msg.code);
      if (AppState.currentState === 'active') {
        const bannerId = `transfer-${msg.coupon_id}-${Date.now()}`;
        bannerNavRef.current[bannerId] = {};
        setBanner({ id: bannerId, title: 'Coupon received', body: 'A shared coupon was added to your wallet.', icon: 'gift' });
      } else {
        presentLocalNotification({ title: 'Coupon received', body: 'A shared coupon was added to your wallet.' });
      }
      bump();
      return;
    }
  }, [dispatchServerNotification, bump]);

  // Poll the server for anything missed while the socket was down/suspended.
  // First run establishes a baseline (no OS notifications); later runs fire OS
  // notifications for genuinely new items, capped + summarized.
  const catchUp = useCallback(async () => {
    let items: DispatchNotif[];
    try {
      const { data } = await getNotifications();
      items = data; // already newest-first from the server
    } catch {
      return;
    }

    if (!baselineSetRef.current) {
      items.forEach(n => seenIdsRef.current.add(n.notification_id));
      baselineSetRef.current = true;
      bump();
      return;
    }

    const missed = items.filter(n => !seenIdsRef.current.has(n.notification_id));
    if (missed.length === 0) return;

    missed.slice(0, CATCHUP_OS_CAP).forEach(n => dispatchServerNotification(n, { forceOS: true }));
    if (missed.length > CATCHUP_OS_CAP) {
      const extra = missed.length - CATCHUP_OS_CAP;
      missed.slice(CATCHUP_OS_CAP).forEach(n => seenIdsRef.current.add(n.notification_id));
      presentLocalNotification({ title: 'Couplet', body: `+${extra} more update${extra > 1 ? 's' : ''} in your groups` });
    }
    bump();
  }, [dispatchServerNotification, bump]);

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
      catchUp(); // sync anything that happened while the socket was down
    };

    ws.onmessage = (e) => { handleMessage(typeof e.data === 'string' ? e.data : ''); };

    ws.onclose = () => {
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      if (intentionalCloseRef.current || !token) return;
      // Exponential backoff reconnect (timers are suspended in background, so this
      // effectively fires on the next resume).
      const delay = Math.min(1000 * 2 ** attemptsRef.current, MAX_BACKOFF_MS);
      attemptsRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => { try { ws.close(); } catch {} };
  }, [token, handleMessage, catchUp]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearTimers();
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
  }, [clearTimers]);

  // Ask for OS-notification permission + set up the Android channel once authed.
  useEffect(() => {
    if (token) configureNotifications();
  }, [token]);

  // Open/close the socket with the auth lifecycle. Reset baseline on sign-out so a
  // new session re-baselines instead of replaying a stale seen-set.
  useEffect(() => {
    if (token) {
      connect();
    } else {
      disconnect();
      seenIdsRef.current = new Set();
      baselineSetRef.current = false;
    }
    return () => disconnect();
  }, [token, connect, disconnect]);

  // On return to the foreground: reconnect (if dropped) and catch up. We do NOT
  // force-close on background — the socket is left to survive the brief grace
  // window so a just-in-time event can still fire an OS notification; the OS
  // suspends JS shortly after anyway, and 410s are pruned server-side.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') { attemptsRef.current = 0; connect(); catchUp(); }
    });
    return () => sub.remove();
  }, [connect, catchUp]);

  // Tapping an OS notification: dismiss it + deep-link to its group.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as { serverId?: string; groupId?: string };
      dismissAndNavigate(data?.serverId, data?.groupId);
    });
    return () => sub.remove();
  }, [dismissAndNavigate]);

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
    dismissAndNavigate(nav.serverId, nav.groupId);
  }, [dismissAndNavigate]);

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
