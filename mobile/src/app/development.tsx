import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { addFitnessResults, deleteFitnessResult, fitnessResults, getAccreditation, selfRatings, type FitnessResult, type SelfRating } from '@/db/development';
import { useData } from '@/db/live';
import { getAccess, getPerson } from '@/db/repo';
import { ACCREDITATION_LEVELS, accreditationState, best, FITNESS_TESTS, fitnessTest, formatFitness, isBetter, parseFitness, RATING_AREAS, RATING_MAX, RATING_SCALE, ratingDue, type FitnessKind } from '@/domain/development';
import { displayName, dmyToIso, localDmy, shortDate } from '@/domain/format';
import { Button, Card, Chip, DateField, Field, Screen, Section, Segmented, Sheet, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/** Self-rating history and fitness benchmarks for one player (yourself, or a player you coach). */
export default function Development() {
  const params = useLocalSearchParams<{ personId?: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => {
      const access = await getAccess(d);
      const personId = params.personId ?? access.meId;
      if (!personId) return { access, personId: null };
      return {
        access,
        personId,
        person: await getPerson(d, personId),
        ratings: await selfRatings(d, personId),
        tests: await fitnessResults(d, personId),
        acc: await getAccreditation(d, personId),
      };
    },
    [params.personId],
  );
  const [tab, setTab] = useState<'rating' | 'fitness'>('rating');
  const [adding, setAdding] = useState<FitnessKind | null>(null);

  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  if (!bundle.personId || !('ratings' in bundle)) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'My development' }} />
        <Card>
          <T v="bodyStrong">Pick yourself first</T>
          <T v="small">In Me, choose which player you are.</T>
        </Card>
      </Screen>
    );
  }
  const { personId, ratings, tests, acc, access, person } = bundle;
  const own = personId === access.meId;
  const title = own ? 'My development' : person ? displayName(person) : 'Player';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen edges={[]}>
        {!own && acc ? (
          <Chip
            label={`${ACCREDITATION_LEVELS[acc.level]} accreditation${acc.expires_on ? ` · ${accreditationState(acc.expires_on) === 'expired' ? 'expired' : 'until'} ${shortDate(acc.expires_on)}` : ''}`}
            tone={accreditationState(acc.expires_on) === 'valid' ? 'brand' : 'warn'}
          />
        ) : null}
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'rating', label: 'Self-rating' },
            { value: 'fitness', label: 'Fitness tests' },
          ]}
        />
        {tab === 'rating' ? <Ratings ratings={ratings} own={own} /> : <Fitness tests={tests} canAdd={own || !!access.staffTeamIds.length || access.level === 'admin' || access.level === 'coordinator'} onAdd={setAdding} canDelete={own} />}
      </Screen>
      <AddResult
        kind={adding}
        onClose={() => setAdding(null)}
        onSave={async (kind, value, testedOn) => {
          await addFitnessResults(db, [{ personId, kind, value, testedOn, recordedById: access.meId }]);
          setAdding(null);
        }}
      />
    </>
  );
}

function Ratings({ ratings, own }: { ratings: SelfRating[]; own: boolean }) {
  const [latest, previous] = ratings;
  const due = ratingDue(latest?.rated_on);
  return (
    <>
      {own ? (
        <Card style={due ? { backgroundColor: colors.brandTint, borderColor: colors.brandTint } : undefined}>
          <T v="bodyStrong">{latest ? (due ? 'Time to re-rate yourself' : `Next check-in after ${shortDate(new Date(new Date(latest.rated_on).getTime() + 182 * 86400_000).toISOString())}`) : 'Rate yourself'}</T>
          <T v="small">Five areas, 1 to 5. Every six months, so you can see how you’re growing. Your coaches can see it too.</T>
          <Button label={latest ? 'Rate myself now' : 'Start'} icon="star-half-full" kind={due ? 'primary' : 'secondary'} onPress={() => router.push('/rate')} />
        </Card>
      ) : null}
      {latest ? (
        <Section title={`Latest · ${shortDate(latest.rated_on)}`}>
          {RATING_AREAS.map((a) => {
            const v = latest[a.key];
            const d = previous ? v - previous[a.key] : 0;
            return (
              <View key={a.key} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="smallStrong">{a.label}</T>
                  <T v="smallStrong" style={{ color: d > 0 ? colors.brandDark : d < 0 ? colors.danger : colors.muted }}>
                    {v}/5 · {RATING_SCALE[v - 1]}{previous && d ? ` (${d > 0 ? '+' : ''}${d})` : ''}
                  </T>
                </View>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.neutralTint, overflow: 'hidden' }}>
                  <View style={{ width: `${(v / RATING_MAX) * 100}%`, height: '100%', backgroundColor: colors.brand }} />
                </View>
              </View>
            );
          })}
          {latest.notes ? <T v="small">“{latest.notes}”</T> : null}
        </Section>
      ) : !own ? (
        <T v="small">No self-ratings yet.</T>
      ) : null}
      {ratings.length > 1 ? (
        <Section title="History">
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', padding: space.sm, backgroundColor: colors.neutralTint }}>
              <T v="smallStrong" style={{ flex: 1.6 }}>
                Date
              </T>
              {RATING_AREAS.map((a) => (
                <T key={a.key} v="smallStrong" style={{ flex: 1, textAlign: 'center' }}>
                  {a.label.slice(0, 3)}
                </T>
              ))}
            </View>
            {ratings.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', padding: space.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
                <T v="small" style={{ flex: 1.6 }}>
                  {shortDate(r.rated_on)}
                </T>
                {RATING_AREAS.map((a) => (
                  <T key={a.key} style={{ flex: 1, textAlign: 'center', fontFamily: font.bold }}>
                    {r[a.key]}
                  </T>
                ))}
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </>
  );
}

function Fitness({ tests, canAdd, canDelete, onAdd }: { tests: FitnessResult[]; canAdd: boolean; canDelete: boolean; onAdd: (k: FitnessKind) => void }) {
  const db = useSQLiteContext();
  return (
    <>
      {FITNESS_TESTS.map((t) => {
        const mine = tests.filter((r) => r.kind === t.kind);
        const pb = best(t.kind, mine.map((r) => r.value));
        const last = mine[0];
        const prev = mine[1];
        return (
          <Card key={t.kind}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{t.label}</T>
                <T v="small">{t.how}</T>
              </View>
              {pb != null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <T style={{ fontFamily: font.display, fontSize: 26 }}>{formatFitness(t.kind, pb)}</T>
                  <T v="small">personal best</T>
                </View>
              ) : null}
            </View>
            {last ? (
              <T v="small">
                Latest {formatFitness(t.kind, last.value)} on {shortDate(last.tested_on)}
                {prev ? (isBetter(t.kind, last.value, prev.value) ? ' · improved ↑' : last.value === prev.value ? ' · same' : ' · down ↓') : ''}
              </T>
            ) : null}
            {mine.length > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {mine.slice(0, 8).map((r) => (
                  <Pressable
                    key={r.id}
                    disabled={!canDelete}
                    onLongPress={() =>
                      Alert.alert('Delete this result?', `${formatFitness(t.kind, r.value)} on ${shortDate(r.tested_on)}`, [
                        { text: 'Keep', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteFitnessResult(db, r.id) },
                      ])
                    }>
                    <Chip label={`${shortDate(r.tested_on).split(' ').slice(1).join(' ')} · ${formatFitness(t.kind, r.value)}`} tone={r.value === pb ? 'brand' : 'neutral'} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {canAdd ? <Button label="Add a result" icon="plus" kind="ghost" onPress={() => onAdd(t.kind)} style={{ minHeight: 36, paddingHorizontal: 0, alignSelf: 'flex-start' }} /> : null}
          </Card>
        );
      })}
    </>
  );
}

function AddResult({ kind, onClose, onSave }: { kind: FitnessKind | null; onClose: () => void; onSave: (k: FitnessKind, value: number, testedOn: string) => void }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(() => localDmy(new Date().toISOString()));
  if (!kind) return null;
  const t = fitnessTest(kind);
  return (
    <Sheet visible onClose={onClose} title={t.label}>
      <Field label={t.kind === 'beep' ? 'Level.shuttle' : 'Time in seconds'} value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder={t.placeholder} hint={t.how} autoFocus />
      <DateField label="Date" value={date} onChangeText={setDate} />
      <Button
        label="Save"
        kind="primary"
        onPress={() => {
          const v = parseFitness(kind, text);
          const on = dmyToIso(date);
          if (v == null) return Alert.alert('Check the result', t.how);
          if (!on) return Alert.alert('Check the date', 'Use dd/mm/yyyy.');
          setText('');
          onSave(kind, v, on);
        }}
      />
    </Sheet>
  );
}
