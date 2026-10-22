import { Stack } from 'expo-router';
import { Linking, View } from 'react-native';

import { GOVERNANCE, REGIONS } from '@/content/hub';
import { Button, Card, Chip, Screen, Section, T } from '@/ui/components';
import { space } from '@/ui/theme';

export default function Governance() {
  return (
    <>
      <Stack.Screen options={{ title: 'Who runs the sport' }} />
      <Screen edges={[]}>
        {GOVERNANCE.map((g) => (
          <Card key={g.name}>
            <Chip label={g.level} tone="neutral" />
            <T v="title">{g.name}</T>
            <T>{g.about}</T>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {g.links.map((l) => (
                <Button key={l.url} label={l.label} icon="open-in-new" kind="ghost" onPress={() => Linking.openURL(l.url)} />
              ))}
            </View>
          </Card>
        ))}
        <Section title="Regions">
          {REGIONS.map((r) => (
            <Card key={r.code}>
              <T v="bodyStrong">
                {r.name} · {r.body}
              </T>
              <T v="small">{r.area}</T>
            </Card>
          ))}
        </Section>
      </Screen>
    </>
  );
}
