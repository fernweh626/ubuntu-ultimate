import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { standingLists } from '@/db/development';
import { useData } from '@/db/live';
import { getAccess } from '@/db/repo';
import { uploadStanding } from '@/db/standing-upload';
import { shortDate } from '@/domain/format';
import { normNumber, parseStandingCsv, type StandingRow } from '@/domain/standing';
import { Button, Card, Choice, Screen, Section, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const ASSOCIATIONS = [{ code: 'safda', name: 'SAFDA (national)' }, ...REGIONS.map((r) => ({ code: r.code, name: `${r.body} · ${r.name}` }))];
const nameOf = (code: string) => ASSOCIATIONS.find((a) => a.code === code)?.name ?? code;

/** Coordinators/admins upload SAFDA's or a region's paid-up member list; the app matches it to players' numbers. */
export default function StandingUpload() {
  const db = useSQLiteContext();
  const bundle = useData(async (d) => {
    const regs = await d.getAllAsync<{ safda_number: string | null; region_code: string | null; region_number: string | null }>(`SELECT safda_number, region_code, region_number FROM registration`);
    return { access: await getAccess(d), lists: await standingLists(d), regs };
  });
  const [association, setAssociation] = useState('safda');
  const [parsed, setParsed] = useState<{ rows: StandingRow[]; skipped: number; file: string; columns: { number: string; status: string | null; until: string | null } } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const allowed = bundle.access.level === 'admin' || bundle.access.level === 'coordinator';

  const known = new Set(
    bundle.regs.map((r) => normNumber(association === 'safda' ? r.safda_number : r.region_code === association ? r.region_number : null)).filter(Boolean),
  );
  const matched = parsed ? parsed.rows.filter((r) => known.has(r.number)).length : 0;

  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      const p = parseStandingCsv(new File(res.assets[0].uri).textSync());
      setParsed({ ...p, file: res.assets[0].name });
    } catch (e) {
      Alert.alert('Couldn’t read that file', `${e instanceof Error ? e.message : e}\n\nSave the spreadsheet as CSV with a “number” column, and optionally “status” and “paid until”.`);
    }
  }

  async function upload() {
    if (!parsed) return;
    setBusy(true);
    try {
      const n = await uploadStanding(db, association, parsed.rows);
      setParsed(null);
      Alert.alert('Uploaded', `${n} ${nameOf(association)} members. Staff now see who’s in good standing.`);
    } catch (e) {
      Alert.alert('Upload failed', `${e instanceof Error ? e.message : e}\n\nYou need to be signed in as a coordinator or admin, with signal.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Paid-up lists' }} />
      <Screen edges={[]}>
        {!allowed ? (
          <Card>
            <T v="bodyStrong">Coordinators and admins only</T>
          </Card>
        ) : (
          <>
            <T v="small">
              Export the member list from SAFDA or a region as CSV (Excel → Save as CSV). It needs a column with the membership number; a “status”/“paid” column and a “paid until” date are used if they’re there. Uploading replaces that association’s previous list.
            </T>
            <Section title="Current lists">
              {bundle.lists.length ? (
                bundle.lists.map((l) => (
                  <T key={l.association} v="small">
                    {nameOf(l.association)}: {l.n} members · uploaded {shortDate(l.uploaded_at)}
                  </T>
                ))
              ) : (
                <T v="small">None yet.</T>
              )}
            </Section>
            <T v="smallStrong">Which association is this list from?</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {ASSOCIATIONS.map((a) => (
                <Choice key={a.code} label={a.name} selected={association === a.code} onPress={() => setAssociation(a.code)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
              ))}
            </ScrollView>
            <Button label={parsed ? `Change file (${parsed.file})` : 'Choose CSV file'} icon="file-upload-outline" onPress={pick} />
            {parsed ? (
              <Card style={{ backgroundColor: colors.brandTint, borderColor: colors.brandTint }}>
                <T v="bodyStrong">
                  {parsed.rows.length} members · {parsed.rows.filter((r) => r.status === 'good').length} in good standing
                </T>
                <T v="small">
                  Number column: “{parsed.columns.number}”{parsed.columns.status ? ` · status: “${parsed.columns.status}”` : ' · no status column, so everyone listed counts as paid up'}
                  {parsed.columns.until ? ` · paid until: “${parsed.columns.until}”` : ''}
                  {parsed.skipped ? ` · ${parsed.skipped} rows without a number skipped` : ''}
                </T>
                <T v="small">{matched} match players who’ve added their number in the app.</T>
                <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                  {busy ? <ActivityIndicator color={colors.brand} /> : <Button label={`Upload to ${nameOf(association)}`} icon="cloud-upload-outline" kind="primary" onPress={upload} style={{ flex: 1 }} />}
                </View>
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}
