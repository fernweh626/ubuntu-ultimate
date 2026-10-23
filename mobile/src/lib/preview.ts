/**
 * Preview builds (for testers): demo data only, no accounts and no syncing, so nothing anyone does
 * reaches the real database. Bug reports still go through. Set EXPO_PUBLIC_PREVIEW=1 at build time.
 */
export const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
