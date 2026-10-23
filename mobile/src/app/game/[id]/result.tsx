import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useData } from '@/db/live';
import { getGameListItem, setGameResult, type ResultMode } from '@/db/repo';
import { Button, Choice, Footer, Screen, Segmented, T, TeamSwatch } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/** Record a result without tracking points: final score, who won, or just that it was played. */
export default function Result() {
  const { id, mode: initial } = useLocalSearchParams<{ id: string; mode?: ResultMode }>();
  const db = useSQLiteContext();
  const g = useData((d) => getGameListItem(d, id), [id]);
  const [mode, setMode] = useState<ResultMode>(initial ?? 'score');
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  if (!g) return <Screen edges={[]}>{null}</Screen>;
  const sa = a ?? (g.result_mode === 'score' ? (g.final_a ?? 0) : 0);
  const sb = b ?? (g.result_mode === 'score' ? (g.final_b ?? 0) : 0);
  const won = winner ?? g.winner_team_id ?? null;

  async function save() {
    await setGameResult(db, id, { mode, finalA: sa, finalB: sb, winnerTeamId: won });
    router.replace(`/game/${id}/report`);
  }

  const stepper = (name: string, color: string | null, value: number, set: (n: number) => void) => (
    <View style={{ flex: 1, alignItems: 'center', gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TeamSwatch color={color} />
        <T v="bodyStrong" numberOfLines={1}>
          {name}
        </T>
      </View>
      <T style={{ fontFamily: font.display, fontSize: 72, lineHeight: 76 }}>{value}</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Pressable onPress={() => set(Math.max(0, value - 1))} accessibilityLabel={`${name} minus one`} style={stepStyle}>
          <T style={{ fontFamily: font.display, fontSize: 28 }}>−</T>
        </Pressable>
        <Pressable onPress={() => set(value + 1)} accessibilityLabel={`${name} plus one`} style={[stepStyle, { backgroundColor: colors.brand, borderColor: colors.brand }]}>
          <T style={{ fontFamily: font.display, fontSize: 28, color: '#fff' }}>+</T>
        </Pressable>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Result' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Save result" kind="primary" big onPress={save} disabled={mode === 'winner' && !won} />
          </Footer>
        }>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'score', label: 'Final score' },
            { value: 'winner', label: 'Who won' },
            { value: 'none', label: 'Just played' },
          ]}
        />
        {mode === 'score' ? (
          <View style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.lg }}>
            {stepper(g.a_name, g.a_color, sa, setA)}
            <T style={{ fontFamily: font.display, fontSize: 40, alignSelf: 'center', color: colors.faint }}>–</T>
            {stepper(g.b_name, g.b_color, sb, setB)}
          </View>
        ) : mode === 'winner' ? (
          <View style={{ gap: space.sm }}>
            {[
              [g.team_a_id, g.a_name],
              [g.team_b_id, g.b_name],
            ].map(([tid, name]) => (
              <Choice key={tid} label={`${name} won`} selected={won === tid} onPress={() => setWinner(tid)} tall />
            ))}
          </View>
        ) : (
          <T>No score kept. The game shows as played, and doesn’t count towards standings.</T>
        )}
        <T v="small">You can change this later. Want stats too? Start a tracked game instead.</T>
      </Screen>
    </>
  );
}

const stepStyle = { width: 64, height: 56, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' } as const;
