import { Stack } from 'expo-router';
import { useState } from 'react';

import { useData } from '@/db/live';
import { getMe, shoutoutsForPerson } from '@/db/repo';
import { shortDate } from '@/domain/format';
import { Card, EmptyState, Screen, Segmented, T } from '@/ui/components';

const name = (first: string | null, last: string | null) => (first ? `${first} ${last ?? ''}`.trim() : 'A teammate');

/** Shout-outs you've had from teammates (and the ones you gave), from post-game and practice check-ins. */
export default function Shoutouts() {
  const data = useData(async (d) => {
    const me = await getMe(d);
    return me ? { me, rows: await shoutoutsForPerson(d, me.id) } : null;
  });
  const [tab, setTab] = useState<'got' | 'gave'>('got');
  if (data === undefined) return <Screen edges={[]}>{null}</Screen>;
  const rows = (data?.rows ?? []).filter((r) => (tab === 'got' ? r.to_person_id === data!.me.id : r.from_person_id === data!.me.id));

  return (
    <>
      <Stack.Screen options={{ title: 'Shout-outs' }} />
      <Screen edges={[]}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'got', label: `For me · ${(data?.rows ?? []).filter((r) => r.to_person_id === data?.me.id).length}` },
            { value: 'gave', label: 'I gave' },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState
            icon="hand-clap"
            title={tab === 'got' ? 'No shout-outs yet' : 'You haven’t given any yet'}
            body="After a game or practice, the check-in asks who stood out. Shout-outs land here and the player gets a notification."
          />
        ) : (
          rows.map((r) => (
            <Card key={r.id}>
              <T v="bodyStrong">🙌 {tab === 'got' ? `From ${name(r.from_first, r.from_last)}` : `To ${name(r.to_first, r.to_last)}`}</T>
              {r.reason ? <T>“{r.reason}”</T> : null}
              <T v="small">{[r.what, r.team, shortDate(r.created_at)].filter(Boolean).join(' · ')}</T>
            </Card>
          ))
        )}
      </Screen>
    </>
  );
}
