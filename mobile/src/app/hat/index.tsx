import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { listHats } from '@/db/hats';
import { useData } from '@/db/live';
import { getAccess } from '@/db/repo';
import { shortDate } from '@/domain/format';
import { Card, Chip, EmptyState, IconButton, Screen, Section, T } from '@/ui/components';
import { RegionChips, useRegionFilter } from '@/ui/region-filter';
import { space } from '@/ui/theme';

/** Hat tournaments: sign up on your own, get drawn into a team on the day. */
export default function Hats() {
  const hats = useData(listHats) ?? [];
  const access = useData(getAccess);
  const region = useRegionFilter();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const runs = access?.level === 'admin' || access?.level === 'coordinator';
  const shown = hats.filter((h) => region.value === 'all' || !h.region || h.region === region.value);
  const upcoming = shown.filter((h) => (h.end_date ?? h.start_date ?? '') >= today).reverse();
  const past = shown.filter((h) => (h.end_date ?? h.start_date ?? '') < today);

  const card = (h: (typeof hats)[number]) => (
    <Card key={h.id} onPress={() => router.push(`/hat/${h.id}`)}>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Chip label={h.hat_status === 'drawn' ? 'Teams drawn' : 'Sign-ups open'} tone={h.hat_status === 'drawn' ? 'brand' : 'warn'} />
        {h.cost ? <Chip label={h.cost} tone="neutral" /> : null}
        <Chip label={`${h.signups} coming`} tone="neutral" />
      </View>
      <T v="title">{h.name}</T>
      <T v="small">{[h.start_date ? shortDate(h.start_date) : null, h.start_time, h.venue_name ?? h.location].filter(Boolean).join(' · ')}</T>
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Hat tournaments', headerRight: () => (runs ? <IconButton icon="plus" label="New hat" onPress={() => router.push('/hat/edit')} /> : null) }} />
      <Screen edges={[]}>
        <RegionChips value={region.value} onChange={region.setValue} home={region.home} />
        <T v="small">Sign up on your own: say how good you are and whether you’d captain. Teams are drawn 48 hours before, balanced by skill and ratio.</T>
        {upcoming.length ? <Section title="Coming up">{upcoming.map(card)}</Section> : <EmptyState icon="hat-fedora" title="No hats coming up" body={runs ? 'Tap + to set one up.' : 'Hats in your region show up here.'} />}
        {past.length ? <Section title="Past">{past.map(card)}</Section> : null}
      </Screen>
    </>
  );
}
