import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onChanged } from './live';
import { syncNow } from './sync';

/**
 * Keeps this phone and the server in step without anyone thinking about it: syncs on start, when the
 * app comes back to the foreground, every two minutes, and a few seconds after any change. Silent when
 * offline or signed out — changes simply wait in the outbox.
 */
export function SyncManager() {
  const db = useSQLiteContext();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const signedIn = async () => !!(await db.getFirstAsync(`SELECT 1 FROM app_meta WHERE key = 'signed_in'`));
    const run = async () => {
      if (!(await signedIn())) return;
      try {
        await syncNow(db);
      } catch {
        // Offline or a hiccup: try again on the next trigger.
      }
    };
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 4000);
    };
    run();
    const every = setInterval(run, 120_000);
    const app = AppState.addEventListener('change', (s) => s === 'active' && run());
    const off = onChanged(soon);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(every);
      app.remove();
      off();
    };
  }, [db]);
  return null;
}
