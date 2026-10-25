import { Alert, Share } from 'react-native';

/**
 * Where the public live page (web/live/index.html) is hosted. Null until it's published;
 * then the share button sends e.g. https://…/live/?g=<game id>.
 */
export const LIVE_BASE_URL: string | null = null;

export const liveUrl = (gameId: string) => (LIVE_BASE_URL ? `${LIVE_BASE_URL}?g=${encodeURIComponent(gameId)}` : null);

/** Share a link spectators can open in any browser. The scorer needs to be signed in so the game uploads. */
export async function shareLiveLink(gameId: string, title: string, signedIn: boolean) {
  const url = liveUrl(gameId);
  if (!url) {
    return Alert.alert('Live link coming soon', 'The spectator page is built but not online yet. Once it’s hosted, this button shares a link anyone can open.');
  }
  if (!signedIn) {
    Alert.alert('Sign in so people can follow', 'Spectators see what this phone uploads. Go online in More → Account & sync, then share again.');
    return;
  }
  await Share.share({ message: `Follow ${title} live 🥏 ${url}`, url });
}
