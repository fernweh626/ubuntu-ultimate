import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { REGIONS } from '@/content/countries';
import { useData } from '@/db/live';
import { getHomeRegion, listEvents, soonFixtures } from '@/db/repo';
import { dateRange, shortDate, timeOfDay } from '@/domain/format';
import { scorableEvents, type ScorableEvent } from '@/domain/scorable-events';

import { Card, Choice, Icon, Section, Sheet, T, TeamSwatch } from './components';
import { colors, font, space } from './theme';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Score a game → which league or tournament. A searchable list: on now first, then coming up, never
 * ones that are over, narrowed to a region (your home region to start with).
 */
export function EventPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const events = useData(listEvents) ?? [];
  const home = useData(getHomeRegion);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [regionChoice, setRegion] = useState<string | null | undefined>(undefined);
  const region = regionChoice === undefined ? (home ?? null) : regionChoice;
  const picked = events.find((e) => e.id === value);
  const { active, upcoming } = scorableEvents(events, today(), { region, q });

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQ('');
  };
  const row = (e: ScorableEvent & { phase: string }) => (
    <Pressable
      key={e.id}
      onPress={() => pick(e.id)}
      accessibilityRole="button"
      style={({ pressed }) => ({ paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 52, justifyContent: 'center', backgroundColor: value === e.id ? colors.brandTint : pressed ? colors.neutralTint : colors.surface })}>
      <T v="bodyStrong">{e.name}</T>
      <T v="small">{[e.kind === 'league' ? 'League' : 'Tournament', e.start_date ? dateRange(e.start_date, e.end_date) : null, e.location].filter(Boolean).join(' · ')}</T>
    </Pressable>
  );
  const list = (title: string, rows: (ScorableEvent & { phase: string })[]) =>
    rows.length ? (
      <View style={{ gap: space.xs }}>
        <T v="label">{title}</T>
        <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>{rows.slice(0, 50).map(row)}</View>
        {rows.length > 50 ? <T v="small">Showing 50 of {rows.length}. Search to narrow it down.</T> : null}
      </View>
    ) : null;

  return (
    <Section title="Tournament or league">
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingHorizontal: space.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <Icon name="trophy-outline" color={colors.muted} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">{picked ? picked.name : 'None (friendly)'}</T>
          {picked ? <T v="small">{picked.kind === 'league' ? 'League' : 'Tournament'}</T> : null}
        </View>
        <Icon name="chevron-down" color={colors.muted} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Which league or tournament?">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
          <Icon name="magnify" color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search leagues and tournaments" placeholderTextColor={colors.faint} style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Choice label="All regions" selected={!region} onPress={() => setRegion(null)} style={{ minHeight: 36, paddingHorizontal: 12 }} />
          {REGIONS.map((r) => (
            <Choice key={r.code} label={r.name} selected={region === r.code} onPress={() => setRegion(r.code)} style={{ minHeight: 36, paddingHorizontal: 12 }} />
          ))}
        </View>
        <Choice label="None (friendly)" selected={!value} onPress={() => pick(null)} style={{ alignItems: 'flex-start' }} />
        {list('On now', active)}
        {list('Coming up', upcoming)}
        {!active.length && !upcoming.length ? <T v="small">No current or upcoming leagues or tournaments{region ? ' in this region' : ''}{q ? ` matching “${q}”` : ''}.</T> : null}
      </Sheet>
    </Section>
  );
}

/** After choosing an event: its games in the next 36 hours, so you can start the right fixture. */
export function SoonFixtures({ eventId }: { eventId: string }) {
  const games = useData((d) => soonFixtures(d, eventId), [eventId]);
  if (!games) return null;
  return (
    <Section title="Games in the next 36 hours">
      {games.length ? (
        games.map((g) => (
          <Card key={g.id} onPress={() => router.replace({ pathname: '/game/new', params: { fixtureId: g.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1, gap: 4 }}>
              <T v="small">
                {shortDate(g.scheduled_at)} · {timeOfDay(g.scheduled_at!)}
                {g.venue_name ? ` · ${g.venue_name}` : ''}
              </T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <TeamSwatch color={g.a_color} size="sm" />
                <T v="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={1}>
                  {g.a_name}
                </T>
                <T v="small">v</T>
                <TeamSwatch color={g.b_color} size="sm" />
                <T v="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={1}>
                  {g.b_name}
                </T>
              </View>
            </View>
            <Icon name="whistle" color={colors.brand} />
          </Card>
        ))
      ) : (
        <T v="small">No fixtures in this event in the next 36 hours. Pick the two teams below to score a game anyway.</T>
      )}
    </Section>
  );
}
