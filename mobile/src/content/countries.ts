/*
 * Everything that differs by country, in one place, so adding a country later means adding an entry
 * here (and its regions), not changing code all over the app. South Africa is the only one for now.
 */

export type Region = { country: string; code: string; name: string; body: string; area: string };

export type Country = {
  code: string;
  name: string;
  /** International dialling code, digits only (27 → +27). */
  dial: string;
  currency: { code: string; symbol: string };
  timeZone: string;
  /** National association, and the privacy law player data falls under. */
  nationalBody: { short: string; name: string; url: string };
  privacyLaw: string;
  /** Annual fees open on this day (month 0 = January). */
  feesOpen: { month: number; day: number };
  /** Coordinators send next season's forms, fees and links to the admins by this day. */
  infoDeadline: { month: number; day: number };
  regions: Region[];
};

// SAFDA's four regions: Northern, Eastern (KwaZulu-Natal), Southern (Eastern Cape) and Western.
const ZA_REGIONS: Region[] = [
  {
    country: 'ZA',
    code: 'western',
    name: 'Western',
    body: 'CTFDA',
    area: 'Western Cape & Northern Cape. One of the oldest and deepest scenes, centred on Cape Town and Stellenbosch.',
  },
  {
    country: 'ZA',
    code: 'northern',
    name: 'Northern',
    body: 'GFDA',
    area: 'Gauteng, Free State, Mpumalanga, North West & Limpopo. The largest region, centred on Johannesburg and Pretoria.',
  },
  {
    country: 'ZA',
    code: 'kzn',
    name: 'Eastern (KZN)',
    body: 'KZN',
    area: 'Durban, Pietermaritzburg and the Midlands, with several long-standing competitive clubs.',
  },
  {
    country: 'ZA',
    code: 'eastern-cape',
    name: 'Southern (EC)',
    body: 'EC',
    area: 'Gqeberha, East London and surrounds — a developing region with a growing set of teams.',
  },
];

export const COUNTRIES: Record<string, Country> = {
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    dial: '27',
    currency: { code: 'ZAR', symbol: 'R' },
    timeZone: 'Africa/Johannesburg',
    nationalBody: { short: 'SAFDA', name: 'South African Flying Disc Association', url: 'https://safda.org.za/' },
    privacyLaw: 'POPIA',
    feesOpen: { month: 1, day: 1 },
    infoDeadline: { month: 0, day: 20 },
    regions: ZA_REGIONS,
  },
};

/** The country the app runs in. One country today; later this comes from the player's region. */
export const COUNTRY = COUNTRIES.ZA;

/** Every region in every country. */
export const REGIONS: Region[] = Object.values(COUNTRIES).flatMap((c) => c.regions);

export const countryOfRegion = (code: string | null | undefined) => Object.values(COUNTRIES).find((c) => c.regions.some((r) => r.code === code)) ?? COUNTRY;

/** Dialling codes offered on phone fields: the app's country first, then neighbours and common ones. */
export const DIAL_CODES: { dial: string; label: string }[] = [
  { dial: '27', label: '🇿🇦 +27' },
  { dial: '263', label: '🇿🇼 +263' },
  { dial: '264', label: '🇳🇦 +264' },
  { dial: '267', label: '🇧🇼 +267' },
  { dial: '258', label: '🇲🇿 +258' },
  { dial: '260', label: '🇿🇲 +260' },
  { dial: '266', label: '🇱🇸 +266' },
  { dial: '268', label: '🇸🇿 +268' },
  { dial: '254', label: '🇰🇪 +254' },
  { dial: '234', label: '🇳🇬 +234' },
  { dial: '44', label: '🇬🇧 +44' },
  { dial: '1', label: '🇺🇸 +1' },
  { dial: '61', label: '🇦🇺 +61' },
  { dial: '64', label: '🇳🇿 +64' },
  { dial: '31', label: '🇳🇱 +31' },
  { dial: '49', label: '🇩🇪 +49' },
];
