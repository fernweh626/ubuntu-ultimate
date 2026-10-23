import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { SPIRIT_CATEGORIES, SPIRIT_SCALE } from '@/content/hub';
import { SPIRIT_EXAMPLES, SPIRIT_GUIDANCE, SPIRIT_SOURCE } from '@/content/spirit';
import { useData } from '@/db/live';
import { getTeam, loadGameData, saveSpirit, spiritForGame } from '@/db/repo';
import type { SpiritScore, Team } from '@/db/types';
import { Button, Card, Choice, Field, Footer, Icon, Screen, Segmented, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

type Key = (typeof SPIRIT_CATEGORIES)[number]['key'];
const DEFAULTS: Record<Key, number> = { rules: 2, fouls: 2, fairness: 2, attitude: 2, communication: 2 };


export default function Spirit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bundle = useData(
    async (d) => {
      const data = await loadGameData(d, id);
      if (!data) return null;
      const [ta, tb] = await Promise.all([getTeam(d, data.game.team_a_id), getTeam(d, data.game.team_b_id)]);
      return { endedAt: data.game.ended_at, ta: ta!, tb: tb!, existing: await spiritForGame(d, id) };
    },
    [id],
  );
  const [from, setFrom] = useState<'A' | 'B'>('A');

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const fromTeam = from === 'A' ? bundle.ta : bundle.tb;
  const toTeam = from === 'A' ? bundle.tb : bundle.ta;

  return (
    <>
      <Stack.Screen options={{ title: 'Spirit score' }} />
      <SpiritForm
        key={fromTeam.id}
        gameId={id}
        fromTeam={fromTeam}
        toTeam={toTeam}
        endedAt={bundle.endedAt}
        existing={bundle.existing.find((s) => s.from_team_id === fromTeam.id) ?? null}
        switcher={
          <Segmented
            value={from}
            onChange={setFrom}
            options={[
              { value: 'A', label: `${bundle.ta.name} scores` },
              { value: 'B', label: `${bundle.tb.name} scores` },
            ]}
          />
        }
      />
    </>
  );
}

function SpiritForm({
  gameId,
  fromTeam,
  toTeam,
  endedAt,
  existing,
  switcher,
}: {
  gameId: string;
  fromTeam: Team;
  toTeam: Team;
  endedAt: string | null;
  existing: SpiritScore | null;
  switcher: React.ReactNode;
}) {
  const db = useSQLiteContext();
  const [scores, setScores] = useState<Record<Key, number>>(() =>
    existing
      ? { rules: existing.rules, fouls: existing.fouls, fairness: existing.fairness, attitude: existing.attitude, communication: existing.communication }
      : DEFAULTS,
  );
  const [comments, setComments] = useState<Partial<Record<Key, string>>>(() => (existing?.comments_json ? JSON.parse(existing.comments_json) : {}));
  const [overall, setOverall] = useState(existing?.overall_comment ?? '');
  const [openComment, setOpenComment] = useState<Key | null>(null);
  const [info, setInfo] = useState<Key | null>(null);
  // Which score's examples the (i) panel shows; follows the chosen score until you tap another.
  const [infoLevel, setInfoLevel] = useState<number | null>(null);
  const [howTo, setHowTo] = useState(false);
  const [hoursLeft] = useState(() => (endedAt ? 12 - (Date.now() - Date.parse(endedAt)) / 3_600_000 : null));
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  async function submit() {
    // The sheet asks for a reason behind any 0 or 4.
    const missing = SPIRIT_CATEGORIES.filter((c) => (scores[c.key] === 0 || scores[c.key] === 4) && !comments[c.key]?.trim());
    if (missing.length) {
      setOpenComment(missing[0].key);
      return Alert.alert('Add a comment', `A 0 or a 4 needs a short reason: ${missing.map((c) => c.label).join(', ')}.`);
    }
    await saveSpirit(db, {
      game_id: gameId,
      from_team_id: fromTeam.id,
      to_team_id: toTeam.id,
      ...scores,
      comments_json: JSON.stringify(comments),
      overall_comment: overall.trim() || null,
    });
    Alert.alert('Spirit score saved', `${toTeam.name}: ${total}/20`);
    router.back();
  }

  return (
    <Screen
      edges={[]}
      footer={
        <Footer>
          <Button label={`Submit ${total}/20 for ${toTeam.name}`} kind="primary" big onPress={submit} />
        </Footer>
      }>
      {switcher}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <T v="title">Spirit for {toTeam.name}</T>
          <T v="small">
            2 is “good” and normal.
            {hoursLeft != null ? (hoursLeft > 0 ? ` Due in ${Math.floor(hoursLeft)}h ${Math.round((hoursLeft % 1) * 60)}m.` : ' The 12-hour window has passed.') : ''}
          </T>
        </View>
        <T style={{ fontFamily: font.display, fontSize: 40, lineHeight: 42 }}>{total}</T>
      </View>
      <Card onPress={() => setHowTo(!howTo)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="hand-heart-outline" color={colors.brand} />
          <T v="bodyStrong" style={{ flex: 1 }}>
            How to score spirit
          </T>
          <Icon name={howTo ? 'chevron-up' : 'chevron-down'} color={colors.muted} />
        </View>
        {howTo ? (
          <View style={{ gap: 6 }}>
            {SPIRIT_GUIDANCE.map((g) => (
              <T key={g} v="small" style={{ color: colors.ink }}>
                • {g}
              </T>
            ))}
            <T v="small">Tap the (i) next to each category for examples of every score. {SPIRIT_SOURCE}</T>
          </View>
        ) : null}
      </Card>

      {SPIRIT_CATEGORIES.map((c) => (
        <Card key={c.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T v="bodyStrong" style={{ flex: 1 }}>
              {c.label}
            </T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`What the scores mean for ${c.label}`}
              onPress={() => {
                setInfo(info === c.key ? null : c.key);
                setInfoLevel(null);
              }}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="information-outline" color={info === c.key ? colors.brand : colors.muted} />
            </Pressable>
          </View>
          {info === c.key ? (
            <View style={{ backgroundColor: colors.night, borderRadius: 10, padding: space.md, gap: space.sm }}>
              <T style={{ fontFamily: font.regular, fontSize: 14, color: '#fff' }}>{SPIRIT_EXAMPLES[c.key].about}</T>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {SPIRIT_SCALE.map((label, i) => {
                  const on = (infoLevel ?? scores[c.key]) === i;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setInfoLevel(i)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: on ? colors.brand : colors.nightRaised }}>
                      <T style={{ fontFamily: font.bold, fontSize: 15, color: '#fff' }}>{i}</T>
                    </Pressable>
                  );
                })}
              </View>
              <T style={{ fontFamily: font.bold, fontSize: 13, color: '#F0A27E' }}>
                {infoLevel ?? scores[c.key]} · {SPIRIT_SCALE[infoLevel ?? scores[c.key]]}: for example
              </T>
              {SPIRIT_EXAMPLES[c.key].levels[infoLevel ?? scores[c.key]].map((e) => (
                <T key={e} style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: colors.nightMuted }}>
                  • {e}
                </T>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 1, 2, 3, 4].map((n) => (
              <Choice
                key={n}
                label={String(n)}
                selected={scores[c.key] === n}
                onPress={() => {
                  setScores((s) => ({ ...s, [c.key]: n }));
                  setInfoLevel(null);
                  if (n === 0 || n === 4) setOpenComment(c.key);
                }}
                style={{ flex: 1 }}
              />
            ))}
          </View>
          <T v="small" style={{ textAlign: 'center' }}>
            {SPIRIT_SCALE[scores[c.key]]}
          </T>
          {openComment === c.key || comments[c.key] ? (
            <TextInput
              value={comments[c.key] ?? ''}
              onChangeText={(v) => setComments((x) => ({ ...x, [c.key]: v }))}
              placeholder={scores[c.key] === 0 || scores[c.key] === 4 ? 'Why? Needed for a 0 or a 4' : 'Comment (optional)'}
              placeholderTextColor={colors.faint}
              multiline
              style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: space.md, fontFamily: font.regular, fontSize: 15, color: colors.ink }}
            />
          ) : (
            <Button label="Add a comment" icon="comment-outline" kind="ghost" onPress={() => setOpenComment(c.key)} style={{ minHeight: 36, alignSelf: 'flex-start', paddingHorizontal: 0 }} />
          )}
        </Card>
      ))}
      <Field label={`Overall comment for ${toTeam.name}`} value={overall} onChangeText={setOverall} multiline placeholder="What they did well, and one thing to improve" />
    </Screen>
  );
}
