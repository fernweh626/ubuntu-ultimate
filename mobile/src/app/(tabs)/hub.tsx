import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { Card, Icon, PageTitle, Screen, T, type IconName } from '@/ui/components';
import { MeButton } from '@/ui/me-button';
import { colors, space } from '@/ui/theme';

const TILES: { title: string; body: string; icon: IconName; href: Href }[] = [
  { title: 'Hat tournaments', body: 'Sign up solo, get drawn into a team: skill, captains, payment', icon: 'hat-fedora', href: '/hat' },
  { title: 'Announcements', body: 'Nationals dates, AGMs, constitution reviews and other news', icon: 'bullhorn-outline', href: '/hub/announcements' },
  { title: 'Merch & links', body: 'Kit and discs, join your association, pickup groups, socials', icon: 'tshirt-crew-outline', href: '/hub/links' },
  { title: 'Find pickup', body: 'Flick through the week to find games near you', icon: 'map-marker-radius', href: '/hub/pickups' },
  { title: 'Fields', body: 'Saved fields, nearest first — add the one you’re on', icon: 'map-marker-multiple', href: '/hub/fields' },
  { title: 'Competitive calendar', body: 'Nationals, regionals, leagues and big tournaments', icon: 'calendar-star', href: '/hub/calendar' },
  { title: 'Teams & contacts', body: 'Every club by region, and how to reach them', icon: 'account-group', href: '/teams' },
  { title: 'Rules quick reference', body: 'The essentials, in plain words', icon: 'book-open-variant', href: '/hub/rules' },
  { title: 'What is ultimate?', body: 'New here? Start with this', icon: 'disc', href: '/hub/about' },
  { title: 'Who runs the sport', body: 'WFDF, AAFDF, SAFDA and its four regions', icon: 'sitemap', href: '/hub/governance' },
];

export default function Hub() {
  return (
    <Screen>
      <PageTitle title="Hub" subtitle="Everything about ultimate in South Africa" right={<MeButton />} />
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
