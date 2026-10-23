import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Switch, View } from 'react-native';

import { useData } from '@/db/live';
import { ensurePermission, notificationsAvailable, refreshNotifications } from '@/notify/manager';
import { Notify } from '@/notify/native';
import { describeWhen, getPrefs, planNotifications, setPrefs, type NotifyPrefs } from '@/notify/plan';
import { Button, Card, Screen, Section, Segmented, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const ITEMS: { key: keyof NotifyPrefs; title: string; body: string }[] = [
  { key: 'gameReminders', title: 'Game reminders', body: 'Can you play? 5 days before, then 24 hours and 100 minutes before: where, when and who.' },
  { key: 'postGame', title: 'After the game', body: 'Your game card is ready + a 1-minute check-in. One nudge next morning if you haven’t.' },
  { key: 'practices', title: 'Practices', body: 'Are you coming? the day before, a reminder if you are, and a 1-minute check-in after.' },
  { key: 'accreditation', title: 'Accreditation expiry', body: '6 months, 1 month and 1 week before it runs out.' },
  { key: 'development', title: 'Self-rating check-in', body: 'Every six months, a nudge to rate yourself again.' },
  { key: 'shoutouts', title: 'Shout-outs', body: 'When a teammate shouts you out.' },
  { key: 'fixtureChanges', title: 'Fixture changes', body: 'Your team’s game moves, is postponed or forfeited.' },
  { key: 'spirit', title: 'Spirit score due', body: 'Captains and spirit captains, 2 hours after a game.' },
  { key: 'roster', title: 'Confirm who played', body: 'Team staff, the morning after, if anyone is unconfirmed.' },
  { key: 'joinRequests', title: 'Join requests', body: 'Staff: someone wants to join. Players: your request was answered.' },
  { key: 'followedResults', title: 'Results of teams you follow', body: 'Final scores. Off by default — it can get busy.' },
];

const QUIET = [
  { value: '21-7', label: '21:00–07:00' },
  { value: '22-6', label: '22:00–06:00' },
  { value: 'off', label: 'Off' },
];

export default function NotificationSettings() {
  const db = useSQLiteContext();
  const loaded = useData(getPrefs);
  const upcoming = useData((d) => planNotifications(d)) ?? [];
  const [prefs, setLocal] = useState<NotifyPrefs | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    ensurePermission(false).then(setAllowed);
  }, []);

  const p = prefs ?? loaded;
  if (!p) return <Screen edges={[]}>{null}</Screen>;

  async function update(next: NotifyPrefs) {
    setLocal(next);
    await setPrefs(db, next);
    await refreshNotifications(db);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <Screen edges={[]}>
        {!notificationsAvailable ? (
          <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
            <T v="bodyStrong" style={{ color: colors.warnInk }}>
              {Platform.OS === 'web' ? 'Notifications come to your phone' : 'Notifications aren’t available in this version of the app'}
            </T>
            <T v="small" style={{ color: colors.warnInk }}>
              {Platform.OS === 'web' ? 'Open the app on your phone to get reminders. ' : 'They’ll work in the installed app. '}Your settings here are saved for then.
            </T>
          </Card>
        ) : allowed === false ? (
          <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
            <T v="bodyStrong" style={{ color: colors.warnInk }}>
              Notifications are off for this app
            </T>
            <Button label="Turn them on" kind="primary" onPress={async () => setAllowed(await ensurePermission(true))} />
          </Card>
        ) : null}
        <T v="small">Only what you need to act on. At most three a day — game days excepted.</T>
        <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          {ITEMS.map((it, i) => (
            <Pressable
              key={it.key}
              onPress={() => update({ ...p, [it.key]: !p[it.key] })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{it.title}</T>
                <T v="small">{it.body}</T>
              </View>
              <Switch value={!!p[it.key]} onValueChange={(v) => update({ ...p, [it.key]: v })} trackColor={{ true: colors.brand }} />
            </Pressable>
          ))}
        </View>
        <Section title="Quiet hours">
          <Segmented
            value={p.quietStart == null ? 'off' : `${p.quietStart}-${p.quietEnd}`}
            onChange={(v) => {
              if (v === 'off') return update({ ...p, quietStart: null, quietEnd: null });
              const [s, e] = v.split('-').map(Number);
              update({ ...p, quietStart: s, quietEnd: e });
            }}
            options={QUIET}
          />
          <T v="small">Reminders move out of quiet hours. The 100-minute game reminder always comes through.</T>
        </Section>
        <Section title={`Coming up · ${upcoming.length}`}>
          {upcoming.slice(0, 6).map((u) => (
            <Card key={u.key}>
              <T v="small">{describeWhen(u.at)}</T>
              <T v="bodyStrong">{u.title}</T>
              <T v="small">{u.body}</T>
            </Card>
          ))}
          {upcoming.length === 0 ? <T v="small">Nothing scheduled. Reminders appear once your team has fixtures.</T> : null}
        </Section>
        <Button
          label="Send me a test"
          icon="bell-ring-outline"
          onPress={async () => {
            if (!Notify) return Alert.alert('Not available here', 'Notifications will work in the installed app.');
            if (!(await ensurePermission(true))) return Alert.alert('Notifications are off', 'Allow them in your phone’s settings.');
            await Notify.scheduleNotificationAsync({
              content: { title: '100 minutes to the pull 🥏', body: 'That’s one full hard cap to find your boots. (This is a test.)' },
              trigger: { type: Notify.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
            });
          }}
        />
      </Screen>
    </>
  );
}
