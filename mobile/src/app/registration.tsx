import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { ASSOCIATIONS } from '@/content/associations';
import { REGIONS } from '@/content/hub';
import { getRegistration, orgLinks, saveRegistration, standingFor, type OrgLink, type Registration } from '@/db/development';
import { getMembership } from '@/db/membership';
import { useData } from '@/db/live';
import { getHomeRegion, getMeId } from '@/db/repo';
import { standingCheck } from '@/domain/standing';
import { Button, Card, Choice, Field, Footer, Icon, Screen, Section, T } from '@/ui/components';
import { PhoneField } from '@/ui/phone-field';
import { colors, space } from '@/ui/theme';

/** Your SAFDA and regional numbers, a number your staff can WhatsApp, and where to sign up or pay. */
export default function RegistrationScreen() {
  const bundle = useData(async (d) => {
    const meId = await getMeId(d);
    return { meId, reg: meId ? await getRegistration(d, meId) : null, home: await getHomeRegion(d), links: await orgLinks(d) };
  });
  if (!bundle) return <Screen edges={[]}>{null}</Screen>;
  if (!bundle.meId) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Membership & fees' }} />
        <Card>
          <T v="bodyStrong">Pick yourself first</T>
          <T v="small">In Me, choose which player you are.</T>
        </Card>
      </Screen>
    );
  }
  return <Form key={bundle.reg?.id ?? 'new'} meId={bundle.meId} reg={bundle.reg} home={bundle.home} links={bundle.links} />;
}

function Form({ meId, reg, home, links }: { meId: string; reg: Registration | null; home: string | null; links: OrgLink[] }) {
  const db = useSQLiteContext();
  const [safda, setSafda] = useState(reg?.safda_number ?? '');
  const [region, setRegion] = useState<string | null>(reg?.region_code ?? home);
  const [regionNo, setRegionNo] = useState(reg?.region_number ?? '');
  const [phone, setPhone] = useState(reg?.phone ?? '');
  const [emName, setEmName] = useState(reg?.emergency_name ?? '');
  const [emPhone, setEmPhone] = useState(reg?.emergency_phone ?? '');
  const standing = useData(
    async (d) => ({
      safda: await standingFor(d, 'safda', reg?.safda_number),
      region: reg?.region_code ? await standingFor(d, reg.region_code, reg.region_number) : null,
    }),
    [reg?.safda_number, reg?.region_code, reg?.region_number],
  );
  const body = REGIONS.find((r) => r.code === region)?.body ?? 'Regional';
  const myLinks = links.filter((l) => (l.kind === 'register' || l.kind === 'rules') && (!l.region_code || l.region_code === region));

  async function save() {
    await saveRegistration(db, meId, {
      safda_number: safda.trim() || null,
      region_code: region,
      region_number: regionNo.trim() || null,
      phone: phone.trim() || null,
      emergency_name: emName.trim() || null,
      emergency_phone: emPhone.trim() || null,
    });
    router.back();
  }

  const line = (label: string, number: string | null | undefined, row: Awaited<ReturnType<typeof standingFor>> | undefined) => {
    const c = standingCheck(number, row ?? null, !!row || false);
    // Players only see their own row; "not listed" isn't shown to them as a warning, since they can't see the list.
    const ok = c.check === 'ok';
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name={ok ? 'check-circle' : 'help-circle-outline'} color={ok ? colors.brand : colors.faint} />
        <T v="small" style={{ flex: 1 }}>
          {label}: {ok ? c.text : number ? 'not confirmed yet: admins upload the paid-up lists from SAFDA and the regions' : 'add your number'}
        </T>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Membership & fees' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label="Save" kind="primary" big onPress={save} />
          </Footer>
        }>
        <AssociationCards meId={meId} />
        <T v="small">
          To play leagues, regionals and nationals you need to be paid up with SAFDA and your region. Your team staff and coordinators can see these numbers so they can help you get sorted before a
          tournament.
        </T>
        <Card>
          {line('SAFDA', reg?.safda_number, standing?.safda)}
          {line(body, reg?.region_number, standing?.region)}
        </Card>

        <Field label="SAFDA number" value={safda} onChangeText={setSafda} autoCapitalize="characters" placeholder="If you have one" />
        <T v="smallStrong">Your region</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {REGIONS.map((r) => (
            <Choice key={r.code} label={`${r.name} · ${r.body}`} selected={region === r.code} onPress={() => setRegion(r.code)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
          ))}
        </ScrollView>
        <Field label={`${body} number`} value={regionNo} onChangeText={setRegionNo} autoCapitalize="characters" placeholder="If you have one" />
        <PhoneField
          label="Your WhatsApp number"
          value={phone}
          onChange={setPhone}
          hint="This is the number we’ll contact you on (WhatsApp). Not South African? Tap the code to change it. Only your team staff and coordinators see it."
        />
        <T v="smallStrong">Emergency contact</T>
        <T v="small">Who should we call if you get hurt at a game or practice? Only your team staff and coordinators see it.</T>
        <Field label="Name" value={emName} onChangeText={setEmName} placeholder="e.g. Thandi (mom)" autoCapitalize="words" />
        <PhoneField label="Their cell number" value={emPhone} onChange={setEmPhone} />

        <Section title="Get your numbers, pay fees">
          {myLinks.length ? (
            myLinks.map((l) => (
              <Card key={l.id} onPress={() => Linking.openURL(l.url)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Icon name="open-in-new" color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{l.label}</T>
                    <T v="small">{l.region_code ? (REGIONS.find((r) => r.code === l.region_code)?.body ?? l.region_code) : 'SAFDA (national)'}</T>
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <T v="small">No registration link for this region yet. The admins add them each January.</T>
          )}
          <Button
            label="Merch, pickup groups & more links"
            icon="tshirt-crew-outline"
            kind="ghost"
            onPress={() => router.push('/hub/links')}
            style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 0 }}
          />
        </Section>
      </Screen>
    </>
  );
}

const MEMBER_STATUS: Record<string, string> = { social: 'Registered (social)', waived: 'Registered', unpaid: 'Waiting for payment', claimed: 'Paid · being confirmed', paid: 'Paid ✓' };

/** This year's membership with each association that runs its form in the app (CTFDA first). */
function AssociationCards({ meId }: { meId: string }) {
  const rows = useData(async (d) => Promise.all(Object.values(ASSOCIATIONS).map(async (a) => ({ a, m: await getMembership(d, meId, a.code, a.season) }))), [meId]) ?? [];
  return (
    <>
      {rows.map(({ a, m }) => (
        <Card
          key={a.code}
          onPress={() => router.push({ pathname: '/membership/[assoc]', params: { assoc: a.code } })}
          style={{ borderColor: m?.submitted_at ? colors.border : colors.brand, borderWidth: m?.submitted_at ? 1 : 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Icon name={m?.status === 'paid' || m?.status === 'social' || m?.status === 'waived' ? 'check-decagram' : 'card-account-details-outline'} color={colors.brand} size={28} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">
                {a.short} {a.season} membership
              </T>
              <T v="small">{m?.submitted_at ? `${MEMBER_STATUS[m.status]}${m.number ? ` · ${m.number}` : ''}` : 'Register for the year: free for social players, fees for competitive club play'}</T>
            </View>
            <Icon name="chevron-right" color={colors.faint} />
          </View>
        </Card>
      ))}
    </>
  );
}
