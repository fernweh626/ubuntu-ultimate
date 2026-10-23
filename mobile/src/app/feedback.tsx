import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';

import { myFeedback, saveFeedback, type FeedbackKind } from '@/db/development';
import { sendPendingFeedback } from '@/db/feedback-send';
import { useData } from '@/db/live';
import { getAccess } from '@/db/repo';
import { shortDate } from '@/domain/format';
import { Button, Card, Chip, Choice, Field, Footer, Screen, Section, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const KINDS: { value: FeedbackKind; label: string; hint: string; titleHint: string }[] = [
  { value: 'bug', label: '🐞 Bug', hint: 'Something broke or did the wrong thing.', titleHint: 'e.g. Score went back to 0 after undo' },
  { value: 'feature', label: '✨ New feature', hint: 'Something the app can’t do yet.', titleHint: 'e.g. Let me track hat tournaments' },
  { value: 'enhancement', label: '🔧 Make it better', hint: 'Something that works but could be easier or clearer.', titleHint: 'e.g. Bigger buttons on the scoring screen' },
  { value: 'other', label: '💬 Other', hint: 'Anything else: praise, questions, data fixes.', titleHint: 'What’s it about?' },
];

/** Report a bug or suggest something. Saved on the phone first, sent as soon as there's signal. */
export default function Feedback() {
  const db = useSQLiteContext();
  const mine = useData(myFeedback) ?? [];
  const access = useData(getAccess);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [where, setWhere] = useState('');
  const [contact, setContact] = useState(true);
  const k = KINDS.find((x) => x.value === kind)!;

  async function send() {
    if (!title.trim()) return Alert.alert('Add a short title', 'One line is enough.');
    await saveFeedback(db, {
      kind,
      title: title.trim().slice(0, 200),
      body: body.trim().slice(0, 5000) || null,
      screen: where.trim().slice(0, 200) || null,
      app_version: `${Constants.expoConfig?.version ?? '?'}${Constants.appOwnership === 'expo' ? ' (Expo Go)' : ''}`,
      device: `${Device.manufacturer ?? ''} ${Device.modelName ?? ''} · ${Platform.OS} ${Device.osVersion ?? ''}`.trim().slice(0, 200),
      contact_ok: contact ? 1 : 0,
      person_id: access?.meId ?? null,
    });
    const n = await sendPendingFeedback(db).catch(() => 0);
    setTitle('');
    setBody('');
    setWhere('');
    Alert.alert('Thank you! 🙌', n ? 'Sent. We read every one.' : 'Saved. It will send next time you have signal.');
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Bugs & ideas' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Send" icon="send" kind="primary" big onPress={send} />
          </Footer>
        }>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {KINDS.map((x) => (
            <Choice key={x.value} label={x.label} selected={kind === x.value} onPress={() => setKind(x.value)} style={{ width: '48.5%' }} />
          ))}
        </View>
        <T v="small">{k.hint}</T>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder={k.titleHint} maxLength={200} />
        <Field
          label={kind === 'bug' ? 'What happened, and what did you expect?' : 'Tell us more (optional)'}
          value={body}
          onChangeText={setBody}
          multiline
          placeholder={kind === 'bug' ? '1. I tapped…\n2. Then…\nI expected…' : 'Why would it help? Who would use it?'}
          maxLength={5000}
        />
        {kind === 'bug' ? <Field label="Which screen? (optional)" value={where} onChangeText={setWhere} placeholder="e.g. scoring, team page, pickups" /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">You can contact me about this</T>
            <T v="small">Attaches your player name (never your email). Off = anonymous.</T>
          </View>
          <Switch value={contact} onValueChange={setContact} trackColor={{ true: colors.brand }} />
        </View>
        <T v="small">We also attach the app version and phone model to help fix bugs.</T>

        {access?.level === 'admin' ? <Button label="See everyone’s reports (admin)" icon="inbox-full-outline" onPress={() => router.push('/feedback-admin')} /> : null}

        {mine.length ? (
          <Section title="What you’ve sent">
            {mine.slice(0, 10).map((f) => (
              <Card key={f.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
                  <T v="bodyStrong" style={{ flex: 1 }}>
                    {f.title}
                  </T>
                  <Chip label={f.sent_at ? 'Sent' : 'Waiting for signal'} tone={f.sent_at ? 'brand' : 'warn'} />
                </View>
                <T v="small">
                  {KINDS.find((x) => x.value === f.kind)?.label} · {shortDate(f.created_at)}
                </T>
              </Card>
            ))}
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
