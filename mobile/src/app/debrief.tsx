import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, TextInput, View } from 'react-native';

import { useData } from '@/db/live';
import { peopleById } from '@/db/reports';
import { getAccess, getSession, getTeam, loadGameData, reflectionsFor, roster } from '@/db/repo';
import { displayName } from '@/domain/format';
import { debriefText, PLAYING_TIME_LABEL, summarise, type PlayingTime } from '@/domain/reflection';
import { Button, Card, Chip, EmptyState, Screen, Section, StatTile, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/** Coaches' and captains' view of a game's or practice's reflections. Staff of that team only. */
export default function Debrief() {
  const { gameId, sessionId, teamId } = useLocalSearchParams<{ gameId?: string; sessionId?: string; teamId: string }>();
  const bundle = useData(
    async (d) => {
      const access = await getAccess(d);
      const team = await getTeam(d, teamId);
      const rows = await reflectionsFor(d, gameId ? { gameId } : { sessionId }, teamId);
      const people = await peopleById(d, rows.map((r) => r.person_id));
      let title = team?.name ?? 'Team';
      let squad = 0;
      if (gameId) {
        const data = await loadGameData(d, gameId);
        const other = data ? await getTeam(d, data.game.team_a_id === teamId ? data.game.team_b_id : data.game.team_a_id) : null;
        title = `${team?.name} v ${other?.name ?? ''}`;
        squad = data?.players.filter((p) => p.team_id === teamId && p.confirmation !== 'removed').length ?? 0;
      } else if (sessionId) {
        const s = await getSession(d, sessionId);
        title = s?.title || `${team?.name ?? 'Team'} practice`;
        squad = (await roster(d, teamId)).length;
      }
      return { allowed: access.level === 'admin' || access.staffTeamIds.includes(teamId), rows, people, title, squad };
    },
    [gameId, sessionId, teamId],
  );

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  if (!bundle.allowed) {
    return (
      <Screen edges={[]}>
        <EmptyState icon="lock-outline" title="Staff only" body="Reflections are only visible to this team’s captains, coaches and managers." />
      </Screen>
    );
  }
  return <DebriefBody {...bundle} />;
}

function DebriefBody({
  rows,
  people,
  title,
  squad,
}: {
  rows: Awaited<ReturnType<typeof reflectionsFor>>;
  people: Map<string, Parameters<typeof displayName>[0]>;
  title: string;
  squad: number;
}) {
  const name = (id: string) => (people.get(id) ? displayName(people.get(id)!) : 'Someone');
  const s = summarise(rows, name);
  const [text, setText] = useState(() => debriefText(title, s, squad));

  return (
    <>
      <Stack.Screen options={{ title: 'Team debrief' }} />
      <Screen edges={[]}>
        <View>
          <T v="title">{title}</T>
          <T v="small">
            {s.responses} of {squad || '?'} replied · only staff can see this page
          </T>
        </View>
        {s.responses === 0 ? (
          <EmptyState icon="comment-question-outline" title="No replies yet" body="Players answer from the game report or their notification after the game." />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <StatTile value={s.avgRpe ?? '–'} label="Effort /10" />
              <StatTile value={s.avgSelf ?? '–'} label="Own rating /5" />
              <StatTile value={s.avgOffence ?? '–'} label="Offence /5" />
              <StatTile value={s.avgDefence ?? '–'} label="Defence /5" />
            </View>

            {s.niggles.length ? (
              <Section title="Niggles and injuries">
                {s.niggles.map((n) => (
                  <Card key={n.name + n.area} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T v="bodyStrong">{n.name}</T>
                    <Chip label={`${n.area}${n.severity ? ` · ${n.severity}` : ''}`} tone={n.severity === 'bad' ? 'danger' : 'warn'} />
                  </Card>
                ))}
              </Section>
            ) : null}

            {s.playingTime.too_little.length || s.playingTime.too_much.length ? (
              <Section title="Playing time">
                <Card>
                  {(['too_little', 'right', 'too_much'] as PlayingTime[]).map((k) =>
                    s.playingTime[k].length ? (
                      <View key={k} style={{ paddingVertical: 4 }}>
                        <T v="smallStrong">
                          {PLAYING_TIME_LABEL[k]} · {s.playingTime[k].length}
                        </T>
                        {k !== 'right' ? <T v="small">{s.playingTime[k].join(', ')}</T> : null}
                      </View>
                    ) : null,
                  )}
                </Card>
              </Section>
            ) : null}

            {s.roleUnclear.length ? (
              <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
                <T v="smallStrong" style={{ color: colors.warnInk }}>
                  Role on the line wasn’t clear for: {s.roleUnclear.join(', ')}
                </T>
              </Card>
            ) : null}

            {(
              [
                ['What would you like your leadership to know?', s.leadership],
                ['Went well', s.wentWell],
                ['To work on', s.workOn],
                ['Drills that helped', s.drills],
                ['Staff notes', s.staffNotes],
              ] as const
            ).map(([head, items]) =>
              items.length ? (
                <Section key={head} title={head}>
                  {items.map((i, k) => (
                    <Card key={k}>
                      <T>{i.text}</T>
                      <T v="small">— {i.name}</T>
                    </Card>
                  ))}
                </Section>
              ) : null,
            )}

            <Section title="Debrief to send the team">
              <T v="small">No names, niggles or leadership notes are included. Edit it, then share to WhatsApp or email.</T>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                style={{
                  minHeight: 180,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: space.md,
                  backgroundColor: colors.surface,
                  fontFamily: font.regular,
                  fontSize: 15,
                  color: colors.ink,
                  textAlignVertical: 'top',
                }}
              />
              <Button label="Share debrief" icon="share-variant" kind="primary" onPress={() => Share.share({ message: text })} />
              <T v="small">An AI-written summary of everything above arrives with the online version.</T>
            </Section>
          </>
        )}
      </Screen>
    </>
  );
}
