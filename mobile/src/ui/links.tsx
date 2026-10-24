import { router } from 'expo-router';
import type { TextProps } from 'react-native';

import { T } from './components';

type Props = Omit<TextProps, 'onPress'> & {
  v?: Parameters<typeof T>[0]['v'];
  children: React.ReactNode;
};

/** A team's name that opens its public team page, wherever it's shown (works inside tappable cards). */
export function TeamLink({ id, ...rest }: Props & { id: string | null | undefined }) {
  if (!id) return <T {...rest} />;
  return <T accessibilityRole="link" suppressHighlighting onPress={() => router.push(`/team/${id}`)} {...rest} />;
}

/** A player's name that opens their page: stats by league, season and team. */
export function PlayerLink({ id, ...rest }: Props & { id: string | null | undefined }) {
  if (!id) return <T {...rest} />;
  return <T accessibilityRole="link" suppressHighlighting onPress={() => router.push(`/player/${id}`)} {...rest} />;
}
