import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { commitDraw, drawPool, getHat, hatSignups, hatStart } from '@/db/hats';
import { useData } from '@/db/live';
import { displayName } from '@/domain/format';
import { drawTeams, recommendCaptains, suggestTeamCount, teamSummary, type HatPlayer, type HatTeam } from '@/domain/hat';
import { parseRules } from '@/domain/rules';
import { Button, Card, Chip, Choice, Footer, IconButton, Screen, Section, Segmented, T, TeamSwatch } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/**
 * The organiser draws the teams: how many, which captains (suggested from those willing), then
 * balanced teams by skill and ratio. Rename them to the shirt colours you're using, and confirm.
 */
export default function Draw() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const bundle = useData(async (d) => ({ hat: await getHat(d, id), signups: await hatSignups(d, id) }), [id]);
  if (!bundle?.hat) return <Screen edges={[]}>{null}</Screen>;
  return <DrawForm key={bundle.signups.length} id={id} hat={bundle.hat} signups={bundle.signups} db={db} />;
}

function DrawForm({
  id,
  hat,
  signups,
  db,
}: {
  id: string;
  hat: NonNullable<Awaited<ReturnType<typeof getHat>>>;
  signups: Awaited<ReturnType<typeof hatSignups>>;
  db: ReturnType<typeof useSQLiteContext>;
}) {
  const rules = parseRules(hat.rules_json);
  const perSide = rules.playersPerSide ?? 7;
  const pool = drawPool(signups);
  const byId = new Map<string, HatPlayer>(pool.map((p) => [p.id, p]));
  const nameOf = (pid: string) => {
    const s = signups.find((x) => x.person_id === pid);
    return s ? displayName(s) : '?';
  };
  const [count, setCount] = useState(suggestTeamCount(pool.length, perSide));
  const [captains, setCaptains] = useState<string[]>(() => recommendCaptains(pool, suggestTeamCount(pool.length, perSide)));
  const [teams, setTeams] = useState<HatTeam[] | null>(null);
  const [fields, setFields] = useState('1');
  const willing = pool.filter((p) => p.wantsCaptain).sort((a, b) => b.skill - a.skill);
  const unpaid = signups.filter((s) => s.attending === 'yes' && !s.paid && !s.paid_confirmed).length;

  function changeCount(n: number) {
    const c = Math.max(2, Math.min(12, n));
    setCount(c);
    setCaptains(recommendCaptains(pool, c));
    setTeams(null);
  }

  function toggleCaptain(pid: string) {
    setTeams(null);
    setCaptains(captains.includes(pid) ? captains.filter((x) => x !== pid) : captains.length >= count ? [...captains.slice(1), pid] : [...captains, pid]);
  }

  async function confirm() {
    if (!teams) return;
    const start = hatStart(hat);
    if (!start) return Alert.alert('Set the hat’s date and start time first');
    await commitDraw(db, id, teams, { startIso: start, gameMinutes: rules.hardCapMinutes ?? 45, fields: Number(fields), venueId: hat.venue_id, rules, region: hat.region });
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Draw the teams' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            {teams ? (
              <Button label="Confirm teams & make the schedule" icon="check" kind="primary" big onPress={confirm} />
            ) : (
              <Button label="Draw" icon="shuffle-variant" kind="primary" big onPress={() => setTeams(drawTeams(pool, count, captains))} disabled={pool.length < count * 2} />
            )}
          </Footer>
        }>
        <Card>
          <T v="bodyStrong">
            {pool.length} paid players · {pool.filter((p) => p.gender === 'W').length} female matching · {pool.filter((p) => p.gender === 'M').length} male matching
          </T>
          <T v="small">
            Only players who are coming and have paid are drawn.{unpaid ? ` ${unpaid} coming but not marked paid: confirm them on the hat page first if they have.` : ''} On-the-day players are added
            after, without moving anyone.
          </T>
        </Card>

        <Section title="How many teams?">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <IconButton icon="minus" label="Fewer teams" onPress={() => changeCount(count - 1)} />
            <T style={{ fontFamily: font.display, fontSize: 40 }}>{count}</T>
            <IconButton icon="plus" label="More teams" onPress={() => changeCount(count + 1)} />
            <T v="small" style={{ flex: 1 }}>
              About {Math.round(pool.length / count)} a team for {perSide}v{perSide}.
            </T>
          </View>
          <T v="smallStrong">Fields to play on at once</T>
          <Segmented
            value={fields}
            onChange={setFields}
            options={[
              { value: '1', label: '1 field' },
              { value: '2', label: '2 fields' },
              { value: '3', label: '3 fields' },
            ]}
          />
        </Section>

        <Section title={`Captains · ${captains.length}/${count}`}>
          <T v="small">Suggested from those willing: most experienced first, mixing female and male matching. Tap to change.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {willing.map((p) => (
              <Choice
                key={p.id}
                label={`${nameOf(p.id)} · ${p.skill.toFixed(1)}`}
                selected={captains.includes(p.id)}
                onPress={() => toggleCaptain(p.id)}
                style={{ minHeight: 40, paddingHorizontal: 12 }}
              />
            ))}
          </View>
          {willing.length < count ? (
            <T v="small" style={{ color: colors.warnInk }}>
              Only {willing.length} willing captains: the other teams start without one; pick one later or on the day.
            </T>
          ) : null}
        </Section>

        {teams ? (
          <Section title="Teams">
            {teams.map((t, i) => {
              const s = teamSummary(t, byId);
              return (
                <Card key={i}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <TeamSwatch color={t.color} />
                    <TextInput
                      value={t.name}
                      onChangeText={(v) => setTeams(teams.map((x, k) => (k === i ? { ...x, name: v } : x)))}
                      accessibilityLabel={`Team ${i + 1} name`}
                      style={{ flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 4 }}
                    />
                    <Chip label={`${s.size} · ${s.women}F ${s.men}M · ${s.skill.toFixed(1)}`} tone="neutral" />
                  </View>
                  <T v="small">{t.playerIds.map((pid) => `${nameOf(pid)}${pid === t.captainId ? ' (C)' : ''}`).join(', ')}</T>
                </Card>
              );
            })}
            <Button label="Draw again" icon="shuffle-variant" kind="ghost" onPress={() => setTeams(drawTeams(pool, count, captains, undefined, Math.random))} />
            <T v="small">Teams are matched on size, ratio and average skill (the number after the F/M split). Everyone gets “check out your team” once you confirm.</T>
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
