import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { addFitnessResults, squadDevelopment } from '@/db/development';
import { useData } from '@/db/live';
import { getAccess } from '@/db/repo';
import { FITNESS_TESTS, fitnessTest, parseFitness, type FitnessKind } from '@/domain/development';
import { displayName, dmyToIso, localDmy } from '@/domain/format';
import { Button, DateField, Footer, Screen, Segmented, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/** Testing day: staff type in one test's result for the whole squad. Blank = didn't test. */
export default function TestingDay() {
  const params = useLocalSearchParams<{ teamId: string; kind?: FitnessKind }>();
  const db = useSQLiteContext();
  const bundle = useData(async (d) => ({ squad: await squadDevelopment(d, params.teamId), access: await getAccess(d) }), [params.teamId]);
  const [kind, setKind] = useState<FitnessKind>(params.kind ?? 'beep');
  const [date, setDate] = useState(() => localDmy(new Date().toISOString()));
  const [values, setValues] = useState<Record<string, string>>({});
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const t = fitnessTest(kind);
  const entered = Object.entries(values).filter(([, v]) => v.trim());
  const bad = entered.filter(([, v]) => parseFitness(kind, v) == null).map(([id]) => id);

  async function save() {
    const on = dmyToIso(date);
    if (!on) return Alert.alert('Check the date', 'Use dd/mm/yyyy.');
    if (bad.length) return Alert.alert('Check the highlighted results', t.how);
    await addFitnessResults(
      db,
      entered.map(([personId, v]) => ({ personId, kind, value: parseFitness(kind, v)!, testedOn: on, recordedById: bundle!.access.meId })),
    );
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Testing day' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={entered.length ? `Save ${entered.length} result${entered.length > 1 ? 's' : ''}` : 'Enter some results'} kind="primary" big disabled={!entered.length} onPress={save} />
          </Footer>
        }>
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k);
            setValues({});
          }}
          options={FITNESS_TESTS.map((x) => ({ value: x.kind, label: x.short }))}
        />
        <T v="small">{t.how} Leave blank for anyone who didn’t test.</T>
        <DateField label="Date" value={date} onChangeText={setDate} />
        {bundle.squad.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <T v="bodyStrong" style={{ flex: 1 }}>
              {displayName(p)}
            </T>
            <TextInput
              value={values[p.id] ?? ''}
              onChangeText={(v) => setValues({ ...values, [p.id]: v })}
              keyboardType="decimal-pad"
              placeholder={t.placeholder}
              placeholderTextColor={colors.faint}
              accessibilityLabel={`${t.label} for ${displayName(p)}`}
              style={{
                width: 96,
                minHeight: 44,
                borderRadius: 10,
                borderWidth: bad.includes(p.id) ? 2 : 1,
                borderColor: bad.includes(p.id) ? colors.danger : colors.border,
                backgroundColor: colors.surface,
                paddingHorizontal: 12,
                fontFamily: font.bold,
                fontSize: 18,
                color: colors.ink,
                textAlign: 'center',
              }}
            />
          </View>
        ))}
      </Screen>
    </>
  );
}
