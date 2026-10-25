import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Text, View } from 'react-native';

import { initials } from '@/domain/format';
import { IS_WEB, webDataUrl } from '@/lib/web';

import { Button, Sheet, T } from './components';
import { colors, DEFAULT_TEAM_COLOR, font } from './theme';

/**
 * Let someone take or choose a square photo, then copy it into the app's own storage (the picker's
 * copy lives in a cache that Android may clear). Returns the stored file's uri, or null if cancelled.
 */
export async function pickPhoto(source: 'camera' | 'library', name: string): Promise<string | null> {
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', source === 'camera' ? 'Allow camera access to take a photo.' : 'Allow photo access to choose a picture.');
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: IS_WEB };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  // The browser has no app folder: keep the picture itself (a data URL), so it survives a reload.
  if (IS_WEB) return result.assets[0].base64 ? `data:${result.assets[0].mimeType ?? 'image/jpeg'};base64,${result.assets[0].base64}` : webDataUrl(result.assets[0].uri);

  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create();
  const ext = result.assets[0].uri.split('.').pop()?.toLowerCase() || 'jpg';
  const dest = new File(dir, `${name}-${Date.now()}.${ext}`);
  new File(result.assets[0].uri).copy(dest);
  return dest.uri;
}

/** Pick up to `max` screenshots (no cropping), kept until they're sent. Returns file or data URIs. */
export async function pickScreenshots(max: number): Promise<string[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow photo access to add screenshots.');
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: max, quality: 0.6, base64: IS_WEB });
  if (result.canceled) return [];
  const out: string[] = [];
  for (const a of result.assets.slice(0, max)) {
    if (IS_WEB) {
      out.push(a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : await webDataUrl(a.uri));
      continue;
    }
    const dir = new Directory(Paths.document, 'feedback');
    if (!dir.exists) dir.create();
    const ext = a.uri.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg';
    const dest = new File(dir, `shot-${Date.now()}-${out.length}.${ext}`);
    new File(a.uri).copy(dest);
    out.push(dest.uri);
  }
  return out;
}

/** Remove a photo we stored earlier; ignores anything outside our photos folder. */
export function deletePhoto(uri: string | null | undefined) {
  if (!uri || !uri.includes('/photos/')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Missing file: nothing to clean up.
  }
}

export function Avatar({ uri, name, size = 44, tone = 'brand' }: { uri: string | null | undefined; name: string; size?: number; tone?: 'brand' | 'tint' }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.neutralTint }} contentFit="cover" accessibilityLabel={name} />;
  }
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'brand' ? colors.brand : colors.brandTint,
      }}>
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.36, color: tone === 'brand' ? '#fff' : colors.brandDark }}>{initials(name)}</Text>
    </View>
  );
}

/** Team logo if there is one, otherwise a square in the team colour. */
export function TeamLogo({ uri, color, size = 40 }: { uri: string | null | undefined; color: string | null | undefined; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.neutralTint }} contentFit="cover" />;
  }
  return <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: color || DEFAULT_TEAM_COLOR }} />;
}

/** Take / choose / remove sheet shared by player photos and team logos. */
export function PhotoSheet({
  visible,
  onClose,
  title,
  hasPhoto,
  fileName,
  onPicked,
  onRemove,
  note,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  hasPhoto: boolean;
  fileName: string;
  onPicked: (uri: string) => void;
  onRemove: () => void;
  note?: string;
}) {
  async function pick(source: 'camera' | 'library') {
    const uri = await pickPhoto(source, fileName);
    if (uri) onPicked(uri);
    onClose();
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Button label="Take a photo" icon="camera-outline" kind="primary" onPress={() => pick('camera')} />
      <Button label="Choose from gallery" icon="image-outline" onPress={() => pick('library')} />
      {hasPhoto ? (
        <Button
          label="Remove"
          icon="delete-outline"
          kind="danger"
          onPress={() => {
            onRemove();
            onClose();
          }}
        />
      ) : null}
      {note ? <T v="small">{note}</T> : null}
    </Sheet>
  );
}
