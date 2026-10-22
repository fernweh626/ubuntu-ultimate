import { NativeTabs } from 'expo-router/native-tabs';

import { colors } from '@/ui/theme';

export default function TabLayout() {
  return (
    <NativeTabs
      backgroundColor={colors.surface}
      indicatorColor={colors.brandTint}
      labelStyle={{ selected: { color: colors.brandDark } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="play">
        <NativeTabs.Trigger.Label>Games</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sportscourt.fill" md="scoreboard" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="teams">
        <NativeTabs.Trigger.Label>Teams</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.3.fill" md="groups" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="hub">
        <NativeTabs.Trigger.Label>Hub</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map.fill" md="explore" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
