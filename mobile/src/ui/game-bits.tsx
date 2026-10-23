import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';

import type { GameListItem } from '@/db/repo';
import { shortDate, timeOfDay } from '@/domain/format';

import { Card, Chip, Icon, T, TeamSwatch } from './components';
import { colors, font, space } from './theme';

const isYouTube = (url: string) => /youtube\.com|youtu\.be/i.test(url);

/** Tappable video icon for a game with a recording or stream: the YouTube logo for YouTube links. */
export function VideoLink({ url, size = 26, compact = false }: { url: string | null | undefined; size?: number; compact?: boolean }) {
  if (!url) return null;
  const yt = isYouTube(url);
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      accessibilityRole="link"
      accessibilityLabel={yt ? 'Watch on YouTube' : 'Watch the video'}
      hitSlop={10}
      style={compact ? undefined : { minWidth: 36, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={yt ? 'youtube' : 'play-circle'} color={yt ? '#FF0000' : colors.brand} size={size} />
    </Pressable>
  );
}

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
        <T v="small" numberOfLines={1} style={{ flex: 1, textAlign: 'right', marginLeft: space.sm }}>
          {[g.event_name, shortDate(g.started_at ?? g.scheduled_at ?? g.created_at)].filter(Boolean).join(' · ')}
        </T>
        <VideoLink url={g.video_url} />
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
    <Card onPress={() => router.push(`/game/${g.id}/fixture`)} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
        <T v="bodyStrong">{g.scheduled_at ? `${shortDate(g.scheduled_at)} · ${timeOfDay(g.scheduled_at)}` : 'Date to be confirmed'}</T>
        {g.postponements ? <Chip label={`Postponed${g.postponements > 1 ? ` ×${g.postponements}` : ''}`} tone="warn" /> : null}
        <VideoLink url={g.video_url} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TeamSwatch color={homeColor} size="sm" />
        <T style={{ fontFamily: font.bold, fontSize: 17, flexShrink: 1 }} numberOfLines={1}>
          {homeName}
        </T>
        <T v="small">v</T>
        <TeamSwatch color={awayColor} size="sm" />
        <T style={{ fontFamily: font.bold, fontSize: 17, flexShrink: 1 }} numberOfLines={1}>
          {awayName}
        </T>
      </View>
      <T v="small" numberOfLines={1}>
        {[g.venue_name, g.event_name, `${homeName} sets up`].filter(Boolean).join(' · ')}
      </T>
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
