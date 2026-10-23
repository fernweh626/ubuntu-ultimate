import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { decideJoinRequest } from '@/db/account';
import { useData } from '@/db/live';
import { cancelJoinRequest, decideJoinLocally, getAccess, joinOrRequest, myJoinRequest, pendingJoinRequests, type JoinKind } from '@/db/repo';
import { displayName, shortDate } from '@/domain/format';

import { Button, Card, Choice, Field, Row, Section, Sheet, T } from './components';
import { colors, space } from './theme';

const KINDS: { value: JoinKind; label: string; body: string }[] = [
  { value: 'core', label: 'I play for this team', body: 'Regular member: practices, league, tournaments.' },
  { value: 'guest', label: 'Guest', body: 'Playing with them for a while, e.g. visiting or trying out.' },
  { value: 'mercenary', label: 'Pick-up for a tournament', body: 'Filling in for one event.' },
];

/** The big “Join this team” on a team page, or where your request stands. */
export function JoinTeamBar({ teamId, teamName, onSquad }: { teamId: string; teamName: string; onSquad: boolean }) {
  const db = useSQLiteContext();
  const access = useData(getAccess);
  const pending = useData(async (d) => (access?.meId ? myJoinRequest(d, access.meId, teamId) : null), [access?.meId, teamId]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<JoinKind>('core');
  const [message, setMessage] = useState('');

  if (onSquad || !access) return null;
  if (!access.meId)
    return (
      <Card>
        <T v="small">To join, first tell the app who you are: tap the person button at the top of Home.</T>
      </Card>
    );
  if (pending)
    return (
      <Card style={{ backgroundColor: colors.brandTint, borderColor: colors.brandTint }}>
        <T v="bodyStrong">Request sent · waiting for the captain</T>
        <T v="small">Sent {shortDate(pending.created_at)}. You’ll be on the team as soon as their staff (or a coordinator) say yes. Give them a nudge on WhatsApp if it’s taking a while.</T>
        <Button label="Cancel request" kind="ghost" onPress={() => cancelJoinRequest(db, pending.id)} style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 0 }} />
      </Card>
    );

  async function join() {
    const r = await joinOrRequest(db, access!.meId!, teamId, kind, message.trim() || null);
    setOpen(false);
    setMessage('');
    if (r === 'joined') Alert.alert(`Welcome to ${teamName}! 🥏`, 'Their games and practices now show on your Home and in My schedule.');
  }

  const direct = !access.signedIn || access.level === 'admin' || access.level === 'coordinator' || access.staffTeamIds.includes(teamId);
  return (
    <>
      <Button label="Join this team" icon="account-plus" kind="primary" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={`Join ${teamName}`}>
        {KINDS.map((k) => (
          <Choice key={k.value} label={k.label} sublabel={k.body} selected={kind === k.value} onPress={() => setKind(k.value)} style={{ alignItems: 'flex-start' }} />
        ))}
        {!direct ? <Field label="Message to the captain (optional)" value={message} onChangeText={setMessage} placeholder="e.g. Hi! I’m new in Cape Town, played for…" /> : null}
        <Button label={direct ? 'Join' : 'Ask to join'} kind="primary" big onPress={join} />
        {!direct ? <T v="small">The team’s captain or coach approves it, so random people can’t add themselves to your roster.</T> : null}
      </Sheet>
    </>
  );
}

/** For team staff: who’s asked to join, with yes / no. */
export function JoinRequests({ teamId }: { teamId: string }) {
  const db = useSQLiteContext();
  const access = useData(getAccess);
  const list = useData((d) => pendingJoinRequests(d, teamId), [teamId]) ?? [];
  if (!list.length) return null;

  async function decide(id: string, approve: boolean) {
    try {
      if (access?.signedIn) await decideJoinRequest(db, id, approve);
      else await decideJoinLocally(db, id, approve);
    } catch (e) {
      Alert.alert('Couldn’t save that', `${String((e as Error).message ?? e)}\n\nYou need signal to approve requests.`);
    }
  }

  return (
    <Section title={`Wants to join · ${list.length}`}>
      <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
        {list.map((r) => (
          <View key={r.id} style={{ backgroundColor: colors.surface }}>
            <Row title={displayName(r)} subtitle={[KINDS.find((k) => k.value === r.kind)?.label, shortDate(r.created_at), r.message ? `“${r.message}”` : null].filter(Boolean).join(' · ')} />
            <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md }}>
              <Button label="Add to team" icon="check" kind="primary" onPress={() => decide(r.id, true)} style={{ flex: 1 }} />
              <Button label="No" onPress={() => decide(r.id, false)} style={{ flex: 1 }} />
            </View>
          </View>
        ))}
      </View>
    </Section>
  );
}
