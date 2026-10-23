import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, TextInput, View } from 'react-native';

import { currentUser, linkAccount, resumeAccount, signIn, signOut, signUp } from '@/db/account';
import { notifyChanged, useData } from '@/db/live';
import { getMe, listPeople, savePerson } from '@/db/repo';
import { syncNow, syncStatus } from '@/db/sync';
import type { Gender } from '@/db/types';
import { displayName } from '@/domain/format';
import { Button, Card, Field, Icon, Row, Screen, Section, Segmented, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

function ago(iso: string | null) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Account() {
  const db = useSQLiteContext();
  const state = useData(async (d) => {
    const user = await currentUser();
    const signedIn = !!(await d.getFirstAsync(`SELECT 1 FROM app_meta WHERE key = 'signed_in'`));
    return { user, signedIn, me: await getMe(d), status: await syncStatus(d) };
  });
  const [busy, setBusy] = useState(false);

  if (!state) return <Screen edges={[]}>{null}</Screen>;
  const { user, signedIn, me, status } = state;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const m = (e as Error).message;
      Alert.alert(m === 'offline' ? 'No connection' : 'Something went wrong', m === 'offline' ? 'Your changes are saved on this phone and will sync when you have signal.' : m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Account & sync' }} />
      {!user ? (
        <SignInForm busy={busy} onSubmit={(mode, email, pw) => run(async () => {
          if (mode === 'up') await signUp(email, pw);
          else await signIn(email, pw);
          // Already linked on another phone: reconnect. Otherwise move on to "Which player are you?".
          // Signing in doesn't touch the local database, so refresh the screen ourselves.
          if (!(await resumeAccount(db))) notifyChanged();
        })} />
      ) : !signedIn ? (
        <LinkPlayer me={me ?? null} busy={busy} email={user.email ?? ''} onLink={(pid) => run(async () => {
          const admin = await linkAccount(db, pid);
          Alert.alert(
            'You’re part of Ubuntu now 🥏',
            admin
              ? 'You’re the very first account, so you’re the admin. Give others coordinator and scorekeeper access from their profiles.'
              : 'Your games, teams and stats are backed up and follow you to any phone. Welcome to the community!',
          );
          router.back();
        })} />
      ) : (
        <Screen edges={[]}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Icon name="cloud-check-outline" color={colors.brand} size={28} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{user.email}</T>
                <T v="small">{me ? `Playing as ${displayName(me)}` : 'Linked'}</T>
              </View>
            </View>
          </Card>
          <Section title="Sync">
            <Card>
              <T>Last synced {ago(status.last)}</T>
              <T v="small">{status.pending ? `${status.pending} change${status.pending > 1 ? 's' : ''} waiting to upload` : 'Everything on this phone is backed up.'}</T>
              {status.rejected.length ? (
                <T v="small" style={{ color: colors.warnInk }}>
                  {status.rejected.length} change{status.rejected.length > 1 ? 's were' : ' was'} not allowed by the server (your level doesn’t cover {status.rejected.length > 1 ? 'them' : 'it'}) and stayed on this phone only.
                </T>
              ) : null}
              <Button
                label={busy ? 'Syncing…' : 'Sync now'}
                icon="sync"
                kind="primary"
                disabled={busy}
                onPress={() => run(async () => {
                  const r = await syncNow(db);
                  Alert.alert('Synced', `${r.pushed} sent · ${r.pulled} received`);
                })}
              />
            </Card>
            <T v="small">The app works offline. It syncs on its own when you have signal — this button is just for peace of mind.</T>
          </Section>
          <Button
            label="Sign out"
            icon="logout"
            kind="ghost"
            onPress={() =>
              Alert.alert('Sign out?', 'Everything stays on this phone and syncs again when you sign back in.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', onPress: () => run(() => signOut(db)) },
              ])
            }
          />
        </Screen>
      )}
    </>
  );
}

function SignInForm({ busy, onSubmit }: { busy: boolean; onSubmit: (mode: 'in' | 'up', email: string, pw: string) => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  return (
    <Screen edges={[]}>
      <T v="title">Go online</T>
      <T v="small">Back up your games and stats, see your levels, and share with your team — players’ answers reach coaches, rosters and fixtures stay in step across phones.</T>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'up', label: 'Create account' },
          { value: 'in', label: 'Sign in' },
        ]}
      />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" hint="Never shown to anyone. Only used to sign in and send you game summaries." />
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" hint={mode === 'up' ? 'At least 6 characters.' : undefined} />
      {busy ? <ActivityIndicator color={colors.brand} /> : null}
      <Button
        label={mode === 'up' ? 'Create account' : 'Sign in'}
        kind="primary"
        big
        disabled={busy}
        onPress={() => {
          if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('Check your email address');
          if (pw.length < 6) return Alert.alert('Use a password of at least 6 characters');
          onSubmit(mode, email, pw);
        }}
      />
    </Screen>
  );
}

function LinkPlayer({ me, busy, email, onLink }: { me: { id: string; first_name: string; last_name: string; birth_date: string | null } | null; busy: boolean; email: string; onLink: (personId: string) => void }) {
  const db = useSQLiteContext();
  const people = useData(listPeople) ?? [];
  const [q, setQ] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [gender, setGender] = useState<Gender>('W');
  const s = q.trim().toLowerCase();
  const matches = s ? people.filter((p) => `${p.first_name} ${p.last_name} ${p.preferred_number ?? ''}`.toLowerCase().includes(s)).slice(0, 15) : [];

  return (
    <Screen edges={[]}>
      <View style={{ backgroundColor: colors.night, borderRadius: 14, padding: space.lg, gap: 6, alignItems: 'center' }}>
        <T style={{ fontSize: 40, lineHeight: 46 }}>🎉</T>
        <T style={{ fontFamily: font.display, fontSize: 28, lineHeight: 30, color: '#fff', textAlign: 'center' }}>WELCOME TO UBUNTU!</T>
        <T style={{ color: colors.nightMuted, textAlign: 'center' }}>Your account is ready: {email}</T>
        <T style={{ color: '#F0A27E', fontFamily: font.semibold, textAlign: 'center' }}>One last step: tell us which player you are.</T>
      </View>
      <T v="title">Which player are you?</T>
      <T v="small">So your stats, teams and levels follow you to any phone.</T>
      {me ? (
        <Card>
          <T v="bodyStrong">That’s me: {displayName(me)}</T>
          <Button label="Yes, link this player" kind="primary" disabled={busy} onPress={() => onLink(me.id)} />
        </Card>
      ) : null}
      <Section title="Find yourself">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
          <Icon name="magnify" color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Your name or number" placeholderTextColor={colors.faint} style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }} />
        </View>
        {matches.length ? (
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
            {matches.map((p) => (
              <Row key={p.id} title={displayName(p)} subtitle={p.preferred_number ? `#${p.preferred_number}` : undefined} onPress={() => onLink(p.id)} />
            ))}
          </View>
        ) : null}
      </Section>
      <Section title="Not listed? Create your player">
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="First name" value={first} onChangeText={setFirst} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last name" value={last} onChangeText={setLast} />
          </View>
        </View>
        <Segmented
          value={gender}
          onChange={setGender}
          options={[
            { value: 'W', label: 'Female matching' },
            { value: 'M', label: 'Male matching' },
            { value: 'X', label: 'Other' },
          ]}
        />
        <Button
          label="Create and link"
          disabled={busy}
          onPress={async () => {
            if (!first.trim()) return Alert.alert('Add your first name');
            const id = await savePerson(db, { first_name: first, last_name: last, gender });
            onLink(id);
          }}
        />
      </Section>
      {busy ? <ActivityIndicator color={colors.brand} /> : null}
    </Screen>
  );
}
