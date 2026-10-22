import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { regionName } from '@/content/hub';
import { useData } from '@/db/live';
import { listCalendar } from '@/db/repo';
import type { CalendarEntry } from '@/db/types';
import { dateRange } from '@/domain/format';
import { RegionChips, useRegionFilter } from '@/ui/region-filter';
import { Card, Chip, EmptyState, IconButton, Screen, Section, Segmented, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const LEVEL_TONE: Record<string, 'brand' | 'neutral' | 'warn' | 'dark'> = {
  international: 'dark',
  national: 'brand',
  regional: 'warn',
  league: 'neutral',
  social: 'neutral',
};

export default function Calendar() {
  const all = useData(listCalendar) ?? [];
  const region = useRegionFilter();
  // National, international and all-region events matter to everyone, so they show in every region.
  const entries = all.filter((e) => region.value === 'all' || !e.region || e.region === region.value || e.level === 'national' || e.level === 'international');
  const [view, setView] = useState<'upcoming' | 'tbc' | 'past'>('upcoming');
  const today = new Date().toISOString().slice(0, 10);

  const dated = entries.filter((e) => e.start_date);
  const upcoming = dated.filter((e) => (e.end_date ?? e.start_date)! >= today);
  const past = dated.filter((e) => (e.end_date ?? e.start_date)! < today).reverse();
  const tbc = entries.filter((e) => !e.start_date);

  const list = view === 'upcoming' ? upcoming : view === 'past' ? past : tbc;
  const byMonth = new Map<string, CalendarEntry[]>();
  for (const e of list) {
    const key = e.start_date ? `${MONTHS[Number(e.start_date.slice(5, 7)) - 1]} ${e.start_date.slice(0, 4)}` : 'Dates to be confirmed';
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Competitive calendar',
          headerRight: () => <IconButton icon="plus" label="Add to calendar" onPress={() => router.push('/hub/calendar-edit')} />,
        }}
      />
      <Screen edges={[]}>
        <RegionChips value={region.value} onChange={region.setValue} home={region.home} />
        {region.value !== 'all' ? <T v="small">{regionName(region.value)} events, plus national and international ones.</T> : null}
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: `Upcoming (${upcoming.length})` },
            { value: 'tbc', label: `TBC (${tbc.length})` },
            { value: 'past', label: 'Past' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState icon="calendar-blank" title="Nothing here yet" body="Tap + to add a tournament, league or national event." />
        ) : (
          [...byMonth.entries()].map(([month, items]) => (
            <Section key={month} title={month}>
              {items.map((e) => (
                <Card key={e.id} onPress={() => router.push({ pathname: '/hub/calendar-edit', params: { id: e.id } })}>
                  <View style={{ flexDirection: 'row', gap: space.md }}>
                    {e.start_date ? (
                      <View style={{ width: 52, alignItems: 'center', borderRadius: 10, backgroundColor: colors.brandTint, paddingVertical: 6 }}>
                        <T style={{ fontFamily: font.display, fontSize: 26, lineHeight: 28, color: colors.brandDark }}>
                          {Number(e.start_date.slice(8, 10))}
                        </T>
                        <T style={{ fontFamily: font.semibold, fontSize: 11, color: colors.brandDark }}>
                          {MONTHS[Number(e.start_date.slice(5, 7)) - 1].slice(0, 3).toUpperCase()}
                        </T>
                      </View>
                    ) : null}
                    <View style={{ flex: 1, gap: 4 }}>
                      <T v="bodyStrong">{e.name}</T>
                      <T v="small">
                        {[e.start_date ? dateRange(e.start_date, e.end_date) : e.month_hint, e.location ?? (e.region ? regionName(e.region) : null)]
                          .filter(Boolean)
                          .join(' · ')}
                      </T>
                      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                        {e.level ? <Chip label={e.level} tone={LEVEL_TONE[e.level] ?? 'neutral'} /> : null}
                        {e.status === 'tbc' ? <Chip label="Dates TBC" tone="warn" /> : null}
                      </View>
                      {e.notes ? <T v="small">{e.notes}</T> : null}
                    </View>
                  </View>
                </Card>
              ))}
            </Section>
          ))
        )}
      </Screen>
    </>
  );
}
