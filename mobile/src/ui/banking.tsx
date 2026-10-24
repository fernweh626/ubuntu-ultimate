import * as Clipboard from 'expo-clipboard';
import { Alert, Platform, Share, View } from 'react-native';

import { Button, Card, Icon, T } from './components';
import { colors, space } from './theme';

/** Banking details with Copy and Share, for paying club or team fees. */
export function BankingCard({ name, details }: { name: string; details: string | null | undefined }) {
  if (!details?.trim()) return null;
  const text = `${name} banking details\n\n${details.trim()}`;
  async function share() {
    if (Platform.OS === 'web') {
      if (navigator.share) return navigator.share({ text }).catch(() => undefined);
      await Clipboard.setStringAsync(text);
      return Alert.alert('Copied', 'Paste it into WhatsApp or an email.');
    }
    await Share.share({ message: text });
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="bank-outline" color={colors.brand} />
        <T v="bodyStrong">Banking details</T>
      </View>
      <T selectable style={{ lineHeight: 22 }}>
        {details.trim()}
      </T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Copy" icon="content-copy" onPress={() => Clipboard.setStringAsync(text).then(() => Alert.alert('Copied', 'Banking details copied.'))} style={{ flex: 1 }} />
        <Button label="Share" icon="share-variant" onPress={share} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}
