import { router, type Href } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { onChanged } from '@/db/live';

import { detectEvents } from './events';
import { Notify as Notifications } from './native';
import { planNotifications } from './plan';

const TAG = 'sa-ultimate';

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const notificationsAvailable = !!Notifications;

export async function ensurePermission(ask: boolean) {
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Games and reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !ask) return current.granted;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Replace this app's scheduled notifications with the current plan, and fire anything new from sync. */
export async function refreshNotifications(db: SQLiteDatabase) {
  if (!Notifications || !(await ensurePermission(false))) return;
  const planned = await planNotifications(db);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const want = new Map(planned.map((p) => [p.key, p]));
  // Keep what's still right; cancel what isn't.
  for (const s of scheduled) {
    const data = s.content.data as { app?: string; key?: string };
    if (data?.app !== TAG) continue;
    if (data.key && want.has(data.key)) want.delete(data.key);
    else await Notifications.cancelScheduledNotificationAsync(s.identifier);
  }
  for (const p of want.values()) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, data: { app: TAG, key: p.key, url: p.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: 'default' },
    });
  }
  for (const n of await detectEvents(db)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, data: { app: TAG, key: n.key, url: n.url } },
      trigger: null,
    });
  }
}

/** Keeps notifications in step with the data, and opens the right screen when one is tapped. */
export function NotificationManager() {
  const db = useSQLiteContext();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => refreshNotifications(db).catch(() => {});
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 5000);
    };
    run();
    const off = onChanged(soon);
    const tap = Notifications?.addNotificationResponseReceivedListener((res) => {
      const url = (res.notification.request.content.data as { url?: string })?.url;
      if (url) router.push(url as Href);
    });
    return () => {
      if (timer) clearTimeout(timer);
      off();
      tap?.remove();
    };
  }, [db]);
  return null;
}
