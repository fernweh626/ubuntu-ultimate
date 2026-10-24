import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Switch, View } from 'react-native';

import { ASSOCIATIONS, formatRand, ORIGINS, paymentReference, POPULATION_GROUPS, type AssociationForm } from '@/content/associations';
import { getRegistration, saveRegistration, type Registration } from '@/db/development';
import { useData } from '@/db/live';
import { claimMemberNumber, claimPaid, ensureNumber, getDemographic, getMembership, issueMemberNumber, prefillFromRoster, saveDemographic, submitMembership, type Demographic, type Membership } from '@/db/membership';
import { getAccess, getMe } from '@/db/repo';
import { dmyToIso } from '@/domain/format';
import type { Gender, Person } from '@/db/types';
import { Button, Card, Chip, Choice, DateField, Field, Footer, Icon, Screen, Section, Segmented, T } from '@/ui/components';
import { PhoneField } from '@/ui/phone-field';
import { colors, font, space } from '@/ui/theme';

/** An association's yearly membership form (CTFDA first), then what to pay and the reference to use. */
export default function MembershipForm() {
  const { assoc: code } = useLocalSearchParams<{ assoc: string }>();
  const assoc = ASSOCIATIONS[code ?? ''];
  const bundle = useData(async (d) => {
    const me = await getMe(d);
    if (!me || !assoc) return { me: null };
    const email = (await d.getFirstAsync<{ email: string | null }>(`SELECT email FROM person WHERE id = ?`, me.id))?.email ?? null;
    return {
      me,
      email,
      access: await getAccess(d),
      reg: await getRegistration(d, me.id),
      demo: await getDemographic(d, me.id),
      membership: await getMembership(d, me.id, assoc.code, assoc.season),
    };
  }, [code]);
  if (!assoc) return <Screen edges={[]}><T>Unknown association.</T></Screen>;
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  if (!bundle.me)
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: `${assoc.short} membership` }} />
        <Card>
          <T v="bodyStrong">Pick yourself first</T>
          <T v="small">In Me, choose which player you are, then come back to register.</T>
        </Card>
      </Screen>
    );
  if (bundle.membership?.submitted_at)
    return <Done assoc={assoc} m={bundle.membership} me={bundle.me} signedIn={!!bundle.access?.signedIn} />;
  return <Form key={bundle.membership?.id ?? 'new'} assoc={assoc} me={bundle.me} email={bundle.email} reg={bundle.reg} demo={bundle.demo} membership={bundle.membership} signedIn={!!bundle.access?.signedIn} />;
}

function Form({ assoc, me, email: savedEmail, reg, demo, membership, signedIn }: { assoc: AssociationForm; me: Person; email: string | null; reg: Registration | null; demo: Demographic | null; membership: Membership | null; signedIn: boolean }) {
  const db = useSQLiteContext();
  const consents0 = membership?.consents_json ? (JSON.parse(membership.consents_json) as Record<string, boolean>) : {};
  const [email, setEmail] = useState(savedEmail ?? '');
  const [phone, setPhone] = useState(reg?.phone ?? '');
  const [emName, setEmName] = useState(reg?.emergency_name ?? '');
  const [emPhone, setEmPhone] = useState(reg?.emergency_phone ?? '');
  const [suburb, setSuburb] = useState(demo?.suburb ?? '');
  const [gender, setGender] = useState<Gender | null>(me.gender);
  const [population, setPopulation] = useState<string | null>(demo?.population_group ?? null);
  const [origin, setOrigin] = useState<'local' | 'transplant' | null>(demo?.origin ?? null);
  // These live on your profile and are asked once; the yearly form only asks for what's missing.
  const have = { gender: me.gender === 'W' || me.gender === 'M', population: !!demo?.population_group, origin: !!demo?.origin, dob: !!me.birth_date, suburb: !!demo?.suburb };
  const [dob, setDob] = useState('');
  const birthYear = me.birth_date ? me.birth_date.slice(0, 4) : (dmyToIso(dob) ?? '').slice(0, 4);
  const [involvement, setInvolvement] = useState<string | null>(membership?.involvement ?? null);
  const [number, setNumber] = useState(membership?.number ?? (reg?.region_code === assoc.regionCode ? (reg?.region_number ?? '') : ''));
  const [option, setOption] = useState<string | null>(membership?.option ?? null);
  const [consents, setConsents] = useState<Record<string, boolean>>(consents0);
  const [note, setNote] = useState(membership?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState<string[] | null>(null);

  const competitive = !!assoc.involvement.find((i) => i.key === involvement)?.competitive;
  const age = birthYear ? assoc.season - Number(birthYear) : null;
  const opt = assoc.options.find((o) => o.key === option);

  async function fillFromList() {
    setBusy(true);
    const filled = await prefillFromRoster(db, me.id, assoc).catch(() => []);
    setBusy(false);
    setPrefilled(filled);
    if (filled.length) router.replace({ pathname: '/membership/[assoc]', params: { assoc: assoc.code } });
  }

  async function submit() {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return Alert.alert('Add your email', `${assoc.short} needs it to reach you.`);
    if (!phone.trim()) return Alert.alert('Add your cell number');
    if (!emName.trim() || !emPhone.trim()) return Alert.alert('Add an emergency contact', 'Who should we call if you get hurt?');
    if (!gender || gender === 'X') return Alert.alert('Pick a gender matching', 'The Ultimate rules category you play in.');
    if (!population) return Alert.alert('Pick a population group', 'Or “Prefer not to say”.');
    if (!origin) return Alert.alert('Born in SA, or a transplant?');
    const year = Number(birthYear);
    if (!have.dob && !dmyToIso(dob)) return Alert.alert('Add your date of birth', 'dd/mm/yyyy, e.g. 14/05/1995. Age groups depend on how old you turn this year.');
    if (!year || year < 1930 || year > assoc.season) return Alert.alert('Check your date of birth', 'e.g. 14/05/1995');
    if (!involvement) return Alert.alert('How involved will you be this year?');
    if (competitive) {
      if (!opt) return Alert.alert('Pick your membership type');
      const missing = assoc.policies.filter((p) => !consents[p.key]);
      if (missing.length) return Alert.alert('Accept the policies', `${missing.map((p) => p.label).join(' and ')}: everyone in ${assoc.short} competitive events must accept them.`);
    }
    if (!consents.waiver) return Alert.alert('Accept the waiver', 'Your registration isn’t complete without it.');
    setBusy(true);
    try {
      const ts = new Date().toISOString();
      await db.runAsync(`UPDATE person SET email = ?, gender = ?, birth_date = COALESCE(birth_date, ?), updated_at = ? WHERE id = ?`, e, gender, have.dob ? null : dmyToIso(dob), ts, me.id);
      // A member number: claim the one I typed, or get mine from the server (on the list, or the next free one).
      let num: string | null = number.trim().toUpperCase() || null;
      let numberNote: string | null = null;
      if (signedIn) {
        const r = num ? await claimMemberNumber(assoc, num) : { number: await issueMemberNumber(assoc), error: null };
        if (r.error) numberNote = r.error;
        else num = r.number;
      }
      await saveRegistration(db, me.id, {
        safda_number: reg?.safda_number ?? null,
        region_code: assoc.regionCode,
        region_number: num,
        phone: phone.trim(),
        emergency_name: emName.trim(),
        emergency_phone: emPhone.trim(),
      });
      await saveDemographic(db, me.id, { population_group: population, origin, birth_year: year, suburb: suburb.trim() || null });
      const fee = competitive ? (opt?.feeCents ?? 0) : 0;
      await submitMembership(db, {
        personId: me.id,
        assoc,
        number: num,
        involvement,
        option: competitive ? option : null,
        feeCents: fee,
        payReference: fee ? paymentReference(assoc, num, me.last_name) : null,
        consents: { ...consents, ...(age !== null && age < 18 ? { guardian: true } : {}) },
        note: note.trim() || null,
      });
      if (numberNote) Alert.alert('Saved, but check your number', numberNote);
      else if (!competitive) Alert.alert(`You’re registered with ${assoc.short} 🙌`, num ? `Your number is ${num}.` : 'Welcome to the community!');
    } finally {
      setBusy(false);
    }
  }

  const tick = (key: string) => setConsents((c) => ({ ...c, [key]: !c[key] }));

  return (
    <>
      <Stack.Screen options={{ title: `${assoc.short} ${assoc.season} membership` }} />
      <Screen edges={[]} footer={<Footer><Button label={busy ? 'Saving…' : 'Submit'} icon="check" kind="primary" big disabled={busy} onPress={submit} /></Footer>}>
        <Card>
          <T v="bodyStrong">{assoc.name}</T>
          <T v="small">{assoc.intro}</T>
        </Card>
        {signedIn ? (
          <Card>
            <T v="small">Been a member before? We can fill in what {assoc.short} already has for your email.</T>
            <Button label="Fill in from my past forms" icon="account-arrow-down-outline" kind="ghost" disabled={busy} onPress={fillFromList} style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 0 }} />
            {prefilled ? <T v="small">{prefilled.length ? `Filled in: ${prefilled.join(', ')}.` : 'Nothing found for your email. No problem: fill it in below.'}</T> : null}
          </Card>
        ) : null}

        <Section title="Contact details">
          <T v="bodyStrong">
            {me.first_name} {me.last_name}
          </T>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
          <PhoneField label="Cell number (WhatsApp)" value={phone} onChange={setPhone} />
          <Field label="Emergency contact name" value={emName} onChangeText={setEmName} placeholder="e.g. Thandi (mom)" />
          <PhoneField label="Emergency contact number" value={emPhone} onChange={setEmPhone} />
          {!have.suburb ? <Field label="Suburb where you live (optional)" value={suburb} onChangeText={setSuburb} hint="Helps find where a new pickup game could start." /> : null}
        </Section>

        <Section title="About you">
          {have.gender || have.population || have.origin || have.dob ? (
            <Card>
              <T v="smallStrong">From your profile</T>
              {have.gender ? <T v="small">Gender matching: {gender === 'W' ? 'Women matching' : 'Man matching'}</T> : null}
              {have.dob ? <T v="small">Date of birth: on file (born {birthYear})</T> : null}
              {have.population ? <T v="small">Population group: {population}</T> : null}
              {have.origin ? <T v="small">{ORIGINS.find((o) => o.key === origin)?.label}</T> : null}
              {have.suburb ? <T v="small">Suburb: {suburb}</T> : null}
              <Button label="Change in your profile" icon="account-edit-outline" kind="ghost" onPress={() => router.push({ pathname: '/player/edit', params: { id: me.id } })} style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 0 }} />
            </Card>
          ) : null}
          <T v="small">{assoc.short} uses this to track growth and diversity. Only you and the admins see it, and reports only ever show totals. It’s saved on your profile, so you only answer once.</T>
          {!have.gender ? (
            <>
              <T v="smallStrong">Gender matching (the Ultimate rules category you play in)</T>
              <Segmented
                value={gender ?? ('' as Gender)}
                onChange={setGender}
                options={[
                  { value: 'W', label: 'Women matching' },
                  { value: 'M', label: 'Man matching' },
                ]}
              />
            </>
          ) : null}
          {!have.dob ? <DateField label="Date of birth" value={dob} onChangeText={setDob} hint="Saved privately on your profile. Age groups depend on how old you turn this year." /> : null}
          {!have.population ? (
            <>
              <T v="smallStrong">Population group (Census 2022 categories)</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {POPULATION_GROUPS.map((p) => (
                  <Choice key={p} label={p} selected={population === p} onPress={() => setPopulation(p)} style={{ minHeight: 40, paddingHorizontal: 12 }} />
                ))}
              </View>
            </>
          ) : null}
          {!have.origin ? (
            <>
              <T v="smallStrong">Local or transplant</T>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {ORIGINS.map((o) => (
                  <Choice key={o.key} label={o.label} selected={origin === o.key} onPress={() => setOrigin(o.key)} style={{ flex: 1, minHeight: 44, paddingHorizontal: 8 }} />
                ))}
              </View>
            </>
          ) : null}
        </Section>

        <Section title={`Your ${assoc.season} involvement (not ability)`}>
          {assoc.involvement.map((i) => (
            <Choice key={i.key} label={i.label} sublabel={i.competitive ? 'Club membership and fees' : 'Free'} selected={involvement === i.key} onPress={() => setInvolvement(i.key)} style={{ alignItems: 'flex-start' }} />
          ))}
        </Section>

        {competitive ? (
          <Section title="Club membership">
            {age !== null && age < 18 ? (
              <Card style={{ backgroundColor: colors.warnTint, borderColor: colors.warnTint }}>
                <T v="small" style={{ color: colors.warnInk }}>
                  Under 18: a parent or guardian must complete and submit this form for you.
                </T>
              </Card>
            ) : null}
            <Field label={`${assoc.short} number`} value={number} onChangeText={(v) => setNumber(v.toUpperCase())} autoCapitalize="characters" placeholder={`${assoc.numberPrefix}123`} hint={`Have one from before? Type it. New to ${assoc.short}? Leave it empty and you’ll get one when you submit.`} />
            <T v="smallStrong">Membership type</T>
            {assoc.options.map((o) => (
              <Choice key={o.key} label={`${o.label} · ${formatRand(o.feeCents)}`} sublabel={o.note} selected={option === o.key} onPress={() => setOption(o.key)} style={{ alignItems: 'flex-start' }} />
            ))}
            {assoc.policies.map((p) => (
              <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">I accept the {p.label}</T>
                  <Pressable onPress={() => Linking.openURL(p.url)} accessibilityRole="link">
                    <T v="small" style={{ color: colors.brand }}>
                      Read it
                    </T>
                  </Pressable>
                </View>
                <Switch value={!!consents[p.key]} onValueChange={() => tick(p.key)} trackColor={{ true: colors.brand }} />
              </View>
            ))}
          </Section>
        ) : null}

        <Section title="Waiver">
          <T v="small">{assoc.waiver}</T>
          <Choice label="I agree" selected={!!consents.waiver} onPress={() => tick('waiver')} style={{ alignItems: 'flex-start' }} />
        </Section>

        <Field label="Talk to us (optional)" value={note} onChangeText={setNote} multiline placeholder="Events you’d like (skills clinics, social tournaments, women-only games…) and whether you could help run them." />
      </Screen>
    </>
  );
}

const STATUS: Record<Membership['status'], { label: string; tone: 'brand' | 'warn' | 'neutral' }> = {
  social: { label: 'Registered (social)', tone: 'brand' },
  waived: { label: 'Registered · no fee', tone: 'brand' },
  unpaid: { label: 'Waiting for payment', tone: 'warn' },
  claimed: { label: 'Paid · waiting for confirmation', tone: 'warn' },
  paid: { label: 'Paid ✓', tone: 'brand' },
};

/** After submitting: your number, what to pay and the reference to use, and "I've paid". */
function Done({ assoc, m, me, signedIn }: { assoc: AssociationForm; m: Membership; me: Person; signedIn: boolean }) {
  const db = useSQLiteContext();
  const ref = m.pay_reference ?? paymentReference(assoc, m.number, me.last_name);
  useEffect(() => {
    if (signedIn && !m.number) ensureNumber(db, m, assoc).catch(() => null);
  }, [db, m, assoc, signedIn]);
  const s = STATUS[m.status];
  return (
    <>
      <Stack.Screen options={{ title: `${assoc.short} ${assoc.season} membership` }} />
      <Screen edges={[]}>
        <View style={{ backgroundColor: colors.night, borderRadius: 14, padding: space.lg, gap: 6 }}>
          <T style={{ fontFamily: font.bold, fontSize: 12, letterSpacing: 1, color: '#F0A27E' }}>{assoc.short.toUpperCase()} NUMBER</T>
          <T style={{ fontFamily: font.display, fontSize: 40, lineHeight: 44, color: '#fff' }}>{m.number ?? 'Coming soon'}</T>
          {!m.number ? <T style={{ color: colors.nightMuted }}>{signedIn ? 'We couldn’t get your number just now. It comes through next time you’re online.' : 'Go online (Me → Settings) to get your number.'}</T> : null}
          <Chip label={s.label} tone={s.tone} />
        </View>

        {m.fee_cents && m.status !== 'paid' && m.status !== 'waived' ? (
          <Section title={`Pay ${formatRand(m.fee_cents)}`}>
            <Card>
              <T v="small">Use this exact reference so {assoc.short} can match your payment:</T>
              <Pressable onPress={() => Clipboard.setStringAsync(ref).then(() => Alert.alert('Copied', ref))} accessibilityRole="button" accessibilityLabel={`Copy reference ${ref}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: 10, backgroundColor: colors.brandTint }}>
                <T style={{ fontFamily: font.display, fontSize: 26, flex: 1, color: colors.brandDark }}>{ref}</T>
                <Icon name="content-copy" color={colors.brandDark} />
              </Pressable>
              {assoc.payment.url ? (
                <Button label={`Pay with ${assoc.payment.method}`} icon="credit-card-outline" kind="primary" onPress={() => Linking.openURL(assoc.payment.url!)} />
              ) : (
                <T v="small">
                  {assoc.payment.howTo} The pay link will be here soon; for now {assoc.short} shares it in their groups, or email {assoc.payment.contactEmail}.
                </T>
              )}
            </Card>
            {m.status === 'unpaid' ? (
              <Button label="I’ve paid" icon="check" onPress={() => claimPaid(db, m.id)} />
            ) : (
              <T v="small">Thanks! {assoc.short} confirms payments against their account. You’ll see “Paid ✓” here once they have.</T>
            )}
            <T v="small">Problems with payment? Email {assoc.payment.contactEmail}.</T>
          </Section>
        ) : null}

        <Button label="Edit my form" icon="pencil" kind="ghost" onPress={() => db.runAsync(`UPDATE association_membership SET submitted_at = NULL WHERE id = ?`, m.id).then(() => router.replace({ pathname: '/membership/[assoc]', params: { assoc: assoc.code } }))} />
      </Screen>
    </>
  );
}
