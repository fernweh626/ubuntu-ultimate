import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { LINK_KINDS, REGIONS } from '@/content/hub';
import { deleteOrgLink, orgLinks, saveOrgLink, type OrgLink } from '@/db/development';
import { useData } from '@/db/live';
import { getAccess } from '@/db/repo';
import { Button, Card, Choice, Field, IconButton, Screen, Sheet, T } from '@/ui/components';
import { space } from '@/ui/theme';

/** Coordinators keep the SAFDA and regional sign-up / payment form links current. Players see them in Membership numbers. */
export default function Links() {
  const db = useSQLiteContext();
  const links = useData(orgLinks) ?? [];
  const [edit, setEdit] = useState<Partial<OrgLink> | null>(null);
  const groups = [{ code: null as string | null, name: 'SAFDA (national)' }, ...REGIONS.map((r) => ({ code: r.code as string | null, name: `${r.body} · ${r.name}` }))];
  const access = useData(getAccess);
  if (access && access.level !== 'admin') {
    return (
      <Screen edges={[]}>
        <T v="bodyStrong">Admins only</T>
        <T v="small">Registration and payment links are managed by the admins. Coordinators: email your region’s new forms, fees and merch links to the admins by 20 January.</T>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Forms & payment links', headerRight: () => <IconButton icon="plus" label="Add link" onPress={() => setEdit({ region_code: null, label: '', url: '' })} /> }} />
      <Screen edges={[]}>
        <T v="small">Everyone sees these in More → Merch & links (their region first), and registration links under Me → Membership numbers.</T>
        {groups.map((g) => {
          const mine = links.filter((l) => l.region_code === g.code);
          return (
            <View key={g.code ?? 'safda'} style={{ gap: space.sm }}>
              <T v="label">{g.name}</T>
              {mine.length ? (
                mine.map((l) => (
                  <Card key={l.id} onPress={() => setEdit(l)}>
                    <T v="bodyStrong">{l.label}</T>
                    <T v="small" numberOfLines={1}>
                      {l.url}
                    </T>
                  </Card>
                ))
              ) : (
                <Button label="Add a link" icon="plus" kind="ghost" onPress={() => setEdit({ region_code: g.code, label: '', url: '' })} style={{ alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 0 }} />
              )}
            </View>
          );
        })}
      </Screen>
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit link' : 'Add link'}>
        {edit ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {groups.map((g) => (
                <Choice key={g.code ?? 'safda'} label={g.name} selected={(edit.region_code ?? null) === g.code} onPress={() => setEdit({ ...edit, region_code: g.code })} style={{ minHeight: 40, paddingHorizontal: 12 }} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {LINK_KINDS.map((k) => (
                <Choice key={k.kind} label={k.title} selected={(edit.kind ?? 'website') === k.kind} onPress={() => setEdit({ ...edit, kind: k.kind })} style={{ minHeight: 36, paddingHorizontal: 10 }} />
              ))}
            </View>
            <Field label="What is it?" value={edit.label ?? ''} onChangeText={(v) => setEdit({ ...edit, label: v })} placeholder="e.g. 2027 registration & fees" />
            <Field label="Link" value={edit.url ?? ''} onChangeText={(v) => setEdit({ ...edit, url: v })} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
            <Button
              label="Save"
              kind="primary"
              onPress={async () => {
                const url = (edit.url ?? '').trim();
                if (!edit.label?.trim() || !/^(https?:\/\/|mailto:)/i.test(url)) return Alert.alert('Add a name and a link starting with https:// (or mailto: for email)');
                await saveOrgLink(db, { id: edit.id, region_code: edit.region_code ?? null, kind: edit.kind ?? 'website', label: edit.label.trim(), url });
                setEdit(null);
              }}
            />
            {edit.id ? (
              <Button
                label="Delete"
                kind="danger"
                onPress={async () => {
                  await deleteOrgLink(db, edit.id!);
                  setEdit(null);
                }}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}
