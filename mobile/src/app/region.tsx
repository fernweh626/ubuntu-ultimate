import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useData } from '@/db/live';
import { getHomeRegion, setHomeRegion } from '@/db/repo';
import { Screen, T } from '@/ui/components';
import { RegionMap } from '@/ui/region-map';

/** Pick your region on the map. Calendar, pickups, teams, links and news open on it. */
export default function Region() {
  const db = useSQLiteContext();
  const home = useData(getHomeRegion);
  return (
    <>
      <Stack.Screen options={{ title: 'Your region' }} />
      <Screen edges={[]}>
        <T>Tap where you play, or care about most. Calendar, pickups, teams, links and news open on it. Pick All of SA to see everything.</T>
        <RegionMap value={home ?? null} onChange={(v) => setHomeRegion(db, v)} />
      </Screen>
    </>
  );
}
