import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Local (on-device) OS notifications — Tier 2. These work in Expo Go; only
// REMOTE push (app fully closed) needs a dev build (Tier 3). We never call the
// push-token APIs here.

// Show the OS banner + play sound even when the app is in the foreground (we
// only present a local notification when the user is NOT on the active screen,
// so this handler governs the brief grace window + catch-up-on-return).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let configured = false;

// Request permission + set up the Android channel. Idempotent; safe to call on
// every auth change. Returns true if OS notifications are permitted.
export async function configureNotifications(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    configured = granted;
    return granted;
  } catch {
    return false;
  }
}

// Present an immediate OS notification. No-ops silently if permission was denied.
export async function presentLocalNotification(opts: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!configured) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: opts.title, body: opts.body, data: opts.data ?? {}, sound: 'default' },
      trigger: null,
    });
  } catch {
    // ignore — OS notifications are best-effort; the in-app banner still works
  }
}

export { Notifications };
