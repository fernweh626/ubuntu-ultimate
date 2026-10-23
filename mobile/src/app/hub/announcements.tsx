import { router, Stack } from 'expo-router';
import { Linking, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { useData } from '@/db/live';
import { getAccess, listAnnouncements } from '@/db/repo';
import { shortDate } from '@/domain/format';
import { Button, Card, Chip, EmptyState, IconButton, Screen, T } from '@/ui/components';
import { RegionChips, useRegionFilter } from '@/ui/region-filter';
import { space } from '@/ui/theme';

/** News from SAFDA and the regions: Nationals dates, AGMs, constitution reviews… Coordinators post. */
export default function Announcements() {
  const list = useData(listAnnouncements) ?? [];
  const access = useData(getAccess);
  const region = useRegionFilter();
  const runs = access?.level === 'admin' || access?.level === 'coordinator';
  const shown = list.filter((a) => region.value === 'all' || !a.region_code || a.region_code === region.value);
  const who = (code: string | null) => (code ? (REGIONS.find((r) => r.code === code)?.body ?? code) : 'SAFDA · national');

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Announcements',
          headerRight: () => (runs ? <IconButton icon="plus" label="New announcement" onPress={() => router.push('/hub/announcement-edit')} /> : null),
        }}
      />
      <Screen edges={[]}>
        <RegionChips value={region.value} onChange={region.setValue} home={region.home} />
        {shown.length === 0 ? (
          <EmptyState icon="bullhorn-outline" title="No announcements yet" body={runs ? 'Tap + to post one, e.g. Nationals dates or an AGM notice.' : 'News from SAFDA and your region will show up here.'} />
        ) : (
          shown.map((a) => (
            <Card key={a.id} onPress={runs ? () => router.push({ pathname: '/hub/announcement-edit', params: { id: a.id } }) : undefined}>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {a.pinned ? <Chip label="Pinned" icon="pin" /> : null}
                <Chip label={who(a.region_code)} tone="neutral" />
                <Chip label={shortDate(a.published_at)} tone="neutral" />
              </View>
              <T v="title">{a.title}</T>
              {a.body ? <T>{a.body}</T> : null}
              {a.link_url ? (
                <Button label={a.link_label || 'Open link'} icon="open-in-new" onPress={() => (a.link_url!.startsWith('/') ? router.push(a.link_url as never) : Linking.openURL(a.link_url!))} style={{ alignSelf: 'flex-start' }} />
              ) : null}
            </Card>
          ))
        )}
      </Screen>
    </>
  );
}
