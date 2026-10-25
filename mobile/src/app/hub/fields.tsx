import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { deleteVenue, saveVenue, type Venue } from '@/db/repo';
import { formatDistance, HERE_M } from '@/domain/geo';
import { Button, Card, Chip, EmptyState, Field, IconButton, Screen, Sheet, T } from '@/ui/components';
import { AddFieldSheet, useNearbyFields } from '@/ui/field-picker';
import { space } from '@/ui/theme';

export default function Fields() {
  const db = useSQLiteContext();
  const { fields, here, locating } = useNearbyFields();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');

  function openMap(v: Venue) {
    const q = v.latitude != null ? `${v.latitude},${v.longitude}` : [v.name, v.city].filter(Boolean).join(', ');
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Fields',
          headerRight: () => <IconButton icon="map-marker-plus" label="Save the field I’m at" onPress={() => setAdding(true)} />,
        }}
      />
      <Screen edges={[]}>
        <T v="small">{locating ? 'Finding where you are…' : here ? 'Nearest first. Saved fields can be picked when starting a game.' : 'Location is off, so fields are listed by name.'}</T>
        <Button label="Save the field I’m at" icon="map-marker-plus" kind="primary" onPress={() => setAdding(true)} />
        {fields.length === 0 ? (
          <EmptyState icon="map-marker-outline" title="No fields saved yet" body="Stand on a field and save it with the name people use for it." />
        ) : (
          fields.map((f) => (
            <Card key={f.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{f.name}</T>
                  <T v="small">{[f.city, f.distance != null ? formatDistance(f.distance) : null].filter(Boolean).join(' · ')}</T>
                </View>
                {f.distance != null && f.distance <= HERE_M ? <Chip label="You’re here" icon="map-marker-check" /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="Map" icon="map-marker" onPress={() => openMap(f)} />
                <Button
                  label="Rename"
                  icon="pencil"
                  kind="ghost"
                  onPress={() => {
                    setEditing(f);
                    setName(f.name);
                    setArea(f.city ?? '');
                  }}
                />
              </View>
            </Card>
          ))
        )}
        <T v="small">Fields are saved on this phone for now. With accounts, everyone will share one list.</T>
      </Screen>

      <AddFieldSheet visible={adding} onClose={() => setAdding(false)} />

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title="Rename field">
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Suburb / town" value={area} onChangeText={setArea} />
        <Button
          label="Save"
          kind="primary"
          onPress={async () => {
            if (!editing || !name.trim()) return;
            await saveVenue(db, { ...editing, name, city: area.trim() || null });
            setEditing(null);
          }}
        />
        <Button
          label="Delete field"
          kind="danger"
          icon="delete-outline"
          onPress={() =>
            Alert.alert('Delete this field?', 'Past games keep their records.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteVenue(db, editing!.id);
                  setEditing(null);
                },
              },
            ])
          }
        />
      </Sheet>
    </>
  );
}
