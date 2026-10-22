import { useSQLiteContext } from 'expo-sqlite';

import { useData } from '@/db/live';
import { isFollowing, setFollowing, type FollowKind } from '@/db/repo';

import { Button } from './components';

/** Star toggle: following puts this team/event's games on your Home "For you" feed. */
export function FollowButton({ kind, id }: { kind: FollowKind; id: string }) {
  const db = useSQLiteContext();
  const following = useData((d) => isFollowing(d, kind, id), [kind, id]);
  return (
    <Button
      label={following ? 'Following' : 'Follow'}
      icon={following ? 'star' : 'star-outline'}
      kind={following ? 'primary' : 'secondary'}
      onPress={() => setFollowing(db, kind, id, !following)}
      accessibilityLabel={following ? 'Unfollow' : 'Follow'}
    />
  );
}
