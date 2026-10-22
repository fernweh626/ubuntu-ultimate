import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  useFonts,
} from '@expo-google-fonts/barlow';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { migrate } from '@/db/schema';
import { seedIfEmpty } from '@/db/seed';
import { colors, font } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

async function init(db: SQLiteDatabase) {
  await migrate(db);
  await seedIfEmpty(db);
}

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, primary: colors.brand, text: colors.ink, border: colors.border },
};

export default function RootLayout() {
  const [loaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={theme}>
      <StatusBar style="dark" />
      <SQLiteProvider databaseName="sa-ultimate.db" onInit={init}>
        <Stack
          screenOptions={{
            headerTitleStyle: { fontFamily: font.bold, fontSize: 18 },
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.ink,
            contentStyle: { backgroundColor: colors.bg },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="game/[id]/index" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack>
      </SQLiteProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
