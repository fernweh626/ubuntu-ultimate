import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { attendanceFor, setAttendance } from '@/db/development';
import { useData } from '@/db/live';
import { cancelPractice, getAccess, getVenue, practiceDetail, setRsvp, type PracticeAttendee, type RsvpStatus } from '@/db/repo';
import { displayName, shortDate, timeOfDay } from '@/domain/format';
import { Button, Card, Chip, Choice, IconButton, Screen, Section, RichText, Sheet, T } from '@/ui/components';
import { AnswerButtons } from '@/ui/answer';
import { Avatar } from '@/ui/photo';
import { byMatching, MatchingHeader } from '@/ui/roster';
import { colors, font, space } from '@/ui/theme';

const F = colors.female;
const M = colors.male;

export default function Practice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => {
      const detail = await practiceDetail(d, id);
      const venue = detail?.session.venue_id ? await getVenue(d, detail.session.venue_id) : null;
      return {
        detail,
        venue,
        access: await getAccess(d),
        register: await attendanceFor(d, id),
      };
    },
    [id],
  );
  const [opened] = useState(() => Date.now());
  const [registerOpen, setRegisterOpen] = useState(false);
  const [ticks, setTicks] = useState<Set<string>>(new Set());

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  if (!bundle.detail)
    return (
      <Screen edges={[]}>
        <T>This practice was removed.</T>
      </Screen>
    );
  const { session: s, people } = bundle.detail;
  const { access, venue, register } = bundle;
  const hasRegister = register.length > 0;
  const present = register.filter((r) => r.attended).length;
  const staff = access.level === 'admin' || access.level === 'coordinator' || (!!s.team_id && access.staffTeamIds.includes(s.team_id));
  const meId = access.meId;
  const mine = people.find((p) => p.personId === meId);
  const onSquad = !!mine;
  const start = Date.parse(s.started_at);
  const ended = start + s.duration_min * 60_000 < opened;
  const started = start < opened;
  const cancelled = !!s.cancelled_at;

  const going = people.filter((p) => p.status === 'going' || p.status === 'late');
  const notGoing = people.filter((p) => p.status === 'not_going');
  const noReply = people.filter((p) => !p.status);
  const f = going.filter((p) => p.gender === 'W').length;
  const m = going.filter((p) => p.gender === 'M').length;

  async function answer(status: RsvpStatus | null, why: string | null = null) {
    if (!meId) return Alert.alert('Pick yourself first', 'Choose who you are in Me (top right on Home).');
    await setRsvp(db, s.id, meId, status, why);
  }

  // Staff can answer for someone who told them in person or on WhatsApp.
  function markFor(p: PracticeAttendee) {
    Alert.alert(displayName(p), 'Mark their answer', [
      { text: 'Back', style: 'cancel' },
      { text: 'Going', onPress: () => setRsvp(db, s.id, p.personId, 'going') },
      { text: 'Late', onPress: () => setRsvp(db, s.id, p.personId, 'late') },
      {
        text: 'Can’t make it',
        onPress: () => setRsvp(db, s.id, p.personId, 'not_going'),
      },
      ...(p.status
        ? [
            {
              text: 'Clear answer',
              style: 'destructive' as const,
              onPress: () => setRsvp(db, s.id, p.personId, null),
            },
          ]
        : []),
    ]);
  }

  function cancelMenu() {
    if (cancelled) return cancelPractice(db, s.id, false);
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive';
      onPress?: () => void;
    }[] = [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel this one',
        style: 'destructive',
        onPress: () => cancelPractice(db, s.id, true),
      },
    ];
    if (s.series_id)
      buttons.push({
        text: 'Cancel this and later weeks',
        style: 'destructive',
        onPress: () => cancelPractice(db, s.id, true, true),
      });
    Alert.alert('Cancel practice?', 'Everyone on the squad gets told.', buttons);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: s.team_name ? `${s.team_name} practice` : 'Practice',
          headerRight: () =>
            staff && !ended ? (
              <IconButton
                icon="pencil"
                label="Edit practice"
                onPress={() =>
                  router.push({
                    pathname: '/practice/edit',
                    params: { teamId: s.team_id!, id: s.id },
                  })
                }
              />
            ) : null,
        }}
      />
      <Screen edges={[]}>
        <Card
          style={{
            backgroundColor: cancelled ? colors.surface : colors.night,
            borderColor: cancelled ? colors.border : colors.night,
            gap: space.xs,
          }}>
          {cancelled ? <Chip label="Cancelled" tone="danger" /> : null}
          <T
            style={{
              fontFamily: font.display,
              fontSize: 30,
              lineHeight: 32,
              color: cancelled ? colors.faint : '#fff',
              textDecorationLine: cancelled ? 'line-through' : 'none',
            }}>
            {shortDate(s.started_at)} · {timeOfDay(s.started_at)}
          </T>
          <T
            style={{
              fontFamily: font.semibold,
              fontSize: 16,
              color: cancelled ? colors.faint : colors.nightMuted,
            }}>
            {[s.title, `${s.duration_min} min`, s.venue_name].filter(Boolean).join(' · ')}
          </T>
          {s.notes ? (
            <RichText
              style={{
                fontFamily: font.regular,
                fontSize: 15,
                color: cancelled ? colors.faint : '#fff',
              }}>
              {s.notes}
            </RichText>
          ) : null}
          {venue && !cancelled ? (
            <Button
              label="Directions"
              icon="map-marker"
              kind="dark"
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.latitude != null ? `${venue.latitude},${venue.longitude}` : venue.name)}`)}
            />
          ) : null}
        </Card>

        {onSquad && !started && !cancelled ? (
          <Section title="Are you coming?">
            <AnswerButtons
              value={mine?.status === 'going' ? 'yes' : mine?.status === 'late' ? 'late' : mine?.status === 'not_going' ? 'no' : null}
              onAnswer={(a, note) => answer(a === 'yes' ? 'going' : a === 'late' ? 'late' : a === 'no' ? 'not_going' : null, note)}
            />
            {mine?.status !== 'going' && mine?.reason ? <T v="small">Your note: {mine.reason}</T> : null}
          </Section>
        ) : null}

        {staff && started && !cancelled ? (
          <Card>
            <T v="bodyStrong">{hasRegister ? `Register: ${present} here` : 'Take the register'}</T>
            <T v="small">Who actually came. It feeds the attendance ranking and spots no-shows.</T>
            <Button
              label={hasRegister ? 'Edit register' : 'Take register'}
              icon="clipboard-check-outline"
              kind={hasRegister ? 'secondary' : 'primary'}
              onPress={() => {
                setTicks(new Set(hasRegister ? register.filter((r) => r.attended).map((r) => r.person_id) : people.filter((p) => p.status === 'going' || p.status === 'late').map((p) => p.personId)));
                setRegisterOpen(true);
              }}
            />
          </Card>
        ) : null}

        {ended && !cancelled ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {onSquad ? (
              <Button
                label="How was it?"
                icon="comment-question-outline"
                kind="primary"
                onPress={() =>
                  router.push({
                    pathname: '/reflect',
                    params: { sessionId: s.id },
                  })
                }
                style={{ flex: 1 }}
              />
            ) : null}
            {staff && s.team_id ? (
              <Button
                label="Debrief"
                icon="clipboard-text-outline"
                onPress={() =>
                  router.push({
                    pathname: '/debrief',
                    params: { sessionId: s.id, teamId: s.team_id },
                  })
                }
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        ) : null}

        <Section title={`Going · ${going.length}`}>
          {going.length ? (
            <>
              {f + m ? (
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <T style={{ fontFamily: font.bold, color: F }}>{f} female matching</T>
                  <T style={{ fontFamily: font.bold, color: M }}>{m} male matching</T>
                </View>
              ) : null}
              <People list={going} showReason={staff} onPress={staff && !ended ? markFor : undefined} />
            </>
          ) : (
            <T v="small">Nobody yet.</T>
          )}
        </Section>
        {notGoing.length ? (
          <Section title={`Can’t make it · ${notGoing.length}`}>
            <People list={notGoing} showReason={staff} onPress={staff && !ended ? markFor : undefined} />
          </Section>
        ) : null}
        {staff && noReply.length && !ended ? (
          <Section title={`Haven’t said · ${noReply.length}`}>
            <People list={noReply} muted onPress={markFor} />
            <T v="small">They get a reminder the day before. Tap a name to mark their answer if they told you another way.</T>
          </Section>
        ) : null}

        {staff && !ended ? (
          <Button label={cancelled ? 'Un-cancel practice' : 'Cancel practice'} icon={cancelled ? 'undo' : 'cancel'} kind={cancelled ? 'secondary' : 'danger'} onPress={cancelMenu} />
        ) : null}
      </Screen>

      <Sheet visible={registerOpen} onClose={() => setRegisterOpen(false)} title={`Who’s here? · ${ticks.size}`}>
        <T v="small">Started from who said they’re going. Tap to change.</T>
        {byMatching(people).map((g) => (
          <View key={g.key} style={{ gap: 4 }}>
            <MatchingHeader group={g} inline />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {g.items.map((p) => {
                const on = ticks.has(p.personId);
                return (
                  <Choice
                    key={p.personId}
                    label={`${on ? '✓ ' : ''}${displayName(p)}`}
                    selected={on}
                    onPress={() => {
                      const next = new Set(ticks);
                      if (on) next.delete(p.personId);
                      else next.add(p.personId);
                      setTicks(next);
                    }}
                    style={{ minHeight: 44, paddingHorizontal: 12 }}
                  />
                );
              })}
            </View>
          </View>
        ))}
        <Button
          label="Save register"
          kind="primary"
          onPress={async () => {
            await setAttendance(
              db,
              s.id,
              people.map((p) => ({
                personId: p.personId,
                attended: ticks.has(p.personId),
              })),
            );
            setRegisterOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

function People({ list, showReason, muted, onPress }: { list: PracticeAttendee[]; showReason?: boolean; muted?: boolean; onPress?: (p: PracticeAttendee) => void }) {
  return (
    <>
      {byMatching(list).map((g) => (
        <View key={g.key} style={{ gap: 4 }}>
          <MatchingHeader group={g} inline />
          <PeopleChips list={g.items} showReason={showReason} muted={muted} onPress={onPress} />
        </View>
      ))}
    </>
  );
}

function PeopleChips({ list, showReason, muted, onPress }: { list: PracticeAttendee[]; showReason?: boolean; muted?: boolean; onPress?: (p: PracticeAttendee) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {list.map((p) => (
        <Pressable
          key={p.personId}
          disabled={!onPress}
          onPress={() => onPress?.(p)}
          accessibilityRole={onPress ? 'button' : undefined}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 4,
            paddingRight: 10,
            paddingLeft: 4,
            borderRadius: 20,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: muted ? 0.6 : 1,
          }}>
          <Avatar uri={p.photo_uri} name={p.first_name} size={26} />
          <View>
            <T
              v="smallStrong"
              style={{
                color: p.gender === 'W' ? F : p.gender === 'M' ? M : colors.ink,
              }}>
              {displayName(p)}
              {p.status === 'late' ? ' · late' : ''}
            </T>
            {showReason && p.reason ? <T v="small">{p.reason}</T> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
