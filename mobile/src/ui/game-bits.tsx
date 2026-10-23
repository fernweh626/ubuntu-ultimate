import { router } from 'expo-router';
import { View } from 'react-native';

import type { GameListItem } from '@/db/repo';
import { shortDate, timeOfDay } from '@/domain/format';

import { Card, Chip, T, TeamSwatch } from './components';
import { colors, font, space } from './theme';

export function GameCard({ g }: { g: GameListItem }) {
  if (g.status === 'scheduled') return <FixtureCard g={g} />;
  const live = g.status === 'live';
  const aWon = g.status === 'final' && g.score_a > g.score_b;
  const bWon = g.status === 'final' && g.score_b > g.score_a;
  const forfeitBy = g.forfeit_team_id ? (g.forfeit_team_id === g.team_a_id ? g.a_name : g.b_name) : null;
  return (
    <Card
      onPress={() => router.push(live ? `/game/${g.id}` : `/game/${g.id}/report`)}
      style={live ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {live ? <Chip label="LIVE" tone="danger" icon="circle" /> : forfeitBy ? <Chip label={`Forfeit · ${forfeitBy}`} tone="warn" /> : <Chip label="Final" tone="neutral" />}
        <T v="small" numberOfLines={1} style={{ flexShrink: 1, marginLeft: space.sm }}>
          {[g.event_name, shortDate(g.started_at ?? g.scheduled_at ?? g.created_at)].filter(Boolean).join(' · ')}
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <TeamSwatch color={g.a_color} />
          <T v="bodyStrong" numberOfLines={2} style={{ flex: 1, opacity: bWon ? 0.6 : 1 }}>
            {g.a_name}
          </T>
        </View>
        <T style={{ fontFamily: font.display, fontSize: 34, lineHeight: 38 }}>
          {g.result_mode === 'winner' ? (g.score_a > g.score_b ? 'W – L' : 'L – W') : g.result_mode === 'none' ? 'Played' : `${g.score_a} – ${g.score_b}`}
        </T>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'flex-end' }}>
          <T v="bodyStrong" numberOfLines={2} style={{ flex: 1, textAlign: 'right', opacity: aWon ? 0.6 : 1 }}>
            {g.b_name}
          </T>
          <TeamSwatch color={g.b_color} />
        </View>
      </View>
    </Card>
  );
}

/** A game that hasn't started: when, where, who's home (sets up the field). */
export function FixtureCard({ g }: { g: GameListItem }) {
  const home = g.home_team_id ?? g.team_a_id;
  const homeName = home === g.team_a_id ? g.a_name : g.b_name;
  const awayName = home === g.team_a_id ? g.b_name : g.a_name;
  const homeColor = home === g.team_a_id ? g.a_color : g.b_color;
  const awayColor = home === g.team_a_id ? g.b_color : g.a_color;
  return (
    <Card onPress={() => router.push(`/game/${g.id}/fixture`)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
        <T v="smallStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
          {g.scheduled_at ? `${shortDate(g.scheduled_at)} · ${timeOfDay(g.scheduled_at)}` : 'Date TBC'}
          {g.venue_name ? ` · ${g.venue_name}` : ''}
        </T>
        {g.postponements ? <Chip label={`Postponed ×${g.postponements}`} tone="warn" /> : g.event_name ? <T v="small" numberOfLines={1}>{g.event_name}</T> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TeamSwatch color={homeColor} size="sm" />
        <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {homeName}
        </T>
        <Chip label="Home · sets up" tone="brand" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TeamSwatch color={awayColor} size="sm" />
        <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {awayName}
        </T>
        <T v="small">Away</T>
      </View>
    </Card>
  );
}

export function FormDots({ form }: { form: ('W' | 'L' | 'D')[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {form.slice(-5).map((r, i) => (
        <View
          key={i}
          accessibilityLabel={r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Draw'}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: r === 'W' ? colors.brand : r === 'L' ? colors.warn : colors.faint,
          }}
        />
      ))}
    </View>
  );
}
