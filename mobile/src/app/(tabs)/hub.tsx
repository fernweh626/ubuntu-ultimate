import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { Card, Icon, PageTitle, Screen, T, type IconName } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const TILES: { title: string; body: string; icon: IconName; href: Href }[] = [
  { title: 'Find pickup', body: 'Flick through the week to find games near you', icon: 'map-marker-radius', href: '/hub/pickups' },
  { title: 'Competitive calendar', body: 'Nationals, regionals, leagues and big tournaments', icon: 'calendar-star', href: '/hub/calendar' },
  { title: 'Teams & contacts', body: 'Every club by region, and how to reach them', icon: 'account-group', href: '/teams' },
  { title: 'Rules quick reference', body: 'The essentials, in plain words', icon: 'book-open-variant', href: '/hub/rules' },
  { title: 'What is ultimate?', body: 'New here? Start with this', icon: 'disc', href: '/hub/about' },
  { title: 'Who runs the sport', body: 'WFDF, AAFDF, SAFDA and the regions', icon: 'sitemap', href: '/hub/governance' },
];

export default function Hub() {
  return (
    <Screen>
      <PageTitle title="Hub" subtitle="Everything about ultimate in South Africa" />
      <View style={{ gap: space.sm }}>
        {TILES.map((t) => (
          <Card key={t.title} onPress={() => router.push(t.href)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={t.icon} color={colors.brandDark} size={26} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{t.title}</T>
              <T v="small">{t.body}</T>
            </View>
            <Icon name="chevron-right" color={colors.faint} />
          </Card>
        ))}
      </View>
    </Screen>
  );
}
