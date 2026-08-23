import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationsContext';

// Re-runs `refresh` whenever a live event happens while this screen is
// mounted — NotificationsContext bumps `revision` on every incoming
// notification, WebRTC code delivery, and notification dismissal, so a
// screen showing the affected data updates without the user having to tap
// the banner (which today only "works" by mounting a fresh screen instance).
//
// Compares against the previously-seen revision rather than firing on any
// revision > 0: that skips the run on mount, so a screen that already calls
// its own load on mount/focus (the common case) doesn't fetch twice.
//
// `refresh` should fail silently (swallow its own errors) — this fires in
// the background while the user is just sitting on the screen, and the
// banner has already told them what happened, so a transient failure here
// should never surface as an alert.
export function useRefreshOnNotification(refresh: () => void) {
  const { revision } = useNotifications();
  const lastSeenRef = useRef(revision);

  useEffect(() => {
    if (lastSeenRef.current === revision) return;
    lastSeenRef.current = revision;
    refresh();
  }, [revision, refresh]);
}
