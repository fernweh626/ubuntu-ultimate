import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { useData } from '@/db/live';
import { getAccess, getCalendarEntry, meetingRsvps, setMeetingRsvp } from '@/db/repo';
import { KIND_LABEL, meetingStart } from '@/domain/calendar';
import { displayName, shortDate } from '@/domain/format';
import { AnswerButtons, type Answer } from '@/ui/answer';
import { Button, Card, Chip, IconButton, Screen, Section, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

const TO: Record<Answer, 'going' | 'late' | 'not_going'> = { yes: 'going', late: 'late', no: 'not_going' };

/** A meeting (AGM, SGM…): when, how to join, the agenda, and RSVP. Coordinators see who's coming. */
export default function Meeting() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const bundle = useData(async (d) => ({ e: await getCalendarEntry(d, id), access: await getAccess(d), rsvps: await meetingRsvps(d, id) }), [id]);
  const [opened] = useState(() => Date.now());
  if (!bundle?.e) return <Screen edges={[]}>{null}</Screen>;
  const { e, access, rsvps } = bundle;
  const runs = access.level === 'admin' || access.level === 'coordinator';
  const mine = rsvps.find((r) => r.person_id === access.meId);
  const start = meetingStart(e);
  const over = start ? opened > start.getTime() + 3 * 3600_000 : false;
  const who = e.region ? (REGIONS.find((r) => r.code === e.region)?.body ?? e.region) : 'Everyone · SAFDA';
  const going = rsvps.filter((r) => r.status !== 'not_going');
  const apologies = rsvps.filter((r) => r.status === 'not_going');

  return (
    <>
      <Stack.Screen
        options={{
          title: KIND_LABEL[e.kind] ?? 'Meeting',
          headerRight: () => (runs ? <IconButton icon="pencil" label="Edit meeting" onPress={() => router.push({ pathname: '/hub/calendar-edit', params: { id } })} /> : null),
        }}
      />
      <Screen edges={[]}>
        <Card style={{ backgroundColor: colors.night, borderColor: colors.night, gap: space.xs }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label={KIND_LABEL[e.kind] ?? 'Meeting'} tone="dark" />
            <Chip label={who} tone="neutral" />
          </View>
          <T style={{ fontFamily: font.display, fontSize: 28, lineHeight: 30, color: '#fff' }}>{e.name}</T>
          <T style={{ fontFamily: font.semibold, fontSize: 16, color: colors.nightMuted }}>
            {[e.start_date ? shortDate(e.start_date) : 'Date to be confirmed', e.start_time ? `${e.start_time}${e.end_time ? `–${e.end_time}` : ''}` : null, e.location].filter(Boolean).join(' · ')}
          </T>
          {e.meeting_url && !over ? <Button label="Join meeting" icon="video-outline" kind="primary" onPress={() => Linking.openURL(e.meeting_url!)} /> : null}
          {e.url ? <Button label="Documents & more" icon="open-in-new" kind="dark" onPress={() => Linking.openURL(e.url!)} /> : null}
        </Card>

        {!over ? (
          <Section title="Are you coming?">
            {access.meId ? (
              <AnswerButtons
                yesLabel="Attending"
                noLabel="Send apologies"
                value={mine ? (mine.status === 'going' ? 'yes' : mine.status === 'late' ? 'late' : 'no') : null}
                onAnswer={(a, note) => setMeetingRsvp(db, id, access.meId!, a ? TO[a] : null, note)}
              />
            ) : (
              <T v="small">Pick yourself in Me to RSVP.</T>
            )}
            {mine?.note ? <T v="small">Your note: {mine.note}</T> : null}
          </Section>
        ) : null}

        <Section title="About & agenda">
          {e.notes ? <T style={{ lineHeight: 22 }}>{e.notes}</T> : <T v="small">No agenda yet.</T>}
        </Section>

        {runs ? (
          <Section title={`RSVPs · ${going.length} attending · ${apologies.length} apologies`}>
            {going.length ? <T v="small">Attending: {going.map((r) => `${displayName(r)}${r.status === 'late' ? ' (late)' : ''}`).join(', ')}</T> : null}
            {apologies.length ? <T v="small">Apologies: {apologies.map((r) => `${displayName(r)}${r.note ? ` (${r.note})` : ''}`).join(', ')}</T> : null}
            <T v="small">Only coordinators and admins see this list.</T>
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
