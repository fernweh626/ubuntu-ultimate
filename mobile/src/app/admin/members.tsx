import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Platform, TextInput, View } from 'react-native';

import { ASSOCIATIONS, formatRand } from '@/content/associations';
import { useData } from '@/db/live';
import { demographicTotals, membershipRegister, setPaid, uploadRoster, type RegisterRow } from '@/db/membership';
import { getAccess } from '@/db/repo';
import { parseRosterCsv } from '@/domain/roster-import';
import { IS_WEB, webShareFiles } from '@/lib/web';
import { Button, Card, Chip, Choice, Icon, Row, Screen, Section, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

type Filter = 'all' | 'unpaid' | 'claimed' | 'paid' | 'social';
const STATUS_LABEL: Record<RegisterRow['status'], string> = { social: 'Social', waived: 'No fee', unpaid: 'Unpaid', claimed: 'Says paid', paid: 'Paid' };

/** Admins: the membership register per association and season, payments, totals, exports and the pre-loaded list. */
export default function Members() {
  const db = useSQLiteContext();
  const access = useData(getAccess);
  const [code, setCode] = useState(Object.keys(ASSOCIATIONS)[0]);
  const assoc = ASSOCIATIONS[code];
  const [season, setSeason] = useState(assoc.season);
  const rows = useData((d) => membershipRegister(d, code, season), [code, season]) ?? [];
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showTotals, setShowTotals] = useState(false);
  const [busy, setBusy] = useState(false);

  if (access && access.level !== 'admin')
    return (
      <Screen edges={[]}>
        <T v="bodyStrong">Admins only</T>
        <T v="small">The membership register holds personal information (POPIA), so only admins can open it.</T>
      </Screen>
    );

  const s = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (filter === 'all' || (filter === 'social' ? r.status === 'social' || r.status === 'waived' : r.status === filter)) &&
      (!s || `${r.first_name} ${r.last_name} ${r.number ?? ''} ${r.email ?? ''} ${r.pay_reference ?? ''}`.toLowerCase().includes(s)),
  );
  const count = (f: Filter) => rows.filter((r) => (f === 'all' ? true : f === 'social' ? r.status === 'social' || r.status === 'waived' : r.status === f)).length;
  const owed = rows.filter((r) => r.status === 'unpaid' || r.status === 'claimed').reduce((a, r) => a + r.fee_cents, 0);
  const totals = demographicTotals(rows, season);

  async function exportCsv() {
    // Individuals' population group is left out on purpose: it's special personal information. Totals are on screen.
    const head = ['Number', 'First name', 'Surname', 'Email', 'Cell', 'Gender', 'Year of birth', 'Involvement', 'Membership', 'Fee', 'Status', 'Reference', 'Submitted', 'Paid on'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head, ...rows.map((r) => [r.number, r.first_name, r.last_name, r.email, r.phone, r.gender === 'W' ? 'Women matching' : r.gender === 'M' ? 'Man matching' : '', r.birth_year, assoc.involvement.find((i) => i.key === r.involvement)?.label ?? r.involvement, assoc.options.find((o) => o.key === r.option)?.label ?? '', r.fee_cents ? formatRand(r.fee_cents) : '', STATUS_LABEL[r.status], r.pay_reference, r.submitted_at?.slice(0, 10), r.paid_at?.slice(0, 10)])];
    const csv = lines.map((l) => l.map(esc).join(',')).join('\n');
    const name = `${assoc.short}-${season}-members.csv`;
    if (IS_WEB) return webShareFiles([{ src: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`, name, mime: 'text/csv' }], name);
    const { Paths } = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    f.writeSync(csv);
    await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: name });
  }

  async function uploadForms() {
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      const text = Platform.OS === 'web' ? await (await fetch(res.assets[0].uri)).text() : new File(res.assets[0].uri).textSync();
      const p = parseRosterCsv(text, assoc.numberPrefix);
      if (!p.rows.length) return Alert.alert('Nothing to upload', 'No rows with an email or member number. Is this the form’s CSV export (Google Forms → Responses → Download)?');
      const n = await uploadRoster(assoc, p.rows);
      Alert.alert('Uploaded', `${n} members on the ${assoc.short} list (${p.skipped} rows skipped). Read: ${p.found.join(', ')}.\n\nWhen someone signs in with a matching email, their form fills itself in.`);
    } catch (e) {
      Alert.alert('Upload failed', `${(e as Error).message}\n\nYou need signal and to be signed in as an admin.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Membership register' }} />
      <Screen edges={[]}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {Object.values(ASSOCIATIONS).map((a) => (
            <Choice key={a.code} label={a.short} selected={code === a.code} onPress={() => setCode(a.code)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
          ))}
          {[assoc.season, assoc.season - 1].map((y) => (
            <Choice key={y} label={String(y)} selected={season === y} onPress={() => setSeason(y)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Card style={{ flex: 1 }}>
            <T style={{ fontFamily: font.display, fontSize: 28 }}>{rows.length}</T>
            <T v="small">registered</T>
          </Card>
          <Card style={{ flex: 1 }}>
            <T style={{ fontFamily: font.display, fontSize: 28 }}>{count('paid')}</T>
            <T v="small">paid</T>
          </Card>
          <Card style={{ flex: 1 }}>
            <T style={{ fontFamily: font.display, fontSize: 28, color: owed ? colors.warnInk : colors.ink }}>{formatRand(owed)}</T>
            <T v="small">still owed</T>
          </Card>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
          <Icon name="magnify" color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search name, number, email or reference" placeholderTextColor={colors.faint} style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(['all', 'unpaid', 'claimed', 'paid', 'social'] as Filter[]).map((f) => (
            <Choice key={f} label={`${f === 'all' ? 'All' : f === 'claimed' ? 'Says paid' : f[0].toUpperCase() + f.slice(1)} · ${count(f)}`} selected={filter === f} onPress={() => setFilter(f)} style={{ minHeight: 36, paddingHorizontal: 12 }} />
          ))}
        </View>

        {shown.length ? (
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
            {shown.map((r) => (
              <Row
                key={r.id}
                title={`${r.first_name} ${r.last_name}`.trim()}
                subtitle={[r.number ?? 'No number yet', assoc.options.find((o) => o.key === r.option)?.label, r.fee_cents ? formatRand(r.fee_cents) : null, r.pay_reference && r.pay_reference !== r.number ? `ref ${r.pay_reference}` : null].filter(Boolean).join(' · ')}
                right={<Chip label={STATUS_LABEL[r.status]} tone={r.status === 'paid' ? 'brand' : r.status === 'unpaid' || r.status === 'claimed' ? 'warn' : 'neutral'} />}
                onPress={
                  r.fee_cents
                    ? () =>
                        Alert.alert(`${r.first_name} ${r.last_name}`, `${formatRand(r.fee_cents)} · reference ${r.pay_reference ?? '—'}`, [
                          { text: 'Cancel', style: 'cancel' },
                          r.status === 'paid' ? { text: 'Mark as unpaid', onPress: () => setPaid(db, r.id, false) } : { text: 'Confirm paid', onPress: () => setPaid(db, r.id, true) },
                        ])
                    : undefined
                }
              />
            ))}
          </View>
        ) : (
          <T v="small">{rows.length ? 'Nobody matches.' : 'No one has registered for this season yet.'}</T>
        )}

        <Section title="Demographics (totals only)">
          {showTotals ? (
            <Card>
              {(
                [
                  ['Gender', totals.gender],
                  ['Population group', totals.population],
                  ['Local or transplant', totals.origin],
                  ['Age', totals.age],
                  ['Involvement', totals.involvement.map(([k, n]) => [assoc.involvement.find((i) => i.key === k)?.label ?? k, n] as [string, number])],
                ] as [string, [string, number][]][]
              ).map(([title, list]) => (
                <View key={title} style={{ gap: 2, marginBottom: space.sm }}>
                  <T v="smallStrong">{title}</T>
                  {list.map(([k, n]) => (
                    <T key={k} v="small">
                      {k}: {n} ({totals.total ? Math.round((n / totals.total) * 100) : 0}%)
                    </T>
                  ))}
                </View>
              ))}
            </Card>
          ) : (
            <Button label="Show totals" icon="chart-bar" kind="ghost" onPress={() => setShowTotals(true)} style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 0 }} />
          )}
        </Section>

        <Section title="Spreadsheet & past forms">
          <Button label="Export register (CSV)" icon="file-delimited-outline" onPress={exportCsv} />
          <Button label={busy ? 'Uploading…' : `Upload past & current ${assoc.short} forms (CSV)`} icon="file-upload-outline" disabled={busy} onPress={uploadForms} />
          <T v="small">From Google Forms: Responses → Download responses (.csv). Upload every year’s file. The list stays on the server; each member only ever sees their own row, matched on their email, to fill in their form. Numbers carry on from the highest one on the list.</T>
        </Section>
      </Screen>
    </>
  );
}
