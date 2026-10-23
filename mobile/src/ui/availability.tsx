import { useSQLiteContext } from 'expo-sqlite';
import { View } from 'react-native';

import { gameAvailability, setAvailability } from '@/db/development';
import { useData } from '@/db/live';
import { getAccess, myScope } from '@/db/repo';
import { displayName } from '@/domain/format';

import { AnswerButtons } from './answer';
import { Section, T } from './components';
import { colors, font, space } from './theme';

const F = colors.female;
const M = colors.male;

/**
 * "Are you available?" for an upcoming game, per team you play for or run. Players answer for
 * themselves; staff see who can't make it and who hasn't answered.
 */
export function Availability({ gameId, teams }: { gameId: string; teams: { id: string; name: string }[] }) {
  const db = useSQLiteContext();
  const bundle = useData(
    async (d) => {
      const access = await getAccess(d);
      const scope = await myScope(d);
      const mine = teams.filter((t) => scope.myTeamIds.has(t.id) || access.staffTeamIds.includes(t.id));
      const lists = await Promise.all(mine.map(async (t) => ({ team: t, staff: access.staffTeamIds.includes(t.id), list: await gameAvailability(d, gameId, t.id) })));
      return { meId: access.meId, lists };
    },
    [gameId, teams.map((t) => t.id).join()],
  );
  if (!bundle?.lists.length) return null;
  return (
    <>
      {bundle.lists.map(({ team, staff, list }) => {
        const me = list.find((p) => p.personId === bundle.meId);
        const yes = list.filter((p) => p.status === 'available' || p.status === 'late');
        const no = list.filter((p) => p.status === 'unavailable');
        const quiet = list.filter((p) => !p.status);
        const f = yes.filter((p) => p.gender === 'W').length;
        const m = yes.filter((p) => p.gender === 'M').length;
        return (
          <Section key={team.id} title={`${team.name} · available ${yes.length}`}>
            {me ? (
              <AnswerButtons
                yesLabel="I can play"
                noLabel="Can’t play"
                value={me.status === 'available' ? 'yes' : me.status === 'late' ? 'late' : me.status === 'unavailable' ? 'no' : null}
                onAnswer={(a, note) =>
                  bundle.meId && setAvailability(db, gameId, team.id, bundle.meId, a === 'yes' ? 'available' : a === 'late' ? 'late' : a === 'no' ? 'unavailable' : null, note)
                }
              />
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
              <T style={{ fontFamily: font.bold, color: F }}>{f} female matching</T>
              <T style={{ fontFamily: font.bold, color: M }}>{m} male matching</T>
              <T v="small">
                {no.length} can’t · {quiet.length} haven’t said
              </T>
            </View>
            {yes.length ? <T v="small">Available: {yes.map((p) => `${displayName(p)}${p.status === 'late' ? ` (late${staff && p.reason ? `, ${p.reason}` : ''})` : ''}`).join(', ')}</T> : null}
            {staff && no.length ? <T v="small">Can’t: {no.map((p) => `${displayName(p)}${p.reason ? ` (${p.reason})` : ''}`).join(', ')}</T> : null}
            {staff && quiet.length ? <T v="small" style={{ color: colors.muted }}>Haven’t said: {quiet.map((p) => displayName(p)).join(', ')}</T> : null}
          </Section>
        );
      })}
    </>
  );
}
