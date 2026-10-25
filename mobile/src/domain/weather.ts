export type Weather = {
  temperatureC: number;
  windKmh: number;
  gustKmh: number;
  windFromDeg: number;
  precipitationMm: number;
  fetchedAt: string;
  source: 'open-meteo' | 'manual';
};

/** Current conditions from Open-Meteo (free, no key). Returns null when offline; the game carries on regardless. */
export async function fetchWeather(lat: number, lng: number): Promise<Weather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` + `&current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation&wind_speed_unit=kmh`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const c = json.current;
    return {
      temperatureC: Math.round(c.temperature_2m),
      windKmh: Math.round(c.wind_speed_10m),
      gustKmh: Math.round(c.wind_gusts_10m),
      windFromDeg: Math.round(c.wind_direction_10m),
      precipitationMm: c.precipitation,
      fetchedAt: new Date().toISOString(),
      source: 'open-meteo',
    };
  } catch {
    return null;
  }
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function compass(deg: number) {
  return COMPASS[Math.round(deg / 45) % 8];
}

export function weatherLine(w: Weather | null) {
  if (!w) return null;
  return `${w.temperatureC}°C · wind ${w.windKmh} km/h from ${compass(w.windFromDeg)}, gusts ${w.gustKmh}${w.precipitationMm > 0 ? ' · rain' : ''}`;
}
