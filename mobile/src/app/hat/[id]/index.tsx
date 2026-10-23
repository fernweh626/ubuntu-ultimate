import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, Switch, TextInput, View } from 'react-native';

import { addLatePlayer, confirmPaid, drawSkill, getHat, hatSignups, hatTeams, mySignup, saveSignup, undoDraw, type Signup } from '@/db/hats';
import { useData } from '@/db/live';
import { getAccess, listGamesForEvent, savePerson } from '@/db/repo';
import { SKILL_FRESH_DAYS } from '@/domain/hat';
import { displayName, shortDate } from '@/domain/format';
import { RATING_SCALE } from '@/domain/development';
import { parseRules } from '@/domain/rules';
import { Button, Card, Chip, Choice, Field, IconButton, Screen, Section, Segmented, Sheet, T, TeamSwatch } from '@/ui/components';
import { GameCard } from '@/ui/game-bits';
import { colors, font, space } from '@/ui/theme';

const F = '#6B2C91';
const M = '#1D3F8F';

export default function HatPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => {
      const access = await getAccess(d);
      const lastRating = access.meId ? await d.getFirstAsync<{ rated_on: string }>(`SELECT rated_on FROM self_rating WHERE person_id = ? ORDER BY rated_on DESC LIMIT 1`, access.meId) : null;
      return {
        hat: await getHat(d, id),
        access,
        mine: access.meId ? await mySignup(d, id, access.meId) : null,
        signups: await hatSignups(d, id),
        teams: await hatTeams(d, id),
        games: await listGamesForEvent(d, id),
        lastRating: lastRating?.rated_on ?? null,
      };
    },
    [id],
  );
  const [opened] = useState(() => Date.now());
  const [late, setLate] = useState(false);
  if (!bundle?.hat) return <Screen edges={[]}>{null}</Screen>;
  const { hat, access, mine, signups, teams, games, lastRating } = bundle;
  const runs = access.level === 'admin' || access.level === 'coordinator';
  const rules = parseRules(hat.rules_json);
  const drawn = hat.hat_status === 'drawn';
  const myTeamId = teams.find((t) => t.person_id === access.meId)?.team_id ?? null;
  const ratingFresh = !!lastRating && (opened - new Date(lastRating).getTime()) / 86400_000 < SKILL_FRESH_DAYS;
  const teamIds = [...new Set(teams.map((t) => t.team_id))];
  const coming = signups.filter((s) => s.attending === 'yes');
  const placed = new Set(teams.map((t) => t.person_id));
  const waiting = signups.filter((s) => s.attending === 'yes' && drawn && !placed.has(s.person_id));

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Hat',
          headerRight: () => (runs ? <IconButton icon="pencil" label="Edit hat" onPress={() => router.push({ pathname: '/hat/edit', params: { id } })} /> : null),
        }}
      />
      <Screen edges={[]}>
        <Card style={{ backgroundColor: colors.night, borderColor: colors.night, gap: space.xs }}>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Chip label="Hat" icon="hat-fedora" tone="dark" />
            <Chip label={`${rules.playersPerSide ?? 7}v${rules.playersPerSide ?? 7} · to ${rules.pointTarget} · ${rules.hardCapMinutes ?? '–'} min`} tone="neutral" />
          </View>
          <T style={{ fontFamily: font.display, fontSize: 30, lineHeight: 32, color: '#fff' }}>{hat.name}</T>
          <T style={{ fontFamily: font.semibold, fontSize: 16, color: colors.nightMuted }}>
            {[hat.start_date ? shortDate(hat.start_date) : null, hat.end_date && hat.end_date !== hat.start_date ? `to ${shortDate(hat.end_date)}` : null, hat.start_time, hat.venue_name ?? hat.location].filter(Boolean).join(' · ')}
          </T>
          {hat.cost ? <T style={{ fontFamily: font.bold, fontSize: 18, color: '#fff' }}>{hat.cost}</T> : null}
          {hat.payment_url ? <Button label="Pay" icon="credit-card-outline" kind="primary" onPress={() => Linking.openURL(hat.payment_url!)} /> : null}
          {hat.details ? <T style={{ color: '#fff' }}>{hat.details}</T> : null}
        </Card>

        {myTeamId ? <MyTeam teamId={myTeamId} rows={teams} meId={access.meId} /> : null}

        {access.meId ? (
          <SignupForm key={mine?.id ?? 'new'} eventId={id} meId={access.meId} mine={mine} drawn={drawn} ratingFresh={ratingFresh} hasPayment={!!hat.payment_url} placed={!!myTeamId} />
        ) : (
          <Card>
            <T v="small">Pick yourself in Me to sign up.</T>
          </Card>
        )}

        {drawn ? (
          <Section title={`Teams · ${teamIds.length}`}>
            {teamIds.map((tid) => {
              const rows = teams.filter((t) => t.team_id === tid);
              return (
                <Card key={tid} style={tid === myTeamId ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <TeamSwatch color={rows[0].color} />
                    <T v="bodyStrong" style={{ flex: 1 }}>
                      {rows[0].name}
                    </T>
                    <T v="small">
                      {rows.filter((r) => r.gender === 'W').length}F · {rows.filter((r) => r.gender === 'M').length}M
                    </T>
                  </View>
                  <T v="small">
                    {rows.map((r) => `${displayName(r)}${r.role === 'captain' ? ' (C)' : ''}`).join(', ')}
                  </T>
                </Card>
              );
            })}
          </Section>
        ) : null}

        {games.length ? (
          <Section title="Schedule">
            {games
              .slice()
              .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
              .map((g) => (
                <GameCard key={g.id} g={g} />
              ))}
          </Section>
        ) : null}

        {runs ? (
          <Section title={`Sign-ups · ${coming.length} coming`}>
            <T v="small">
              {coming.filter((s) => s.gender === 'W').length} female matching · {coming.filter((s) => s.gender === 'M').length} male matching · {coming.filter((s) => s.paid || s.paid_confirmed).length} paid ·{' '}
              {coming.filter((s) => s.wants_captain).length} willing to captain · {signups.filter((s) => s.attending === 'maybe').length} maybe
            </T>
            {!drawn ? <Button label="Draw teams" icon="shuffle-variant" kind="primary" onPress={() => router.push(`/hat/${id}/draw`)} /> : null}
            <Button label="Add an on-the-day player" icon="account-plus-outline" onPress={() => setLate(true)} />
            {waiting.length ? (
              <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
                <T v="bodyStrong">Waiting for a team · {waiting.length}</T>
                {waiting.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <T style={{ flex: 1 }}>{displayName(s)}</T>
                    <Button label="Place" kind="ghost" onPress={() => addLatePlayer(db, id, s.person_id, { paid: !!s.paid, skill: s.skill })} style={{ minHeight: 36, paddingHorizontal: 6 }} />
                  </View>
                ))}
              </Card>
            ) : null}
            {signups.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 6 }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" style={{ color: s.gender === 'W' ? F : s.gender === 'M' ? M : colors.ink }}>
                    {displayName(s)}
                  </T>
                  <T v="small">
                    {[s.attending === 'yes' ? 'Coming' : s.attending === 'maybe' ? 'Maybe' : 'Not coming', `skill ${drawSkill(s).toFixed(1)}`, s.wants_captain ? 'would captain' : null, s.on_the_day ? 'on the day' : null, s.paid && !s.paid_confirmed ? 'says paid' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </T>
                </View>
                <T v="small">Paid</T>
                <Switch value={!!s.paid_confirmed} onValueChange={(v) => void confirmPaid(db, s.id, v)} trackColor={{ true: colors.brand }} />
              </View>
            ))}
            {drawn ? (
              <Button
                label="Undo the draw"
                icon="undo"
                kind="ghost"
                onPress={() =>
                  Alert.alert('Undo the draw?', 'Teams and the schedule are removed, so you can draw again. Only possible before any game starts.', [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Undo', style: 'destructive', onPress: () => undoDraw(db, id).catch((e) => Alert.alert(String(e.message ?? e))) },
                  ])
                }
              />
            ) : null}
          </Section>
        ) : null}
      </Screen>
      <LatePlayerSheet visible={late} onClose={() => setLate(false)} eventId={id} drawn={drawn} />
    </>
  );
}

function MyTeam({ teamId, rows, meId }: { teamId: string; rows: Awaited<ReturnType<typeof hatTeams>>; meId: string | null }) {
  const mine = rows.filter((r) => r.team_id === teamId);
  const captain = mine.find((r) => r.role === 'captain');
  return (
    <Card style={{ borderColor: colors.brand, borderWidth: 2, gap: space.xs }}>
      <T v="label">Your team</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TeamSwatch color={mine[0]?.color ?? null} />
        <T style={{ fontFamily: font.display, fontSize: 26 }}>{mine[0]?.name}</T>
      </View>
      {captain ? <T>Captain: {captain.person_id === meId ? 'you!' : displayName(captain)}</T> : null}
      <T v="small">Wear a {mine[0]?.name.toLowerCase()} shirt if you have one. Team-mates: {mine.filter((r) => r.person_id !== meId).map((r) => displayName(r)).join(', ')}</T>
    </Card>
  );
}

function SignupForm({ eventId, meId, mine, drawn, ratingFresh, hasPayment, placed }: { eventId: string; meId: string; mine: Signup | null; drawn: boolean; ratingFresh: boolean; hasPayment: boolean; placed: boolean }) {
  const db = useSQLiteContext();
  const [attending, setAttending] = useState<Signup['attending']>(mine?.attending ?? 'yes');
  const [captain, setCaptain] = useState(!!mine?.wants_captain);
  const [skill, setSkill] = useState<number | null>(mine?.skill ?? null);
  const [paid, setPaid] = useState(!!mine?.paid);
  const needsSkill = !ratingFresh;

  async function save() {
    if (attending === 'yes' && needsSkill && !skill) return Alert.alert('One more thing', 'Rate yourself 1–5 so the teams come out even.');
    await saveSignup(db, eventId, meId, { attending, wantsCaptain: captain, skill, paid, onTheDay: drawn && !mine });
    Alert.alert(mine ? 'Updated' : 'You’re signed up! 🎩', drawn && !placed ? 'Teams are already drawn: the organiser will put you in a team on the day.' : 'Teams are drawn 48 hours before. You’ll get a notification with your team.');
  }

  return (
    <Section title={mine ? 'Your sign-up' : 'Sign up'}>
      {mine?.paid_confirmed ? <Chip label="Payment confirmed" icon="check" /> : null}
      <Segmented
        value={attending}
        onChange={setAttending}
        options={[
          { value: 'yes', label: 'I’m in' },
          { value: 'maybe', label: 'Maybe' },
          { value: 'no', label: 'Can’t' },
        ]}
      />
      {attending !== 'no' ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">Happy to captain</T>
              <T v="small">The organiser picks captains from those willing.</T>
            </View>
            <Switch value={captain} onValueChange={setCaptain} trackColor={{ true: colors.brand }} />
          </View>
          {needsSkill ? (
            <View style={{ gap: space.xs }}>
              <T v="bodyStrong">How good are you, honestly?</T>
              <T v="small">You haven’t rated yourself in the last 6 months. Quick one for the draw, or do the full self-rating in Me → My development.</T>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {RATING_SCALE.map((label, i) => (
                  <Choice key={label} label={String(i + 1)} selected={skill === i + 1} onPress={() => setSkill(i + 1)} style={{ flex: 1, minHeight: 44, paddingHorizontal: 0 }} />
                ))}
              </View>
              {skill ? <T v="small">{RATING_SCALE[skill - 1]}</T> : null}
            </View>
          ) : (
            <T v="small">Your self-rating is recent, so the draw uses it.</T>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">I’ve paid</T>
              <T v="small">{hasPayment ? 'Pay with the button above first. Only paid players are drawn into teams.' : 'Only paid players are drawn into teams.'}</T>
            </View>
            <Switch value={paid} onValueChange={setPaid} trackColor={{ true: colors.brand }} />
          </View>
        </>
      ) : null}
      <Button label={mine ? 'Update' : 'Sign up'} icon="check" kind="primary" onPress={save} />
    </Section>
  );
}

function LatePlayerSheet({ visible, onClose, eventId, drawn }: { visible: boolean; onClose: () => void; eventId: string; drawn: boolean }) {
  const db = useSQLiteContext();
  const [q, setQ] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [gender, setGender] = useState<'W' | 'M'>('W');
  const [skill, setSkill] = useState(3);
  const people = useData(
    async (d) => (q.trim().length < 2 ? [] : d.getAllAsync<{ id: string; first_name: string; last_name: string; birth_date: string | null }>(`SELECT id, first_name, last_name, birth_date FROM person WHERE deleted_at IS NULL AND (first_name || ' ' || last_name) LIKE ? ORDER BY first_name LIMIT 8`, `%${q.trim()}%`)),
    [q],
  ) ?? [];

  async function add(personId: string) {
    const team = await addLatePlayer(db, eventId, personId, { paid: true, skill });
    onClose();
    Alert.alert('Added', team ? 'They’re in the team that balances best. Nobody else moved.' : 'Signed up: they’ll be in the draw.');
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="On-the-day player">
      <T v="small">{drawn ? 'They go into the team they balance best (by ratio and skill); the teams already drawn stay as they are.' : 'They’ll be included when you draw the teams.'}</T>
      <TextInput value={q} onChangeText={setQ} placeholder="Search players by name" placeholderTextColor={colors.faint} style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 16, color: colors.ink, backgroundColor: colors.surface }} />
      {people.map((p) => (
        <Choice key={p.id} label={displayName(p)} onPress={() => add(p.id)} style={{ minHeight: 40 }} />
      ))}
      <T v="smallStrong">Not in the app? Add them</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="First name" value={first} onChangeText={setFirst} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Surname" value={last} onChangeText={setLast} />
        </View>
      </View>
      <Segmented
        value={gender}
        onChange={setGender}
        options={[
          { value: 'W', label: 'Female matching' },
          { value: 'M', label: 'Male matching' },
        ]}
      />
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Choice key={n} label={`${n}`} selected={skill === n} onPress={() => setSkill(n)} style={{ flex: 1, minHeight: 40, paddingHorizontal: 0 }} />
        ))}
      </View>
      <Button
        label="Add and place"
        kind="primary"
        onPress={async () => {
          if (!first.trim()) return Alert.alert('Add their first name');
          const pid = await savePerson(db, { first_name: first.trim(), last_name: last.trim(), gender });
          setFirst('');
          setLast('');
          await add(pid);
        }}
      />
    </Sheet>
  );
}
