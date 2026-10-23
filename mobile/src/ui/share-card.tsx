import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { IS_WEB, webShareFiles } from '@/lib/web';

import { Button, Sheet, T } from './components';
import { colors, DEFAULT_TEAM_COLOR, font, space } from './theme';

export type ShareCardData = {
  kicker: string;
  title: string;
  left?: { name: string; color: string | null; score: number };
  right?: { name: string; color: string | null; score: number };
  stats: { label: string; value: string }[];
  highlights: string[];
  footer: string;
};

/** A Strava-style image card: rendered on screen, captured to PNG and handed to the share sheet. */
export function ShareCardSheet({ visible, onClose, data }: { visible: boolean; onClose: () => void; data: ShareCardData | null }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    if (!ref.current) return;
    setBusy(true);
    try {
      if (IS_WEB) {
        const b64 = await captureRef(ref.current as never, { format: 'png', quality: 1, result: 'base64' });
        return await webShareFiles([{ src: b64, name: 'ubuntu-ultimate-game.png', mime: 'image/png' }], 'My game');
      }
      const uri = await captureRef(ref.current as never, { format: 'png', quality: 1 });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing is not available on this device');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your game' });
    } catch (e) {
      Alert.alert('Could not create the image', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Share">
      {data ? (
        <View ref={ref} collapsable={false} style={{ backgroundColor: colors.night, borderRadius: 16, padding: space.xl, gap: space.lg }}>
          <View>
            <T style={{ fontFamily: font.semibold, fontSize: 12, letterSpacing: 1, color: colors.nightMuted, textTransform: 'uppercase' }}>
              {data.kicker}
            </T>
            <T style={{ fontFamily: font.bold, fontSize: 22, color: '#fff', marginTop: 2 }}>{data.title}</T>
          </View>
          {data.left && data.right ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Side name={data.left.name} color={data.left.color} />
              <T style={{ fontFamily: font.display, fontSize: 64, lineHeight: 68, color: '#fff' }}>
                {data.left.score}–{data.right.score}
              </T>
              <Side name={data.right.name} color={data.right.color} align="right" />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
            {data.stats.map((s) => (
              <View key={s.label} style={{ width: '33.33%' }}>
                <T style={{ fontFamily: font.display, fontSize: 30, lineHeight: 34, color: '#fff' }}>{s.value}</T>
                <T style={{ fontFamily: font.medium, fontSize: 12, color: colors.nightMuted }}>{s.label}</T>
              </View>
            ))}
          </View>
          {data.highlights.length ? (
            <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.nightRaised, paddingTop: space.md }}>
              {data.highlights.map((h) => (
                <T key={h} style={{ fontFamily: font.medium, fontSize: 15, color: '#fff' }}>
                  {h}
                </T>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T style={{ fontFamily: font.display, fontSize: 18, color: '#F0A27E', letterSpacing: 1 }}>UBUNTU ULTIMATE</T>
            <T style={{ fontFamily: font.regular, fontSize: 12, color: colors.nightMuted }}>{data.footer}</T>
          </View>
        </View>
      ) : null}
      <Button label={busy ? 'Preparing…' : 'Share image'} icon="share-variant" kind="primary" onPress={share} disabled={busy} big />
      <T v="small" style={{ textAlign: 'center' }}>
        Post it to WhatsApp, Instagram stories or anywhere else.
      </T>
    </Sheet>
  );
}

function Side({ name, color, align = 'left' }: { name: string; color: string | null; align?: 'left' | 'right' }) {
  return (
    <View style={{ flex: 1, alignItems: align === 'left' ? 'flex-start' : 'flex-end', gap: 6 }}>
      <View style={{ width: 36, height: 6, borderRadius: 3, backgroundColor: color || DEFAULT_TEAM_COLOR }} />
      <T numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 16, color: '#fff', textAlign: align }}>
        {name}
      </T>
    </View>
  );
}
