import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { RULES, RULES_URL } from '@/content/hub';
import { Button, Card, Icon, Screen, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function Rules() {
  const [open, setOpen] = useState<string | null>(RULES[0].title);
  return (
    <>
      <Stack.Screen options={{ title: 'Rules quick reference' }} />
      <Screen edges={[]}>
        <T v="small">The essentials in plain words. The WFDF Rules of Ultimate are the official version.</T>
        {RULES.map((r) => {
          const expanded = open === r.title;
          return (
            <Card key={r.title} style={{ padding: 0 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : r.title)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: space.lg, minHeight: 56 }}>
                <T v="bodyStrong" style={{ flex: 1 }}>
                  {r.title}
                </T>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} color={colors.muted} />
              </Pressable>
              {expanded ? (
                <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}>
                  {r.points.map((p) => (
                    <View key={p} style={{ flexDirection: 'row', gap: space.sm }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 8 }} />
                      <T style={{ flex: 1 }}>{p}</T>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })}
        <Button label="Official WFDF rules" icon="open-in-new" onPress={() => Linking.openURL(RULES_URL)} />
      </Screen>
    </>
  );
}
