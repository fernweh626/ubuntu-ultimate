import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { regionName } from '@/content/hub';
import { useData } from '@/db/live';
import { listHats } from '@/db/hats';
import { getAccess, listCalendar } from '@/db/repo';
import { isMeeting, KIND_LABEL } from '@/domain/calendar';
import type { CalendarEntry } from '@/db/types';
import { dateRange } from '@/domain/format';
import { RegionChips, useRegionFilter } from '@/ui/region-filter';
import { Button, Card, Chip, EmptyState, IconButton, Screen, Section, Segmented, T } from '@/ui/components';
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
  const entries0 = useData(listCalendar) ?? [];
  const hats = useData(listHats) ?? [];
  // Hats live as events, so they're added here alongside the calendar entries.
  const all: CalendarEntry[] = [
    ...entries0,
    ...hats.map((h) => ({ id: `hat:${h.id}`, name: `🎩 ${h.name}`, kind: 'hat', level: 'social', region: h.region, location: h.venue_name ?? h.location, start_date: h.start_date, end_date: h.end_date, month_hint: null, status: 'confirmed' as const, url: null, notes: h.cost ? `Hat · ${h.cost} · sign up in the app` : 'Hat · sign up in the app', start_time: h.start_time, end_time: null, meeting_url: null })),
  ].sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'));
  const access = useData(getAccess);
  const runs = access?.level === 'admin' || access?.level === 'coordinator';
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
          headerRight: () => (runs ? <IconButton icon="plus" label="Add to calendar" onPress={() => router.push('/hub/calendar-edit')} /> : null),
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
          <EmptyState icon="calendar-blank" title="Nothing here yet" body={runs ? 'Tap + to add a tournament, league, AGM or meeting.' : 'Coordinators add tournaments, leagues and meetings here.'} />
        ) : (
          [...byMonth.entries()].map(([month, items]) => (
            <Section key={month} title={month}>
              {items.map((e) => (
                <Card
                  key={e.id}
                  onPress={
                    e.id.startsWith('hat:')
                      ? () => router.push(`/hat/${e.id.slice(4)}`)
                      : isMeeting(e.kind)
                      ? () => router.push(`/hub/meeting/${e.id}`)
                      : runs
                        ? () => router.push({ pathname: '/hub/calendar-edit', params: { id: e.id } })
                        : e.url
                          ? () => Linking.openURL(e.url!)
                          : undefined
                  }>
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
                        {isMeeting(e.kind) ? <Chip label={KIND_LABEL[e.kind]} icon="account-group-outline" tone="dark" /> : e.level ? <Chip label={e.level} tone={LEVEL_TONE[e.level] ?? 'neutral'} /> : null}
                        {isMeeting(e.kind) && e.start_time ? <Chip label={`${e.start_time}${e.end_time ? `–${e.end_time}` : ''}`} icon="clock-outline" tone="neutral" /> : null}
                        {e.status === 'tbc' ? <Chip label="Dates TBC" tone="warn" /> : null}
                      </View>
                      {e.notes ? <T v="small">{e.notes}</T> : null}
                      {e.meeting_url && (e.end_date ?? e.start_date ?? '') >= today ? (
                        <Button label="Join meeting" icon="video-outline" kind="primary" onPress={() => Linking.openURL(e.meeting_url!)} style={{ alignSelf: 'flex-start', minHeight: 40 }} />
                      ) : null}
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
