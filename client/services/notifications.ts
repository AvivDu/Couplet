// Deep imports on purpose. The `expo-notifications` package index re-exports
// DevicePushTokenAutoRegistration.fx, which registers a push-token listener at
// module scope; on Android in Expo Go that throws (Android push was removed
// from Expo Go in SDK 53), taking down this module -> NotificationsContext ->
// app/_layout.tsx, so the app never mounts. None of the submodules below reach
// that code path. These are private build/ paths - re-check them on any
// expo-notifications version bump.
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { addNotificationResponseReceivedListener } from 'expo-notifications/build/NotificationsEmitter';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { Platform } from 'react-native';

// Same surface the rest of the app consumed from `import * as Notifications`.
const Notifications = {
  setNotificationHandler,
  scheduleNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  addNotificationResponseReceivedListener,
  AndroidImportance,
};

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
