import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { useData } from '@/db/live';
import { peopleById } from '@/db/reports';
import { deleteGame, getEvent, getTeam, getVenue, loadGameData, reopenGame, spiritForGame, updateGameMeta } from '@/db/repo';
import { clock, displayName, pct, round1, shortDate, shortName, signedSeconds, timeOfDay } from '@/domain/format';
import { computeGameStats, type TeamGameStats } from '@/domain/stats';
import { weatherLine, type Weather } from '@/domain/weather';
import { Bars, ScoreProgression } from '@/ui/charts';
import { Button, Card, Chip, Field, IconButton, RatioBadge, Screen, Section, Segmented, Sheet, T, TeamSwatch } from '@/ui/components';
import { PlayerTable } from '@/ui/player-table';
import { ShareCardSheet, type ShareCardData } from '@/ui/share-card';
import { colors, font, space } from '@/ui/theme';

export default function GameReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => {
      const data = await loadGameData(d, id);
      if (!data) return null;
      const [ta, tb, event, venue, spirit] = await Promise.all([
        getTeam(d, data.game.team_a_id),
        getTeam(d, data.game.team_b_id),
        data.game.event_id ? getEvent(d, data.game.event_id) : Promise.resolve(null),
        data.game.venue_id ? getVenue(d, data.game.venue_id) : Promise.resolve(null),
        spiritForGame(d, id),
      ]);
      const people = await peopleById(d, data.players.map((p) => p.person_id));
      return { data, ta: ta!, tb: tb!, event, venue, spirit, people };
    },
    [id],
  );
  const [side, setSide] = useState<'A' | 'B'>('A');
  const [share, setShare] = useState<ShareCardData | null>(null);
  const [videoSheet, setVideoSheet] = useState(false);
  const [video, setVideo] = useState('');
  const [menu, setMenu] = useState(false);

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { data, ta, tb, event, venue, spirit, people } = bundle;
  const { game } = data;
  const stats = computeGameStats(data);
  const A = stats.teams[ta.id];
  const B = stats.teams[tb.id];
  const weather: Weather | null = game.weather_json ? JSON.parse(game.weather_json) : null;
  const name = (pid: string | null) => (pid && people.get(pid) ? shortName(people.get(pid)!) : 'Unknown');
  const final = game.status === 'final';

  const rows: { label: string; a: string; b: string }[] = [
    { label: 'Holds', a: `${A.holds}/${A.oPoints}`, b: `${B.holds}/${B.oPoints}` },
    { label: 'Hold rate', a: pct(A.holds, A.oPoints), b: pct(B.holds, B.oPoints) },
    { label: 'Clean holds', a: String(A.cleanHolds), b: String(B.cleanHolds) },
    { label: 'Breaks', a: String(A.breaks), b: String(B.breaks) },
    { label: 'Break chances', a: String(A.breakChances), b: String(B.breakChances) },
    { label: 'Break conversion', a: pct(A.breaks, A.breakChances), b: pct(B.breaks, B.breakChances) },
    { label: 'Turnovers', a: String(A.turnovers), b: String(B.turnovers) },
    { label: 'Turnovers per point', a: perPoint(A), b: perPoint(B) },
    { label: 'Intercepts', a: String(A.intercepts), b: String(B.intercepts) },
    { label: 'Pull timing (avg)', a: A.pullDelayCount ? signedSeconds(A.pullDelaySum / A.pullDelayCount) : '–', b: B.pullDelayCount ? signedSeconds(B.pullDelaySum / B.pullDelayCount) : '–' },
    { label: 'Pulls in / out', a: `${A.pulls.in}/${A.pulls.out}`, b: `${B.pulls.in}/${B.pulls.out}` },
    { label: 'Timeouts', a: String(A.timeouts), b: String(B.timeouts) },
  ];

  function openShare() {
    const top = Object.values(stats.players).sort((x, y) => y.goals + y.assists + y.intercepts - (x.goals + x.assists + x.intercepts))[0];
    const winner = A.score >= B.score ? A : B;
    setShare({
      kicker: [event?.name ?? 'Game', shortDate(game.started_at ?? game.created_at)].join(' · '),
      title: final ? `Final${A.score === B.score ? ' — draw' : ''}` : 'In progress',
      left: { name: ta.name, color: ta.primary_color, score: A.score },
      right: { name: tb.name, color: tb.primary_color, score: B.score },
      stats: [
        { label: 'Holds', value: `${A.holds}–${B.holds}` },
        { label: 'Breaks', value: `${A.breaks}–${B.breaks}` },
        { label: 'Clean holds', value: `${A.cleanHolds}–${B.cleanHolds}` },
        { label: 'Turnovers', value: `${A.turnovers}–${B.turnovers}` },
        { label: 'Intercepts', value: `${A.intercepts}–${B.intercepts}` },
        { label: 'Avg point', value: stats.avgPointSeconds ? clock(stats.avgPointSeconds) : '–' },
      ],
      highlights: [
        top && top.goals + top.assists + top.intercepts > 0 && people.get(top.personId)
          ? `Standout: ${shortName(people.get(top.personId)!)} · ${top.goals}G ${top.assists}A ${top.intercepts}I`
          : null,
        stats.connections[0] ? `Top connection: ${name(stats.connections[0].assistId)} → ${name(stats.connections[0].scorerId)} ×${stats.connections[0].count}` : null,
        winner.cleanHolds ? `${winner.teamId === ta.id ? ta.name : tb.name}: ${winner.cleanHolds} clean holds` : null,
      ].filter(Boolean) as string[],
      footer: venue?.name ?? '',
    });
  }

  const teamPlayers = Object.values(stats.players).filter((p) => p.teamId === (side === 'A' ? ta.id : tb.id) && (p.points > 0 || p.goals || p.assists || p.intercepts));

  return (
    <>
      <Stack.Screen
        options={{
          title: final ? 'Game report' : 'Live stats',
          headerRight: () => <IconButton icon="dots-vertical" label="More" onPress={() => setMenu(true)} />,
        }}
      />
      <Screen edges={[]}>
        <Card style={{ backgroundColor: colors.night, borderColor: colors.night }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            {final ? <Chip label="Final" tone="dark" /> : <Chip label="LIVE" tone="danger" />}
            <T style={{ fontFamily: font.medium, fontSize: 13, color: colors.nightMuted }}>
              {[event?.name, shortDate(game.started_at ?? game.created_at)].filter(Boolean).join(' · ')}
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
            <View style={{ flex: 1, gap: 6 }}>
              <TeamSwatch color={ta.primary_color} size="sm" />
              <T style={{ fontFamily: font.bold, fontSize: 17, color: '#fff' }}>{ta.name}</T>
            </View>
            <T style={{ fontFamily: font.display, fontSize: 56, lineHeight: 60, color: '#fff' }}>
              {A.score}–{B.score}
            </T>
            <View style={{ flex: 1, gap: 6, alignItems: 'flex-end' }}>
              <TeamSwatch color={tb.primary_color} size="sm" />
              <T style={{ fontFamily: font.bold, fontSize: 17, color: '#fff', textAlign: 'right' }}>{tb.name}</T>
            </View>
          </View>
          <T style={{ fontFamily: font.regular, fontSize: 13, color: colors.nightMuted, marginTop: space.sm }}>
            {[
              venue?.name,
              game.started_at ? `Started ${timeOfDay(game.started_at)}` : null,
              stats.durationSeconds ? `${clock(stats.durationSeconds)} long` : null,
              stats.avgPointSeconds ? `avg point ${clock(stats.avgPointSeconds)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </T>
          {weather ? <T style={{ fontFamily: font.regular, fontSize: 13, color: colors.nightMuted }}>{weatherLine(weather)}</T> : null}
        </Card>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Share" icon="share-variant" kind="primary" onPress={openShare} style={{ flex: 1 }} />
          <Button label="Spirit" icon="handshake-outline" onPress={() => router.push(`/game/${id}/spirit`)} style={{ flex: 1 }} />
          {game.video_url ? (
            <Button label="Video" icon="youtube" onPress={() => Linking.openURL(game.video_url!)} style={{ flex: 1 }} />
          ) : (
            <Button label="Video" icon="link-plus" onPress={() => setVideoSheet(true)} style={{ flex: 1 }} />
          )}
        </View>
        {!final ? <Button label="Back to scoring" icon="whistle" onPress={() => router.replace(`/game/${id}`)} /> : null}

        <Section title="Score progression">
          <Card>
            <ScoreProgression timeline={stats.timeline} aColor={ta.primary_color} bColor={tb.primary_color} aName={ta.name} bName={tb.name} />
          </Card>
        </Section>

        <Section title="Team stats">
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', backgroundColor: colors.neutralTint, paddingHorizontal: space.md, minHeight: 40, alignItems: 'center' }}>
              <T v="smallStrong" style={{ flex: 1 }} numberOfLines={1}>
                {ta.short_name ?? ta.name}
              </T>
              <T v="label" style={{ flex: 1.6, textAlign: 'center' }}>
                {' '}
              </T>
              <T v="smallStrong" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
                {tb.short_name ?? tb.name}
              </T>
            </View>
            {rows.map((r, i) => (
              <View key={r.label} style={{ flexDirection: 'row', paddingHorizontal: space.md, minHeight: 40, alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                <T v="bodyStrong" style={{ flex: 1 }}>
                  {r.a}
                </T>
                <T v="small" style={{ flex: 1.6, textAlign: 'center' }}>
                  {r.label}
                </T>
                <T v="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>
                  {r.b}
                </T>
              </View>
            ))}
          </View>
        </Section>

        <Section title="How possessions were lost">
          <Card>
            {[ta, tb].map((t) => {
              const s = t.id === ta.id ? A : B;
              return (
                <View key={t.id} style={{ gap: space.sm, marginBottom: space.sm }}>
                  <T v="smallStrong">{t.name}</T>
                  <Bars
                    rows={[
                      { label: 'Throwaways', value: s.throwaways, color: t.primary_color ?? undefined },
                      { label: 'Drops', value: s.drops, color: t.primary_color ?? undefined },
                      { label: 'Stalls', value: s.stalls, color: t.primary_color ?? undefined },
                      { label: 'Intercepted', value: s.interceptedAgainst, color: t.primary_color ?? undefined },
                    ]}
                  />
                </View>
              );
            })}
          </Card>
        </Section>

        {stats.connections.length ? (
          <Section title="Top connections">
            <Card>
              {stats.connections.slice(0, 5).map((c) => (
                <View key={`${c.assistId}-${c.scorerId}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <T>
                    {name(c.assistId)} → {name(c.scorerId)}
                  </T>
                  <T v="bodyStrong">{c.count}</T>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title="Players">
          <Segmented
            value={side}
            onChange={setSide}
            options={[
              { value: 'A', label: ta.name },
              { value: 'B', label: tb.name },
            ]}
          />
          <PlayerTable rows={teamPlayers} people={people} extra={(s) => `${s.oPoints} O · ${s.dPoints} D${s.pulls ? ` · ${s.pulls} pulls` : ''}`} />
        </Section>

        <Section title="Point by point">
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {stats.timeline
              .filter((t) => t.scoringTeamId)
              .map((t, i) => {
                const scorer = t.scoringTeamId === ta.id ? ta : tb;
                return (
                  <View key={t.point.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                    <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: scorer.primary_color ?? colors.faint }} />
                    <T style={{ fontFamily: font.display, fontSize: 22, width: 52 }}>
                      {t.scoreA}–{t.scoreB}
                    </T>
                    <RatioBadge ratio={t.point.ratio} compact />
                    <View style={{ flex: 1 }}>
                      <T v="smallStrong" numberOfLines={1}>
                        {t.callahan ? `Callahan · ${name(t.scorerId)}` : t.scorerId ? `${name(t.scorerId)}${t.assistId ? ` from ${name(t.assistId)}` : ''}` : scorer.name}
                      </T>
                      <T v="small">
                        {[t.seconds ? clock(t.seconds) : null, t.turnovers ? `${t.turnovers} turnover${t.turnovers > 1 ? 's' : ''}` : null, t.point.half === 2 && i > 0 && stats.timeline[i - 1]?.point.half === 1 ? 'after half' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </T>
                    </View>
                    {t.kind ? <Chip label={t.clean ? 'Clean hold' : t.kind === 'hold' ? 'Hold' : 'Break'} tone={t.kind === 'break' ? 'warn' : 'brand'} /> : null}
                  </View>
                );
              })}
            {stats.timeline.every((t) => !t.scoringTeamId) ? (
              <View style={{ padding: space.lg }}>
                <T v="small">No points scored yet.</T>
              </View>
            ) : null}
          </View>
        </Section>

        {spirit.length ? (
          <Section title="Spirit">
            {spirit.map((s) => {
              const to = s.to_team_id === ta.id ? ta : tb;
              const total = s.rules + s.fouls + s.fairness + s.attitude + s.communication;
              return (
                <Card key={s.id} onPress={() => router.push(`/game/${id}/spirit`)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T v="bodyStrong">{to.name} received</T>
                    <T style={{ fontFamily: font.display, fontSize: 22 }}>{total}/20</T>
                  </View>
                  {s.overall_comment ? <T v="small">“{s.overall_comment}”</T> : null}
                </Card>
              );
            })}
          </Section>
        ) : null}

        <T v="small" style={{ textAlign: 'center' }}>
          Top performer by +/−:{' '}
          {(() => {
            const best = Object.values(stats.players).sort((a, b) => b.plusMinus - a.plusMinus)[0];
            return best && people.get(best.personId) ? `${displayName(people.get(best.personId)!)} (${best.plusMinus >= 0 ? '+' : ''}${best.plusMinus})` : '–';
          })()}
        </T>
      </Screen>

      <ShareCardSheet visible={!!share} data={share} onClose={() => setShare(null)} />

      <Sheet visible={videoSheet} onClose={() => setVideoSheet(false)} title="Link a video">
        <Field label="YouTube link (public or unlisted)" value={video} onChangeText={setVideo} autoCapitalize="none" placeholder="https://youtu.be/…" />
        <Button
          label="Save"
          kind="primary"
          onPress={async () => {
            await updateGameMeta(db, id, { video_url: video.trim() || null });
            setVideoSheet(false);
          }}
        />
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Game">
        {game.video_url ? <Button label="Change video link" icon="link-variant" onPress={() => { setMenu(false); setVideo(game.video_url ?? ''); setVideoSheet(true); }} /> : null}
        {final ? (
          <Button
            label="Reopen game for scoring"
            icon="lock-open-variant-outline"
            onPress={async () => {
              setMenu(false);
              await reopenGame(db, data);
              router.replace(`/game/${id}`);
            }}
          />
        ) : null}
        <Button
          label="Delete game"
          icon="delete-outline"
          kind="danger"
          onPress={() => {
            setMenu(false);
            Alert.alert('Delete this game?', 'Its stats will be removed from all reports.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteGame(db, id);
                  router.back();
                },
              },
            ]);
          }}
        />
      </Sheet>
    </>
  );
}

function perPoint(s: TeamGameStats) {
  const pts = s.oPoints + s.dPoints;
  return pts ? String(round1(s.turnovers / pts)) : '–';
}
