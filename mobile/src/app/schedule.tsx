import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { setAvailability } from '@/db/development';
import { dayLabel } from '@/db/home';
import { useData } from '@/db/live';
import { setMeetingRsvp, setPickupRsvp, setRsvp } from '@/db/repo';
import { attended, myPastSchedule, mySchedule, type ScheduleItem } from '@/db/schedule';
import { timeOfDay } from '@/domain/format';
import { AnswerButtons, type Answer } from '@/ui/answer';
import { Button, Card, Chip, Choice, EmptyState, Screen, Section, Segmented, StatTile, T } from '@/ui/components';
import { KindIcon } from '@/ui/kind-icon';
import { colors, font, space } from '@/ui/theme';

const PRACTICE: Record<Answer, string> = { yes: 'going', late: 'late', no: 'not_going' };
const GAME: Record<Answer, string> = { yes: 'available', late: 'late', no: 'unavailable' };
const toAnswer = (s: string | null): Answer | null => (s === 'going' || s === 'available' ? 'yes' : s === 'late' ? 'late' : s === 'not_going' || s === 'unavailable' ? 'no' : null);

/** Your practices, games, hats, meetings and pickups: answer in one tap, see who's coming, check in afterwards. */
export default function Schedule() {
  const db = useSQLiteContext();
  const data = useData((d) => mySchedule(d));
  const [opened] = useState(() => Date.now());
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  if (!data) return <Screen edges={[]}>{null}</Screen>;
  if (tab === 'past')
    return (
      <>
        <Stack.Screen options={{ title: 'My schedule' }} />
        <Screen edges={[]}>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
          <PastSchedule />
        </Screen>
      </>
    );
  const { meId, items, teams } = data;

  const done = items.filter((i) => (i.kind === 'practice' || i.kind === 'game') && Date.parse(i.endAt) < opened && !i.cancelled && i.played && !i.checkedIn && i.gameStatus !== 'scheduled');
  const upcoming = items.filter((i) => Date.parse(i.endAt) >= opened);
  const unanswered = upcoming.filter((i) => !i.status && !i.cancelled && (i.kind === 'practice' || i.gameStatus === 'scheduled')).length;
  const ANSWERS: Record<Answer, 'going' | 'late' | 'not_going'> = { yes: 'going', late: 'late', no: 'not_going' };
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
    else if (it.kind === 'pickup') await setPickupRsvp(db, it.id, it.onDate!, meId, a ? ANSWERS[a] : null, note);
    else if (it.kind === 'meeting') await setMeetingRsvp(db, it.id, meId, a ? ANSWERS[a] : null, note);
    else if (it.kind === 'hat') return;
    else await setAvailability(db, it.id, it.teamId, meId, a ? (GAME[a] as 'available') : null, note);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'My schedule' }} />
      <Screen edges={[]}>
        {meId ? <Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} /> : null}
        {!meId ? (
          <EmptyState icon="calendar-account-outline" title="Nothing to show yet" body="Pick yourself in Me first. Then your team’s practices and games, hats you sign up for, meetings and the pickups you go to all show up here." />
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

            {days.length === 0 ? (
              <EmptyState
                icon="calendar-blank"
                title="Nothing coming up"
                body={teams ? 'When your staff schedule practices or fixtures, they appear here. So do hats you sign up for and pickups you go to.' : 'Join a team, sign up for a hat, or tap “I go here” on a pickup, and it shows up here.'}
                action={<Button label="Find pickup" icon="map-marker-radius" onPress={() => router.push('/hub/pickups')} />}
              />
            ) : null}
            {days.map((d) => (
              <Section key={d.label} title={d.label}>
                {d.items.map((it) => {
                  const live = it.gameStatus === 'live';
                  const canAnswer = !it.cancelled && (it.kind === 'game' ? it.gameStatus === 'scheduled' : it.kind !== 'hat' && Date.parse(it.at) > opened);
                  const href =
                    it.kind === 'practice' ? `/practice/${it.id}` : it.kind === 'hat' ? `/hat/${it.id}` : it.kind === 'meeting' ? `/hub/meeting/${it.id}` : it.kind === 'pickup' ? '/hub/pickups' : live ? `/game/${it.id}/report` : `/game/${it.id}/fixture`;
                  return (
                    <Card
                      key={it.key}
                      onPress={() => router.push(href as never)}
                      style={live ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                        <KindIcon kind={it.kind} />
                        <T style={{ fontFamily: font.display, fontSize: 22, width: 56, textDecorationLine: it.cancelled ? 'line-through' : 'none' }}>{timeOfDay(it.at)}</T>
                        <View style={{ flex: 1 }}>
                          <T v="bodyStrong" style={{ textDecorationLine: it.cancelled ? 'line-through' : 'none' }}>
                            {it.title}
                          </T>
                          <T v="small">{it.place}</T>
                        </View>
                        {it.cancelled ? <Chip label="Cancelled" tone="danger" /> : live ? <Chip label="LIVE" tone="danger" icon="circle" /> : it.kind === 'hat' ? <Chip label={it.status === 'going' ? 'Signed up' : 'Maybe'} tone={it.status === 'going' ? 'brand' : 'warn'} /> : null}
                      </View>
                      {it.cancelled ? null : it.kind === 'hat' ? (
                        <T v="small">{it.coming} signed up · tap for your team, payment and schedule</T>
                      ) : (
                        <T v="small">
                          {it.coming} coming{it.late ? ` (${it.late} late)` : ''}
                          {it.kind === 'practice' || it.kind === 'game' ? ` · ${it.cant} can’t` : ''}
                        </T>
                      )}
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

const WENT: Record<ReturnType<typeof attended>, { label: string; tone: 'brand' | 'neutral' | 'warn' }> = {
  went: { label: 'Went', tone: 'brand' },
  missed: { label: 'Missed', tone: 'neutral' },
  unknown: { label: 'No answer', tone: 'warn' },
};
const KIND_PLURAL: Record<ScheduleItem['kind'], string> = { practice: 'Practices', game: 'Games', pickup: 'Pickups', hat: 'Hats', meeting: 'Meetings' };

/** The last year: what you went to, month by month, with totals at the top. */
function PastSchedule() {
  const data = useData((d) => myPastSchedule(d));
  const [kind, setKind] = useState<'all' | ScheduleItem['kind']>('all');
  if (!data) return null;
  const all = data.items.filter((i) => !i.cancelled);
  const shown = all.filter((i) => kind === 'all' || i.kind === kind);
  const went = (k: ScheduleItem['kind']) => all.filter((i) => i.kind === k && attended(i) === 'went').length;
  const months: { label: string; items: ScheduleItem[] }[] = [];
  for (const it of shown) {
    const label = new Date(it.at).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    const last = months[months.length - 1];
    if (last?.label === label) last.items.push(it);
    else months.push({ label, items: [it] });
  }
  const kinds = (['practice', 'game', 'pickup', 'hat', 'meeting'] as const).filter((k) => all.some((i) => i.kind === k));
  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <StatTile value={went('practice')} label="Practices" />
        <StatTile value={went('game')} label="Games" />
        <StatTile value={went('pickup')} label="Pickups" />
        <StatTile value={went('hat')} label="Hats" />
      </View>
      <T v="small">What you went to in the last 12 months.</T>
      {kinds.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(['all', ...kinds] as const).map((k) => (
            <Choice key={k} label={k === 'all' ? 'All' : KIND_PLURAL[k]} selected={kind === k} onPress={() => setKind(k)} style={{ minHeight: 36, paddingHorizontal: 12 }} />
          ))}
        </View>
      ) : null}
      {months.length === 0 ? <EmptyState icon="history" title="Nothing yet" body="Practices, games, hats and pickups you go to show up here once they’re over." /> : null}
      {months.map((m) => (
        <Section key={m.label} title={m.label}>
          {m.items.map((it) => {
            const w = WENT[attended(it)];
            const href =
              it.kind === 'practice' ? `/practice/${it.id}` : it.kind === 'hat' ? `/hat/${it.id}` : it.kind === 'meeting' ? `/hub/meeting/${it.id}` : it.kind === 'pickup' ? '/hub/pickups' : it.gameStatus === 'final' ? `/game/${it.id}/report` : `/game/${it.id}/fixture`;
            return (
              <Card key={it.key} onPress={() => router.push(href as never)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <KindIcon kind={it.kind} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{it.title}</T>
                    <T v="small">{[dayLabel(it.at), it.place].filter(Boolean).join(' · ')}</T>
                  </View>
                  <Chip label={w.label} tone={w.tone} />
                </View>
              </Card>
            );
          })}
        </Section>
      ))}
    </>
  );
}
