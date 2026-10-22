import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { createFixtures, getEvent, listTeams, listVenues, saveEvent, eventTeams, saveVenue } from '@/db/repo';
import { parseSchedule, SCHEDULE_TEMPLATE } from '@/domain/fixtures';
import { shortDate, timeOfDay } from '@/domain/format';
import { rulesFor } from '@/domain/rules';
import { Button, Card, Chip, Field, Footer, Screen, Section, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function ScheduleImport() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => ({ event: await getEvent(d, eventId), teams: await listTeams(d), venues: await listVenues(d), entered: await eventTeams(d, eventId) }),
    [eventId],
  );
  const [text, setText] = useState('');

  if (!bundle?.event) return <Screen edges={[]}>{null}</Screen>;
  const { event, teams, venues, entered } = bundle;
  const rows = text.trim() ? parseSchedule(text, teams) : [];
  const good = rows.filter((r) => !r.error);
  const bad = rows.filter((r) => r.error);
  const name = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '';

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', 'text/tab-separated-values'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    try {
      setText(new File(res.assets[0].uri).textSync());
    } catch (e) {
      Alert.alert('Couldn’t read that file', `Save it as CSV (comma separated) and try again.\n\n${String(e)}`);
    }
  }

  async function importRows() {
    if (!good.length) return;
    // Fields named in the sheet but not saved yet are created (without GPS) so they can be picked later.
    const venueIds = new Map(venues.map((v) => [v.name.trim().toLowerCase(), v.id]));
    for (const r of good) {
      const key = r.venueName?.trim().toLowerCase();
      if (key && !venueIds.has(key)) {
        venueIds.set(key, await saveVenue(db, { name: r.venueName!, city: event!.location ?? null, latitude: null, longitude: null }));
      }
    }
    // Teams in the sheet join the event (with their pool if given).
    const teamPools = new Map(entered.map((t) => [t.id, t.pool]));
    for (const r of good) {
      for (const tid of [r.homeId!, r.awayId!]) if (!teamPools.has(tid) || (r.pool && !teamPools.get(tid))) teamPools.set(tid, r.pool ?? teamPools.get(tid) ?? null);
    }
    await saveEvent(db, { ...event!, teams: [...teamPools.entries()].map(([teamId, pool]) => ({ teamId, pool })) });
    const rules = rulesFor(event!.kind === 'league' ? 'league' : 'wfdf', event!.division);
    await createFixtures(
      db,
      good.map((r) => ({
        eventId,
        homeId: r.homeId!,
        awayId: r.awayId!,
        scheduledAt: r.scheduledAt,
        venueId: r.venueName ? venueIds.get(r.venueName.trim().toLowerCase()) ?? null : null,
        rules,
      })),
    );
    Alert.alert('Schedule imported', `${good.length} games added to ${event!.name}.`);
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Import schedule' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button
              label={good.length ? `Import ${good.length} game${good.length > 1 ? 's' : ''}${bad.length ? ` (skip ${bad.length})` : ''}` : 'Import'}
              kind="primary"
              big
              disabled={!good.length}
              onPress={importRows}
            />
          </Footer>
        }>
        <Card>
          <T v="bodyStrong">One row per game</T>
          <T v="small">Columns: date, time, field, home, away, pool (optional). Dates as dd/mm/yyyy. The home team sets up the field. Export from Excel or Google Sheets as CSV, or copy the rows and paste below.</T>
          <View style={{ backgroundColor: colors.neutralTint, borderRadius: 8, padding: space.sm }}>
            <T style={{ fontFamily: 'monospace', fontSize: 12, color: colors.ink }}>{SCHEDULE_TEMPLATE}</T>
          </View>
        </Card>
        <Button label="Choose a CSV file" icon="file-upload-outline" kind="primary" onPress={pickFile} />
        <Field label="…or paste the rows" value={text} onChangeText={setText} multiline placeholder="date,time,field,home,away" autoCapitalize="none" />

        {rows.length ? (
          <Section title={`Preview · ${good.length} ready${bad.length ? ` · ${bad.length} to fix` : ''}`}>
            {bad.map((r) => (
              <Card key={`bad-${r.line}`} style={{ borderColor: colors.danger }}>
                <Chip label={`Row ${r.line}`} tone="danger" />
                <T v="small" style={{ color: colors.danger }}>
                  {r.error}
                </T>
              </Card>
            ))}
            {good.map((r) => (
              <Card key={`ok-${r.line}`}>
                <T v="small">
                  {shortDate(r.scheduledAt)} {timeOfDay(r.scheduledAt)} · {r.venueName ?? 'Field TBC'}
                  {r.pool ? ` · Pool ${r.pool}` : ''}
                </T>
                <T v="bodyStrong">
                  {name(r.homeId)} <T v="small">(home)</T> v {name(r.awayId)}
                </T>
              </Card>
            ))}
          </Section>
        ) : null}
        <T v="small">Team names must match teams in the app (or their 3-letter short names). Add missing teams in the Teams tab first.</T>
      </Screen>
    </>
  );
}
