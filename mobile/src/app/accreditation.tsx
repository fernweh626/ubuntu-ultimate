import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { getAccreditation, saveAccreditation, type Accreditation } from '@/db/development';
import { useData } from '@/db/live';
import { getMeId } from '@/db/repo';
import { ACCREDITATION_LEVELS, accreditationState, daysUntil, type AccreditationLevel } from '@/domain/development';
import { dmyToIso, isoToDmy, shortDate } from '@/domain/format';
import { Button, Card, Chip, DateField, Footer, Icon, Screen, Segmented, T } from '@/ui/components';
import { deletePhoto, PhotoSheet } from '@/ui/photo';
import { IS_WEB, webDataUrl } from '@/lib/web';
import { colors, space } from '@/ui/theme';

const isPdf = (uri: string) => uri.toLowerCase().endsWith('.pdf');

/** Your WFDF/SAFDA rules accreditation: certificate photo, level and expiry. Leagues and nationals check it. */
export default function AccreditationScreen() {
  const bundle = useData(async (d) => {
    const meId = await getMeId(d);
    return { meId, acc: meId ? await getAccreditation(d, meId) : null };
  });
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  if (!bundle.meId) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Accreditation' }} />
        <Card onPress={() => router.back()}>
          <T v="bodyStrong">Pick yourself first</T>
          <T v="small">In Me, choose which player you are, then add your accreditation.</T>
        </Card>
      </Screen>
    );
  }
  return <Form key={bundle.acc?.id ?? 'new'} meId={bundle.meId} acc={bundle.acc} />;
}

function Form({ meId, acc }: { meId: string; acc: Accreditation | null }) {
  const db = useSQLiteContext();
  const [level, setLevel] = useState<AccreditationLevel>(acc?.level ?? 'standard');
  const [expiry, setExpiry] = useState(isoToDmy(acc?.expires_on));
  const [photo, setPhoto] = useState<string | null>(acc?.photo_uri ?? null);
  const [sheet, setSheet] = useState(false);
  const [big, setBig] = useState(false);

  const iso = dmyToIso(expiry);
  const state = accreditationState(iso);
  const days = iso ? daysUntil(iso) : null;

  async function pickPdf() {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    if (IS_WEB) return setPhoto(await webDataUrl(res.assets[0].uri));
    // Keep our own copy, like photos, so it survives the picker's cache being cleared.
    const dir = new Directory(Paths.document, 'photos');
    if (!dir.exists) dir.create();
    const dest = new File(dir, `accreditation-${meId}-${Date.now()}.pdf`);
    new File(res.assets[0].uri).copy(dest);
    if (photo) deletePhoto(photo);
    setPhoto(dest.uri);
  }

  async function save() {
    if (expiry && !iso) return Alert.alert('Check the expiry date', 'Use dd/mm/yyyy, e.g. 31/03/2027.');
    await saveAccreditation(db, meId, { level, expiresOn: iso, photoUri: photo });
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Accreditation' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Save" kind="primary" big onPress={save} />
          </Footer>
        }>
        <T v="small">You need a valid rules accreditation to play leagues, regionals and nationals. Your team staff and coordinators can see the level and expiry; the certificate photo stays on this phone.</T>

        {iso ? (
          <Card
            style={{
              backgroundColor: state === 'expired' ? colors.dangerTint : state === 'expiring' ? colors.warnTint : colors.brandTint,
              borderColor: 'transparent',
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name={state === 'valid' ? 'check-decagram' : 'alert-decagram'} color={state === 'expired' ? colors.danger : state === 'expiring' ? colors.warnInk : colors.brandDark} />
              <T v="bodyStrong">
                {state === 'expired' ? `Expired ${shortDate(iso)}` : state === 'expiring' ? `Expires in ${days} day${days === 1 ? '' : 's'}` : `Valid until ${shortDate(iso)}`}
              </T>
            </View>
            <T v="small">We’ll remind you 6 months, 1 month and 1 week before it runs out.</T>
          </Card>
        ) : null}

        <T v="smallStrong">Level</T>
        <Segmented value={level} onChange={setLevel} options={(Object.keys(ACCREDITATION_LEVELS) as AccreditationLevel[]).map((l) => ({ value: l, label: ACCREDITATION_LEVELS[l] }))} />

        <DateField label="Expiry date" value={expiry} onChangeText={setExpiry} />

        <T v="smallStrong">Certificate</T>
        {photo && isPdf(photo) ? (
          <Card onPress={() => Sharing.shareAsync(photo, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Icon name="file-pdf-box" color={colors.danger} size={36} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">Certificate (PDF)</T>
                <T v="small">Tap to open</T>
              </View>
            </View>
          </Card>
        ) : photo ? (
          <Pressable onPress={() => setBig(!big)} accessibilityRole="imagebutton" accessibilityLabel="Accreditation certificate">
            <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: big ? 0.75 : 1.6, borderRadius: 12, backgroundColor: colors.neutralTint }} contentFit={big ? 'contain' : 'cover'} />
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label={photo ? 'Photo' : 'Add photo'} icon="camera-outline" onPress={() => setSheet(true)} style={{ flex: 1 }} />
          <Button label={photo ? 'PDF' : 'Upload PDF'} icon="file-pdf-box" onPress={pickPdf} style={{ flex: 1 }} />
        </View>
        {photo ? <Button label="Remove certificate" icon="delete-outline" kind="ghost" onPress={() => { deletePhoto(photo); setPhoto(null); }} style={{ minHeight: 36 }} /> : null}
        {acc?.level ? <Chip label={`Saved: ${ACCREDITATION_LEVELS[acc.level]}`} tone="neutral" /> : null}
      </Screen>
      <PhotoSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Accreditation certificate"
        hasPhoto={!!photo}
        fileName={`accreditation-${meId}`}
        onPicked={(uri) => {
          if (photo) deletePhoto(photo);
          setPhoto(uri);
        }}
        onRemove={() => {
          if (photo) deletePhoto(photo);
          setPhoto(null);
        }}
        note="Show it to a tournament director if asked."
      />
    </>
  );
}
