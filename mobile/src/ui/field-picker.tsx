import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { useData } from '@/db/live';
import { listVenues, saveVenue, type Venue } from '@/db/repo';
import { currentPosition, distanceM, formatDistance, HERE_M, placeName, type LatLng } from '@/domain/geo';

import { Button, Chip, Choice, Field, Sheet, T } from './components';
import { colors, space } from './theme';

export type VenueWithDistance = Venue & { distance: number | null };

/** Saved fields, nearest first when we know where the phone is. */
export function useNearbyFields() {
  const venues = useData(listVenues);
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    let alive = true;
    currentPosition().then((p) => {
      if (!alive) return;
      setHere(p);
      setLocating(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const sorted = useMemo<VenueWithDistance[]>(() => {
    const withD = (venues ?? []).map((v) => ({
      ...v,
      distance: here && v.latitude != null && v.longitude != null ? distanceM(here, { latitude: v.latitude, longitude: v.longitude }) : null,
    }));
    return withD.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name));
  }, [venues, here]);

  return { fields: sorted, here, locating };
}

/** Pick the field for a game. Suggests the one you're standing on; lets you save a new one in two taps. */
export function FieldPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { fields, here, locating } = useNearbyFields();
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const autoPicked = useRef(false);
  const nearest = fields[0];
  const atField = nearest?.distance != null && nearest.distance <= HERE_M ? nearest : null;

  useEffect(() => {
    if (!autoPicked.current && !value && atField) {
      autoPicked.current = true;
      onChange(atField.id);
    }
  }, [atField, value, onChange]);

  const shown = showAll ? fields : fields.slice(0, 5);

  return (
    <View style={{ gap: space.sm }}>
      {locating ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <ActivityIndicator color={colors.brand} />
          <T v="small">Finding fields near you…</T>
        </View>
      ) : atField ? (
        <Chip label={`You’re at ${atField.name}`} icon="map-marker-check" />
      ) : here ? (
        <T v="small">No saved field right here. Save it so the next person can just tap it.</T>
      ) : (
        <T v="small">Location is off, so fields are listed by name.</T>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Choice label="Not listed" selected={!value} onPress={() => onChange(null)} style={{ paddingHorizontal: 14 }} />
        {shown.map((f) => (
          <Choice
            key={f.id}
            label={f.name}
            sublabel={f.distance != null ? formatDistance(f.distance) : f.city ?? undefined}
            selected={value === f.id}
            onPress={() => onChange(f.id)}
            style={{ paddingHorizontal: 14 }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {fields.length > 5 ? <Button label={showAll ? 'Fewer' : `All ${fields.length} fields`} kind="ghost" onPress={() => setShowAll(!showAll)} /> : null}
        <Button label="Save the field I’m at" icon="map-marker-plus" kind="ghost" onPress={() => setAdding(true)} />
      </View>
      <AddFieldSheet visible={adding} onClose={() => setAdding(false)} onSaved={(id) => onChange(id)} />
    </View>
  );
}

/** Save the phone's current spot as a named field that everyone can reuse. */
export function AddFieldSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved?: (id: string) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Save this field">
      {visible ? <AddFieldForm onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function AddFieldForm({ onClose, onSaved }: { onClose: () => void; onSaved?: (id: string) => void }) {
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [pos, setPos] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    let alive = true;
    currentPosition().then(async (p) => {
      if (!alive) return;
      setPos(p);
      setLocating(false);
      if (p) {
        const place = await placeName(p);
        if (alive && place) setArea((a) => a || place);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    if (!name.trim()) return Alert.alert('Give the field a name', 'Use what people call it, e.g. “Green Point field 2”.');
    if (!pos) return Alert.alert('No location yet', 'Turn on location so others can find this field.');
    const id = await saveVenue(db, { name, city: area.trim() || null, latitude: pos.latitude, longitude: pos.longitude });
    onSaved?.(id);
    onClose();
  }

  return (
    <>
      <T v="small">
        {locating ? 'Getting your location…' : pos ? 'Saved at your current spot. Stand on the field when you save it.' : 'Location is off — turn it on to save a field.'}
      </T>
      <Field label="Name people use for it" value={name} onChangeText={setName} placeholder="e.g. Plumstead 2, Green Point back field" autoFocus />
      <Field label="Suburb / town" value={area} onChangeText={setArea} placeholder="Filled in from your location" />
      <Button label="Save field" icon="map-marker-plus" kind="primary" big onPress={save} disabled={locating} />
    </>
  );
}
