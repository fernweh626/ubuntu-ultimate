import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, View } from 'react-native';

import { WEB_URL } from '@/content/hub';

import { Button, Card, Icon, T } from './components';
import { colors, space } from './theme';

/**
 * Banking details for paying club or team fees: one slim row until tapped, then WhatsApp, Share and Copy. The message
 * includes a link to the team's page in the web app, so it can be posted in WhatsApp groups.
 */
export function BankingCard({ name, details, path }: { name: string; details: string | null | undefined; path: string }) {
  const [open, setOpen] = useState(false);
  if (!details?.trim()) return null;
  const link = `${WEB_URL}${path}`;
  const text = `${name}: banking details for fees\n\n${details.trim()}\n\nAlso on Ubuntu Ultimate: ${link}`;
  async function share() {
    if (Platform.OS === 'web') {
      if (navigator.share) return navigator.share({ text }).catch(() => undefined);
      await Clipboard.setStringAsync(text);
      return Alert.alert('Copied', 'Paste it into WhatsApp or an email.');
    }
    await Share.share({ message: text });
  }
  if (!open)
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Show fees and banking details" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 }}>
        <Icon name="bank-outline" color={colors.brand} size={18} />
        <T v="smallStrong" style={{ flex: 1, color: colors.brand }}>
          Fees & banking details
        </T>
        <Icon name="chevron-down" color={colors.brand} size={18} />
      </Pressable>
    );
  return (
    <Card>
      <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="bank-outline" color={colors.brand} />
        <T v="bodyStrong" style={{ flex: 1 }}>
          Fees & banking details
        </T>
        <Icon name="chevron-up" color={colors.muted} />
      </Pressable>
      <T selectable style={{ lineHeight: 22 }}>
        {details.trim()}
      </T>
      <Button label="Send on WhatsApp" icon="whatsapp" kind="primary" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`)} />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Share" icon="share-variant" onPress={share} style={{ flex: 1 }} />
        <Button label="Copy" icon="content-copy" onPress={() => Clipboard.setStringAsync(text).then(() => Alert.alert('Copied', 'Banking details and link copied.'))} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}
