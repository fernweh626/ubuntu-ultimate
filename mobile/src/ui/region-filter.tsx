import { useState } from 'react';
import { ScrollView } from 'react-native';

import { REGIONS } from '@/content/hub';
import { useData } from '@/db/live';
import { getHomeRegion } from '@/db/repo';

import { Choice } from './components';
import { space } from './theme';

/**
 * Region filter that starts on the user's home region (set in Me). 'all' = all of SA.
 * `ready` is false until the home region has loaded, so lists don't flash the wrong region first.
 */
export function useRegionFilter() {
  const home = useData(getHomeRegion);
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? (home === undefined ? 'all' : (home ?? 'all'));
  return { value, setValue: setPicked, home: home ?? null, ready: home !== undefined };
}

export function RegionChips({ value, onChange, home, extra = [] }: { value: string; onChange: (v: string) => void; home: string | null; extra?: { code: string; name: string }[] }) {
  // Home region first, then the rest, so the most likely choice is always under the thumb.
  const regions = [...REGIONS].sort((a, b) => Number(b.code === home) - Number(a.code === home));
  const options = [...extra, ...regions.map((r) => ({ code: r.code, name: r.code === home ? `⌂ ${r.name}` : r.name })), { code: 'all', name: 'All of SA' }];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {options.map((r) => (
        <Choice key={r.code} label={r.name} selected={value === r.code} onPress={() => onChange(r.code)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
      ))}
    </ScrollView>
  );
}
