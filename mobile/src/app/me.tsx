import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useData } from '@/db/live';
import { loadFinishedGames, playerTotals } from '@/db/reports';
import {
  getAccess,
  getHomeRegion,
  getMe,
  listEvents,
  listFollows,
  listGamesForPerson,
  listPeople,
  listTeams,
  personLog,
  myRoles,
  savePerson,
  setFollowing,
  setMeId,
  setMembershipRole,
  type MyRole,
} from '@/db/repo';
import type { Gender } from '@/db/types';
import { displayName, shortDate } from '@/domain/format';
import { canSetTeamRole, LEVEL_LABEL } from '@/domain/permissions';
import { Button, Card, Chip, Choice, Field, Icon, IconButton, Row, Screen, Section, Segmented, Sheet, StatTile, T, TeamSwatch } from '@/ui/components';
import { regionName } from '@/content/hub';
import { getAccreditation } from '@/db/development';
import { ACCREDITATION_LEVELS, accreditationState } from '@/domain/development';
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

const GROUP = { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider } as const;


export default function Me() {
  const db = useSQLiteContext();
  const me = useData(getMe);
  const roles = useData(async (d) => (me ? myRoles(d, me.id) : []), [me?.id]) ?? [];
  const access = useData(getAccess);
  const homeRegion = useData(getHomeRegion);
  const acc = useData(async (d) => (me ? getAccreditation(d, me.id) : null), [me?.id]);
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

  if (me === undefined) return <Screen edges={[]}>{null}</Screen>;
  if (!me) return <WhoAreYou />;

  const level = access?.level ?? 'player';
  const runs = level === 'admin' || level === 'coordinator';
  const accOk = !!acc && accreditationState(acc.expires_on) === 'valid';

  return (
    <>
      <Stack.Screen options={{ title: 'Me' }} />
      <Screen edges={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Avatar uri={me.photo_uri} name={`${me.first_name} ${me.last_name}`} size={72} />
          <View style={{ flex: 1 }}>
            <T v="heading">{displayName(me)}</T>
            <T v="small">{[me.preferred_number ? `#${me.preferred_number}` : null, me.position ? me.position[0].toUpperCase() + me.position.slice(1) : null, roles.map((r) => r.team_name).join(', ') || null].filter(Boolean).join(' · ') || 'Add your number and position'}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <StatTile value={totals?.games ?? 0} label="Games" />
          <StatTile value={totals?.goals ?? 0} label="Goals" />
          <StatTile value={totals?.assists ?? 0} label="Assists" />
          <StatTile value={totals?.intercepts ?? 0} label="Ds" />
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="My stats" icon="chart-box-outline" kind="primary" onPress={() => router.push(`/player/${me.id}`)} style={{ flex: 1 }} />
          <Button label="Edit profile" icon="account-edit-outline" onPress={() => router.push({ pathname: '/player/edit', params: { id: me.id } })} style={{ flex: 1 }} />
        </View>

        <Section title="This week">
          <View style={GROUP}>
            <Row title="My schedule" subtitle="Practices and games: going, late or can’t" left={<Icon name="calendar-check-outline" color={colors.brand} />} onPress={() => router.push('/schedule')} />
            <Row
              title="My ultimate log"
              subtitle={week ? `${week.count} session${week.count === 1 ? '' : 's'} · ${week.minutes} min this week` : 'Games, practices and pickups you’ve played'}
              left={<Icon name="run" color={colors.brand} />}
              onPress={() => router.push('/log')}
            />
          </View>
        </Section>

        <Section title="My teams">
          {roles.length === 0 ? (
            <Card onPress={() => router.push('/teams')}>
              <T v="bodyStrong">Join your team</T>
              <T v="small">Find your club in Teams and tap “Join”. Your games and practices then show up here.</T>
            </Card>
          ) : (
            <View style={GROUP}>
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

        <Section title="Playing">
          <View style={GROUP}>
            <Row
              title="Accreditation"
              subtitle={!acc ? 'Add yours: needed for leagues and nationals' : `${ACCREDITATION_LEVELS[acc.level]}${acc.expires_on ? ` · ${accreditationState(acc.expires_on) === 'expired' ? 'expired' : 'valid until'} ${shortDate(acc.expires_on)}` : ''}`}
              left={<Icon name={accOk ? 'check-decagram' : 'alert-decagram-outline'} color={accOk ? colors.brand : colors.warn} />}
              onPress={() => router.push('/accreditation')}
            />
            <Row title="Membership & fees" subtitle="SAFDA and regional numbers, where to pay" left={<Icon name="card-account-details-outline" color={colors.brand} />} onPress={() => router.push('/registration')} />
            <Row title="My development" subtitle="Self-rating and fitness tests" left={<Icon name="chart-line" color={colors.brand} />} onPress={() => router.push('/development')} />
          </View>
        </Section>

        <Section title="Settings">
          <View style={GROUP}>
            <Row title="Region" subtitle={homeRegion ? regionName(homeRegion) : 'All of SA'} left={<Icon name="map-outline" color={colors.brand} />} onPress={() => router.push('/region')} />
            <Row title="Notifications" subtitle="Reminders, check-ins, news" left={<Icon name="bell-outline" color={colors.brand} />} onPress={() => router.push('/notifications')} />
            <Row
              title={access?.signedIn ? 'Account & sync' : 'Go online'}
              subtitle={access?.signedIn ? 'Backed up · syncs automatically' : 'Back up your data and share with your team'}
              left={<Icon name={access?.signedIn ? 'cloud-check-outline' : 'cloud-upload-outline'} color={colors.brand} />}
              onPress={() => router.push('/account')}
            />
            <Row title="Access level" subtitle={LEVEL_LABEL[level]} left={<Icon name="shield-account-outline" color={colors.brand} />} onPress={() => router.push('/access')} />
          </View>
        </Section>

        {following.length ? (
          <Section title="Following">
            <View style={GROUP}>
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
          </Section>
        ) : null}

        {runs ? (
          <Section title="Admin">
            <View style={GROUP}>
              <Row title="Paid-up lists" subtitle="Upload SAFDA and regional member lists (CSV)" left={<Icon name="file-upload-outline" color={colors.brand} />} onPress={() => router.push('/admin/standing')} />
              <Row title="Forms & payment links" subtitle="Where players register and pay" left={<Icon name="link-variant" color={colors.brand} />} onPress={() => router.push('/admin/links')} />
              {level === 'admin' ? <Row title="Bugs & ideas inbox" subtitle="Reports from players" left={<Icon name="inbox-full-outline" color={colors.brand} />} onPress={() => router.push('/feedback-admin')} /> : null}
            </View>
          </Section>
        ) : null}

        <Section title="Help">
          <View style={GROUP}>
            <Row title="Report a bug or suggest an idea" subtitle="Goes straight to the people building the app" left={<Icon name="lightbulb-on-outline" color={colors.brand} />} onPress={() => router.push('/feedback')} />
          </View>
        </Section>

        <Button label="Not you? Switch player" kind="ghost" onPress={() => setMeId(db, null)} />
      </Screen>

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
        <Button label="Set up step by step (profile, team, region)" icon="map-marker-path" kind="ghost" onPress={() => router.push('/welcome')} />
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
            { value: 'W', label: 'Female matching' },
            { value: 'M', label: 'Male matching' },
            { value: 'X', label: 'Other' },
          ]}
        />
        <Button label="Create and continue" kind="primary" big onPress={create} />
      </Sheet>
    </>
  );
}
