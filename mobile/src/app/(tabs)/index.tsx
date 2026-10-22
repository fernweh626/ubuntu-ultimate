import { router } from 'expo-router';
import { View } from 'react-native';

import { listCalendar, listGames, listPickups } from '@/db/repo';
import { useData } from '@/db/live';
import { DAYS_LONG, dateRange, weekdayIndex } from '@/domain/format';
import { Button, Card, Chip, EmptyState, Section, Screen, T } from '@/ui/components';
import { GameCard } from '@/ui/game-bits';
import { colors, font, space } from '@/ui/theme';

export default function Home() {
  const games = useData(listGames);
  const pickups = useData(listPickups);
  const calendar = useData(listCalendar);

  const live = games?.filter((g) => g.status === 'live') ?? [];
  const recent = games?.filter((g) => g.status === 'final').slice(0, 3) ?? [];
  const today = weekdayIndex();
  const todays = pickups?.filter((p) => p.day_of_week === today) ?? [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = (calendar ?? []).filter((c) => c.start_date && (c.end_date ?? c.start_date) >= todayIso).slice(0, 3);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <T style={{ fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: 0.5 }}>SA ULTIMATE</T>
          <T v="small">{DAYS_LONG[today]} · built for the South African ultimate community</T>
        </View>
      </View>

      {live.length > 0 ? (
        <Section title="Live now">
          {live.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </Section>
      ) : null}

      <Card style={{ backgroundColor: colors.night, borderColor: colors.night, gap: space.md }}>
        <T style={{ fontFamily: font.bold, fontSize: 20, color: '#fff' }}>Score a game</T>
        <T style={{ fontFamily: font.regular, fontSize: 15, color: colors.nightMuted }}>
          Lines, pulls, turnovers and stats for both teams — works with no signal.
        </T>
        <Button label="Start a game" icon="whistle" kind="primary" big onPress={() => router.push('/game/new')} />
      </Card>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Pickups" icon="map-marker-radius" style={{ flex: 1 }} onPress={() => router.push('/hub/pickups')} />
        <Button label="Rules" icon="book-open-variant" style={{ flex: 1 }} onPress={() => router.push('/hub/rules')} />
        <Button label="Calendar" icon="calendar" style={{ flex: 1 }} onPress={() => router.push('/hub/calendar')} />
      </View>

      <Section
        title={`Pickup today · ${DAYS_LONG[today]}`}
        action={<Button label="All days" kind="ghost" onPress={() => router.push('/hub/pickups')} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
        {todays.length === 0 ? (
          <Card>
            <T v="small">No pickup listed for today yet. Know one? Add it in the Hub so others can find it.</T>
          </Card>
        ) : (
          todays.map((p) => (
            <Card key={p.id} onPress={() => router.push({ pathname: '/hub/pickup-edit', params: { id: p.id } })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T v="bodyStrong" style={{ flex: 1 }}>
                  {p.name}
                </T>
                <T style={{ fontFamily: font.display, fontSize: 22 }}>{p.start_time}</T>
              </View>
              <T v="small">{[p.venue_text, p.area, p.city].filter(Boolean).join(' · ')}</T>
              {p.is_sample ? <Chip label="Sample — tap to edit" tone="warn" /> : null}
            </Card>
          ))
        )}
      </Section>

      <Section title="Recent results" action={recent.length ? <Button label="All games" kind="ghost" onPress={() => router.push('/play')} style={{ minHeight: 32, paddingHorizontal: 0 }} /> : undefined}>
        {recent.length === 0 ? (
          <EmptyState icon="flag-checkered" title="No finished games yet" body="Finished games and their reports will show up here." />
        ) : (
          recent.map((g) => <GameCard key={g.id} g={g} />)
        )}
      </Section>

      <Section title="Coming up" action={<Button label="Calendar" kind="ghost" onPress={() => router.push('/hub/calendar')} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
        {upcoming.length === 0 ? (
          <Card>
            <T v="small">Nothing dated yet. Add events to the competitive calendar in the Hub.</T>
          </Card>
        ) : (
          upcoming.map((c) => (
            <Card key={c.id} onPress={() => router.push({ pathname: '/hub/calendar-edit', params: { id: c.id } })}>
              <T v="bodyStrong">{c.name}</T>
              <T v="small">{[dateRange(c.start_date, c.end_date), c.location].filter(Boolean).join(' · ')}</T>
            </Card>
          ))
        )}
      </Section>
    </Screen>
  );
}
