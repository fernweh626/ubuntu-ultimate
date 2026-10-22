import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { REGIONS, regionName } from '@/content/hub';
import { useData } from '@/db/live';
import { listTeams } from '@/db/repo';
import { Button, Choice, EmptyState, Icon, PageTitle, Row, Screen, Section, TeamSwatch } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

export default function Teams() {
  const teams = useData(listTeams);
  const [q, setQ] = useState('');
  const [region, setRegion] = useState<string>('all');

  const filtered = (teams ?? []).filter((t) => {
    if (region !== 'all' && (region === 'sample' ? !t.is_sample : t.region !== region || t.is_sample)) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return t.name.toLowerCase().includes(s) || (t.short_name ?? '').toLowerCase().includes(s) || (t.city ?? '').toLowerCase().includes(s);
  });

  const groups = [
    ...REGIONS.map((r) => ({ key: r.code, title: `${r.name} · ${r.body}`, teams: filtered.filter((t) => t.region === r.code && !t.is_sample) })),
    { key: 'other', title: 'Other', teams: filtered.filter((t) => !t.is_sample && !REGIONS.some((r) => r.code === t.region)) },
    { key: 'sample', title: 'Sample teams', teams: filtered.filter((t) => t.is_sample) },
  ].filter((g) => g.teams.length);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
        <PageTitle
          title="Teams"
          subtitle="Clubs across South Africa, rosters and contacts"
          right={<Button label="Add" icon="plus" onPress={() => router.push('/team/edit')} />}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
          <Icon name="magnify" color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search teams or towns"
            placeholderTextColor={colors.faint}
            style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {[{ code: 'all', name: 'All' }, ...REGIONS.map((r) => ({ code: r.code, name: r.name })), { code: 'sample', name: 'Samples' }].map((r) => (
            <Choice key={r.code} label={r.name} selected={region === r.code} onPress={() => setRegion(r.code)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
          ))}
        </ScrollView>
      </View>
      {groups.length === 0 ? (
        <EmptyState icon="account-group-outline" title="No teams match" body="Try another search, or add the team." />
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ paddingHorizontal: space.lg }}>
            <Section title={g.title}>
              <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
                {g.teams.map((t) => (
                  <Row
                    key={t.id}
                    title={t.name}
                    subtitle={[t.city, t.region ? regionName(t.region) : null].filter(Boolean).join(' · ')}
                    left={<TeamSwatch color={t.primary_color} />}
                    onPress={() => router.push(`/team/${t.id}`)}
                  />
                ))}
              </View>
            </Section>
          </View>
        ))
      )}
    </Screen>
  );
}
