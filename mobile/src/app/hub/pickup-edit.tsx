import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { useData } from '@/db/live';
import { deletePickup, getAccess, getPickup, listPeople, savePickup } from '@/db/repo';
import { canChoosePickupEditors, canEditPickup, MAX_PICKUP_EDITORS, pickupEditors } from '@/domain/permissions';
import type { PickupSpot } from '@/db/types';
import { DAYS } from '@/domain/format';
import { Button, Choice, Field, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { PhoneField } from '@/ui/phone-field';
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
  const access = useData(getAccess);
  const people = useData(listPeople) ?? [];
  const [q, setQ] = useState('');
  const editors = pickupEditors(f);

  useEffect(() => {
    if (id) getPickup(db, id).then((p) => p && setF(p));
  }, [db, id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof Form) => (v: string) => set(k, (v || null) as never);

  async function save() {
    if (!id && !access?.meId) return Alert.alert('Pick who you are first', 'Tap the person button at the top of Home, so the pickup knows who added it.');
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

  if (id && access && f.name && !canEditPickup(f, access.level, access.meId)) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit pickup' }} />
        <Screen edges={[]}>
          <T v="bodyStrong">Only the organisers can edit this pickup</T>
          <T v="small">Whoever added it, the people they chose, and admins. Spotted something wrong? Message the contact on the pickup, or report it in More → Report a bug.</T>
        </Screen>
      </>
    );
  }
  const chooser = !id || (access ? canChoosePickupEditors(f, access.level, access.meId) : false);
  const s = q.trim().toLowerCase();
  const found =
    s.length >= 2 ? people.filter((p) => !editors.includes(p.id) && p.id !== (f.created_by_person ?? access?.meId) && `${p.first_name} ${p.last_name}`.toLowerCase().includes(s)).slice(0, 6) : [];
  const setEditors = (ids: string[]) => set('editor_ids', ids.length ? JSON.stringify(ids) : null);

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
            <PhoneField label="Contact number" value={f.contact_phone ?? ''} onChange={text('contact_phone')} />
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
        {chooser ? (
          <Section title={`Who else can edit · ${editors.length}/${MAX_PICKUP_EDITORS}`}>
            <T v="small">You can always edit the pickups you add. Pick up to {MAX_PICKUP_EDITORS} others to help keep it up to date (admins can too).</T>
            {editors.map((pid) => {
              const p = people.find((x) => x.id === pid);
              return (
                <Choice
                  key={pid}
                  label={p ? `${p.first_name} ${p.last_name}`.trim() : 'Someone'}
                  sublabel="Tap to remove"
                  selected
                  onPress={() => setEditors(editors.filter((x) => x !== pid))}
                  style={{ alignItems: 'flex-start' }}
                />
              );
            })}
            {editors.length < MAX_PICKUP_EDITORS ? (
              <>
                <Field label="Add an editor" value={q} onChangeText={setQ} placeholder="Search by name" />
                {found.map((p) => (
                  <Choice
                    key={p.id}
                    label={`${p.first_name} ${p.last_name}`.trim()}
                    onPress={() => {
                      setEditors([...editors, p.id]);
                      setQ('');
                    }}
                    style={{ alignItems: 'flex-start' }}
                  />
                ))}
              </>
            ) : null}
          </Section>
        ) : null}
        {id ? <Button label="Delete pickup" kind="danger" icon="delete-outline" onPress={remove} /> : null}
      </Screen>
    </>
  );
}
