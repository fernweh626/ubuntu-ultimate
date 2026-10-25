import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { COUNTRY } from '@/content/countries';
import { regionName } from '@/content/hub';
import { dayLabel, homeFeed, type TimelineItem } from '@/db/home';
import { notifyChanged, useData } from '@/db/live';
import { getAccess, getHomeRegion, isOnboarded, listAnnouncements, pendingForStaff } from '@/db/repo';
import { mySchedule } from '@/db/schedule';
import { DAYS_LONG, weekdayIndex } from '@/domain/format';
import { deadlineLabel, yearlyInfoMailto, yearlyInfoSeason, yearlyInfoText } from '@/domain/yearly';
import { PREVIEW } from '@/lib/preview';
import { Button, Card, Icon, Screen, Section, T } from '@/ui/components';
import { TimelineRow } from '@/ui/feed';
import { GameCard } from '@/ui/game-bits';
import { JoinRequestPrompt } from '@/ui/join-team';
import { MeButton } from '@/ui/me-button';
import { colors, font, space } from '@/ui/theme';

const LOGO = require('../../../assets/images/logo-mark.png');

/*
 * Home is only "what's next for me": things waiting for my answer, live games of mine, and my
 * next week. Results, leagues and the rest of SA live in Play; everything else in More.
 */

const MAX_TIMELINE = 6;

export default function Home() {
  const onboarded = useData(isOnboarded);
  const feed = useData((d) => homeFeed(d));

  // First time on this phone: set up who you are, your team and region.
  if (onboarded === false) return <Redirect href="/welcome" />;

  return (
    <Screen>
      <JoinRequestPrompt />
      {PREVIEW ? (
        <Pressable
          onPress={() => router.push('/feedback')}
          accessibilityRole="button"
          style={{ backgroundColor: colors.warnTint, borderRadius: 10, paddingHorizontal: space.md, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="flask-outline" color={colors.warnInk} size={18} />
          <T v="small" style={{ flex: 1, color: colors.warnInk }}>
            <T v="smallStrong" style={{ color: colors.warnInk }}>
              Preview.
            </T>{' '}
            Play with the demo data; nothing is saved for real. Tap to send feedback.
          </T>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
          <Image source={LOGO} style={{ width: 48, height: 48, borderRadius: 24 }} accessibilityIgnoresInvertColors accessible={false} />
          <View style={{ flexShrink: 1 }}>
            <T numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: font.display, fontSize: 28, lineHeight: 30, letterSpacing: 0.5, color: colors.night }}>
              UBUNTU ULTIMATE
            </T>
            <T v="small">{DAYS_LONG[weekdayIndex()]}</T>
          </View>
        </View>
        <MeButton />
      </View>

      <YearlyInfoCard />
      <News />
      <NeedsYou />
      {feed ? <Upcoming data={feed} /> : null}
    </Screen>
  );
}

/* ------------------------------ Needs you ------------------------------ */

/** One card with everything waiting on you: answers, check-ins, people asking to join your team. */
function NeedsYou() {
  const [opened] = useState(() => Date.now());
  const todo = useData(async (d) => {
    const [sched, access] = await Promise.all([mySchedule(d), getAccess(d)]);
    const upcoming = sched.items.filter((i) => Date.parse(i.endAt) >= opened && !i.cancelled);
    return {
      answers: upcoming.filter((i) => !i.status && (i.kind === 'practice' || i.gameStatus === 'scheduled')).length,
      checkins: sched.items.filter((i) => (i.kind === 'practice' || i.kind === 'game') && Date.parse(i.endAt) < opened && !i.cancelled && i.played && !i.checkedIn && i.gameStatus !== 'scheduled')
        .length,
      requests: (await pendingForStaff(d, access.staffTeamIds)).length,
      teamId: access.staffTeamIds[0],
    };
  });
  if (!todo || !(todo.answers || todo.checkins || todo.requests)) return null;
  const rows: [string, string, () => void][] = [];
  if (todo.answers) rows.push(['calendar-question', `${todo.answers} to answer: are you coming?`, () => router.push('/schedule')]);
  if (todo.checkins) rows.push(['comment-check-outline', `${todo.checkins} check-in${todo.checkins > 1 ? 's' : ''}: how did it go?`, () => router.push('/schedule')]);
  if (todo.requests) rows.push(['account-clock-outline', `${todo.requests} asking to join your team`, () => router.push(`/team/${todo.teamId}`)]);
  return (
    <View style={{ backgroundColor: colors.warnTint, borderRadius: 14, overflow: 'hidden' }}>
      {rows.map(([icon, label, go], i) => (
        <Pressable
          key={label}
          onPress={go}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: '#F3D9C6' }}>
          <Icon name={icon as never} color={colors.warnInk} />
          <T v="bodyStrong" style={{ flex: 1, color: colors.warnInk }}>
            {label}
          </T>
          <Icon name="chevron-right" color={colors.warnInk} />
        </Pressable>
      ))}
    </View>
  );
}

/* ------------------------------ Announcements ------------------------------ */

/** Pinned for coordinators and admins from 1 December to 20 January, until they tap Done. */
function YearlyInfoCard() {
  const db = useSQLiteContext();
  const [now] = useState(() => new Date());
  const season = yearlyInfoSeason(now);
  const state = useData(
    async (d) => {
      const access = await getAccess(d);
      const done = season ? !!(await d.getFirstAsync(`SELECT 1 FROM app_meta WHERE key = ?`, `yearly_info_done:${season}`)) : true;
      const home = await getHomeRegion(d);
      return { level: access.level, done, region: home && home !== 'all' ? regionName(home) : null };
    },
    [season],
  );
  if (!season || !state || state.done || (state.level !== 'admin' && state.level !== 'coordinator')) return null;
  const text = yearlyInfoText(season, state.level);
  const daysLeft = Math.max(0, Math.ceil((new Date(season, COUNTRY.infoDeadline.month, COUNTRY.infoDeadline.day, 23, 59).getTime() - now.getTime()) / 86400_000));
  return (
    <View style={{ backgroundColor: colors.brand, borderRadius: 14, padding: space.lg, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="pin" color="#fff" size={18} />
        <T style={{ fontFamily: font.bold, fontSize: 12, letterSpacing: 1, color: '#fff' }}>{daysLeft <= 7 ? `${daysLeft} DAYS LEFT` : `DUE ${deadlineLabel.toUpperCase()}`}</T>
      </View>
      <T style={{ fontFamily: font.bold, fontSize: 19, lineHeight: 24, color: '#fff' }}>{text.title}</T>
      <T style={{ color: '#FBE9E0' }}>{text.body}</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {state.level === 'admin' ? (
          <Button label="Update links" icon="link-variant" kind="dark" onPress={() => router.push('/admin/links')} style={{ flex: 1 }} />
        ) : (
          <Button label="Email the admins" icon="email-outline" kind="dark" onPress={() => Linking.openURL(yearlyInfoMailto(season, state.region))} style={{ flex: 1 }} />
        )}
        <Button
          label={state.level === 'admin' ? 'All updated' : 'I’ve sent it'}
          icon="check"
          kind="dark"
          onPress={() => db.runAsync(`INSERT INTO app_meta (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'`, `yearly_info_done:${season}`).then(() => notifyChanged())}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

function News() {
  const list = useData(listAnnouncements) ?? [];
  const region = useData(getHomeRegion) ?? null;
  const [opened] = useState(() => Date.now());
  const fresh = list.filter((a) => (!a.region_code || !region || a.region_code === region) && (a.pinned || opened - Date.parse(a.published_at) < 14 * 86400_000));
  if (!fresh.length) return null;
  const top = fresh[0];
  // One slim line: the newest/pinned announcement, and how many more there are.
  return (
    <Pressable
      onPress={() => router.push('/hub/announcements')}
      accessibilityRole="button"
      accessibilityLabel={`Announcement: ${top.title}${fresh.length > 1 ? `, and ${fresh.length - 1} more` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.night, borderRadius: 12, paddingHorizontal: space.md, paddingVertical: 10 }}>
      <Icon name="bullhorn-outline" color="#F0A27E" size={20} />
      <T numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold, fontSize: 15, color: '#fff' }}>
        {top.title}
      </T>
      {fresh.length > 1 ? <T style={{ fontFamily: font.bold, fontSize: 13, color: '#F0A27E' }}>+{fresh.length - 1}</T> : null}
      <Icon name="chevron-right" color={colors.nightMuted} size={18} />
    </Pressable>
  );
}

/* ------------------------------ Coming up ------------------------------ */

/** Live games of mine, then my next week: practices, fixtures, pickups and things I follow. */
function Upcoming({ data }: { data: Awaited<ReturnType<typeof homeFeed>> }) {
  if (!data.hasScope) {
    return (
      <Card>
        <T v="bodyStrong">Make this yours</T>
        <T v="small">Join your team and its games and practices show up here. Follow any team, league or pickup to add it too.</T>
        <Button label="Find your team" icon="account-group" kind="primary" onPress={() => router.push('/teams')} />
      </Card>
    );
  }
  const shown = data.timeline.slice(0, MAX_TIMELINE);
  const days: { label: string; items: TimelineItem[] }[] = [];
  for (const it of shown) {
    const label = dayLabel(it.at);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(it);
    else days.push({ label, items: [it] });
  }
  return (
    <>
      {data.live.length ? (
        <Section title="Live now">
          {data.live.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </Section>
      ) : null}
      <Section title="Next up" action={<Button label="My schedule ›" kind="ghost" onPress={() => router.push('/schedule')} style={{ minHeight: 32, paddingHorizontal: 0 }} />}>
        {days.length === 0 ? (
          <Card>
            <T v="small">Nothing on in the next 7 days.</T>
          </Card>
        ) : (
          days.map((d) => (
            <View key={d.label} style={{ gap: space.xs }}>
              <T v="label">{d.label}</T>
              <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                {d.items.map((it, i) => (
                  <TimelineRow key={it.key} it={it} first={i === 0} />
                ))}
              </View>
            </View>
          ))
        )}
        {data.timeline.length > shown.length ? <T v="small">+{data.timeline.length - shown.length} more this week in My schedule.</T> : null}
      </Section>
    </>
  );
}
