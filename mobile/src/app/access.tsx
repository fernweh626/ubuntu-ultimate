import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { useData } from '@/db/live';
import { getAccess, getMe, joinTeam, listTeams, myRoles, setMembershipRole, setTestLevel, type MyRole } from '@/db/repo';
import { grantSummary, LEVEL_LABEL } from '@/domain/permissions';
import { Card, Choice, Icon, Screen, Section, Sheet, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

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

/** What your level lets you do, and (before sign-in) a switch to try other levels on this phone. */
export default function Access() {
  const db = useSQLiteContext();
  const me = useData(getMe);
  const roles = useData(async (d) => (me ? myRoles(d, me.id) : []), [me?.id]) ?? [];
  const access = useData(getAccess);
  const allTeams = useData(listTeams) ?? [];
  const [staffPicker, setStaffPicker] = useState(false);
  if (!me || !access) return <Screen edges={[]}>{null}</Screen>;
  const staffOn = roles.filter((r) => STAFF.includes(r.role));
  const level = access.level;

  return (
    <>
      <Stack.Screen options={{ title: 'Access level' }} />
      <Screen edges={[]}>
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
    </>
  );
}
