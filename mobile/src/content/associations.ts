/*
 * Each association's yearly membership form, fees and payment details, so the app can run sign-up,
 * numbers and payment references for any of them. CTFDA (Western) first; others follow the same shape.
 * Taken from the CTFDA 2026 Membership Google Form.
 */

export type Involvement = { key: string; label: string; competitive: boolean };
export type MembershipOption = { key: string; label: string; feeCents: number; note?: string };
export type Policy = { key: string; label: string; url: string };

export type AssociationForm = {
  code: string;
  regionCode: string | null;
  short: string;
  name: string;
  season: number;
  /** Member numbers look like CT123: this prefix, then digits. */
  numberPrefix: string;
  intro: string;
  involvement: Involvement[];
  options: MembershipOption[];
  policies: Policy[];
  waiver: string;
  payment: {
    method: string;
    /** Pay link (SnapScan or Yoco). Null until the association gives us theirs. */
    url: string | null;
    /** How to pay when there's no link yet. */
    howTo: string;
    contactEmail: string;
  };
  /** What to use as the payment reference before you have a number. */
  referenceFallback: (surname: string) => string;
};

export const POPULATION_GROUPS = ['Black African', 'Coloured', 'Indian/Asian', 'White', 'Other', 'Prefer not to say'] as const;
export const ORIGINS = [
  { key: 'local', label: 'Born in South Africa' },
  { key: 'transplant', label: 'Transplant (born elsewhere)' },
] as const;

export const CTFDA: AssociationForm = {
  code: 'ctfda',
  regionCode: 'western',
  short: 'CTFDA',
  name: 'Cape Town Flying Disc Association',
  season: 2026,
  numberPrefix: 'CT',
  intro: 'Registering with CTFDA is free for pickup, social and school players. Fees are only for a full year of competitive play (Mixed, Womxn’s/Open club leagues and any 2nd tier league).',
  involvement: [
    { key: 'pickup', label: 'Pick-up (social) play only', competitive: false },
    { key: 'school', label: 'Playing in High Schools Ultimate', competitive: false },
    { key: 'varsity', label: 'Playing in internal University leagues', competitive: false },
    { key: 'events', label: 'Pick-up, but interested in one-off events (skills clinics, hat tournaments)', competitive: false },
    { key: 'social_leagues', label: 'Regular social / semi-competitive leagues or events (individual sign-up: hat or draft)', competitive: false },
    { key: 'competitive', label: 'Regular competitive leagues (club or team, including 2nd tier)', competitive: true },
  ],
  options: [
    { key: 'general', label: 'General membership', feeCents: 40000 },
    { key: 'student', label: 'Student membership', feeCents: 25000 },
    { key: 'u18', label: 'U18 High School player', feeCents: 0 },
    { key: 'uct', label: 'UCT member', feeCents: 0, note: 'Paid by the university club' },
  ],
  policies: [
    { key: 'code_of_conduct', label: 'CTFDA Code of Conduct', url: 'https://tinyurl.com/tt9m6c3' },
    { key: 'anti_harassment', label: 'CTFDA Anti-Harassment Policy', url: 'https://tinyurl.com/qofg4l4' },
  ],
  waiver:
    'I take part in disc sports in 2026 voluntarily and won’t hold CTFDA or SAFDA liable for injury or loss. I agree to the CTFDA Code of Conduct and Anti-Harassment Policy. League or tournament coordinators may set a required rules accreditation.',
  payment: {
    method: 'SnapScan',
    url: null,
    howTo: 'Pay via SnapScan using your CTFDA number as the reference.',
    contactEmail: 'helloctfda@gmail.com',
  },
  referenceFallback: (surname) => `member_${surname.trim().replace(/\s+/g, '_').toLowerCase()}`,
};

export const ASSOCIATIONS: Record<string, AssociationForm> = { ctfda: CTFDA };

export const formatRand = (cents: number) => (cents ? `R${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` : 'Free');

/** Payment reference: your member number, or the association's fallback until you have one. */
export const paymentReference = (a: AssociationForm, number: string | null | undefined, surname: string) => (number?.trim() ? number.trim().toUpperCase() : a.referenceFallback(surname));

/** Is this a member number in the association's format (CT123)? */
export const isMemberNumber = (a: AssociationForm, n: string | null | undefined) => !!n && new RegExp(`^${a.numberPrefix}\\d+$`, 'i').test(n.replace(/\s/g, ''));
