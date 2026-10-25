import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { REGIONS } from '@/content/countries';
import { homeFeed } from '@/db/home';
import { useData } from '@/db/live';
import { getAccess, getHomeRegion, getMeId, listEvents, listGames, myRoles, type GameListItem } from '@/db/repo';
import { dateRange } from '@/domain/format';
import { eventPhase, scorableEvents } from '@/domain/scorable-events';
import { Button, Card, Chip, Choice, EmptyState, Icon, PageTitle, Screen, Section, Segmented, T } from '@/ui/components';
import { CompetitionCard } from '@/ui/feed';
import { GameCard } from '@/ui/game-bits';
import { MeButton } from '@/ui/me-button';
import { colors, font, space } from '@/ui/theme';

const KIND_LABEL: Record<string, string> = { tournament: 'Tournament', league: 'League', scrimmage: 'Scrimmage', practice: 'Practice', pickup: 'Pickup' };
const CHIP = { minHeight: 36, paddingHorizontal: 12 } as const;
const PAGE = 8;

/** Score a game, what's live, your competitions, then every game and league: yours, your region or all of SA. */
export default function Play() {
  const [tab, setTab] = useState<'games' | 'events'>('games');
  const feed = useData((d) => homeFeed(d));
  const live = useData(listGames)?.filter((g) => g.status === 'live') ?? [];
  return (
    <Screen>
      <PageTitle title="Play" right={<MeButton />} />
      <Button label="Score a game" icon="whistle" kind="primary" big onPress={() => router.push('/game/new')} />
      {live.length ? (
        <Section title={`Live now · ${live.length}`}>
          {live.slice(0, 3).map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </Section>
      ) : null}
      {feed?.competitions.length ? (
        <Section title="Your competitions">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}
            style={{ marginHorizontal: -space.lg, paddingLeft: space.lg }}>
            {feed.competitions.map((c) => (
              <CompetitionCard key={c.key} c={c} />
            ))}
          </ScrollView>
        </Section>
      ) : null}
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'games', label: 'Games' },
          { value: 'events', label: 'Leagues & tournaments' },
        ]}
      />
      {tab === 'games' ? <Games /> : <Events />}
    </Screen>
  );
}

/* ------------------------------ Games ------------------------------ */

function Games() {
  const [opened] = useState(() => Date.now());
  const games = useData(listGames) ?? [];
  const home = useData(getHomeRegion);
  const mine = useData(async (d) => {
    const me = await getMeId(d);
    return me ? (await myRoles(d, me)).map((r) => r.team_id) : [];
  });
  // 'mine', 'all' or a region code. Starts on your teams, else your home region.
  const [scopeChoice, setScope] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const scope = scopeChoice ?? (mine?.length ? 'mine' : (home ?? 'all'));
  const fits = (g: GameListItem) =>
    scope === 'all' || (scope === 'mine' ? !!mine?.some((t) => t === g.team_a_id || t === g.team_b_id) : g.a_region === scope || g.b_region === scope || g.event_region === scope);
  const shown = games.filter((g) => g.status !== 'live' && fits(g));
  // Fixtures in the past with no result aren't "coming up": they wait for someone to enter the result.
  const cutoff = new Date(opened - 3 * 3600_000).toISOString();
  const scheduled = shown.filter((g) => g.status === 'scheduled').sort((a, b) => (a.scheduled_at ?? '9999').localeCompare(b.scheduled_at ?? '9999'));
  const upcoming = scheduled.filter((g) => !g.scheduled_at || g.scheduled_at >= cutoff);
  const overdue = scheduled.filter((g) => g.scheduled_at && g.scheduled_at < cutoff).reverse();
  const done = shown.filter((g) => g.status === 'final');

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {mine?.length ? <Choice label="★ My teams" selected={scope === 'mine'} onPress={() => setScope('mine')} style={CHIP} /> : null}
        <Choice label="All regions" selected={scope === 'all'} onPress={() => setScope('all')} style={CHIP} />
        {REGIONS.map((r) => (
          <Choice key={r.code} label={r.name} selected={scope === r.code} onPress={() => setScope(r.code)} style={CHIP} />
        ))}
      </View>
      {overdue.length ? (
        <Section title={`Needs a result · ${overdue.length}`}>
          <T v="small">Scheduled but nobody scored them. Open one to enter the result, or postpone it.</T>
          {overdue.slice(0, 3).map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </Section>
      ) : null}
      <Section title="Coming up">{upcoming.length ? upcoming.slice(0, more ? 40 : 4).map((g) => <GameCard key={g.id} g={g} />) : <T v="small">No fixtures coming up.</T>}</Section>
      <Section title="Results">
        {done.length ? (
          done.slice(0, more ? 40 : PAGE).map((g) => <GameCard key={g.id} g={g} />)
        ) : (
          <EmptyState icon="flag-checkered" title="No finished games yet" body="Every finished game gets a full report you can share." />
        )}
        {!more && (done.length > PAGE || upcoming.length > 4) ? <Button label="Show more" kind="ghost" onPress={() => setMore(true)} /> : null}
      </Section>
    </>
  );
}

/* ------------------------------ Leagues & tournaments ------------------------------ */

function Events() {
  const events = useData(listEvents) ?? [];
  const home = useData(getHomeRegion);
  const access = useData(getAccess);
  const [q, setQ] = useState('');
  const [regionChoice, setRegion] = useState<string | null | undefined>(undefined);
  const [when, setWhen] = useState<'now' | 'past'>('now');
  const region = regionChoice === undefined ? (home ?? null) : regionChoice;
  const today = new Date().toISOString().slice(0, 10);
  const { active, upcoming } = scorableEvents(events, today, { region, q });
  const past = events
    .filter((e) => (e.kind === 'league' || e.kind === 'tournament') && eventPhase(e, today) === 'past')
    .filter((e) => !region || !e.region || e.region === region)
    .filter((e) => !q.trim() || `${e.name} ${e.location ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.end_date ?? b.start_date ?? '').localeCompare(a.end_date ?? a.start_date ?? ''));
  const card = (e: (typeof events)[number]) => (
    <Card key={e.id} onPress={() => router.push(`/event/${e.id}`)}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label={KIND_LABEL[e.kind] ?? e.kind} />
        <Chip label={e.division} tone="neutral" />
      </View>
      <T v="title">{e.name}</T>
      <T v="small">{[dateRange(e.start_date, e.end_date), e.location].filter(Boolean).join(' · ')}</T>
    </Card>
  );

  return (
    <>
      {access?.level === 'admin' || access?.level === 'coordinator' ? <Button label="New tournament or league" icon="trophy-outline" onPress={() => router.push('/event/edit')} /> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          backgroundColor: colors.surface,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: space.md,
        }}>
        <Icon name="magnify" color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search leagues and tournaments"
          placeholderTextColor={colors.faint}
          style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Choice label="All regions" selected={!region} onPress={() => setRegion(null)} style={CHIP} />
        {REGIONS.map((r) => (
          <Choice key={r.code} label={r.name} selected={region === r.code} onPress={() => setRegion(r.code)} style={CHIP} />
        ))}
      </View>
      <Segmented
        value={when}
        onChange={setWhen}
        options={[
          { value: 'now', label: `On now & coming up · ${active.length + upcoming.length}` },
          { value: 'past', label: `Past · ${past.length}` },
        ]}
      />
      {when === 'now' ? (
        <>
          {active.length ? <Section title="On now">{active.slice(0, 30).map(card)}</Section> : null}
          {upcoming.length ? <Section title="Coming up">{upcoming.slice(0, 30).map(card)}</Section> : null}
          {!active.length && !upcoming.length ? <EmptyState icon="trophy-outline" title="Nothing on or coming up" body="Try another region, or search." /> : null}
        </>
      ) : past.length ? (
        past.slice(0, 30).map(card)
      ) : (
        <EmptyState icon="trophy-outline" title="Nothing finished yet" body="Finished tournaments and leagues keep their standings and reports here." />
      )}
    </>
  );
}
