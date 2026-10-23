import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { squadDevelopment } from '@/db/development';
import { useData } from '@/db/live';
import { getTeam } from '@/db/repo';
import { ACCREDITATION_LEVELS, accreditationState, best, FITNESS_TESTS, formatFitness, RATING_AREAS, type FitnessKind } from '@/domain/development';
import { displayName, shortDate } from '@/domain/format';
import { Button, Card, Chip, Screen, Segmented, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/** Staff: who's accredited (and until when), fitness benchmarks and self-ratings across the squad. */
export default function SquadDevelopment() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const bundle = useData(async (d) => ({ team: await getTeam(d, teamId), squad: await squadDevelopment(d, teamId) }), [teamId]);
  const [view, setView] = useState<'accreditation' | FitnessKind | 'rating'>('accreditation');
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { team, squad } = bundle;

  const accredited = squad.filter((p) => accreditationState(p.expires_on) === 'valid' || accreditationState(p.expires_on) === 'expiring').length;
  const rows = [...squad].map((p) => {
    if (view === 'accreditation') {
      const st = accreditationState(p.expires_on);
      return { p, sort: st === 'expired' || st === 'unknown' ? 0 : st === 'expiring' ? 1 : 2, value: p.level ? ACCREDITATION_LEVELS[p.level] : '—', sub: p.expires_on ? `${st === 'expired' ? 'expired' : 'until'} ${shortDate(p.expires_on)}` : 'not added', tone: st === 'valid' ? 'brand' : st === 'expiring' ? 'warn' : 'danger' };
    }
    if (view === 'rating') {
      const r = p.rating;
      const avg = r ? RATING_AREAS.reduce((a, x) => a + r[x.key], 0) / RATING_AREAS.length : null;
      return { p, sort: avg ?? -1, value: avg != null ? avg.toFixed(1) : '—', sub: r ? `rated ${shortDate(r.rated_on)}` : 'not rated', tone: 'neutral' };
    }
    const vals = p.tests.filter((t) => t.kind === view).map((t) => t.value);
    const pb = best(view, vals);
    const lower = FITNESS_TESTS.find((t) => t.kind === view)!.lowerIsBetter;
    return { p, sort: pb == null ? -Infinity : lower ? -pb : pb, value: pb != null ? formatFitness(view, pb) : '—', sub: vals.length ? `${vals.length} result${vals.length > 1 ? 's' : ''}` : 'no result', tone: 'neutral' };
  });
  rows.sort((a, b) => (view === 'accreditation' ? a.sort - b.sort : b.sort - a.sort) || a.p.first_name.localeCompare(b.p.first_name));

  return (
    <>
      <Stack.Screen options={{ title: `${team?.name ?? 'Squad'} · development` }} />
      <Screen edges={[]}>
        <Card style={{ backgroundColor: accredited === squad.length ? colors.brandTint : colors.warnTint, borderColor: 'transparent' }}>
          <T v="bodyStrong">
            {accredited} of {squad.length} accredited
          </T>
          <T v="small">Players need a valid accreditation for leagues, regionals and nationals. Players get reminders before theirs runs out.</T>
        </Card>
        <Segmented
          value={view === 'accreditation' || view === 'rating' ? view : 'fitness'}
          onChange={(v) => setView(v === 'fitness' ? 'beep' : v)}
          options={[
            { value: 'accreditation', label: 'Accreditation' },
            { value: 'fitness', label: 'Fitness' },
            { value: 'rating', label: 'Self-rating' },
          ]}
        />
        {view !== 'accreditation' && view !== 'rating' ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {FITNESS_TESTS.map((t) => (
                <Button key={t.kind} label={t.short} kind={view === t.kind ? 'primary' : 'secondary'} onPress={() => setView(t.kind)} style={{ flex: 1, minHeight: 40, paddingHorizontal: 4 }} />
              ))}
            </View>
            <Button label="Testing day: enter results for everyone" icon="timer-outline" onPress={() => router.push({ pathname: '/team/testing', params: { teamId, kind: view } })} />
          </>
        ) : null}
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
          {rows.map(({ p, value, sub, tone }, i) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: '/development', params: { personId: p.id } })}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
              <T style={{ width: 22, fontFamily: font.bold, color: colors.faint }}>{view === 'accreditation' ? '' : i + 1}</T>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong" style={{ color: p.gender === 'W' ? '#6B2C91' : p.gender === 'M' ? '#1D3F8F' : colors.ink }}>
                  {displayName(p)}
                </T>
                <T v="small">{sub}</T>
              </View>
              {view === 'accreditation' ? <Chip label={value} tone={tone as 'brand' | 'warn' | 'danger'} /> : <T style={{ fontFamily: font.display, fontSize: 22 }}>{value}</T>}
            </Pressable>
          ))}
        </View>
      </Screen>
    </>
  );
}
