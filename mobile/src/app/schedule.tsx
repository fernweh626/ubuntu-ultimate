import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { setAvailability } from '@/db/development';
import { dayLabel } from '@/db/home';
import { useData } from '@/db/live';
import { setRsvp } from '@/db/repo';
import { mySchedule, type ScheduleItem } from '@/db/schedule';
import { timeOfDay } from '@/domain/format';
import { AnswerButtons, type Answer } from '@/ui/answer';
import { Button, Card, Chip, EmptyState, Screen, Section, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

const PRACTICE: Record<Answer, string> = { yes: 'going', late: 'late', no: 'not_going' };
const GAME: Record<Answer, string> = { yes: 'available', late: 'late', no: 'unavailable' };
const toAnswer = (s: string | null): Answer | null => (s === 'going' || s === 'available' ? 'yes' : s === 'late' ? 'late' : s === 'not_going' || s === 'unavailable' ? 'no' : null);

/** Your practices and games: answer in one tap, see who's coming, do the check-in afterwards. */
export default function Schedule() {
  const db = useSQLiteContext();
  const data = useData((d) => mySchedule(d));
  const [opened] = useState(() => Date.now());
  if (!data) return <Screen edges={[]}>{null}</Screen>;
  const { meId, items, teams } = data;

  const done = items.filter((i) => Date.parse(i.endAt) < opened && !i.cancelled && i.played && !i.checkedIn && i.gameStatus !== 'scheduled');
  const upcoming = items.filter((i) => Date.parse(i.endAt) >= opened);
  const unanswered = upcoming.filter((i) => !i.status && !i.cancelled && (i.kind === 'practice' || i.gameStatus === 'scheduled')).length;
  const days: { label: string; items: ScheduleItem[] }[] = [];
  for (const it of upcoming) {
    const label = dayLabel(it.at);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(it);
    else days.push({ label, items: [it] });
  }

  async function answer(it: ScheduleItem, a: Answer | null, note: string | null) {
    if (!meId) return;
    if (it.kind === 'practice') await setRsvp(db, it.id, meId, a ? (PRACTICE[a] as 'going') : null, note);
    else await setAvailability(db, it.id, it.teamId, meId, a ? (GAME[a] as 'available') : null, note);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'My schedule' }} />
      <Screen edges={[]}>
        {!meId || !teams ? (
          <EmptyState icon="calendar-account-outline" title="Nothing to show yet" body="Pick yourself in Me and join a team: its practices and games show up here." />
        ) : (
          <>
            {unanswered ? (
              <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
                <T v="bodyStrong" style={{ color: colors.warnInk }}>
                  {unanswered} still need{unanswered === 1 ? 's' : ''} your answer
                </T>
                <T v="small" style={{ color: colors.warnInk }}>
                  One tap each. Your captains plan lines and lifts around it.
                </T>
              </Card>
            ) : null}

            {done.length ? (
              <Section title="How did it go?">
                {done.map((it) => (
                  <Card key={it.key}>
                    <T v="bodyStrong">{it.title}</T>
                    <T v="small">{dayLabel(it.at)} · a minute for your coaches</T>
                    <Button
                      label="Check in"
                      icon="comment-question-outline"
                      kind="primary"
                      onPress={() => router.push({ pathname: '/reflect', params: it.kind === 'practice' ? { sessionId: it.id } : { gameId: it.id } })}
                    />
                  </Card>
                ))}
              </Section>
            ) : null}

            {days.length === 0 ? <EmptyState icon="calendar-blank" title="Nothing coming up" body="When your staff schedule practices or fixtures, they appear here." /> : null}
            {days.map((d) => (
              <Section key={d.label} title={d.label}>
                {d.items.map((it) => {
                  const live = it.gameStatus === 'live';
                  const canAnswer = !it.cancelled && (it.kind === 'practice' ? Date.parse(it.at) > opened : it.gameStatus === 'scheduled');
                  return (
                    <Card
                      key={it.key}
                      onPress={() => router.push(it.kind === 'practice' ? `/practice/${it.id}` : live ? `/game/${it.id}/report` : `/game/${it.id}/fixture`)}
                      style={live ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                        <T style={{ fontFamily: font.display, fontSize: 22, width: 56, textDecorationLine: it.cancelled ? 'line-through' : 'none' }}>{timeOfDay(it.at)}</T>
                        <View style={{ flex: 1 }}>
                          <T v="bodyStrong" style={{ textDecorationLine: it.cancelled ? 'line-through' : 'none' }}>
                            {it.title}
                          </T>
                          <T v="small">{[it.kind === 'game' ? 'Game' : null, it.place].filter(Boolean).join(' · ')}</T>
                        </View>
                        {it.cancelled ? <Chip label="Cancelled" tone="danger" /> : live ? <Chip label="LIVE" tone="danger" icon="circle" /> : null}
                      </View>
                      {!it.cancelled ? (
                        <T v="small">
                          {it.coming} coming{it.late ? ` (${it.late} late)` : ''} · {it.cant} can’t
                        </T>
                      ) : null}
                      {canAnswer ? (
                        <AnswerButtons
                          compact
                          yesLabel={it.kind === 'game' ? 'I’ll play' : 'Going'}
                          noLabel={it.kind === 'game' ? 'Can’t play' : 'Can’t make it'}
                          value={toAnswer(it.status)}
                          onAnswer={(a, note) => answer(it, a, note)}
                        />
                      ) : null}
                    </Card>
                  );
                })}
              </Section>
            ))}
          </>
        )}
      </Screen>
    </>
  );
}
