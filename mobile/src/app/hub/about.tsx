import { router, Stack } from 'expo-router';

import { WHAT_IS_ULTIMATE } from '@/content/hub';
import { Button, Card, Screen, T } from '@/ui/components';

export default function About() {
  return (
    <>
      <Stack.Screen options={{ title: 'What is ultimate?' }} />
      <Screen edges={[]}>
        {WHAT_IS_ULTIMATE.map((s) => (
          <Card key={s.title}>
            <T v="title">{s.title}</T>
            <T>{s.body}</T>
          </Card>
        ))}
        <Button label="Find a pickup game" icon="map-marker-radius" kind="primary" onPress={() => router.push('/hub/pickups')} />
        <Button label="Read the rules" icon="book-open-variant" onPress={() => router.push('/hub/rules')} />
      </Screen>
    </>
  );
}
