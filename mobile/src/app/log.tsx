import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useData } from '@/db/live';
import { getMe, myRoles, personLog, type LogEntry } from '@/db/repo';
import { clock, shortDate } from '@/domain/format';
import { Bars } from '@/ui/charts';
import { Button, Card, Chip, EmptyState, Icon, Screen, Section, StatTile, T, type IconName } from '@/ui/components';
import { LogSessionSheet } from '@/ui/log-session';
import { colors, space } from '@/ui/theme';

const KIND: Record<LogEntry['kind'], { label: string; icon: IconName }> = {
  game: { label: 'Game', icon: 'whistle' },
  practice: { label: 'Practice', icon: 'cone' },
  pickup: { label: 'Pickup', icon: 'account-group' },
  gym: { label: 'Gym', icon: 'dumbbell' },
  physio: { label: 'Physio', icon: 'medical-bag' },
  other: { label: 'Session', icon: 'disc' },
};

/** Monday 00:00 of the week containing `d`. */
function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const hm = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`);

export default function MyLog() {
  const bundle = useData(async (d) => {
    const me = await getMe(d);
    if (!me) return null;
    return { me, log: await personLog(d, me.id), teams: (await myRoles(d, me.id)).map((r) => ({ id: r.team_id, name: r.team_name })) };
  });
  const [logging, setLogging] = useState(false);

  if (bundle === undefined) return <Screen edges={[]}>{null}</Screen>;
  if (!bundle) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="account-question-outline"
          title="Pick yourself first"
          body="Open Me (top right on any tab) and choose who you are."
          action={<Button label="Go to Me" kind="primary" onPress={() => router.replace('/me')} />}
        />
      </Screen>
    );
  }
  const { me, log, teams } = bundle;
  const thisWeek = weekStart(new Date());
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - (7 - i) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const items = log.filter((e) => new Date(e.date) >= start && new Date(e.date) < end);
    return { start, minutes: items.reduce((a, e) => a + e.minutes, 0), count: items.length };
  });
  const now = weeks[weeks.length - 1];
  const loadWeek = log.filter((e) => new Date(e.date) >= thisWeek).reduce((a, e) => a + (e.rpe ? e.rpe * e.minutes : 0), 0);
  const missing = log.filter((e) => e.kind === 'game' && !e.reflected).slice(0, 3);

  return (
    <>
      <Stack.Screen options={{ title: 'My ultimate log' }} />
      <Screen edges={[]}>
        <Section title="This week">
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <StatTile value={now.count} label="Sessions" tone="brand" />
            <StatTile value={hm(now.minutes)} label="Total time" />
            <StatTile value={loadWeek || '–'} label="Load (effort × min)" />
          </View>
        </Section>
        <Button label="Log a session: practice, pickup, gym, physio" icon="plus" kind="primary" onPress={() => setLogging(true)} />
        <T v="small" style={{ textAlign: 'center', marginTop: -4 }}>
          Games you play are logged automatically.
        </T>

        {missing.length ? (
          <Section title="Tell us how these went">
            {missing.map((e) => (
              <Card key={e.key} onPress={() => router.push({ pathname: '/reflect', params: { gameId: e.gameId! } })} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Icon name="comment-question-outline" color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{e.title}</T>
                  <T v="small">{shortDate(e.date)} · about a minute</T>
                </View>
              </Card>
            ))}
          </Section>
        ) : null}

        <Section title="Minutes played · last 8 weeks">
          <Card>
            <Bars rows={weeks.map((w) => ({ label: `${w.start.getDate()}/${w.start.getMonth() + 1}`, value: w.minutes }))} />
          </Card>
        </Section>

        <Section title="Everything">
          {log.length === 0 ? (
            <EmptyState icon="run" title="Nothing logged yet" body="Games you play are added automatically. Log practices, pickups, gym and physio with the button above." />
          ) : (
            log.map((e) => (
              <Card
                key={e.key}
                onPress={() => (e.gameId ? router.push(`/game/${e.gameId}/report`) : router.push({ pathname: '/reflect', params: { sessionId: e.sessionId! } }))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Icon name={KIND[e.kind].icon} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>
                    {e.title}
                  </T>
                  <T v="small">
                    {shortDate(e.date)} · {clock(e.minutes * 60)}
                    {e.rpe ? ` · effort ${e.rpe}/10` : ''}
                  </T>
                </View>
                <Chip label={KIND[e.kind].label} tone="neutral" />
              </Card>
            ))
          )}
        </Section>
        <T v="small">Load = effort (1–10) × minutes. It feeds the fitness dots coaches see when picking lines.</T>
      </Screen>
      <LogSessionSheet visible={logging} onClose={() => setLogging(false)} meId={me.id} teams={teams} />
    </>
  );
}
