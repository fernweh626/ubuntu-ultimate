import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { addSelfRating, selfRatings } from '@/db/development';
import { useData } from '@/db/live';
import { getMeId } from '@/db/repo';
import { RATING_AREAS, RATING_SCALE, type RatingArea } from '@/domain/development';
import { Button, Field, Footer, Screen, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/** Rate yourself 1–5 in five areas. Last time's answer is shown faintly so the change is honest. */
export default function Rate() {
  const db = useSQLiteContext();
  const bundle = useData(async (d) => {
    const meId = await getMeId(d);
    return { meId, last: meId ? ((await selfRatings(d, meId))[0] ?? null) : null };
  });
  const [values, setValues] = useState<Partial<Record<RatingArea, number>>>({});
  const [notes, setNotes] = useState('');
  if (!bundle?.meId) return <Screen edges={[]}>{null}</Screen>;
  const { meId, last } = bundle;
  const complete = RATING_AREAS.every((a) => values[a.key]);

  return (
    <>
      <Stack.Screen options={{ title: 'Rate yourself' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button
              label={complete ? 'Save' : `Rate all five (${RATING_AREAS.filter((a) => values[a.key]).length}/5)`}
              kind="primary"
              big
              disabled={!complete}
              onPress={async () => {
                await addSelfRating(db, meId, { ...(values as Record<RatingArea, number>), notes: notes.trim() || null });
                router.back();
              }}
            />
          </Footer>
        }>
        <T v="small">{RATING_SCALE.map((l, i) => `${i + 1} = ${l}`).join(' · ')}. Be honest: it’s for you to track your growth.</T>
        {RATING_AREAS.map((a) => (
          <View key={a.key} style={{ gap: space.xs }}>
            <T v="bodyStrong">{a.label}</T>
            <T v="small">
              {a.hint}
              {last ? ` Last time: ${last[a.key]}.` : ''}
            </T>
            {values[a.key] ? <T v="smallStrong" style={{ color: colors.brandDark }}>{RATING_SCALE[values[a.key]! - 1]}</T> : null}
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {RATING_SCALE.map((_, i) => i + 1).map((n) => {
                const on = values[a.key] === n;
                const wasLast = last?.[a.key] === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setValues({ ...values, [a.key]: n })}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.label} ${n}`}
                    accessibilityState={{ selected: on }}
                    style={{
                      flex: 1,
                      height: 52,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? colors.brand : colors.surface,
                      borderWidth: wasLast && !on ? 2 : 1,
                      borderColor: wasLast && !on ? colors.brand : colors.border,
                      borderStyle: wasLast && !on ? 'dashed' : 'solid',
                    }}>
                    <T style={{ fontFamily: font.bold, fontSize: 18, color: on ? '#fff' : colors.ink }}>{n}</T>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <Field label="What are you working on? (optional)" value={notes} onChangeText={setNotes} multiline placeholder="e.g. forehand break throws, staying low on the mark" />
      </Screen>
    </>
  );
}
