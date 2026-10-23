import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';

import { regionName } from '@/content/hub';
import { useData } from '@/db/live';
import { getHomeRegion, getMeId, joinOrRequest, listPeople, listTeams, myRoles, savePerson, setHomeRegion, setMeId, setOnboarded } from '@/db/repo';
import type { Gender } from '@/db/types';
import { displayName } from '@/domain/format';
import { ensurePermission } from '@/notify/manager';
import { Button, Choice, Field, Icon, Row, Screen, Segmented, T, TeamSwatch } from '@/ui/components';
import { RegionMap } from '@/ui/region-map';
import { colors, font, space } from '@/ui/theme';

const LOGO = require('../../assets/images/logo-mark.png');

type Step = 'hello' | 'who' | 'team' | 'region' | 'done';

/** First run: who you are, your team and your region, so the app opens on what matters to you. */
export default function Welcome() {
  const db = useSQLiteContext();
  const [step, setStep] = useState<Step>('hello');
  const meId = useData(getMeId);

  async function skip() {
    await setOnboarded(db);
    router.replace('/');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen>
        <Progress step={step} />
        {step === 'hello' ? <Hello onNext={() => setStep(meId ? 'team' : 'who')} onSkip={skip} /> : null}
        {step === 'who' ? <Who onNext={() => setStep('team')} /> : null}
        {step === 'team' && meId ? <Teams meId={meId} onNext={() => setStep('region')} /> : null}
        {step === 'region' ? <Region onNext={() => setStep('done')} /> : null}
        {step === 'done' ? <Done onFinish={skip} /> : null}
      </Screen>
    </>
  );
}

function Progress({ step }: { step: Step }) {
  const steps: Step[] = ['hello', 'who', 'team', 'region', 'done'];
  const at = steps.indexOf(step);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${at + 1} of ${steps.length}`}>
      {steps.map((s, i) => (
        <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= at ? colors.brand : colors.border }} />
      ))}
    </View>
  );
}

function Hello({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const points: [string, string][] = [
    ['whistle', 'Score games and see everyone’s stats, live'],
    ['calendar-check-outline', 'Your team’s practices and games: say if you’re coming in one tap'],
    ['map-marker-radius', 'Pickups, hats, leagues and news near you'],
  ];
  return (
    <View style={{ gap: space.lg, alignItems: 'center', paddingTop: space.lg }}>
      <Image source={LOGO} style={{ width: 120, height: 120, borderRadius: 60 }} accessible={false} />
      <T style={{ fontFamily: font.display, fontSize: 34, lineHeight: 36, color: colors.night, textAlign: 'center' }}>UBUNTU ULTIMATE</T>
      <T style={{ textAlign: 'center' }}>Ultimate in South Africa, all in one place.</T>
      <View style={{ gap: space.md, alignSelf: 'stretch' }}>
        {points.map(([icon, text]) => (
          <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon as never} color={colors.brandDark} />
            </View>
            <T style={{ flex: 1 }}>{text}</T>
          </View>
        ))}
      </View>
      <Button label="Get started" kind="primary" big onPress={onNext} style={{ alignSelf: 'stretch' }} />
      <Button label="Just looking around" kind="ghost" onPress={onSkip} />
    </View>
  );
}

function Who({ onNext }: { onNext: () => void }) {
  const db = useSQLiteContext();
  const people = useData(listPeople) ?? [];
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [gender, setGender] = useState<Gender>('W');
  const s = q.trim().toLowerCase();
  const matches = s.length >= 2 ? people.filter((p) => `${p.first_name} ${p.last_name} ${p.nickname ?? ''}`.toLowerCase().includes(s)).slice(0, 8) : [];

  async function pick(id: string) {
    await setMeId(db, id);
    onNext();
  }

  return (
    <View style={{ gap: space.md }}>
      <T v="heading">Who are you?</T>
      <T v="small">If your team has added you already, you’ll be on the list. Otherwise create your profile: it takes ten seconds.</T>
      {!creating ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
            <Icon name="magnify" color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Your name" placeholderTextColor={colors.faint} style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }} />
          </View>
          {matches.length ? (
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>
              {matches.map((p) => (
                <Row key={p.id} title={displayName(p)} subtitle={p.preferred_number ? `#${p.preferred_number}` : 'That’s me'} onPress={() => pick(p.id)} />
              ))}
            </View>
          ) : s.length >= 2 ? (
            <T v="small">Not on the list yet.</T>
          ) : null}
          <Button label="I’m new: create my profile" icon="account-plus" kind={matches.length ? 'secondary' : 'primary'} onPress={() => setCreating(true)} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field label="First name" value={first} onChangeText={setFirst} autoFocus />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Surname" value={last} onChangeText={setLast} />
            </View>
          </View>
          <T v="smallStrong">You play as</T>
          <Segmented
            value={gender}
            onChange={setGender}
            options={[
              { value: 'W', label: 'Female matching' },
              { value: 'M', label: 'Male matching' },
              { value: 'X', label: 'Other' },
            ]}
          />
          <T v="small">Only used for line ratios and stats. Your email is never shown to anyone.</T>
          <Button
            label="Continue"
            kind="primary"
            big
            disabled={!first.trim()}
            onPress={async () => pick(await savePerson(db, { first_name: first.trim(), last_name: last.trim(), gender }))}
          />
          <Button label="Back to search" kind="ghost" onPress={() => setCreating(false)} />
        </>
      )}
    </View>
  );
}

function Teams({ meId, onNext }: { meId: string; onNext: () => void }) {
  const db = useSQLiteContext();
  const teams = useData(listTeams) ?? [];
  const mine = useData((d) => myRoles(d, meId), [meId]) ?? [];
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const onTeams = new Set([...mine.map((r) => r.team_id), ...picked]);
  const s = q.trim().toLowerCase();
  const shown = teams.filter((t) => !t.is_sample && (!s || `${t.name} ${t.city ?? ''}`.toLowerCase().includes(s))).slice(0, s ? 30 : 12);

  async function next() {
    let asked = 0;
    for (const id of picked) if (!mine.some((r) => r.team_id === id)) asked += (await joinOrRequest(db, meId, id, 'core')) === 'requested' ? 1 : 0;
    if (asked) Alert.alert('Request sent', 'Your captain approves it, then the team’s games and practices show up for you.');
    // Region follows your first team unless you change it next.
    const first = teams.find((t) => t.id === (picked[0] ?? mine[0]?.team_id));
    if (first?.region && !(await getHomeRegion(db))) await setHomeRegion(db, first.region);
    onNext();
  }

  return (
    <View style={{ gap: space.md }}>
      <T v="heading">Your team</T>
      <T v="small">Tap the teams you play for. You’ll see their games, practices and polls. You can add more later.</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
        <Icon name="magnify" color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search clubs or towns" placeholderTextColor={colors.faint} style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }} />
      </View>
      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space.sm }}>
        {shown.map((t) => {
          const on = onTeams.has(t.id);
          return (
            <Choice
              key={t.id}
              label={t.name}
              sublabel={[t.city, t.region ? regionName(t.region) : null].filter(Boolean).join(' · ')}
              selected={on}
              onPress={() => (mine.some((r) => r.team_id === t.id) ? undefined : setPicked(on ? picked.filter((x) => x !== t.id) : [...picked, t.id]))}
              style={{ alignItems: 'flex-start' }}
            />
          );
        })}
      </ScrollView>
      {onTeams.size ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {[...onTeams].map((id) => {
            const t = teams.find((x) => x.id === id);
            return t ? (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TeamSwatch color={t.primary_color} />
                <T v="smallStrong">{t.name}</T>
              </View>
            ) : null;
          })}
        </View>
      ) : null}
      <Button label={onTeams.size ? 'Continue' : 'I’m not on a team yet'} kind="primary" big onPress={next} />
    </View>
  );
}

function Region({ onNext }: { onNext: () => void }) {
  const db = useSQLiteContext();
  const home = useData(getHomeRegion);
  return (
    <View style={{ gap: space.md }}>
      <T v="heading">Where do you play?</T>
      <T v="small">Calendar, pickups, teams and news open on your region. Change it any time in Me.</T>
      <RegionMap value={home ?? null} onChange={(v) => setHomeRegion(db, v)} />
      <Button label="Continue" kind="primary" big onPress={onNext} />
    </View>
  );
}

function Done({ onFinish }: { onFinish: () => void }) {
  const [asked, setAsked] = useState<boolean | null>(null);
  return (
    <View style={{ gap: space.lg, paddingTop: space.lg }}>
      <T v="heading">You’re set 🥏</T>
      <View style={{ gap: space.md }}>
        <T>• Home shows your week: games, practices and pickups.</T>
        <T>• Tap Going, Late or Can’t on anything your team schedules.</T>
        <T>• Score a game from the big button on Home.</T>
      </View>
      <Button
        label={asked ? 'Reminders on ✓' : 'Turn on reminders'}
        icon="bell-ring-outline"
        disabled={!!asked}
        onPress={async () => setAsked(await ensurePermission(true))}
      />
      {asked === false ? <T v="small">No problem: you can turn them on later in Me → Notifications.</T> : null}
      <Button label="Go to Home" kind="primary" big onPress={onFinish} />
      <T v="small" style={{ textAlign: 'center' }}>Stuck any time? Me → Help & how-to guide.</T>
    </View>
  );
}
