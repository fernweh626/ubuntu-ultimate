import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { regionName } from '@/content/hub';
import { addClubStaff, clubSquad, clubStaff, clubTeams, getClub, removeClubStaff } from '@/db/clubs';
import { useData } from '@/db/live';
import { getAccess, listGames } from '@/db/repo';
import { divisionName } from '@/domain/divisions';
import { displayName } from '@/domain/format';
import { whatsappLink } from '@/domain/standing';
import { Button, Card, Chip, Choice, EmptyState, IconButton, Row, Screen, Section, Sheet, T, RichText } from '@/ui/components';
import { GameCard } from '@/ui/game-bits';
import { BankingCard } from '@/ui/banking';
import { colors, font, space } from '@/ui/theme';

/** A club: its teams side by side, everyone across them, upcoming games and club staff. */
export default function ClubPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => {
      const club = await getClub(d, id);
      if (!club) return null;
      const teams = await clubTeams(d, id);
      const ids = new Set(teams.map((t) => t.id));
      const games = (await listGames(d)).filter((g) => ids.has(g.team_a_id) || ids.has(g.team_b_id));
      return { club, teams, games, squad: await clubSquad(d, id), staff: await clubStaff(d, id), access: await getAccess(d) };
    },
    [id],
  );
  const [addingStaff, setAddingStaff] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [opened] = useState(() => Date.now());
  if (bundle === undefined) return <Screen edges={[]}>{null}</Screen>;
  if (!bundle) return <Screen edges={[]}><EmptyState icon="shield-off-outline" title="Club not found" /></Screen>;
  const { club, teams, games, squad, staff, access } = bundle;
  const isAdmin = access.level === 'admin' || access.level === 'coordinator' || staff.some((s) => s.person_id === access.meId);
  const upcoming = games.filter((g) => g.status === 'scheduled' && g.scheduled_at && Date.parse(g.scheduled_at) > opened - 3 * 3600_000).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const live = games.filter((g) => g.status === 'live');
  const recent = games.filter((g) => g.status === 'final').slice(0, 3);
  const record = (teamId: string) => {
    const fin = games.filter((g) => g.status === 'final' && (g.team_a_id === teamId || g.team_b_id === teamId));
    const w = fin.filter((g) => (g.team_a_id === teamId ? g.score_a > g.score_b : g.score_b > g.score_a)).length;
    return fin.length ? `${w}–${fin.length - w}` : null;
  };
  const wa = whatsappLink(club.contact_phone);

  return (
    <>
      <Stack.Screen
        options={{
          title: club.short_name ?? club.name,
          headerRight: () => (isAdmin ? <IconButton icon="pencil" label="Edit club" onPress={() => router.push({ pathname: '/club/edit', params: { id } })} /> : null),
        }}
      />
      <Screen edges={[]}>
        <Card style={{ backgroundColor: club.primary_color ?? colors.night, borderColor: 'transparent', gap: space.xs }}>
          <T style={{ fontFamily: font.display, fontSize: 32, lineHeight: 34, color: '#fff', textTransform: 'uppercase' }}>{club.name}</T>
          <T style={{ color: 'rgba(255,255,255,0.85)', fontFamily: font.semibold }}>
            {[club.city, club.region ? regionName(club.region) : null, `${teams.length} team${teams.length === 1 ? '' : 's'}`, `${squad.length} players`].filter(Boolean).join(' · ')}
          </T>
          {club.about ? <RichText style={{ color: '#fff' }}>{club.about}</RichText> : null}
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {wa ? <Button label="WhatsApp" icon="whatsapp" kind="dark" onPress={() => Linking.openURL(wa)} /> : null}
            {club.website ? <Button label="Website" icon="web" kind="dark" onPress={() => Linking.openURL(club.website!)} /> : null}
          </View>
        </Card>

        <Section
          title="Teams"
          action={isAdmin ? <Button label="Add team" icon="plus" kind="ghost" onPress={() => router.push({ pathname: '/team/edit', params: { clubId: id } })} style={{ minHeight: 32, paddingHorizontal: 0 }} /> : undefined}>
          {teams.length ? (
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
              {teams.map((t) => (
                <Row
                  key={t.id}
                  title={t.name}
                  subtitle={[divisionName(t.division) || null, `${t.players} players`, record(t.id) ? `${record(t.id)} this season` : null].filter(Boolean).join(' · ')}
                  left={<View style={{ width: 10, height: 36, borderRadius: 5, backgroundColor: t.primary_color ?? colors.faint }} />}
                  onPress={() => router.push(`/team/${t.id}`)}
                />
              ))}
            </View>
          ) : (
            <Card>
              <T v="small">{isAdmin ? 'Add the club’s teams: Mixed, Open, Women’s, juniors… Existing teams can join from their own edit page.' : 'No teams linked yet.'}</T>
            </Card>
          )}
        </Section>

        <BankingCard name={club.name} details={club.banking_details} path={`/club/${club.id}`} />
        {live.length ? (
          <Section title="Live now">
            {live.map((g) => (
              <GameCard key={g.id} g={g} />
            ))}
          </Section>
        ) : null}
        {upcoming.length ? (
          <Section title="Coming up">
            {upcoming.slice(0, 4).map((g) => (
              <GameCard key={g.id} g={g} />
            ))}
          </Section>
        ) : null}
        {recent.length ? (
          <Section title="Recent results">
            {recent.map((g) => (
              <GameCard key={g.id} g={g} />
            ))}
          </Section>
        ) : null}

        <Section title={`Players · ${squad.length}`}>
          <T v="small">Everyone across the club’s teams. Players on more than one team show each.</T>
          {(showAll ? squad : squad.slice(0, 12)).map((p) => (
            <Row
              key={p.id}
              title={displayName(p)}
              subtitle={p.teams.map((t) => `${t.name}${t.role !== 'player' ? ` (${t.role.replace('_', ' ')})` : ''}`).join(' · ')}
              onPress={() => router.push(`/player/${p.id}`)}
            />
          ))}
          {squad.length > 12 && !showAll ? <Button label={`Show all ${squad.length}`} kind="ghost" onPress={() => setShowAll(true)} /> : null}
        </Section>

        <Section title="Club staff" action={isAdmin ? <Button label="Add" icon="plus" kind="ghost" onPress={() => setAddingStaff(true)} style={{ minHeight: 32, paddingHorizontal: 0 }} /> : undefined}>
          <T v="small">Club staff act as team staff on every team in the club: lines, practices, rosters, readiness.</T>
          {staff.map((s) => (
            <Row
              key={s.id}
              title={displayName(s)}
              subtitle={s.role === 'admin' ? 'Club admin' : s.role === 'coach' ? 'Club coach' : 'Club manager'}
              right={
                isAdmin && staff.length > 1 ? (
                  <IconButton
                    icon="close"
                    label={`Remove ${s.first_name}`}
                    onPress={() =>
                      Alert.alert(`Remove ${s.first_name} as club staff?`, undefined, [
                        { text: 'Keep', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => removeClubStaff(db, s.id) },
                      ])
                    }
                  />
                ) : undefined
              }
            />
          ))}
        </Section>
      </Screen>

      <Sheet visible={addingStaff} onClose={() => setAddingStaff(false)} title="Add club staff">
        <T v="small">Pick someone from the club. They’ll be able to manage all its teams.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {squad
            .filter((p) => !staff.some((s) => s.person_id === p.id))
            .map((p) => (
              <Choice
                key={p.id}
                label={displayName(p)}
                onPress={() =>
                  Alert.alert(`${displayName(p)}`, 'Add as…', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Coach', onPress: () => addClubStaff(db, id, p.id, 'coach').then(() => setAddingStaff(false)) },
                    { text: 'Manager', onPress: () => addClubStaff(db, id, p.id, 'manager').then(() => setAddingStaff(false)) },
                    { text: 'Admin', onPress: () => addClubStaff(db, id, p.id, 'admin').then(() => setAddingStaff(false)) },
                  ])
                }
                style={{ minHeight: 40, paddingHorizontal: 12 }}
              />
            ))}
        </View>
        {squad.length === 0 ? <Chip label="Add teams and players first" tone="neutral" /> : null}
      </Sheet>
    </>
  );
}
