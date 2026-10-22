import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { deletePickup, getPickup, savePickup } from '@/db/repo';
import type { PickupSpot } from '@/db/types';
import { DAYS } from '@/domain/format';
import { Button, Choice, Field, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { space } from '@/ui/theme';

type Form = Omit<PickupSpot, 'id' | 'is_sample'>;

const EMPTY: Form = {
  name: '',
  region: 'western',
  city: '',
  area: null,
  day_of_week: 1,
  start_time: '18:00',
  end_time: null,
  venue_text: null,
  map_url: null,
  contact_name: null,
  contact_phone: null,
  whatsapp_url: null,
  level: 'all',
  cost: null,
  notes: null,
};

export default function PickupEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [f, setF] = useState<Form>(EMPTY);

  useEffect(() => {
    if (id) getPickup(db, id).then((p) => p && setF(p));
  }, [db, id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof Form) => (v: string) => set(k, (v || null) as never);

  async function save() {
    if (!f.name.trim() || !f.city.trim()) {
      Alert.alert('Add a name and a city');
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(f.start_time)) {
      Alert.alert('Start time should look like 18:00');
      return;
    }
    await savePickup(db, { ...f, id });
    router.back();
  }

  function remove() {
    if (!id) return;
    Alert.alert('Delete this pickup?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePickup(db, id);
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit pickup' : 'Add a pickup' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Save" kind="primary" big onPress={save} />
          </Footer>
        }>
        <Field label="Name" value={f.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Green Point Tuesday pickup" />
        <Section title="Day">
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {DAYS.map((d, i) => (
              <Choice key={d} label={d} selected={f.day_of_week === i} onPress={() => set('day_of_week', i)} style={{ flex: 1, paddingHorizontal: 0 }} />
            ))}
          </View>
        </Section>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Starts" value={f.start_time} onChangeText={(v) => set('start_time', v)} placeholder="18:00" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Ends (optional)" value={f.end_time ?? ''} onChangeText={text('end_time')} placeholder="20:00" keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <Section title="Region">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {REGIONS.map((r) => (
              <Choice key={r.code} label={r.name} selected={f.region === r.code} onPress={() => set('region', r.code)} style={{ paddingHorizontal: 14 }} />
            ))}
          </View>
        </Section>
        <Field label="City or town" value={f.city} onChangeText={(v) => set('city', v)} placeholder="Cape Town" />
        <Field label="Field / venue" value={f.venue_text ?? ''} onChangeText={text('venue_text')} placeholder="Name of the park or field" />
        <Field label="Suburb (optional)" value={f.area ?? ''} onChangeText={text('area')} />
        <Field label="Map link (optional)" value={f.map_url ?? ''} onChangeText={text('map_url')} placeholder="Paste a Google Maps link" autoCapitalize="none" />
        <Field label="WhatsApp group link (optional)" value={f.whatsapp_url ?? ''} onChangeText={text('whatsapp_url')} placeholder="https://chat.whatsapp.com/…" autoCapitalize="none" />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Contact name" value={f.contact_name ?? ''} onChangeText={text('contact_name')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Contact number" value={f.contact_phone ?? ''} onChangeText={text('contact_phone')} keyboardType="phone-pad" />
          </View>
        </View>
        <Section title="Level">
          <Segmented
            value={f.level}
            onChange={(v) => set('level', v)}
            options={[
              { value: 'all', label: 'All levels' },
              { value: 'beginner', label: 'Beginners' },
              { value: 'competitive', label: 'Competitive' },
            ]}
          />
        </Section>
        <Field label="Cost (optional)" value={f.cost ?? ''} onChangeText={text('cost')} placeholder="Free, R20…" />
        <Field label="Notes" value={f.notes ?? ''} onChangeText={text('notes')} multiline placeholder="Bring a light and a dark shirt…" />
        {id ? <Button label="Delete pickup" kind="danger" icon="delete-outline" onPress={remove} /> : null}
        <T v="small">Pickups are saved on this phone for now. Sharing them with everyone comes with the online version.</T>
      </Screen>
    </>
  );
}
