import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { allFeedback, setFeedbackStatus, type ServerFeedback } from '@/db/feedback-send';
import { shortDate } from '@/domain/format';
import { Button, Card, Chip, Choice, Field, Screen, Segmented, Sheet, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const STATUS: Record<ServerFeedback['status'], string> = { new: 'New', planned: 'Planned', in_progress: 'In progress', done: 'Done', wont_do: 'Won’t do' };
const KIND: Record<string, string> = { bug: '🐞 Bug', feature: '✨ Feature', enhancement: '🔧 Better', other: '💬 Other' };

/** Admins triage bug reports and ideas. Needs a signed-in admin account; the server checks. */
export default function FeedbackAdmin() {
  const [rows, setRows] = useState<ServerFeedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [open, setOpen] = useState<ServerFeedback | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    allFeedback()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);
  useEffect(load, [load]);

  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === 'new' || r.status === 'planned' || r.status === 'in_progress');
  return (
    <>
      <Stack.Screen options={{ title: 'Reports & ideas' }} />
      <Screen edges={[]}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'all', label: 'All' },
          ]}
        />
        {error ? <T v="small" style={{ color: colors.danger }}>Couldn’t load: {error}. You need to be signed in as an admin.</T> : null}
        {!rows && !error ? <ActivityIndicator color={colors.brand} /> : null}
        {rows && shown.length === 0 ? <T v="small">Nothing here. 🎉</T> : null}
        {shown.map((f) => (
          <Card
            key={f.id}
            onPress={() => {
              setOpen(f);
              setNote(f.admin_note ?? '');
            }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
              <T v="bodyStrong" style={{ flex: 1 }}>
                {f.title}
              </T>
              <Chip label={STATUS[f.status]} tone={f.status === 'new' ? 'warn' : f.status === 'done' ? 'brand' : 'neutral'} />
            </View>
            <T v="small">{[KIND[f.kind], shortDate(f.created_at), f.screen, f.contact_ok ? 'can contact' : 'anonymous'].filter(Boolean).join(' · ')}</T>
            {f.body ? (
              <T v="small" numberOfLines={3}>
                {f.body}
              </T>
            ) : null}
          </Card>
        ))}
      </Screen>
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open ? (
          <>
            {open.body ? <T>{open.body}</T> : null}
            <T v="small">{[open.app_version, open.device, open.person_id && open.contact_ok ? `player ${open.person_id.slice(0, 8)}` : null].filter(Boolean).join(' · ')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {(Object.keys(STATUS) as ServerFeedback['status'][]).map((s) => (
                <Choice
                  key={s}
                  label={STATUS[s]}
                  selected={open.status === s}
                  onPress={() => setOpen({ ...open, status: s })}
                  style={{ minHeight: 40, paddingHorizontal: 12 }}
                />
              ))}
            </View>
            <Field label="Note (only admins see it)" value={note} onChangeText={setNote} multiline />
            <Button
              label="Save"
              kind="primary"
              onPress={async () => {
                try {
                  await setFeedbackStatus(open.id, open.status, note.trim() || null);
                  setOpen(null);
                  load();
                } catch (e) {
                  Alert.alert('Couldn’t save', String(e));
                }
              }}
            />
          </>
        ) : null}
      </Sheet>
    </>
  );
}
