import { Stack } from 'expo-router';
import { Linking, View } from 'react-native';

import { LINK_KINDS, REGIONS } from '@/content/hub';
import { orgLinks, type OrgLink } from '@/db/development';
import { useData } from '@/db/live';
import { Card, Icon, Screen, Section, T, type IconName } from '@/ui/components';
import { RegionChips, useRegionFilter } from '@/ui/region-filter';
import { colors, space } from '@/ui/theme';

const host = (url: string) => (url.startsWith('mailto:') ? url.slice(7) : url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]);

/** Merch, registration, pickup groups, socials and policies for your region plus SAFDA, in one place. */
export default function Links() {
  const links = useData(orgLinks) ?? [];
  const region = useRegionFilter();
  const body = REGIONS.find((r) => r.code === region.value)?.body;
  // Your region's links first, then national ones. "All of SA" shows everything.
  const shown = links.filter((l) => region.value === 'all' || !l.region_code || l.region_code === region.value);
  const ofKind = (kind: string) =>
    shown
      .filter((l) => (l.kind ?? 'website') === kind)
      .sort((a, b) => Number(!a.region_code) - Number(!b.region_code) || a.sort - b.sort);
  const merch = ofKind('merch');

  return (
    <>
      <Stack.Screen options={{ title: 'Merch & links' }} />
      <Screen edges={[]}>
        <RegionChips value={region.value} onChange={region.setValue} home={region.home} />
        {merch.length ? (
          <Card style={{ backgroundColor: colors.night, borderColor: colors.night, gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name="tshirt-crew-outline" color="#fff" size={26} />
              <T v="title" style={{ color: '#fff' }}>
                Merch & discs
              </T>
            </View>
            <T style={{ color: colors.nightMuted }}>Kit, discs (175 g) and club gear. Buying from your association funds leagues and development.</T>
            {merch.map((l) => (
              <LinkRow key={l.id} l={l} dark />
            ))}
          </Card>
        ) : null}
        {LINK_KINDS.filter((k) => k.kind !== 'merch').map((k) => {
          const list = ofKind(k.kind);
          return list.length ? (
            <Section key={k.kind} title={k.title}>
              <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
                {list.map((l) => (
                  <LinkRow key={l.id} l={l} icon={k.icon as IconName} />
                ))}
              </View>
            </Section>
          ) : null;
        })}
        {region.value !== 'all' && !shown.some((l) => l.region_code === region.value) ? (
          <Card>
            <T v="bodyStrong">No {body ?? 'regional'} links yet</T>
            <T v="small">Coordinators can add the region’s website, registration, merch and WhatsApp groups in Me → Admin → Forms & payment links.</T>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

function LinkRow({ l, icon, dark }: { l: OrgLink; icon?: IconName; dark?: boolean }) {
  const who = l.region_code ? (REGIONS.find((r) => r.code === l.region_code)?.body ?? '') : 'National';
  return (
    <Card
      onPress={() => Linking.openURL(l.url)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: dark ? 10 : 0, borderWidth: 0, backgroundColor: dark ? 'rgba(255,255,255,0.08)' : colors.surface }}>
      {icon ? <Icon name={icon} color={colors.brand} /> : null}
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" style={dark ? { color: '#fff' } : undefined}>
          {l.label}
        </T>
        <T v="small" style={dark ? { color: colors.nightMuted } : undefined}>
          {who} · {host(l.url)}
        </T>
      </View>
      <Icon name="open-in-new" color={dark ? '#fff' : colors.faint} size={18} />
    </Card>
  );
}
