import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { regionName } from '@/content/hub';
import { useData } from '@/db/live';
import { loadFinishedGames, peopleById, teamAggregate } from '@/db/reports';
import { deleteTeam, getAccess, getTeam, listGamesForTeam, roster, savedLines, sessionsForTeam, setMembershipRole, setTeamLogo, shoutoutsForTeam } from '@/db/repo';
import { displayName, pct, round1, shortDate } from '@/domain/format';
import { canSetTeamRole, grantSummary, TEAM_ROLE_LABEL, type TeamRole } from '@/domain/permissions';
import { Button, Card, Chip, Choice, EmptyState, Icon, IconButton, Row, Screen, Section, Sheet, StatTile, T } from '@/ui/components';
import { FollowButton } from '@/ui/follow-button';
import { LogSessionSheet } from '@/ui/log-session';
import { FormDots, GameCard } from '@/ui/game-bits';
import { Avatar, deletePhoto, PhotoSheet, TeamLogo } from '@/ui/photo';
import { colors, space } from '@/ui/theme';

const KIND_LABEL = { core: 'Core', guest: 'Guest', mercenary: 'Mercenary' } as const;
const POS = { handler: 'Handler', cutter: 'Cutter', hybrid: 'Hybrid' } as const;

function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('0') ? `27${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export default function TeamPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const team = useData((d) => getTeam(d, id), [id]);
  const players = useData((d) => roster(d, id), [id]);
  const access = useData(getAccess);
  const [rolesSheet, setRolesSheet] = useState(false);
  const [rolePerson, setRolePerson] = useState<string | null>(null);
  const lines = useData((d) => savedLines(d, id), [id]);
  const games = useData((d) => listGamesForTeam(d, id), [id]);
  const loaded = useData(async (d) => loadFinishedGames(d, await listGamesForTeam(d, id)), [id]);
  const [logoSheet, setLogoSheet] = useState(false);
  const [logging, setLogging] = useState(false);
  const practices = useData((d) => sessionsForTeam(d, id), [id]) ?? [];
  const shouts = useData(async (d) => {
    const rows = await shoutoutsForTeam(d, id, 8);
    return { rows, people: await peopleById(d, rows.flatMap((r) => [r.from_person_id, r.to_person_id])) };
  }, [id]);

  if (!team) return <Screen edges={[]}>{null}</Screen>;
  const agg = loaded ? teamAggregate(id, loaded) : null;
  const canManage = !!access && canSetTeamRole(access.level, access.staffTeamIds, id, 'captain');
  const canDelete = !!access && (access.level === 'admin' || access.level === 'coordinator');
  const isStaffHere = !!access && (access.level === 'admin' || access.staffTeamIds.includes(id));
  const onSquad = !!access?.meId && !!players?.some((p) => p.id === access.meId);
  const hasContact = team.contact_name || team.contact_phone || team.contact_email || team.website || team.social;

  function remove() {
    Alert.alert(`Delete ${team!.name}?`, 'Games already played keep their records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTeam(db, id);
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (canManage ? (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="pencil" label="Edit team" onPress={() => router.push({ pathname: '/team/edit', params: { id } })} />
              {canDelete ? <IconButton icon="delete-outline" label="Delete team" onPress={remove} color={colors.danger} /> : null}
            </View>
          ) : null),
        }}
      />
      <Screen edges={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Pressable accessibilityRole="button" accessibilityLabel={team.logo_uri ? 'Change logo' : 'Add a logo'} disabled={!canManage} onPress={() => setLogoSheet(true)}>
            <TeamLogo uri={team.logo_uri} color={team.primary_color} size={56} />
            {!team.logo_uri && canManage ? (
              <View style={{ position: 'absolute', right: -4, bottom: -4, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                <Icon name="camera-plus-outline" size={16} />
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            <T v="heading">{team.name}</T>
            <T v="small">{[team.city, team.region ? regionName(team.region) : null].filter(Boolean).join(' · ')}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Chip label={team.kind} tone="neutral" />
          {team.short_name ? <Chip label={team.short_name} tone="neutral" /> : null}
          {team.is_sample ? <Chip label="Sample team" tone="warn" /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <FollowButton kind="team" id={id} />
          {agg && agg.games ? <Button label="Team report" icon="chart-box-outline" onPress={() => router.push({ pathname: '/team/report', params: { id } })} /> : null}
        </View>
        {team.about ? <T v="small">{team.about}</T> : null}

        <Section title="Contact">
          {hasContact ? (
            <Card>
              {team.contact_name ? <T v="bodyStrong">{team.contact_name}</T> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {team.contact_phone ? (
                  <>
                    <Button label="WhatsApp" icon="whatsapp" kind="primary" onPress={() => Linking.openURL(whatsappUrl(team.contact_phone!))} />
                    <Button label="Call" icon="phone" onPress={() => Linking.openURL(`tel:${team.contact_phone}`)} />
                  </>
                ) : null}
                {team.contact_email ? <Button label="Email" icon="email-outline" onPress={() => Linking.openURL(`mailto:${team.contact_email}`)} /> : null}
                {team.website ? <Button label="Website" icon="web" onPress={() => Linking.openURL(team.website!)} /> : null}
                {team.social ? <Button label="Social" icon="instagram" onPress={() => Linking.openURL(team.social!)} /> : null}
              </View>
            </Card>
          ) : (
            <Card onPress={canManage ? () => router.push({ pathname: '/team/edit', params: { id } }) : undefined}>
              <T v="small">{canManage ? 'No contact details yet. Tap to add who to contact and how.' : 'No contact details yet.'}</T>
            </Card>
          )}
        </Section>

        <Section
          title="Season so far"
          action={
            agg && agg.games ? (
              <Button label="Full report" kind="ghost" onPress={() => router.push({ pathname: '/team/report', params: { id } })} style={{ minHeight: 32, paddingHorizontal: 0 }} />
            ) : undefined
          }>
          {agg && agg.games ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T v="title">
                  {agg.wins}–{agg.losses}
                  {agg.draws ? `–${agg.draws}` : ''}
                </T>
                <FormDots form={agg.form} />
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <StatTile value={pct(agg.holds, agg.oPoints)} label="Hold rate" />
                <StatTile value={pct(agg.breaks, agg.dPoints)} label="Break rate" />
                <StatTile value={agg.pointsPlayed ? round1(agg.turnovers / agg.pointsPlayed) : '–'} label="Turns / point" />
              </View>
            </Card>
          ) : (
            <Card>
              <T v="small">Stats appear once this team finishes a scored game.</T>
            </Card>
          )}
        </Section>

        <Section
          title={`Roster · ${players?.length ?? 0}`}
          action={
            canManage ? (
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <Button label="Roles" icon="shield-account-outline" kind="ghost" onPress={() => setRolesSheet(true)} style={{ minHeight: 32, paddingHorizontal: 0 }} />
                <Button label="Add" icon="account-plus" kind="ghost" onPress={() => router.push({ pathname: '/player/edit', params: { teamId: id } })} style={{ minHeight: 32, paddingHorizontal: 0 }} />
              </View>
            ) : undefined
          }>
          {players && players.length ? (
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
              {players.map((p) => (
                <Row
                  key={p.id}
                  title={`${displayName(p)}${p.jersey_number ? `  #${p.jersey_number}` : ''}`}
                  subtitle={[p.gender === 'W' ? 'Woman' : p.gender === 'M' ? 'Man' : null, p.position ? POS[p.position] : null].filter(Boolean).join(' · ')}
                  right={
                    p.role !== 'player' ? (
                      <Chip label={TEAM_ROLE_LABEL[p.role]} />
                    ) : p.membership_kind !== 'core' ? (
                      <Chip label={KIND_LABEL[p.membership_kind]} tone="warn" />
                    ) : undefined
                  }
                  left={<Avatar uri={p.photo_uri} name={displayName(p)} size={36} tone="tint" />}
                  onPress={() => router.push(`/player/${p.id}`)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="account-multiple-plus-outline"
              title="No players yet"
              action={canManage ? <Button label="Add player" icon="account-plus" kind="primary" onPress={() => router.push({ pathname: '/player/edit', params: { teamId: id } })} /> : undefined}
            />
          )}
        </Section>

        <Section
          title="Saved lines"
          action={canManage ? <Button label="New line" icon="plus" kind="ghost" onPress={() => router.push({ pathname: '/team/line-edit', params: { teamId: id } })} style={{ minHeight: 32, paddingHorizontal: 0 }} /> : undefined}>
          {lines && lines.length ? (
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
              {lines.map((l) => (
                <Row
                  key={l.id}
                  title={l.name}
                  subtitle={`${l.member_ids.length} players${l.side !== 'any' ? ` · ${l.side === 'O' ? 'Offence' : 'Defence'}` : ''}`}
                  onPress={() => router.push({ pathname: '/team/line-edit', params: { teamId: id, id: l.id } })}
                />
              ))}
            </View>
          ) : (
            <Card>
              <T v="small">Save lines like “Super O” or “Zone D” to load them with one tap during games.</T>
            </Card>
          )}
        </Section>

        {onSquad || isStaffHere ? (
          <Section
            title="Practices"
            action={isStaffHere && access?.meId ? <Button label="Log a practice" icon="plus" kind="ghost" onPress={() => setLogging(true)} style={{ minHeight: 32, paddingHorizontal: 0 }} /> : undefined}>
            {practices.length ? (
              practices.slice(0, 5).map((pr) => (
                <Card key={pr.id}>
                  <T v="bodyStrong">{pr.title || 'Practice'}</T>
                  <T v="small">
                    {shortDate(pr.started_at)} · {pr.duration_min} min
                  </T>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    {onSquad ? <Button label="How was it?" icon="comment-question-outline" onPress={() => router.push({ pathname: '/reflect', params: { sessionId: pr.id } })} style={{ flex: 1 }} /> : null}
                    {isStaffHere ? <Button label="Debrief" icon="clipboard-text-outline" onPress={() => router.push({ pathname: '/debrief', params: { sessionId: pr.id, teamId: id } })} style={{ flex: 1 }} /> : null}
                  </View>
                </Card>
              ))
            ) : (
              <Card>
                <T v="small">{isStaffHere ? 'Log a practice and the squad can tell you how it went.' : 'No practices logged yet.'}</T>
              </Card>
            )}
          </Section>
        ) : null}

        {(onSquad || isStaffHere) && shouts?.rows.length ? (
          <Section title="Shout-outs">
            {shouts.rows.map((so) => (
              <Card key={so.id}>
                <T v="bodyStrong">
                  🙌 {shouts.people.get(so.to_person_id) ? displayName(shouts.people.get(so.to_person_id)!) : 'Someone'}
                </T>
                {so.reason ? <T>“{so.reason}”</T> : null}
                <T v="small">
                  from {shouts.people.get(so.from_person_id) ? displayName(shouts.people.get(so.from_person_id)!) : 'a teammate'} · {shortDate(so.created_at)}
                </T>
              </Card>
            ))}
            <T v="small">Only this squad sees shout-outs.</T>
          </Section>
        ) : null}

        <Section title="Games">
          {games && games.length ? games.slice(0, 10).map((g) => <GameCard key={g.id} g={g} />) : <T v="small">No games yet.</T>}
        </Section>
      </Screen>
      <Sheet
        visible={rolesSheet}
        onClose={() => {
          setRolesSheet(false);
          setRolePerson(null);
        }}
        title={rolePerson ? `Role for ${displayName(players?.find((p) => p.id === rolePerson) ?? { first_name: '', last_name: '', birth_date: null })}` : 'Team roles'}>
        {rolePerson ? (
          <>
            {(Object.keys(TEAM_ROLE_LABEL) as TeamRole[])
              .filter((r) => access && canSetTeamRole(access.level, access.staffTeamIds, id, r))
              .map((r) => (
                <Choice
                  key={r}
                  label={TEAM_ROLE_LABEL[r]}
                  selected={players?.find((p) => p.id === rolePerson)?.role === r}
                  onPress={async () => {
                    await setMembershipRole(db, rolePerson, id, r);
                    setRolePerson(null);
                  }}
                  style={{ alignItems: 'flex-start' }}
                />
              ))}
            <Button label="Back" kind="ghost" onPress={() => setRolePerson(null)} />
          </>
        ) : (
          <>
            <T v="small">{access ? grantSummary(access.level) : ''}</T>
            {(players ?? []).map((p) => (
              <Choice key={p.id} label={displayName(p)} sublabel={TEAM_ROLE_LABEL[p.role]} onPress={() => setRolePerson(p.id)} style={{ alignItems: 'flex-start' }} />
            ))}
          </>
        )}
      </Sheet>
      {access?.meId ? (
        <LogSessionSheet visible={logging} onClose={() => setLogging(false)} meId={access.meId} teams={[{ id, name: team.name }]} fixedTeamId={id} />
      ) : null}
      <PhotoSheet
        visible={logoSheet}
        onClose={() => setLogoSheet(false)}
        title="Team logo"
        hasPhoto={!!team.logo_uri}
        fileName={`team-${id}`}
        onPicked={async (uri) => {
          deletePhoto(team.logo_uri);
          await setTeamLogo(db, id, uri);
        }}
        onRemove={async () => {
          deletePhoto(team.logo_uri);
          await setTeamLogo(db, id, null);
        }}
      />
    </>
  );
}
