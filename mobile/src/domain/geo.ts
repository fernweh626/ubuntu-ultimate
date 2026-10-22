import * as Location from 'expo-location';

export type LatLng = { latitude: number; longitude: number };

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m away`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km away`;
}

/** Fields closer than this are treated as "you're probably here". */
export const HERE_M = 400;

/**
 * Where the phone is, or null if location is off or refused. Uses the last known fix first (instant),
 * then a fresh one if that's missing or stale.
 */
export async function currentPosition(): Promise<LatLng | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 200 });
    if (last) return last.coords;
    const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return fresh.coords;
  } catch {
    return null;
  }
}

/** Best-effort suburb/city for a new field, so people don't have to type it. */
export async function placeName(p: LatLng): Promise<string | null> {
  try {
    const [r] = await Location.reverseGeocodeAsync(p);
    if (!r) return null;
    return [r.district || r.subregion, r.city].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}
