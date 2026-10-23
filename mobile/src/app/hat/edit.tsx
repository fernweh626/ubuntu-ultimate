import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { REGIONS } from '@/content/hub';
import { getHat, saveHat } from '@/db/hats';
import { getHomeRegion } from '@/db/repo';
import { dmyToIso, isoToDmy } from '@/domain/format';
import { parseRules } from '@/domain/rules';
import { Button, Choice, DateField, Field, Footer, Screen, Section, Segmented, T } from '@/ui/components';
import { FieldPicker } from '@/ui/field-picker';
import { space } from '@/ui/theme';

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Starting text for the details: organisers fill in the blanks.
const DETAILS_TEMPLATE = `What to bring: a light AND a dark shirt, water, sunscreen, cleats or tekkies
Food & drinks: 
Theme / dress-up: 
Schedule: check-in 08:30, first pull 09:00, finals around 15:00
After-party: 
Questions? WhatsApp: `;

/** Organisers set up a hat: when, where, cost and payment link, and how the games are played. */
export default function HatEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [cost, setCost] = useState('');
  const [payment, setPayment] = useState('');
  const [eft, setEft] = useState('');
  const [pop, setPop] = useState('');
  const [details, setDetails] = useState(id ? '' : DETAILS_TEMPLATE);
  const [where, setWhere] = useState<'field' | 'other'>('field');
  const [mapUrl, setMapUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [perSide, setPerSide] = useState('7');
  const [minutes, setMinutes] = useState('45');
  const [points, setPoints] = useState('11');

  useEffect(() => {
    if (!id) {
      getHomeRegion(db).then(setRegion);
      return;
    }
    getHat(db, id).then((h) => {
      if (!h) return;
      const r = parseRules(h.rules_json);
      setName(h.name);
      setRegion(h.region);
      setDate(isoToDmy(h.start_date));
      setEndDate(h.end_date && h.end_date !== h.start_date ? isoToDmy(h.end_date) : '');
      setTime(h.start_time ?? '09:00');
      setVenueId(h.venue_id);
      setLocation(h.location ?? '');
      setMapUrl(h.map_url ?? '');
      setWebsite(h.website ?? '');
      setWhere(h.venue_id ? 'field' : 'other');
      setCost(h.cost ?? '');
      setPayment(h.payment_url ?? '');
      setEft(h.eft_details ?? '');
      setPop(h.pop_contact ?? '');
      setDetails(h.details ?? '');
      setPerSide(String(r.playersPerSide ?? 7));
      setMinutes(String(r.hardCapMinutes ?? 45));
      setPoints(String(r.pointTarget));
    });
  }, [db, id]);

  async function save() {
    const start = dmyToIso(date);
    const end = endDate ? dmyToIso(endDate) : null;
    if (!name.trim()) return Alert.alert('Give the hat a name');
    if (!start || (endDate && !end)) return Alert.alert('Check the dates', 'Use dd/mm/yyyy.');
    if (!TIME.test(time)) return Alert.alert('Check the start time', 'Use HH:MM, e.g. 09:00.');
    if (payment && !/^https?:\/\//i.test(payment.trim())) return Alert.alert('Check the payment link', 'It should start with https://');
    if (website && !/^https?:\/\//i.test(website.trim())) return Alert.alert('Check the website', 'It should start with https://');
    if (where === 'other' && mapUrl && !/^https?:\/\//i.test(mapUrl.trim())) return Alert.alert('Check the map link', 'Paste the link from Google Maps (Share → Copy link).');
    const hatId = await saveHat(db, {
      id,
      name,
      region,
      location: location.trim() || null,
      startDate: start,
      endDate: end,
      startTime: time,
      venueId: where === 'field' ? venueId : null,
      mapUrl: where === 'other' ? mapUrl.trim() || null : null,
      website: website.trim() || null,
      cost: cost.trim() || null,
      paymentUrl: payment.trim() || null,
      eftDetails: eft.trim() || null,
      popContact: pop.trim() || null,
      details: details.trim() || null,
      perSide: Number(perSide),
      gameMinutes: Math.max(10, Number(minutes) || 45),
      pointTarget: Math.max(3, Number(points) || 11),
      teamCount: null,
    });
    if (id) router.back();
    else router.replace(`/hat/${hatId}`);
  }

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit hat' : 'New hat tournament' }} />
      <Screen
        edges={[]}
        footer={
          <Footer>
            <Button label={id ? 'Save' : 'Create & open sign-ups'} icon="hat-fedora" kind="primary" big onPress={save} />
          </Footer>
        }>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Halloween Hat 2026" />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1.3 }}>
            <DateField label="Date" value={date} onChangeText={setDate} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Start" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" placeholder="09:00" />
          </View>
        </View>
        <DateField label="Ends (if it’s a weekend)" value={endDate} onChangeText={setEndDate} />
        <Section title="Region">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {REGIONS.map((r) => (
              <Choice key={r.code} label={r.name} selected={region === r.code} onPress={() => setRegion(r.code)} style={{ minHeight: 40, paddingHorizontal: 12 }} />
            ))}
          </View>
        </Section>
        <Section title="Where">
          <Segmented
            value={where}
            onChange={setWhere}
            options={[
              { value: 'field', label: 'A saved field' },
              { value: 'other', label: 'Somewhere else' },
            ]}
          />
          {where === 'field' ? (
            <FieldPicker value={venueId} onChange={setVenueId} />
          ) : (
            <>
              <Field label="Place or address" value={location} onChangeText={setLocation} placeholder="e.g. Clifton 2nd Beach, Cape Town" />
              <Button
                label="Find it on Google Maps"
                icon="google-maps"
                kind="ghost"
                disabled={!location.trim()}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`)}
                style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 0 }}
              />
              <Field label="Google Maps link (optional)" value={mapUrl} onChangeText={setMapUrl} autoCapitalize="none" keyboardType="url" placeholder="In Maps: Share → Copy link, then paste here" hint="Players get a Directions button straight to the spot." />
            </>
          )}
          {where === 'field' ? <Field label="Nickname for the spot (optional)" value={location} onChangeText={setLocation} placeholder="e.g. the back field, by the clubhouse" /> : null}
        </Section>
        <Field label="Website (optional)" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder="https://… (a page or Instagram post about the hat)" />
        <Field label="Cost" value={cost} onChangeText={setCost} placeholder="e.g. R120, includes a disc" />
        <Section title="Payment">
          <T v="small">Use a pay link, EFT details, or both. Players tick “I’ve paid”; you confirm payments on the hat page.</T>
          <Field label="Payment link (optional)" value={payment} onChangeText={setPayment} autoCapitalize="none" keyboardType="url" placeholder="SnapScan, Zapper, PayFast…" />
          <Field label="EFT details (optional)" value={eft} onChangeText={setEft} multiline placeholder={'Bank: …\nAccount name: …\nAccount no: …\nBranch code: …\nReference: your name + HAT'} />
          <Field label="Send proof of payment to" value={pop} onChangeText={setPop} autoCapitalize="none" placeholder="Email or WhatsApp number" hint="Players get a button that opens WhatsApp or email to you, ready to attach their PoP." />
        </Section>
        <Section title="Games">
          <T v="smallStrong">Players a side</T>
          <Segmented
            value={perSide}
            onChange={setPerSide}
            options={[
              { value: '4', label: '4v4' },
              { value: '5', label: '5v5' },
              { value: '7', label: '7v7' },
            ]}
          />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Game length (min)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Play to" value={points} onChangeText={setPoints} keyboardType="number-pad" />
            </View>
          </View>
          <T v="small">{Number(perSide) % 2 ? 'Mixed ratio applies (e.g. 3–2 for 5v5).' : 'Even sides: no gender ratio.'}</T>
        </Section>
        <Field label="Details" value={details} onChangeText={setDetails} multiline placeholder="Theme, what to bring (light and dark shirt!), food, the after-party…" hint="Fill in the blanks and delete any lines you don’t need." />
      </Screen>
    </>
  );
}
