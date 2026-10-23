import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { deleteAnnouncement, getAccess, getAnnouncement, saveAnnouncement } from '@/db/repo';
import { Button, Choice, Field, Footer, Screen, Section, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

/** Coordinators post or edit an announcement. Everyone in that region (or everyone, if national) gets a notification. */
export default function AnnouncementEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [region, setRegion] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!id) return;
    getAnnouncement(db, id).then((a) => {
      if (!a) return;
      setRegion(a.region_code);
      setTitle(a.title);
      setBody(a.body ?? '');
      setLink(a.link_url ?? '');
      setLinkLabel(a.link_label ?? '');
      setPinned(!!a.pinned);
    });
  }, [db, id]);

  async function save() {
    if (!title.trim()) return Alert.alert('Add a headline');
    if (link && !/^https?:\/\//i.test(link.trim())) return Alert.alert('Check the link', 'It should start with https://');
    const access = await getAccess(db);
    await saveAnnouncement(db, {
      id,
      region_code: region,
      title: title.trim().slice(0, 200),
      body: body.trim() || null,
      link_url: link.trim() || null,
      link_label: linkLabel.trim() || null,
      pinned: pinned ? 1 : 0,
      created_by_id: access.meId,
    });
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit announcement' : 'New announcement' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={id ? 'Save' : 'Post'} icon="bullhorn-outline" kind="primary" big onPress={save} />
          </Footer>
        }>
        <Section title="Who is it for?">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Choice label="Everyone (SAFDA)" selected={!region} onPress={() => setRegion(null)} style={{ minHeight: 40, paddingHorizontal: 12 }} />
            {REGIONS.map((r) => (
              <Choice key={r.code} label={`${r.name} · ${r.body}`} selected={region === r.code} onPress={() => setRegion(r.code)} style={{ minHeight: 40, paddingHorizontal: 12 }} />
            ))}
          </View>
        </Section>
        <Field label="Headline" value={title} onChangeText={setTitle} placeholder="e.g. Mixed Nationals 2027 dates announced" maxLength={200} />
        <Field label="Details" value={body} onChangeText={setBody} multiline placeholder="What, when, what people need to do" maxLength={5000} />
        <Field label="Link (optional)" value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
        {link ? <Field label="Button text" value={linkLabel} onChangeText={setLinkLabel} placeholder="e.g. Read the draft constitution" /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">Pin to the top</T>
            <T v="small">Pinned announcements also show on Home.</T>
          </View>
          <Switch value={pinned} onValueChange={setPinned} trackColor={{ true: colors.brand }} />
        </View>
        {id ? (
          <Button
            label="Delete announcement"
            kind="danger"
            icon="delete-outline"
            onPress={() =>
              Alert.alert('Delete this announcement?', undefined, [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteAnnouncement(db, id);
                    router.back();
                  },
                },
              ])
            }
          />
        ) : null}
      </Screen>
    </>
  );
}
