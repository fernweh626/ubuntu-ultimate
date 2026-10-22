import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Every write bumps this version; mounted queries re-run so all screens stay in step.
let version = 0;
const listeners = new Set<() => void>();

export function notifyChanged() {
  version += 1;
  listeners.forEach((l) => l());
}

/**
 * Load data from the local database and keep it fresh: re-runs when the screen gains focus and
 * after any write anywhere in the app.
 */
export function useData<T>(load: (db: SQLiteDatabase) => Promise<T>, deps: unknown[] = []) {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | undefined>(undefined);
  const [tick, setTick] = useState(version);
  const loadRef = useRef(load);

  useLayoutEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const l = () => setTick(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const depsKey = JSON.stringify(deps);
  const run = useCallback(() => {
    let cancelled = false;
    loadRef.current(db).then((v) => {
      if (!cancelled) setData(v);
    });
    return () => {
      cancelled = true;
    };
    // depsKey and tick are triggers: a change means "load again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, tick, depsKey]);

  useFocusEffect(run);

  return data;
}
