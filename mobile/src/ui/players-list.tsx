import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useData } from '@/db/live';
import { listFollows, setFollowing } from '@/db/repo';

import { EmptyState, Icon, IconButton, Row, Section, T } from './components';
import { Avatar } from './photo';
import { colors, font, space } from './theme';

type P = { id: string; first_name: string; last_name: string; nickname: string | null; photo_uri: string | null; preferred_number: string | null; teams: string | null };

/** Find any player and follow them: their teams' games then show on Home under “For you”. */
export function PlayersList() {
  const db = useSQLiteContext();
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const data = useData(
    async (d) => {
      const followed = new Set((await listFollows(d)).filter((f) => f.kind === 'player').map((f) => f.target_id));
      const people = await d.getAllAsync<P>(
        `SELECT p.id, p.first_name, p.last_name, p.nickname, p.photo_uri, p.preferred_number,
                (SELECT GROUP_CONCAT(t.name, ', ') FROM membership m JOIN team t ON t.id = m.team_id
                  WHERE m.person_id = p.id AND m.end_date IS NULL AND m.deleted_at IS NULL) AS teams
           FROM person p
          WHERE p.deleted_at IS NULL AND (p.id IN (SELECT target_id FROM follow WHERE kind = 'player')
             OR (? != '' AND LOWER(p.first_name || ' ' || p.last_name || ' ' || COALESCE(p.nickname, '')) LIKE '%' || ? || '%'))
          ORDER BY p.first_name, p.last_name LIMIT 60`,
        s.length >= 2 ? s : '',
        s,
      );
      return { followed, people };
    },
    [s],
  );
  const followed = data?.followed ?? new Set<string>();
  const people = data?.people ?? [];
  const mine = people.filter((p) => followed.has(p.id));
  const found = s.length >= 2 ? people.filter((p) => !followed.has(p.id)) : [];

  const row = (p: P) => (
    <Row
      key={p.id}
      title={`${p.first_name} ${p.last_name}`.trim()}
      subtitle={[p.preferred_number ? `#${p.preferred_number}` : null, p.teams].filter(Boolean).join(' · ') || 'No team yet'}
      left={<Avatar uri={p.photo_uri} name={`${p.first_name} ${p.last_name}`} size={36} />}
      right={
        <IconButton
          icon={followed.has(p.id) ? 'star' : 'star-outline'}
          color={followed.has(p.id) ? colors.warn : colors.muted}
          label={followed.has(p.id) ? 'Unfollow' : 'Follow'}
          onPress={() => setFollowing(db, 'player', p.id, !followed.has(p.id))}
        />
      }
      onPress={() => router.push(`/player/${p.id}`)}
    />
  );
  const group = (ps: P[]) => <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, gap: 1, backgroundColor: colors.divider }}>{ps.map(row)}</View>;

  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          backgroundColor: colors.surface,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: space.md,
        }}>
        <Icon name="magnify" color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search players by name"
          placeholderTextColor={colors.faint}
          style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }}
        />
      </View>
      {s.length >= 2 ? <Section title={`Found · ${found.length}`}>{found.length ? group(found) : <T v="small">Nobody by that name.</T>}</Section> : null}
      {mine.length ? (
        <Section title="Following">{group(mine)}</Section>
      ) : s.length < 2 ? (
        <EmptyState
          icon="star-outline"
          title="Follow a player"
          body="Search for your partner, a friend or a player you love watching, and tap the star. Their games show on Home under “For you”. They aren’t told who follows them."
        />
      ) : null}
    </View>
  );
}
