import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { certificateUrl, uploadCertificate } from '@/db/accreditation-send';
import { getAccreditation, saveAccreditation, type Accreditation } from '@/db/development';
import { useData } from '@/db/live';
import { getAccess, getMeId } from '@/db/repo';
import { ACCREDITATION_LEVELS, accreditationState, daysUntil, type AccreditationLevel } from '@/domain/development';
import { dmyToIso, isoToDmy, shortDate } from '@/domain/format';
import { Button, Card, DateField, Footer, Icon, Screen, Segmented, T } from '@/ui/components';
import { deletePhoto } from '@/ui/photo';
import { IS_WEB, webDataUrl } from '@/lib/web';
import { colors, space } from '@/ui/theme';

/**
 * Your WFDF rules accreditation: level, expiry and the certificate PDF. Saving uploads the PDF so your
 * team staff can check the level and expiry against it before CTFDA, regional and SAFDA events.
 */
export default function AccreditationScreen() {
  const bundle = useData(async (d) => {
    const meId = await getMeId(d);
    return { meId, acc: meId ? await getAccreditation(d, meId) : null, signedIn: (await getAccess(d)).signedIn };
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
  return <Form key={bundle.acc?.id ?? 'new'} meId={bundle.meId} acc={bundle.acc} signedIn={bundle.signedIn} />;
}

function Form({ meId, acc, signedIn }: { meId: string; acc: Accreditation | null; signedIn: boolean }) {
  const db = useSQLiteContext();
  const [level, setLevel] = useState<AccreditationLevel>(acc?.level ?? 'standard');
  const [expiry, setExpiry] = useState(isoToDmy(acc?.expires_on));
  const [photo, setPhoto] = useState<string | null>(acc?.photo_uri ?? null);
  const [busy, setBusy] = useState(false);

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

  async function open() {
    try {
      if (photo) return IS_WEB ? Linking.openURL(photo) : Sharing.shareAsync(photo, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      if (acc?.file_path) return Linking.openURL(await certificateUrl(acc.file_path));
    } catch (e) {
      Alert.alert('Couldn’t open it', String((e as Error).message ?? e));
    }
  }

  async function save() {
    if (expiry && !iso) return Alert.alert('Check the expiry date', 'Use dd/mm/yyyy, e.g. 31/03/2027.');
    if (!iso) return Alert.alert('Add the expiry date', 'It’s on your certificate. Team staff check it against the PDF.');
    if (!photo && !acc?.file_path) return Alert.alert('Upload your certificate', 'A PDF of your WFDF accreditation certificate.');
    setBusy(true);
    let filePath = acc?.file_path ?? null;
    // A new PDF on this phone: upload it so staff can check it. Without signal, it stays here and goes next time you save.
    const fresh = !!photo && photo !== acc?.photo_uri;
    if ((fresh || (photo && !filePath)) && signedIn) {
      try {
        filePath = await uploadCertificate(meId, photo!);
      } catch (e) {
        setBusy(false);
        return Alert.alert('Couldn’t upload the certificate', `${String((e as Error).message ?? e)}\n\nCheck your signal and try again. It must be a PDF under 5 MB.`);
      }
    }
    await saveAccreditation(db, meId, { level, expiresOn: iso, photoUri: photo, filePath });
    setBusy(false);
    if (!signedIn) Alert.alert('Saved on this phone', 'Go online (More → Account & sync) and save again so your team staff can check it.');
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Accreditation' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={busy ? 'Uploading…' : 'Save'} kind="primary" big disabled={busy} onPress={save} />
          </Footer>
        }>
        <Button label="Do or renew your accreditation (WFDF, free)" icon="open-in-new" kind="secondary" onPress={() => Linking.openURL('https://rules.wfdf.org/accreditation')} />
        <T v="small">You need a valid rules accreditation to play leagues, regionals and nationals. Captains, spirit captains and international teams need Advanced. Your team staff and coordinators check your certificate against the level and expiry you enter.</T>
        {acc ? <CheckCard acc={acc} /> : null}

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

        <T v="smallStrong">Certificate (PDF)</T>
        {photo || acc?.file_path ? (
          <Card onPress={open}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Icon name="file-pdf-box" color={colors.danger} size={36} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">Certificate</T>
                <T v="small">{acc?.file_path && photo === acc.photo_uri ? 'Uploaded · tap to open' : 'Uploads when you save · tap to open'}</T>
              </View>
            </View>
          </Card>
        ) : null}
        <Button label={photo || acc?.file_path ? 'Replace PDF' : 'Upload PDF'} icon="file-pdf-box" onPress={pickPdf} />
        {photo && !acc?.file_path ? (
          <Button
            label="Remove certificate"
            icon="delete-outline"
            kind="ghost"
            onPress={() => {
              deletePhoto(photo);
              setPhoto(null);
            }}
            style={{ minHeight: 36 }}
          />
        ) : null}
      </Screen>
    </>
  );
}

/** Where your check stands: not checked yet, verified by staff, or something to fix. */
function CheckCard({ acc }: { acc: Accreditation }) {
  const tone = acc.status === 'verified' ? colors.brandTint : acc.status === 'rejected' ? colors.dangerTint : colors.neutralTint;
  return (
    <Card style={{ backgroundColor: tone, borderColor: 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name={acc.status === 'verified' ? 'shield-check' : acc.status === 'rejected' ? 'shield-alert' : 'shield-outline'} color={acc.status === 'verified' ? colors.brandDark : acc.status === 'rejected' ? colors.danger : colors.muted} />
        <T v="bodyStrong">{acc.status === 'verified' ? `Checked by your team staff${acc.checked_at ? ` · ${shortDate(acc.checked_at)}` : ''}` : acc.status === 'rejected' ? 'Your team staff found a problem' : 'Not checked yet'}</T>
      </View>
      {acc.status === 'rejected' && acc.check_note ? <T v="small">“{acc.check_note}”</T> : null}
      {acc.status === 'unverified' ? <T v="small">{acc.file_path ? 'Your team staff will check it before the next CTFDA, regional or SAFDA event.' : 'Upload the PDF so your team staff can check it.'}</T> : null}
    </Card>
  );
}
