import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

import { Icon, type IconName } from '@/ui/components';
import { colors, font } from '@/ui/theme';

/** The four tabs: what's next for me, games, teams, and everything else. Me is the avatar at the top. */
const TABS: { name: string; label: string; sf: string; md: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', sf: 'house.fill', md: 'home', icon: 'home' },
  { name: 'play', label: 'Play', sf: 'sportscourt.fill', md: 'scoreboard', icon: 'scoreboard' },
  { name: 'teams', label: 'Teams', sf: 'person.3.fill', md: 'groups', icon: 'account-group' },
  { name: 'more', label: 'More', sf: 'square.grid.2x2.fill', md: 'apps', icon: 'view-grid' },
];

export default function TabLayout() {
  // The website uses the same bottom tab bar as the phone, so they look and work the same.
  if (Platform.OS === 'web')
    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brandDark,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64 },
          tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
        }}>
        {TABS.map((t) => (
          <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label, tabBarIcon: ({ color }) => <Icon name={t.icon} color={String(color)} /> }} />
        ))}
      </Tabs>
    );
  return (
    <NativeTabs backgroundColor={colors.surface} indicatorColor={colors.brandTint} labelStyle={{ selected: { color: colors.brandDark } }}>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={t.sf as never} md={t.md as never} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
