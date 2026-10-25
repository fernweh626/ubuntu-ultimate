import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { decideJoinRequests } from '@/db/account';
import { useData } from '@/db/live';
import { cancelJoinRequest, decideJoinLocally, getAccess, joinOrRequest, myJoinRequest, pendingForStaff, pendingJoinRequests, type JoinKind } from '@/db/repo';
import { displayName, shortDate } from '@/domain/format';

import { Button, Card, Choice, Field, Icon, Row, Section, Sheet, T } from './components';
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
    else Alert.alert('Request sent 👍', `This has been sent to ${teamName}’s team staff for approval. You’ll get a notification when they say yes, and their games will then show on your Home.`);
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

const LABELS: { value: JoinKind; label: string }[] = [
  { value: 'core', label: 'Core' },
  { value: 'guest', label: 'Guest' },
  { value: 'mercenary', label: 'Pick-up' },
];

/**
 * For team staff: who's asked to join. Each request can be labelled (core / guest / pick-up), approved
 * or declined on its own, or ticked and approved together.
 */
export function JoinRequests({ teamId }: { teamId: string }) {
  const db = useSQLiteContext();
  const access = useData(getAccess);
  const list = useData((d) => pendingJoinRequests(d, teamId), [teamId]) ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, JoinKind>>({});
  const [busy, setBusy] = useState(false);
  if (!list.length) return null;

  const labelOf = (r: (typeof list)[number]) => labels[r.id] ?? r.kind;
  async function decide(ids: string[], approve: boolean) {
    if (!ids.length) return;
    setBusy(true);
    try {
      // One call per label, so mixed labels still go in a couple of calls.
      const groups = new Map<JoinKind, string[]>();
      for (const id of ids) {
        const r = list.find((x) => x.id === id);
        if (r) groups.set(labelOf(r), [...(groups.get(labelOf(r)) ?? []), id]);
      }
      for (const [k, g] of groups) {
        if (access?.signedIn) await decideJoinRequests(db, g, approve, k);
        else for (const id of g) await decideJoinLocally(db, id, approve, k);
      }
      setPicked((p) => p.filter((x) => !ids.includes(x)));
    } catch (e) {
      Alert.alert('Couldn’t save that', `${String((e as Error).message ?? e)}\n\nYou need signal to approve requests.`);
    } finally {
      setBusy(false);
    }
  }
  const all = list.map((r) => r.id);
  const allPicked = picked.length === list.length;
  function approveMany() {
    const ids = picked.length ? picked : all;
    Alert.alert(`Add ${ids.length} to the team?`, 'Each gets the label shown on their card.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add them', onPress: () => decide(ids, true) },
    ]);
  }

  return (
    <Section title={`Wants to join · ${list.length}`}>
      {list.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            label={allPicked ? 'Untick all' : 'Tick all'}
            icon={allPicked ? 'checkbox-blank-outline' : 'checkbox-multiple-marked-outline'}
            onPress={() => setPicked(allPicked ? [] : all)}
            style={{ flex: 1 }}
          />
          <Button label={picked.length ? `Approve ${picked.length}` : 'Approve all'} icon="check-all" kind="primary" disabled={busy} onPress={approveMany} style={{ flex: 1 }} />
        </View>
      ) : null}
      <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
        {list.map((r) => {
          const on = picked.includes(r.id);
          return (
            <View key={r.id} style={{ backgroundColor: on ? colors.brandTint : colors.surface }}>
              <Row
                title={displayName(r)}
                subtitle={[`Asked as ${KINDS.find((k) => k.value === r.kind)?.label.toLowerCase()}`, shortDate(r.created_at), r.message ? `“${r.message}”` : null].filter(Boolean).join(' · ')}
                left={list.length > 1 ? <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} color={on ? colors.brand : colors.faint} /> : undefined}
                onPress={list.length > 1 ? () => setPicked(on ? picked.filter((x) => x !== r.id) : [...picked, r.id]) : undefined}
              />
              <View style={{ paddingHorizontal: space.md, gap: space.sm, paddingBottom: space.md }}>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  {LABELS.map((l) => (
                    <Choice
                      key={l.value}
                      label={l.label}
                      selected={labelOf(r) === l.value}
                      onPress={() => setLabels({ ...labels, [r.id]: l.value })}
                      style={{ flex: 1, minHeight: 36, paddingHorizontal: 6 }}
                    />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button label="Add to team" icon="check" kind="primary" disabled={busy} onPress={() => decide([r.id], true)} style={{ flex: 1 }} />
                  <Button label="No" disabled={busy} onPress={() => decide([r.id], false)} style={{ flex: 1 }} />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

/** For team staff, on Home: a pop-up when new people ask to join one of their teams, once per request. */
export function JoinRequestPrompt() {
  const db = useSQLiteContext();
  const access = useData(getAccess);
  const teams = access?.staffTeamIds ?? [];
  const list = useData((d) => pendingForStaff(d, teams), [teams.join(',')]);
  useEffect(() => {
    if (!list?.length) return;
    (async () => {
      const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'join_prompted'`);
      const seen: string[] = row ? JSON.parse(row.value) : [];
      const fresh = list.filter((r) => !seen.includes(r.id));
      if (!fresh.length) return;
      await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('join_prompted', ?)`, JSON.stringify([...seen, ...fresh.map((r) => r.id)].slice(-200)));
      const first = fresh[0];
      const sameTeam = fresh.every((r) => r.team_id === first.team_id);
      Alert.alert(
        fresh.length === 1 ? `Someone wants to join ${first.team}` : `${fresh.length} people want to join${sameTeam ? ` ${first.team}` : ' your teams'}`,
        'Approve them (and label them core, guest or pick-up) on the team page.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Review', onPress: () => router.push(`/team/${first.team_id}?tab=staff`) },
        ],
      );
    })();
  }, [db, list]);
  return null;
}
