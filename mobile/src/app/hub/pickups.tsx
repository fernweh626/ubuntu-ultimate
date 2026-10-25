import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useData } from '@/db/live';
import { getAccess, listFollows, listPickups, setFollowing } from '@/db/repo';
import { canEditPickup } from '@/domain/permissions';
import { DAYS, DAYS_LONG, weekdayIndex } from '@/domain/format';
import { Button, Card, Chip, Choice, EmptyState, IconButton, Screen, T, RichText } from '@/ui/components';
import { RegionChips, useRegionFilter } from '@/ui/region-filter';
import { colors, font, space } from '@/ui/theme';

const LEVEL = { all: 'All levels', beginner: 'Beginner friendly', competitive: 'Competitive' } as const;

function mapsUrl(q: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default function Pickups() {
  const db = useSQLiteContext();
  const pickups = useData(listPickups);
  const going = useData(async (d) => new Set((await listFollows(d)).filter((f) => f.kind === 'pickup').map((f) => f.target_id))) ?? new Set<string>();
  const access = useData(getAccess);
  const params = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState(params.day != null && /^[0-6]$/.test(params.day) ? Number(params.day) : weekdayIndex());
  const [city, setCity] = useState<string>('all');
  const region = useRegionFilter();

  const inRegion = useMemo(() => (pickups ?? []).filter((p) => region.value === 'all' || p.region === region.value), [pickups, region.value]);
  const cities = useMemo(() => Array.from(new Set(inRegion.map((p) => p.city))).sort(), [inRegion]);
  const inCity = inRegion.filter((p) => city === 'all' || p.city === city);
  const forDay = inCity.filter((p) => p.day_of_week === day);
  const countFor = (d: number) => inCity.filter((p) => p.day_of_week === d).length;

  const swipe = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX < -60) setDay((d) => (d + 1) % 7);
      if (e.translationX > 60) setDay((d) => (d + 6) % 7);
    });

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Find pickup',
          headerRight: () => <IconButton icon="plus" label="Add a pickup" onPress={() => router.push('/hub/pickup-edit')} />,
        }}
      />
      <Screen edges={[]} padded={false} scroll={false}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {DAYS.map((d, i) => {
              const selected = i === day;
              const n = countFor(i);
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={`${DAYS_LONG[i]}, ${n} pickup${n === 1 ? '' : 's'}`}
                  accessibilityState={{ selected }}
                  onPress={() => setDay(i)}
                  style={{
                    flex: 1,
                    minHeight: 60,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.brand : colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? colors.brand : colors.border,
                  }}>
                  <T style={{ fontFamily: font.semibold, fontSize: 14, color: selected ? '#fff' : colors.ink }}>{d}</T>
                  <T style={{ fontFamily: font.display, fontSize: 18, color: selected ? '#fff' : n ? colors.brand : colors.faint }}>{n}</T>
                  {i === weekdayIndex() ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: selected ? '#fff' : colors.brand }} /> : null}
                </Pressable>
              );
            })}
          </View>
          <RegionChips
            value={region.value}
            onChange={(v) => {
              region.setValue(v);
              setCity('all');
            }}
            home={region.home}
          />
          {cities.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {['all', ...cities].map((c) => (
                <Choice key={c} label={c === 'all' ? 'All cities' : c} selected={city === c} onPress={() => setCity(c)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
              ))}
            </ScrollView>
          ) : null}
        </View>
        <GestureDetector gesture={swipe}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 80 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="title">{DAYS_LONG[day]}</T>
              <T v="small">Swipe for other days</T>
            </View>
            {forDay.length === 0 ? (
              <EmptyState
                icon="map-marker-question-outline"
                title={`No pickup listed on ${DAYS_LONG[day]}s`}
                body="Know a regular game? Add it so others can find it."
                action={<Button label="Add a pickup" icon="plus" onPress={() => router.push('/hub/pickup-edit')} />}
              />
            ) : (
              forDay.map((p) => (
                <Card key={p.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
                    <View style={{ flex: 1 }}>
                      <T v="title">{p.name}</T>
                      <T v="small">{[p.venue_text, p.area, p.city].filter(Boolean).join(' · ')}</T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T style={{ fontFamily: font.display, fontSize: 28, lineHeight: 30 }}>{p.start_time}</T>
                      {p.end_time ? <T v="small">until {p.end_time}</T> : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                    <Chip label={LEVEL[p.level]} tone="neutral" />
                    {p.cost ? <Chip label={p.cost} tone="neutral" /> : null}
                    {p.is_sample ? <Chip label="Sample" tone="warn" /> : null}
                  </View>
                  {p.notes ? <RichText v="small">{p.notes}</RichText> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs }}>
                    <Button
                      label={going.has(p.id) ? 'I go here ✓' : 'I go here'}
                      icon={going.has(p.id) ? 'star' : 'star-outline'}
                      kind={going.has(p.id) ? 'primary' : 'secondary'}
                      onPress={() => setFollowing(db, 'pickup', p.id, !going.has(p.id))}
                    />
                    {p.whatsapp_url ? <Button label="WhatsApp group" icon="whatsapp" kind="primary" onPress={() => Linking.openURL(p.whatsapp_url!)} /> : null}
                    <Button label="Map" icon="map-marker" onPress={() => Linking.openURL(p.map_url || mapsUrl([p.venue_text, p.area, p.city].filter(Boolean).join(', ')))} />
                    {p.contact_phone ? <Button label="Call" icon="phone" onPress={() => Linking.openURL(`tel:${p.contact_phone}`)} /> : null}
                    {access && canEditPickup(p, access.level, access.meId) ? (
                      <Button label="Edit" icon="pencil" kind="ghost" onPress={() => router.push({ pathname: '/hub/pickup-edit', params: { id: p.id } })} />
                    ) : null}
                  </View>
                </Card>
              ))
            )}
          </ScrollView>
        </GestureDetector>
      </Screen>
    </>
  );
}
