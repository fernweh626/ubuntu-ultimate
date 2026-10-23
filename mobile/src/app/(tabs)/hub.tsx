import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { Icon, PageTitle, Row, Screen, Section, type IconName } from '@/ui/components';
import { MeButton } from '@/ui/me-button';
import { colors } from '@/ui/theme';

type Tile = { title: string; body: string; icon: IconName; href: Href };

// Grouped by what you came to do, so the list stays scannable as it grows.
const GROUPS: { title: string; tiles: Tile[] }[] = [
  {
    title: 'Play',
    tiles: [
      { title: 'Find pickup', body: 'Flick through the week for games near you', icon: 'map-marker-radius', href: '/hub/pickups' },
      { title: 'Hat tournaments', body: 'Sign up solo, get drawn into a team', icon: 'hat-fedora', href: '/hat' },
      { title: 'Fields', body: 'Saved fields, nearest first', icon: 'map-marker-multiple', href: '/hub/fields' },
    ],
  },
  {
    title: 'Compete',
    tiles: [
      { title: 'Calendar', body: 'Nationals, regionals, leagues, hats and AGMs', icon: 'calendar-star', href: '/hub/calendar' },
      { title: 'Teams & clubs', body: 'Every club by region, and how to reach them', icon: 'account-group', href: '/teams' },
    ],
  },
  {
    title: 'Community',
    tiles: [
      { title: 'Announcements', body: 'News from SAFDA and your region', icon: 'bullhorn-outline', href: '/hub/announcements' },
      { title: 'Merch & links', body: 'Kit and discs, join your association, groups', icon: 'tshirt-crew-outline', href: '/hub/links' },
    ],
  },
  {
    title: 'Learn',
    tiles: [
      { title: 'Rules quick reference', body: 'The essentials, in plain words', icon: 'book-open-variant', href: '/hub/rules' },
      { title: 'What is ultimate?', body: 'New here? Start with this', icon: 'disc', href: '/hub/about' },
      { title: 'Who runs the sport', body: 'WFDF, AAFDF, SAFDA and its four regions', icon: 'sitemap', href: '/hub/governance' },
    ],
  },
];

export default function Hub() {
  return (
    <Screen>
      <PageTitle title="Hub" subtitle="Everything about ultimate in South Africa" right={<MeButton />} />
      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
            {g.tiles.map((t) => (
              <Row key={t.title} title={t.title} subtitle={t.body} left={<Icon name={t.icon} color={colors.brand} />} onPress={() => router.push(t.href)} />
            ))}
          </View>
        </Section>
      ))}
    </Screen>
  );
}
