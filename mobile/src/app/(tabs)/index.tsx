import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { regionName } from '@/content/hub';
import { dayLabel, homeFeed, type Competition, type TimelineItem } from '@/db/home';
import { useData } from '@/db/live';
import { getHomeRegion, listCalendar, listGames, listPickups, type GameListItem } from '@/db/repo';
import { DAYS_LONG, dateRange, timeOfDay, weekdayIndex } from '@/domain/format';
import { Button, Card, Chip, EmptyState, Icon, IconButton, Section, Screen, Segmented, T } from '@/ui/components';
import { GameCard } from '@/ui/game-bits';
import { MeButton } from '@/ui/me-button';
import { colors, font, space } from '@/ui/theme';

/*
 * Home stays short however big things get:
 *  - For you: a strip of your competitions + one 7-day timeline sorted by time, each item tagged.
 *    Detail (standings, every fixture) lives on the competition's own page.
 *  - Your region / All of SA: a few of each thing, with "See all" — never everything.
 */

const MAX = 3;
const MAX_TIMELINE = 8;

export default function Home() {
  const feedData = useData((d) => homeFeed(d));
  const home = useData(getHomeRegion);
  const [feedChoice, setFeed] = useState<'you' | 'region' | 'all' | null>(null);
  const feed = feedChoice === 'region' && !home ? 'all' : (feedChoice ?? (feedData?.hasScope ? 'you' : home ? 'region' : 'all'));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <T style={{ fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: 0.5 }}>SA ULTIMATE</T>
          <T v="small">{DAYS_LONG[weekdayIndex()]}</T>
        </View>
        <MeButton />
      </View>

      <Segmented
        value={feed}
        onChange={setFeed}
        options={[
          { value: 'you', label: '★ For you' },
          ...(home ? [{ value: 'region' as const, label: regionName(home) }] : []),
          { value: 'all', label: 'All of SA' },
        ]}
      />

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Score a game" icon="whistle" kind="primary" onPress={() => router.push('/game/new')} style={{ flex: 1 }} />
        <IconButton icon="map-marker-radius" label="Pickups" onPress={() => router.push('/hub/pickups')} />
        <IconButton icon="calendar" label="Calendar" onPress={() => router.push('/hub/calendar')} />
        <IconButton icon="book-open-variant" label="Rules" onPress={() => router.push('/hub/rules')} />
      </View>

      {feed === 'you' ? feedData ? <ForYou data={feedData} /> : null : <Area region={feed === 'region' ? home ?? null : null} />}
    </Screen>
  );
}

/* ------------------------------ For you ------------------------------ */

function ForYou({ data }: { data: Awaited<ReturnType<typeof homeFeed>> }) {
  if (!data.hasScope) {
    return (
      <Card onPress={() => router.push('/me')}>
        <T v="bodyStrong">Make this yours</T>
        <T v="small">
          Pick yourself in Me (top right) and your teams, leagues and games appear here. Follow any team, tournament or pickup — in any region — to add it too.
        </T>
      </Card>
    );
  }
  const shown = data.timeline.slice(0, MAX_TIMELINE);
  const days: { label: string; items: TimelineItem[] }[] = [];
  for (const it of shown) {
    const label = dayLabel(it.at);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(it);
    else days.push({ label, items: [it] });
  }
  return (
    <>
      {data.live.length ? (
        <Section title="Live now">
          {data.live.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </Section>
      ) : null}

      <Section title="Your competitions">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }} style={{ marginHorizontal: -space.lg, paddingLeft: space.lg }}>
          {data.competitions.map((c) => (
            <CompetitionCard key={c.key} c={c} />
          ))}
          <Pressable
            onPress={() => router.push('/hub/calendar')}
            accessibilityRole="button"
            style={{ width: 120, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, padding: space.md, justifyContent: 'center', alignItems: 'center', gap: 4 }}>
            <Icon name="plus" color={colors.brand} />
            <T v="small" style={{ textAlign: 'center' }}>
              Find leagues, tournaments & pickups
            </T>
          </Pressable>
        </ScrollView>
      </Section>

      <Section title="This week" action={<Button label="All games" kind="ghost" onPress={() => router.push('/play')} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
        {days.length === 0 ? (
          <Card>
            <T v="small">Nothing on in the next 7 days. Fixtures, practices and pickups you follow show up here.</T>
          </Card>
        ) : (
          days.map((d) => (
            <View key={d.label} style={{ gap: space.xs }}>
              <T v="label">{d.label}</T>
              <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                {d.items.map((it, i) => (
                  <TimelineRow key={it.key} it={it} first={i === 0} />
                ))}
              </View>
            </View>
          ))
        )}
        {data.timeline.length > shown.length ? <T v="small">+{data.timeline.length - shown.length} more this week in All games.</T> : null}
      </Section>

      {data.recent.length ? (
        <Section title="Recent results">
          {data.recent.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function CompetitionCard({ c }: { c: Competition }) {
  return (
    <Pressable
      onPress={() => router.push(c.kind === 'event' ? `/event/${c.id}` : '/hub/pickups')}
      accessibilityRole="button"
      style={{ width: 200, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
      <View style={{ height: 6, backgroundColor: c.color }} />
      <View style={{ padding: space.md, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 16, lineHeight: 20, color: colors.ink }}>
          {c.name}
        </Text>
        <T v="small" numberOfLines={1} style={{ color: colors.ink }}>
          {c.line1}
        </T>
        <T v="small" numberOfLines={1}>
          {c.line2}
        </T>
      </View>
    </Pressable>
  );
}

function TimelineRow({ it, first }: { it: TimelineItem; first: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(it.url as never)}
      accessibilityRole="button"
      style={{ flexDirection: 'row', gap: space.md, padding: space.md, borderTopWidth: first ? 0 : 1, borderTopColor: colors.divider, alignItems: 'center' }}>
      <Text style={{ width: 52, fontFamily: font.display, fontSize: 20, color: colors.ink }}>{timeOfDay(it.at)}</Text>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {it.title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          {it.tag ? <TagChip name={it.tag.name} color={it.tag.color} /> : null}
          {it.following ? <Chip label="Following" tone="neutral" /> : null}
          {it.subtitle ? (
            <T v="small" numberOfLines={1} style={{ flexShrink: 1 }}>
              {it.subtitle}
            </T>
          ) : null}
        </View>
      </View>
      <Icon name={it.kind === 'game' ? 'flag-variant-outline' : it.kind === 'pickup' ? 'account-group-outline' : 'run'} color={colors.faint} />
    </Pressable>
  );
}

/** Competition tag: coloured dot + name, so two leagues on the same day are easy to tell apart. */
function TagChip({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 190 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 12, color }}>
        {name}
      </Text>
    </View>
  );
}

/* ------------------------------ Region / All of SA ------------------------------ */

function Area({ region }: { region: string | null }) {
  const games = useData(listGames);
  const pickups = useData(listPickups);
  const calendar = useData(listCalendar);
  const [opened] = useState(() => Date.now());
  const here = (g: GameListItem) => !region || g.a_region === region || g.b_region === region || g.event_region === region;
  const inRegion = (r: string | null | undefined) => !region || !r || r === region;

  const live = games?.filter((g) => g.status === 'live' && here(g)) ?? [];
  const recent = games?.filter((g) => g.status === 'final' && here(g)).slice(0, MAX) ?? [];
  const nextUp = (games ?? [])
    .filter((g) => g.status === 'scheduled' && g.scheduled_at && here(g) && Date.parse(g.scheduled_at) > opened - 3 * 3600_000)
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))
    .slice(0, MAX);
  const today = weekdayIndex();
  const todays = pickups?.filter((p) => p.day_of_week === today && (!region || p.region === region)) ?? [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = (calendar ?? [])
    .filter((c) => c.start_date && (c.end_date ?? c.start_date) >= todayIso)
    .filter((c) => c.level === 'national' || c.level === 'international' || inRegion(c.region))
    .slice(0, MAX);
  const where = region ? regionName(region) : 'SA';

  return (
    <>
      {live.length ? (
        <Section title={`Live now · ${live.length}`} action={live.length > MAX ? <Button label="See all" kind="ghost" onPress={() => router.push('/play')} style={{ minHeight: 32, paddingHorizontal: 0 }} /> : undefined}>
          {live.slice(0, MAX).map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </Section>
      ) : null}

      {nextUp.length ? (
        <Section title={`Next games in ${where}`} action={<Button label="See all" kind="ghost" onPress={() => router.push('/play')} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
          {nextUp.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </Section>
      ) : null}

      <Section title={`Pickup today · ${DAYS_LONG[today]}`} action={<Button label="All days" kind="ghost" onPress={() => router.push('/hub/pickups')} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
        {todays.length === 0 ? (
          <Card>
            <T v="small">No pickup listed for today{region ? ` in ${where}` : ''}. Know one? Add it in Pickups so others can find it.</T>
          </Card>
        ) : (
          todays.slice(0, MAX).map((p) => (
            <Card key={p.id} onPress={() => router.push('/hub/pickups')}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T v="bodyStrong" style={{ flex: 1 }}>
                  {p.name}
                </T>
                <T style={{ fontFamily: font.display, fontSize: 22 }}>{p.start_time}</T>
              </View>
              <T v="small">{[p.venue_text, p.area, p.city].filter(Boolean).join(' · ')}</T>
              {p.is_sample ? <Chip label="Sample" tone="warn" /> : null}
            </Card>
          ))
        )}
        {todays.length > MAX ? <T v="small">+{todays.length - MAX} more in Pickups.</T> : null}
      </Section>

      <Section title="Recent results" action={recent.length ? <Button label="See all" kind="ghost" onPress={() => router.push('/play')} style={{ minHeight: 32, paddingHorizontal: 0 }} /> : undefined}>
        {recent.length === 0 ? (
          <EmptyState icon="flag-checkered" title="No finished games yet" body="Finished games and their reports show up here." />
        ) : (
          recent.map((g) => <GameCard key={g.id} g={g} />)
        )}
      </Section>

      <Section title="Coming up" action={<Button label="Calendar" kind="ghost" onPress={() => router.push('/hub/calendar')} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
        {upcoming.length === 0 ? (
          <Card>
            <T v="small">Nothing dated yet. Add events to the competitive calendar.</T>
          </Card>
        ) : (
          upcoming.map((c) => (
            <Card key={c.id} onPress={() => router.push('/hub/calendar')}>
              <T v="bodyStrong">{c.name}</T>
              <T v="small">{[dateRange(c.start_date, c.end_date), c.location].filter(Boolean).join(' · ')}</T>
            </Card>
          ))
        )}
      </Section>
    </>
  );
}
