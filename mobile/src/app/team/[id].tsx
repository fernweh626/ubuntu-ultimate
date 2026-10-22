import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { regionName } from '@/content/hub';
import { useData } from '@/db/live';
import { loadFinishedGames, teamAggregate } from '@/db/reports';
import { deleteTeam, getTeam, listGamesForTeam, roster, savedLines, setTeamLogo } from '@/db/repo';
import { displayName, pct, round1 } from '@/domain/format';
import { Button, Card, Chip, EmptyState, Icon, IconButton, Row, Screen, Section, StatTile, T } from '@/ui/components';
import { FollowButton } from '@/ui/follow-button';
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
  const lines = useData((d) => savedLines(d, id), [id]);
  const games = useData((d) => listGamesForTeam(d, id), [id]);
  const loaded = useData(async (d) => loadFinishedGames(d, await listGamesForTeam(d, id)), [id]);
  const [logoSheet, setLogoSheet] = useState(false);

  if (!team) return <Screen edges={[]}>{null}</Screen>;
  const agg = loaded ? teamAggregate(id, loaded) : null;
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
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="pencil" label="Edit team" onPress={() => router.push({ pathname: '/team/edit', params: { id } })} />
              <IconButton icon="delete-outline" label="Delete team" onPress={remove} color={colors.danger} />
            </View>
          ),
        }}
      />
      <Screen edges={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Pressable accessibilityRole="button" accessibilityLabel={team.logo_uri ? 'Change logo' : 'Add a logo'} onPress={() => setLogoSheet(true)}>
            <TeamLogo uri={team.logo_uri} color={team.primary_color} size={56} />
            {!team.logo_uri ? (
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
            <Card onPress={() => router.push({ pathname: '/team/edit', params: { id } })}>
              <T v="small">No contact details yet. Tap to add who to contact and how.</T>
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
          action={<Button label="Add player" icon="account-plus" kind="ghost" onPress={() => router.push({ pathname: '/player/edit', params: { teamId: id } })} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
          {players && players.length ? (
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
              {players.map((p) => (
                <Row
                  key={p.id}
                  title={`${displayName(p)}${p.jersey_number ? `  #${p.jersey_number}` : ''}`}
                  subtitle={[p.gender === 'W' ? 'Woman' : p.gender === 'M' ? 'Man' : null, p.position ? POS[p.position] : null].filter(Boolean).join(' · ')}
                  right={p.membership_kind !== 'core' ? <Chip label={KIND_LABEL[p.membership_kind]} tone="warn" /> : undefined}
                  left={<Avatar uri={p.photo_uri} name={displayName(p)} size={36} tone="tint" />}
                  onPress={() => router.push(`/player/${p.id}`)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="account-multiple-plus-outline"
              title="No players yet"
              action={<Button label="Add player" icon="account-plus" kind="primary" onPress={() => router.push({ pathname: '/player/edit', params: { teamId: id } })} />}
            />
          )}
        </Section>

        <Section
          title="Saved lines"
          action={<Button label="New line" icon="plus" kind="ghost" onPress={() => router.push({ pathname: '/team/line-edit', params: { teamId: id } })} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
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

        <Section title="Games">
          {games && games.length ? games.slice(0, 10).map((g) => <GameCard key={g.id} g={g} />) : <T v="small">No games yet.</T>}
        </Section>
      </Screen>
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
