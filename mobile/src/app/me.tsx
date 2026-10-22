import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useData } from '@/db/live';
import { loadFinishedGames, playerTotals } from '@/db/reports';
import {
  getAccess,
  getMe,
  listEvents,
  listFollows,
  listGamesForPerson,
  listPeople,
  joinTeam,
  listTeams,
  personLog,
  myRoles,
  savePerson,
  setFollowing,
  setMeId,
  setMembershipRole,
  setTestLevel,
  type MyRole,
} from '@/db/repo';
import type { Gender } from '@/db/types';
import { displayName } from '@/domain/format';
import { canSetTeamRole, grantSummary, LEVEL_LABEL } from '@/domain/permissions';
import { Button, Card, Chip, Choice, Field, Icon, IconButton, Row, Screen, Section, Segmented, Sheet, StatTile, T, TeamSwatch } from '@/ui/components';
import { Avatar } from '@/ui/photo';
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
  { key: 'admin', title: 'Admin', body: 'Everything. Can make people coordinators, team staff or scorekeepers.' },
  { key: 'coordinator', title: 'Coordinator', body: 'Runs leagues, regionals and nationals. Can make people team staff or scorekeepers.' },
  { key: 'staff', title: 'Team staff', body: 'Captains, coaches, spirit captains, managers: roster, lines, contacts, spirit, confirming who played. Can give staff roles and scorekeeper within their team.' },
  { key: 'scorekeeper', title: 'Scorekeeper', body: 'Starts and scores any game and adds players. Can’t give access to anyone.' },
  { key: 'player', title: 'Player', body: 'Starts friendly games, edits their own details, joins teams. Can’t give access to anyone.' },
] as const;

export default function Me() {
  const db = useSQLiteContext();
  const me = useData(getMe);
  const roles = useData(async (d) => (me ? myRoles(d, me.id) : []), [me?.id]) ?? [];
  const access = useData(getAccess);
  const week = useData(async (d) => {
    if (!me) return null;
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const items = (await personLog(d, me.id)).filter((e) => new Date(e.date) >= monday);
    return { count: items.length, minutes: items.reduce((a, e) => a + e.minutes, 0) };
  }, [me?.id]);
  const following = useData(async (d) => {
    const [follows, teams, events] = await Promise.all([listFollows(d), listTeams(d), listEvents(d)]);
    return follows
      .map((f) =>
        f.kind === 'team'
          ? { ...f, name: teams.find((t) => t.id === f.target_id)?.name, color: teams.find((t) => t.id === f.target_id)?.primary_color ?? null }
          : { ...f, name: events.find((e) => e.id === f.target_id)?.name, color: null },
      )
      .filter((f) => f.name);
  }) ?? [];
  const totals = useData(async (d) => (me ? playerTotals(await loadFinishedGames(d, await listGamesForPerson(d, me.id))).get(me.id) ?? null : null), [me?.id]);
  const [roleFor, setRoleFor] = useState<MyRole | null>(null);
  const [staffPicker, setStaffPicker] = useState(false);
  const allTeams = useData(listTeams) ?? [];

  if (me === undefined) return <Screen edges={[]}>{null}</Screen>;
  if (!me) return <WhoAreYou />;

  const staffOn = roles.filter((r) => STAFF.includes(r.role));
  const level = access?.level ?? 'player';

  return (
    <>
      <Stack.Screen options={{ title: 'Me' }} />
      <Screen edges={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Avatar uri={me.photo_uri} name={`${me.first_name} ${me.last_name}`} size={72} />
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

        <Card onPress={() => router.push('/log')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Icon name="run" color={colors.brand} size={28} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">My ultimate log</T>
            <T v="small">
              {week ? `This week: ${week.count} session${week.count === 1 ? '' : 's'} · ${week.minutes} min` : 'Games, practices and pickups you’ve played'}
            </T>
          </View>
          <Icon name="chevron-right" color={colors.faint} />
        </Card>

        <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
          <Row
            title={access?.signedIn ? 'Account & sync' : 'Go online'}
            subtitle={access?.signedIn ? 'Backed up · syncs automatically' : 'Back up your data and share with your team'}
            left={<Icon name={access?.signedIn ? 'cloud-check-outline' : 'cloud-upload-outline'} color={colors.brand} />}
            onPress={() => router.push('/account')}
          />
          <Row title="Notifications" subtitle="Game reminders, shout-outs, check-ins" left={<Icon name="bell-outline" color={colors.brand} />} onPress={() => router.push('/notifications')} />
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
              <T v="title">{LEVEL_LABEL[level]}</T>
            </View>
            <T v="small">
              {level === 'staff'
                ? `${staffOn.map((r) => `${ROLE_LABEL[r.role]} of ${r.team_name}`).join(', ')}.`
                : level === 'scorekeeper'
                  ? 'You can start any game — league, tournament or friendly — and add players. Captains confirm the rosters afterwards.'
                  : level === 'player'
                    ? 'You can start friendly scrimmages and pickups, update your own details, join teams and see every stat.'
                    : LEVELS.find((l) => l.key === level)!.body}
            </T>
            <T v="small" style={{ color: colors.ink }}>
              {grantSummary(level)}
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
          {!access?.signedIn ? (
            <>
          <T v="label">Try a level on this phone</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {(['player', 'scorekeeper', 'staff', 'coordinator', 'admin'] as const).map((l) => (
              <Choice
                key={l}
                label={LEVEL_LABEL[l]}
                selected={level === l}
                onPress={async () => {
                  if (l === 'staff') return setStaffPicker(true);
                  // Player and scorekeeper rank below team staff, so drop any staff roles to really be them.
                  if (l === 'player' || l === 'scorekeeper') {
                    for (const r of staffOn) await setMembershipRole(db, me.id, r.team_id, 'player');
                  }
                  await setTestLevel(db, l);
                }}
                style={{ paddingHorizontal: 14 }}
              />
            ))}
          </View>
          <T v="small">Team staff makes you captain of a team you pick. In real use, staff roles are given by that team’s staff, a coordinator or an admin.</T>
            </>
          ) : (
            <T v="small">Your level comes from your account. Admins and coordinators give levels from a player’s profile; team staff give team roles from the team page.</T>
          )}
          {!access?.signedIn ? (
          <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
            <T v="smallStrong" style={{ color: colors.warnInk }}>
              Not enforced yet
            </T>
            <T v="small" style={{ color: colors.warnInk }}>
              This app version has no sign-in, so anyone holding this phone can edit anything. When accounts arrive, the server will check these levels on every change, and admins will assign them.
            </T>
          </Card>
          ) : null}
        </Section>

        <Section title="Following">
          {following.length ? (
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
              {following.map((f) => (
                <Row
                  key={`${f.kind}-${f.target_id}`}
                  title={f.name!}
                  subtitle={f.kind === 'team' ? 'Team' : 'Tournament / league'}
                  left={f.kind === 'team' ? <TeamSwatch color={f.color} /> : <Icon name="trophy-outline" />}
                  right={<IconButton icon="star" color={colors.warn} label="Unfollow" onPress={() => setFollowing(db, f.kind, f.target_id, false)} />}
                  onPress={() => router.push(f.kind === 'team' ? `/team/${f.target_id}` : `/event/${f.target_id}`)}
                />
              ))}
            </View>
          ) : (
            <Card onPress={() => router.push('/teams')}>
              <T v="small">Follow teams in any province, and tournaments, to see their results on Home under “For you”.</T>
            </Card>
          )}
        </Section>

        <Button label="Not you? Switch player" kind="ghost" onPress={() => setMeId(db, null)} />
      </Screen>

      <Sheet visible={staffPicker} onClose={() => setStaffPicker(false)} title="Be team staff for…">
        <T v="small">You’ll be captain of this team (and join it if you’re not on it).</T>
        {[...allTeams]
          .sort((a, b) => Number(!roles.some((r) => r.team_id === b.id)) - Number(!roles.some((r) => r.team_id === a.id)) || a.name.localeCompare(b.name))
          .map((t) => (
            <Choice
              key={t.id}
              label={t.name}
              sublabel={roles.some((r) => r.team_id === t.id) ? 'Your team' : undefined}
              dot={t.primary_color ?? undefined}
              onPress={async () => {
                if (!roles.some((r) => r.team_id === t.id)) await joinTeam(db, me.id, t.id, 'core', me.preferred_number);
                await setMembershipRole(db, me.id, t.id, 'captain');
                await setTestLevel(db, 'player');
                setStaffPicker(false);
              }}
              style={{ alignItems: 'flex-start' }}
            />
          ))}
      </Sheet>

      <Sheet visible={!!roleFor} onClose={() => setRoleFor(null)} title={roleFor ? `Your role in ${roleFor.team_name}` : ''}>
        {roleFor && access && canSetTeamRole(access.level, access.staffTeamIds, roleFor.team_id, 'captain') ? (
          (Object.keys(ROLE_LABEL) as MyRole['role'][]).map((r) => (
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
          ))
        ) : (
          <T>You’re {ROLE_LABEL[roleFor?.role ?? 'player'].toLowerCase()} here. Staff roles are given by this team’s captain or coach, a coordinator or an admin.</T>
        )}
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
