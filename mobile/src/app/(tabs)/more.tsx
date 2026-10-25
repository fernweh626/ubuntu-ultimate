import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { regionName } from '@/content/hub';
import { useData } from '@/db/live';
import { getAccess, getHomeRegion } from '@/db/repo';
import { LEVEL_LABEL } from '@/domain/permissions';
import { PREVIEW } from '@/lib/preview';
import { Icon, PageTitle, Row, Screen, Section, type IconName } from '@/ui/components';
import { MeButton } from '@/ui/me-button';
import { colors } from '@/ui/theme';

type Item = { title: string; body: string; icon: IconName; href: Href };
const GROUP = { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider } as const;

/** Everything that isn't Home, Play or Teams, grouped by what you came to do. */
export default function More() {
  const access = useData(getAccess);
  const region = useData(getHomeRegion);
  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Find a game',
      items: [
        { title: 'Pickup', body: 'Weekly games near you', icon: 'map-marker-radius', href: '/hub/pickups' },
        { title: 'Hat tournaments', body: 'Sign up solo, get drawn into a team', icon: 'hat-fedora', href: '/hat' },
        { title: 'Calendar', body: 'Nationals, regionals, leagues, hats and AGMs', icon: 'calendar-star', href: '/hub/calendar' },
        { title: 'Fields', body: 'Saved fields, nearest first', icon: 'map-marker-multiple', href: '/hub/fields' },
      ],
    },
    {
      title: 'Community',
      items: [
        { title: 'Announcements', body: 'News from SAFDA and your region', icon: 'bullhorn-outline', href: '/hub/announcements' },
        { title: 'Merch & links', body: 'Kit and discs, associations, groups', icon: 'tshirt-crew-outline', href: '/hub/links' },
      ],
    },
    {
      title: 'Learn',
      items: [
        { title: 'Rules quick reference', body: 'The essentials, in plain words', icon: 'book-open-variant', href: '/hub/rules' },
        { title: 'What is ultimate?', body: 'New here? Start with this', icon: 'disc', href: '/hub/about' },
        { title: 'Who runs the sport', body: 'WFDF, AAFDF, SAFDA and its regions', icon: 'sitemap', href: '/hub/governance' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { title: 'Region', body: region ? regionName(region) : 'All of SA', icon: 'map-outline', href: '/region' },
        { title: 'Notifications', body: 'Reminders, check-ins, news', icon: 'bell-outline', href: '/notifications' },
        {
          title: PREVIEW ? 'Preview version' : access?.signedIn ? 'Account & sync' : 'Go online',
          body: PREVIEW ? 'Nothing you do here is saved online' : access?.signedIn ? 'Backed up · syncs automatically' : 'Back up your data and share with your team',
          icon: access?.signedIn ? 'cloud-check-outline' : 'cloud-upload-outline',
          href: '/account',
        },
        { title: 'Your data & privacy', body: 'Who sees it, download or delete', icon: 'shield-lock-outline', href: '/privacy' },
        { title: 'Access level', body: access ? LEVEL_LABEL[access.level] : '', icon: 'shield-account-outline', href: '/access' },
      ],
    },
    {
      title: 'Help',
      items: [
        { title: 'Help & how-to guide', body: 'Every feature, step by step', icon: 'help-circle-outline', href: '/guide' },
        { title: 'Report a bug or suggest an idea', body: 'Goes straight to the people building the app', icon: 'lightbulb-on-outline', href: '/feedback' },
      ],
    },
  ];
  if (access?.level === 'admin')
    groups.push({
      title: 'Admin',
      items: [
        { title: 'Membership register', body: 'Registered and paid, totals, exports', icon: 'card-account-details-star-outline', href: '/admin/members' },
        { title: 'Paid-up lists', body: 'Upload SAFDA and regional lists (CSV)', icon: 'file-upload-outline', href: '/admin/standing' },
        { title: 'Forms & payment links', body: 'Where players register and pay', icon: 'link-variant', href: '/admin/links' },
        { title: 'Bugs & ideas inbox', body: 'Reports, access and privacy requests', icon: 'inbox-full-outline', href: '/feedback-admin' },
      ],
    });

  return (
    <Screen>
      <PageTitle title="More" right={<MeButton />} />
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <View style={GROUP}>
            {g.items.map((t) => (
              <Row key={t.title} title={t.title} subtitle={t.body} left={<Icon name={t.icon} color={colors.brand} />} onPress={() => router.push(t.href)} />
            ))}
          </View>
        </Section>
      ))}
    </Screen>
  );
}
