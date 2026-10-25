import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { certificateUrl, verifyAccreditation } from '@/db/accreditation-send';
import { readiness } from '@/db/development';
import { useData } from '@/db/live';
import { getAccess, getTeam } from '@/db/repo';
import { ACCREDITATION_LEVELS, accreditationCheck, accreditationState, best, FITNESS_TESTS, formatFitness, RATING_AREAS, type FitnessKind } from '@/domain/development';
import { displayName, shortDate } from '@/domain/format';
import { standingCheck, whatsappLink, type Check } from '@/domain/standing';
import { Button, Card, Field, Icon, IconButton, Screen, Segmented, Sheet, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/** Staff: who's ready to play (accreditation, SAFDA, region), fitness benchmarks and self-ratings across the squad. */
export default function SquadDevelopment() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const bundle = useData(async (d) => ({ team: await getTeam(d, teamId), squad: await readiness(d, teamId) }), [teamId]);
  const [view, setView] = useState<'ready' | FitnessKind | 'rating'>('ready');
  const [checking, setChecking] = useState<string | null>(null);
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  const { team, squad } = bundle;
  const international = team?.kind === 'national';

  const checks = (p: (typeof squad)[number]) => {
    const acc = accreditationCheck({ level: p.level, expires_on: p.expires_on, status: p.acc_status, file: p.acc_file }, { role: p.role, teamKind: team?.kind });
    const safda = standingCheck(p.reg?.safda_number, p.safda, p.safdaListed);
    const body = REGIONS.find((r) => r.code === p.reg?.region_code)?.body ?? 'Region';
    const region = standingCheck(p.reg?.region_number, p.region, p.regionListed);
    return { acc, safda, region, body, ready: acc.check === 'ok' && safda.check === 'ok' && region.check === 'ok' };
  };
  const readyCount = squad.filter((p) => checks(p).ready).length;
  // SAFDA Road to Nationals: at Nationals at least half of each team needs valid Advanced accreditation.
  const advanced = squad.filter((p) => p.level === 'advanced' && accreditationState(p.expires_on) !== 'expired').length;
  const advancedNeeded = international ? squad.length : Math.ceil(squad.length / 2);
  const unchecked = squad.filter((p) => p.level && p.acc_file && p.acc_status !== 'verified').length;
  const rows = [...squad].map((p) => {
    if (view === 'ready') {
      const c = checks(p);
      const score = [c.acc, c.safda, c.region].filter((x) => x.check === 'ok').length;
      return { p, sort: score, value: '', sub: '', tone: 'neutral' };
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
  rows.sort((a, b) => (view === 'ready' ? a.sort - b.sort : b.sort - a.sort) || a.p.first_name.localeCompare(b.p.first_name));

  return (
    <>
      <Stack.Screen options={{ title: `${team?.name ?? 'Squad'} · development` }} />
      <Screen edges={[]}>
        {view === 'ready' ? (
          <Card style={{ backgroundColor: readyCount === squad.length ? colors.brandTint : colors.warnTint, borderColor: 'transparent' }}>
            <T v="bodyStrong">
              {readyCount} of {squad.length} ready to play
            </T>
            <T v="small">Ready = valid accreditation, and paid up with SAFDA and their region (from the lists admins upload). Tap WhatsApp to follow up with anyone who isn’t.</T>
          </Card>
        ) : null}
        {view === 'ready' && squad.length ? (
          <Card style={{ backgroundColor: advanced >= advancedNeeded ? colors.brandTint : colors.warnTint, borderColor: 'transparent' }}>
            <T v="bodyStrong">
              Nationals: {advanced} of {squad.length} have Advanced accreditation (need {advancedNeeded})
            </T>
            <T v="small">
              {international
                ? 'International team: everyone needs Advanced accreditation.'
                : 'SAFDA’s Road to Nationals: everyone needs Standard by Regionals, captains and spirit captains need Advanced, and at Nationals half of each team needs Advanced.'}
            </T>
          </Card>
        ) : null}
        {view === 'ready' && unchecked ? (
          <Card style={{ backgroundColor: colors.warnTint, borderColor: 'transparent' }}>
            <T v="bodyStrong">{unchecked} certificate{unchecked > 1 ? 's' : ''} to check</T>
            <T v="small">Before a CTFDA, regional or SAFDA event, open each certificate and confirm the type and expiry date match. Tap “Check certificate” on a player.</T>
          </Card>
        ) : null}
        <Segmented
          value={view === 'ready' || view === 'rating' ? view : 'fitness'}
          onChange={(v) => setView(v === 'fitness' ? 'beep' : v)}
          options={[
            { value: 'ready', label: 'Ready to play' },
            { value: 'fitness', label: 'Fitness' },
            { value: 'rating', label: 'Self-rating' },
          ]}
        />
        {view !== 'ready' && view !== 'rating' ? (
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
          {rows.map(({ p, value, sub }, i) => {
            if (view === 'ready') {
              const c = checks(p);
              const wa = whatsappLink(p.reg?.phone, `Hi ${p.first_name}, ${team?.name ?? 'team'} here about being tournament-ready: `);
              const line = (label: string, x: { check: Check; text: string }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name={x.check === 'ok' ? 'check-circle' : x.check === 'unknown' ? 'help-circle-outline' : 'alert-circle'} size={16} color={x.check === 'ok' ? colors.brand : x.check === 'unknown' ? colors.faint : x.check === 'warn' ? colors.warn : colors.danger} />
                  <T v="small" style={{ flex: 1 }}>
                    {label}: {x.text}
                  </T>
                </View>
              );
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                  <Pressable onPress={() => router.push({ pathname: '/development', params: { personId: p.id } })} accessibilityRole="button" style={{ flex: 1, gap: 3 }}>
                    <T v="bodyStrong" style={{ color: p.gender === 'W' ? colors.female : p.gender === 'M' ? colors.male : colors.ink }}>
                      {c.ready ? '✓ ' : ''}
                      {displayName(p)}
                    </T>
                    {line('Accreditation', c.acc)}
                    {p.acc_file ? (
                      <Pressable onPress={() => setChecking(p.id)} accessibilityRole="button">
                        <T v="smallStrong" style={{ color: colors.brand }}>
                          {p.acc_status === 'verified' ? 'Certificate checked · look again' : 'Check certificate ›'}
                        </T>
                      </Pressable>
                    ) : null}
                    {line('SAFDA', c.safda)}
                    {line(c.body, c.region)}
                    {p.reg?.emergency_phone ? (
                      <Pressable onPress={() => Linking.openURL(`tel:${p.reg!.emergency_phone!.replace(/\s/g, '')}`)} accessibilityRole="link" accessibilityLabel={`Call emergency contact ${p.reg.emergency_name ?? ''}`}>
                        <T v="small" style={{ color: colors.danger }}>
                          ✚ Emergency: {[p.reg.emergency_name, p.reg.emergency_phone].filter(Boolean).join(' · ')} (tap to call)
                        </T>
                      </Pressable>
                    ) : (
                      <T v="small">✚ No emergency contact</T>
                    )}
                  </Pressable>
                  {wa ? <IconButton icon="whatsapp" label={`WhatsApp ${p.first_name}`} color="#25D366" onPress={() => Linking.openURL(wa)} /> : <T v="small" style={{ width: 52, textAlign: 'center' }}>no phone</T>}
                </View>
              );
            }
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push({ pathname: '/development', params: { personId: p.id } })}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
                <T style={{ width: 22, fontFamily: font.bold, color: colors.faint }}>{i + 1}</T>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" style={{ color: p.gender === 'W' ? colors.female : p.gender === 'M' ? colors.male : colors.ink }}>
                    {displayName(p)}
                  </T>
                  <T v="small">{sub}</T>
                </View>
                <T style={{ fontFamily: font.display, fontSize: 22 }}>{value}</T>
              </Pressable>
            );
          })}
        </View>
      </Screen>
      <CheckSheet player={squad.find((p) => p.id === checking) ?? null} onClose={() => setChecking(null)} />
    </>
  );
}

/** Staff open the certificate and confirm the level and expiry the player entered, or say what's wrong. */
function CheckSheet({ player, onClose }: { player: { id: string; first_name: string; last_name: string; birth_date: string | null; level: keyof typeof ACCREDITATION_LEVELS | null; expires_on: string | null; acc_file: string | null; acc_note: string | null } | null; onClose: () => void }) {
  const db = useSQLiteContext();
  const access = useData(getAccess);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function decide(ok: boolean) {
    if (!player) return;
    if (!ok && !note.trim()) return Alert.alert('Say what’s wrong', 'e.g. “Certificate says Standard” or “Expired in March”. The player sees this.');
    setBusy(true);
    try {
      await verifyAccreditation(db, player.id, ok, note);
      setNote('');
      onClose();
    } catch (e) {
      Alert.alert('Couldn’t save that', `${String((e as Error).message ?? e)}\n\nYou need signal.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={!!player} onClose={onClose} title={player ? `${displayName(player)}’s accreditation` : ''}>
      {player ? (
        <>
          <T>
            They entered: <T v="bodyStrong">{player.level ? ACCREDITATION_LEVELS[player.level] : '—'}</T>, expires <T v="bodyStrong">{player.expires_on ? shortDate(player.expires_on) : '—'}</T>
          </T>
          {!access?.signedIn ? <T v="small">Go online (More → Account & sync) to open and check certificates.</T> : null}
          <Button
            label="Open certificate (PDF)"
            icon="file-pdf-box"
            disabled={!access?.signedIn}
            onPress={async () => {
              try {
                await Linking.openURL(await certificateUrl(player.acc_file!));
              } catch (e) {
                Alert.alert('Couldn’t open it', String((e as Error).message ?? e));
              }
            }}
          />
          <Button label="Type and expiry are correct" icon="shield-check" kind="primary" disabled={busy || !access?.signedIn} onPress={() => decide(true)} />
          <Field label="Something’s wrong? Say what" value={note} onChangeText={setNote} placeholder="e.g. Certificate says Standard, not Advanced" />
          <Button label="Send back to the player" icon="shield-alert-outline" disabled={busy || !access?.signedIn} onPress={() => decide(false)} />
        </>
      ) : null}
    </Sheet>
  );
}
