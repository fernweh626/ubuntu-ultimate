import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useData } from '@/db/live';
import { getAccess, listEvents, listGames } from '@/db/repo';
import { dateRange } from '@/domain/format';
import { Button, Card, Chip, EmptyState, PageTitle, Screen, Section, Segmented, T } from '@/ui/components';
import { GameCard } from '@/ui/game-bits';
import { MeButton } from '@/ui/me-button';
import { space } from '@/ui/theme';

const KIND_LABEL: Record<string, string> = {
  tournament: 'Tournament',
  league: 'League',
  scrimmage: 'Scrimmage',
  practice: 'Practice',
  pickup: 'Pickup',
};

export default function Play() {
  const [tab, setTab] = useState<'games' | 'events'>('games');
  const [opened] = useState(() => Date.now());
  const games = useData(listGames);
  const events = useData(listEvents);
  const today = new Date(opened).toISOString().slice(0, 10);
  // Open: started and not finished. Upcoming: not started (or no date yet). Past: finished.
  const byWhen = { open: [] as NonNullable<typeof events>, upcoming: [] as NonNullable<typeof events>, past: [] as NonNullable<typeof events> };
  for (const e of events ?? []) {
    const end = e.end_date ?? e.start_date;
    if (!e.start_date || e.start_date > today) byWhen.upcoming.push(e);
    else if (end && end < today) byWhen.past.push(e);
    else byWhen.open.push(e);
  }
  byWhen.upcoming.sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'));
  byWhen.past.sort((a, b) => (b.end_date ?? b.start_date ?? '').localeCompare(a.end_date ?? a.start_date ?? ''));
  const [whenPick, setWhen] = useState<'open' | 'upcoming' | 'past' | null>(null);
  const when = whenPick ?? (byWhen.open.length ? 'open' : 'upcoming');
  const access = useData(getAccess);
  const runsEvents = access?.level === 'admin' || access?.level === 'coordinator';

  const live = games?.filter((g) => g.status === 'live') ?? [];
  const done = games?.filter((g) => g.status === 'final') ?? [];
  // Fixtures in the past with no result aren't "coming up": they wait for someone to enter the result.
  const cutoff = new Date(opened - 3 * 3600_000).toISOString();
  const scheduled = (games ?? []).filter((g) => g.status === 'scheduled').sort((a, b) => (a.scheduled_at ?? '9999').localeCompare(b.scheduled_at ?? '9999'));
  const upcoming = scheduled.filter((g) => !g.scheduled_at || g.scheduled_at >= cutoff).slice(0, 10);
  const overdue = scheduled.filter((g) => g.scheduled_at && g.scheduled_at < cutoff).reverse();

  return (
    <Screen>
      <PageTitle title="Games" subtitle="Score games, run tournaments and leagues" right={<MeButton />} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'games', label: 'Games' },
          { value: 'events', label: 'Tournaments & leagues' },
        ]}
      />

      {tab === 'games' ? (
        <>
          <Button label="Start a game" icon="whistle" kind="primary" big onPress={() => router.push('/game/new')} />
          {live.length ? (
            <Section title="In progress">
              {live.map((g) => (
                <GameCard key={g.id} g={g} />
              ))}
            </Section>
          ) : null}
          {upcoming.length ? (
            <Section title="Coming up">
              {upcoming.map((g) => (
                <GameCard key={g.id} g={g} />
              ))}
            </Section>
          ) : null}
          {overdue.length ? (
            <Section title={`Needs a result · ${overdue.length}`}>
              <T v="small">These were scheduled but nobody scored them. Open one to enter the result, or postpone it.</T>
              {overdue.slice(0, 3).map((g) => (
                <GameCard key={g.id} g={g} />
              ))}
            </Section>
          ) : null}
          <Section title="Finished">
            {done.length === 0 ? (
              <EmptyState icon="flag-checkered" title="No finished games yet" body="Every finished game gets a full report you can share." />
            ) : (
              done.map((g) => <GameCard key={g.id} g={g} />)
            )}
          </Section>
        </>
      ) : (
        <>
          {runsEvents ? (
            <Button label="New tournament or league" icon="trophy-outline" kind="primary" big onPress={() => router.push('/event/edit')} />
          ) : (
            <T v="small">Coordinators and admins create tournaments and leagues. Set your level in Me (top right).</T>
          )}
          <Segmented
            value={when}
            onChange={setWhen}
            options={[
              { value: 'open', label: `Open · ${byWhen.open.length}` },
              { value: 'upcoming', label: `Upcoming · ${byWhen.upcoming.length}` },
              { value: 'past', label: `Past · ${byWhen.past.length}` },
            ]}
          />
          {byWhen[when].length === 0 ? (
            <EmptyState
              icon="trophy-outline"
              title={when === 'open' ? 'Nothing on right now' : when === 'upcoming' ? 'Nothing coming up' : 'Nothing finished yet'}
              body={when === 'past' ? 'Finished tournaments and leagues keep their standings and reports here.' : 'Create one, add the teams, then score games inside it to get standings, leaders and team reports.'}
            />
          ) : (
            byWhen[when].map((e) => (
              <Card key={e.id} onPress={() => router.push(`/event/${e.id}`)}>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Chip label={KIND_LABEL[e.kind] ?? e.kind} />
                  <Chip label={e.division} tone="neutral" />
                </View>
                <T v="title">{e.name}</T>
                <T v="small">{[dateRange(e.start_date, e.end_date), e.location].filter(Boolean).join(' · ')}</T>
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
