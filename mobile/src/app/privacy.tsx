import { File, Paths } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';

import { PRIVACY_EMAIL } from '@/content/hub';
import { sendRequest } from '@/db/feedback-send';
import { useData } from '@/db/live';
import { myDataExport } from '@/db/my-data';
import { getAccess, getMe } from '@/db/repo';
import { displayName } from '@/domain/format';
import { Button, Card, Choice, Field, Icon, Screen, Section, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const REQUESTS = [
  { key: 'correct', label: 'Fix something about me', title: 'Correct my data' },
  { key: 'delete', label: 'Delete my data', title: 'Delete my data and account' },
  { key: 'question', label: 'A question about my data', title: 'Question about my data' },
] as const;

/** Where your data lives, who sees it, download it, or ask for it to be fixed or deleted. */
export default function Privacy() {
  const db = useSQLiteContext();
  const me = useData(getMe);
  const access = useData(getAccess);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<(typeof REQUESTS)[number]['key']>('correct');
  const [note, setNote] = useState('');

  async function download() {
    if (!me) return;
    setBusy(true);
    try {
      const json = JSON.stringify(await myDataExport(db, me.id), null, 2);
      const name = `ubuntu-ultimate-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = name;
        a.click();
      } else {
        const file = new File(Paths.cache, name);
        if (file.exists) file.delete();
        file.create();
        file.writeSync(json);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'My data', UTI: 'public.json' });
      }
    } catch (e) {
      Alert.alert('Couldn’t make the file', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function request() {
    const r = REQUESTS.find((x) => x.key === kind)!;
    const sent = await sendRequest(db, `[Privacy] ${r.title}`, `${me ? displayName(me) : 'Unknown player'}${access?.signedIn ? ' (signed in)' : ''}\n\n${note.trim()}`, me?.id ?? null);
    setNote('');
    Alert.alert('Request sent', sent ? 'An admin will get back to you, usually within a week. The law allows up to 30 days.' : 'Saved. It sends next time you have signal.');
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Your data & privacy' }} />
      <Screen edges={[]}>
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Icon name="shield-lock-outline" color={colors.brand} />
            <T v="bodyStrong">The short version</T>
          </View>
          <T v="small">Your data is used to run ultimate in SA: games, teams, practices and tournaments. It’s never sold, never used for ads, and you can download it or ask for it to be deleted any time.</T>
          <Button label="Read the full explanation" kind="ghost" onPress={() => router.push({ pathname: '/guide', params: { topic: 'data-where' } })} style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 0 }} />
        </Card>

        <Section title="Download my data">
          <T v="small">One file with your profile and everything linked to you on this phone: teams, games and stats, practices, ratings, fitness, accreditation and numbers.</T>
          <Button label={busy ? 'Making the file…' : 'Download my data'} icon="download" kind="primary" disabled={!me || busy} onPress={download} />
          {!me ? <T v="small">Pick which player you are in Me first.</T> : null}
        </Section>

        <Section title="Fix or delete my data">
          {REQUESTS.map((r) => (
            <Choice key={r.key} label={r.label} selected={kind === r.key} onPress={() => setKind(r.key)} style={{ alignItems: 'flex-start' }} />
          ))}
          <Field label="Details (optional)" value={note} onChangeText={setNote} multiline placeholder={kind === 'delete' ? 'Anything we should keep, e.g. game scores for your team' : 'What should change?'} />
          <Button label="Send to the admins" icon="send" onPress={request} />
          <Button
            label={`Or email ${PRIVACY_EMAIL}`}
            icon="email-outline"
            kind="ghost"
            onPress={() => Linking.openURL(`mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent('Privacy request')}`)}
            style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 0 }}
          />
          <T v="small">You can fix most things yourself: Me → Edit profile. Deleting removes your profile, contact details, ratings, fitness and accreditation. Game scores stay, with your name taken off.</T>
        </Section>
      </Screen>
    </>
  );
}
