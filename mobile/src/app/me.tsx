import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useData } from '@/db/live';
import { loadFinishedGames, playerTotals } from '@/db/reports';
import { getMe, listGamesForPerson, listPeople, myRoles, savePerson, setMeId, setMembershipRole, type MyRole } from '@/db/repo';
import type { Gender } from '@/db/types';
import { displayName, initials } from '@/domain/format';
import { Button, Card, Chip, Choice, Field, Icon, Row, Screen, Section, Segmented, Sheet, StatTile, T, TeamSwatch } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

const ROLE_LABEL: Record<MyRole['role'], string> = {
  player: 'Player',
  captain: 'Captain',
  coach: 'Coach',
  spirit_captain: 'Spirit captain',
  manager: 'Team manager',
};
const STAFF: MyRole['role'][] = ['captain', 'coach', 'spirit_captain', 'manager'];

const LEVELS = [
  { key: 'admin', title: 'Admin', body: 'Assigns roles to everyone. Can merge duplicate players.' },
  { key: 'coordinator', title: 'Coordinator', body: 'Runs leagues, regionals and nationals: events, schedules, results.' },
  { key: 'staff', title: 'Team staff', body: 'Captains, coaches, spirit captains, managers: roster, lines, contacts, spirit scores.' },
  { key: 'scorekeeper', title: 'Scorekeeper', body: 'Scores the games they are given.' },
  { key: 'player', title: 'Player', body: 'Edits their own details, joins teams, sees all stats.' },
] as const;

export default function Me() {
  const db = useSQLiteContext();
  const me = useData(getMe);
  const roles = useData(async (d) => (me ? myRoles(d, me.id) : []), [me?.id]) ?? [];
  const totals = useData(async (d) => (me ? playerTotals(await loadFinishedGames(d, await listGamesForPerson(d, me.id))).get(me.id) ?? null : null), [me?.id]);
  const [roleFor, setRoleFor] = useState<MyRole | null>(null);

  if (me === undefined) return <Screen edges={[]}>{null}</Screen>;
  if (!me) return <WhoAreYou />;

  const staffOn = roles.filter((r) => STAFF.includes(r.role));
  const level = staffOn.length ? 'staff' : 'player';

  return (
    <>
      <Stack.Screen options={{ title: 'Me' }} />
      <Screen edges={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <T style={{ fontFamily: font.bold, fontSize: 26, color: '#fff' }}>{initials(`${me.first_name} ${me.last_name}`)}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T v="heading">{displayName(me)}</T>
            <T v="small">{[me.preferred_number ? `#${me.preferred_number}` : null, me.position ? me.position[0].toUpperCase() + me.position.slice(1) : null].filter(Boolean).join(' · ') || 'Add your number and position'}</T>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <StatTile value={totals?.games ?? 0} label="Games" />
          <StatTile value={totals?.goals ?? 0} label="Goals" />
          <StatTile value={totals?.assists ?? 0} label="Assists" />
          <StatTile value={totals?.intercepts ?? 0} label="Intercepts" />
        </View>

        <View style={{ gap: space.sm }}>
          <Button label="My stats & games" icon="chart-box-outline" kind="primary" onPress={() => router.push(`/player/${me.id}`)} />
          <Button label="Update my details" icon="account-edit-outline" onPress={() => router.push({ pathname: '/player/edit', params: { id: me.id } })} />
        </View>

        <Section title="My teams">
          {roles.length === 0 ? (
            <Card>
              <T v="small">You’re not on a team yet. Open your stats page and tap “Join a team”.</T>
            </Card>
          ) : (
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
              {roles.map((r) => (
                <Row
                  key={r.team_id}
                  title={r.team_name}
                  subtitle={r.kind === 'core' ? 'Core member' : r.kind === 'guest' ? 'Guest' : 'Mercenary'}
                  left={<TeamSwatch color={r.primary_color} />}
                  right={<Chip label={ROLE_LABEL[r.role]} tone={STAFF.includes(r.role) ? 'brand' : 'neutral'} />}
                  onPress={() => setRoleFor(r)}
                />
              ))}
            </View>
          )}
        </Section>

        <Section title="My access level">
          <Card style={{ borderColor: colors.brand, borderWidth: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name="shield-account-outline" color={colors.brand} />
              <T v="title">{level === 'staff' ? 'Team staff' : 'Player'}</T>
            </View>
            <T v="small">
              {level === 'staff'
                ? `${staffOn.map((r) => `${ROLE_LABEL[r.role]} of ${r.team_name}`).join(', ')}.`
                : 'You can update your own details, join teams and see every stat.'}
            </T>
          </Card>
          <View style={{ gap: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.divider }}>
            {LEVELS.map((l) => {
              const mine = l.key === level;
              return (
                <View key={l.key} style={{ flexDirection: 'row', gap: space.md, padding: space.md, backgroundColor: mine ? colors.brandTint : colors.surface }}>
                  <Icon name={mine ? 'check-circle' : 'circle-outline'} color={mine ? colors.brand : colors.faint} size={20} />
                  <View style={{ flex: 1 }}>
                    <T v="smallStrong">{l.title}</T>
                    <T v="small">{l.body}</T>
                  </View>
                </View>
              );
            })}
          </View>
          <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
            <T v="smallStrong" style={{ color: colors.warnInk }}>
              Not enforced yet
            </T>
            <T v="small" style={{ color: colors.warnInk }}>
              This app version has no sign-in, so anyone holding this phone can edit anything. When accounts arrive, the server will check these levels on every change, and admins will assign them.
            </T>
          </Card>
        </Section>

        <Button label="Not you? Switch player" kind="ghost" onPress={() => setMeId(db, null)} />
      </Screen>

      <Sheet visible={!!roleFor} onClose={() => setRoleFor(null)} title={roleFor ? `Your role in ${roleFor.team_name}` : ''}>
        {(Object.keys(ROLE_LABEL) as MyRole['role'][]).map((r) => (
          <Choice
            key={r}
            label={ROLE_LABEL[r]}
            selected={roleFor?.role === r}
            onPress={async () => {
              await setMembershipRole(db, me.id, roleFor!.team_id, r);
              setRoleFor(null);
            }}
            style={{ alignItems: 'flex-start' }}
          />
        ))}
        <T v="small">For trying things out. With accounts, only admins and team staff can give someone a staff role.</T>
        <Button label="Open team page" kind="ghost" onPress={() => { const t = roleFor!.team_id; setRoleFor(null); router.push(`/team/${t}`); }} />
      </Sheet>
    </>
  );
}

function WhoAreYou() {
  const db = useSQLiteContext();
  const people = useData(listPeople) ?? [];
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [gender, setGender] = useState<Gender>('W');

  const s = q.trim().toLowerCase();
  const matches = s
    ? people.filter((p) => `${p.first_name} ${p.last_name} ${p.nickname ?? ''} ${p.preferred_number ?? ''}`.toLowerCase().includes(s))
    : [];

  async function create() {
    if (!first.trim()) return;
    const id = await savePerson(db, { first_name: first, last_name: last, gender });
    await setMeId(db, id);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Who are you?' }} />
      <Screen edges={[]}>
        <T>Find yourself so this button takes you straight to your stats, details and teams.</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
          <Icon name="magnify" color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Your name or number"
            placeholderTextColor={colors.faint}
            style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }}
          />
        </View>
        {matches.length ? (
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
            {matches.slice(0, 20).map((p) => (
              <Row key={p.id} title={displayName(p)} subtitle={p.preferred_number ? `#${p.preferred_number}` : undefined} onPress={() => setMeId(db, p.id)} />
            ))}
          </View>
        ) : s ? (
          <T v="small">Nobody by that name yet.</T>
        ) : null}
        <Button label="I’m not listed — create my profile" icon="account-plus" onPress={() => setAdding(true)} />
      </Screen>
      <Sheet visible={adding} onClose={() => setAdding(false)} title="Create my profile">
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="First name" value={first} onChangeText={setFirst} autoFocus />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last name" value={last} onChangeText={setLast} />
          </View>
        </View>
        <Segmented
          value={gender}
          onChange={setGender}
          options={[
            { value: 'W', label: 'Woman' },
            { value: 'M', label: 'Man' },
            { value: 'X', label: 'Other' },
          ]}
        />
        <Button label="Create and continue" kind="primary" big onPress={create} />
      </Sheet>
    </>
  );
}
