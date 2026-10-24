import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { useData } from '@/db/live';
import { clearPrivateField, getMeId, getPersonForEdit, savePerson, setPersonPhoto, type PersonForEdit, type PersonInput } from '@/db/repo';
import type { Gender, Position } from '@/db/types';
import { dmyToIso, isMinor } from '@/domain/format';
import { Button, DateField, Field, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { Avatar, deletePhoto, PhotoSheet } from '@/ui/photo';
import { colors, space } from '@/ui/theme';

export default function PlayerEdit() {
  const { id, teamId } = useLocalSearchParams<{ id?: string; teamId?: string }>();
  const db = useSQLiteContext();
  const [f, setF] = useState<PersonInput>({ first_name: '', last_name: '', gender: null, position: null });
  const [kind, setKind] = useState<'core' | 'guest' | 'mercenary'>('core');
  const [addAnother, setAddAnother] = useState(false);
  // What is on file for email/birth date. The values themselves never come back to the screen.
  const [onFile, setOnFile] = useState<Pick<PersonForEdit, 'has_email' | 'is_minor'> | null>(null);
  const [dob, setDob] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPersonForEdit(db, id).then((p) => {
      if (!p) return;
      const { has_email, is_minor, photo_uri, ...rest } = p;
      setF({ ...rest, email: null, birth_date: null });
      setPhoto(photo_uri);
      setOnFile({ has_email, is_minor });
    });
  }, [db, id]);

  function clear(field: 'email' | 'birth_date') {
    Alert.alert(field === 'email' ? 'Remove the email on file?' : 'Remove the birth date on file?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearPrivateField(db, id!, field);
          setOnFile((o) => o && (field === 'email' ? { ...o, has_email: 0 } : { ...o, is_minor: null }));
        },
      },
    ]);
  }

  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const meId = useData(getMeId);
  const isMe = !!id && id === meId;

  async function save(another: boolean) {
    if (!f.first_name.trim()) return Alert.alert('Add a first name');
    // Your own profile needs an email (for your association membership and signing in). Optional for people staff add.
    if (isMe && !onFile?.has_email && !/^\S+@\S+\.\S+$/.test((f.email ?? '').trim())) return Alert.alert('Add your email', 'It’s never shown to anyone. Your association needs it for your membership.');
    const birth = dob ? dmyToIso(dob) : null;
    if (dob && !birth) return Alert.alert('Check the birth date', 'Use dd/mm/yyyy, for example 30/06/2001.');
    const savedId = await savePerson(db, { ...f, birth_date: birth, id }, teamId && !id ? { teamId, kind, jersey: f.preferred_number ?? null } : undefined);
    if (!id && photo) await setPersonPhoto(db, savedId, photo);
    if (another) {
      setF({ first_name: '', last_name: '', gender: f.gender, position: null });
      setDob('');
      setPhoto(null);
      setAddAnother(true);
      return;
    }
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit player' : 'Add player' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {!id ? <Button label="Save & add another" onPress={() => save(true)} style={{ flex: 1 }} /> : null}
              <Button label="Save" kind="primary" onPress={() => save(false)} style={{ flex: 1 }} />
            </View>
          </Footer>
        }>
        {addAnother ? <T v="small">Saved. Add the next player, or tap Save when you’re done.</T> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={photo ? 'Change photo' : 'Add a photo'}
          onPress={() => setPhotoSheet(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Avatar uri={photo} name={`${f.first_name || '?'} ${f.last_name}`} size={72} tone="tint" />
          <T v="bodyStrong" style={{ color: colors.brand }}>
            {photo ? 'Change photo' : 'Add a photo'}
          </T>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="First name" value={f.first_name} onChangeText={(v) => set('first_name', v)} autoFocus={!id} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last name" value={f.last_name} onChangeText={(v) => set('last_name', v)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Nickname" value={f.nickname ?? ''} onChangeText={(v) => set('nickname', v || null)} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Jersey number" value={f.preferred_number ?? ''} onChangeText={(v) => set('preferred_number', v.replace(/\D/g, '').slice(0, 3) || null)} keyboardType="number-pad" />
          </View>
        </View>
        <Section title="Plays in the ratio as">
          <Segmented<Gender | 'none'>
            value={f.gender ?? 'none'}
            onChange={(v) => set('gender', v === 'none' ? null : v)}
            options={[
              { value: 'W', label: 'Female matching' },
              { value: 'M', label: 'Male matching' },
              { value: 'X', label: 'Other' },
            ]}
          />
        </Section>
        <Section title="Position">
          <Segmented<Position | 'none'>
            value={f.position ?? 'none'}
            onChange={(v) => set('position', v === 'none' ? null : v)}
            options={[
              { value: 'handler', label: 'Handler' },
              { value: 'cutter', label: 'Cutter' },
              { value: 'hybrid', label: 'Hybrid' },
            ]}
          />
        </Section>
        {teamId && !id ? (
          <Section title="Joining as">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'core', label: 'Core' },
                { value: 'guest', label: 'Guest' },
                { value: 'mercenary', label: 'Mercenary' },
              ]}
            />
          </Section>
        ) : null}
        <DateField
          label={onFile?.is_minor != null ? 'Birth date (on file — type to replace)' : 'Birth date (optional)'}
          value={dob}
          onChangeText={setDob}
          placeholder={onFile?.is_minor != null ? (onFile.is_minor ? 'On file · under 18' : 'On file · 18 or older') : 'dd/mm/yyyy'}
          hint={
            isMinor(dmyToIso(dob)) || (!dob && onFile?.is_minor)
              ? 'Under 18: shown publicly as first name and surname initial only.'
              : 'Used for age divisions. Nobody can read it back — only the age group is shown.'
          }
        />
        {onFile?.is_minor != null ? <Button label="Remove birth date" kind="ghost" onPress={() => clear('birth_date')} style={{ alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 0 }} /> : null}
        <Field
          label={onFile?.has_email ? 'Email (on file — type to replace)' : isMe ? 'Email' : 'Email (optional)'}
          value={f.email ?? ''}
          onChangeText={(v) => set('email', v || null)}
          placeholder={onFile?.has_email ? 'Hidden' : undefined}
          keyboardType="email-address"
          autoCapitalize="none"
          hint="Never shown to anyone, including admins. Only used to send game summaries and reminders."
        />
        {onFile?.has_email ? <Button label="Remove email" kind="ghost" onPress={() => clear('email')} style={{ alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 0 }} /> : null}
      </Screen>
      <PhotoSheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Profile photo"
        hasPhoto={!!photo}
        fileName={`person-${id ?? 'new'}`}
        note="Photos are kept on this phone for now and appear on your profile and team rosters."
        onPicked={async (uri) => {
          if (id) {
            deletePhoto(photo);
            await setPersonPhoto(db, id, uri);
          }
          setPhoto(uri);
        }}
        onRemove={async () => {
          deletePhoto(photo);
          if (id) await setPersonPhoto(db, id, null);
          setPhoto(null);
        }}
      />
    </>
  );
}
