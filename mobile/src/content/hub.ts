// Static info-hub content. Club and region lists come from the community hub in the current Stall Count
// app (Oct 2026). Contact details are filled in per team in the app.
import { REGIONS } from './countries';

// Regions come from the country settings (src/content/countries.ts); South Africa for now.
export type { Region } from './countries';
export { REGIONS };

export const regionName = (code: string | null | undefined) => REGIONS.find((r) => r.code === code)?.name ?? 'Other';

export const SEED_CLUBS: { name: string; city: string; region: string; short: string }[] = [
  { name: 'UCT Flying Tigers', city: 'UCT, Cape Town', region: 'western', short: 'FTG' },
  { name: 'UCT Roaring Tigers', city: 'UCT, Cape Town', region: 'western', short: 'RTG' },
  { name: 'Chilli Legends', city: 'Pinelands, Cape Town', region: 'western', short: 'CHL' },
  { name: 'Catch 22', city: 'Cape Town', region: 'western', short: 'C22' },
  { name: 'Ghost', city: 'Cape Town', region: 'western', short: 'GHO' },
  { name: 'Salusa 45', city: 'Cape Town', region: 'western', short: 'S45' },
  { name: 'Maties Meerkats', city: 'Stellenbosch', region: 'western', short: 'MMK' },
  { name: 'Nomad', city: 'Cape Town', region: 'western', short: 'NMD' },
  { name: 'Ultitude', city: 'Greenside, Johannesburg', region: 'northern', short: 'ULT' },
  { name: 'Skyveld', city: 'Johannesburg', region: 'northern', short: 'SKY' },
  { name: 'Zone Rangers', city: 'Johannesburg & Pretoria', region: 'northern', short: 'ZNR' },
  { name: 'Wits Voodoo Kudus', city: 'Wits, Johannesburg', region: 'northern', short: 'WVK' },
  { name: 'Soweto Ultimate', city: 'Soweto', region: 'northern', short: 'SOW' },
  { name: 'Orange Farm', city: 'Johannesburg', region: 'northern', short: 'ORF' },
  { name: 'Disks of Hazard', city: 'Tuks, Pretoria', region: 'northern', short: 'DOH' },
  { name: 'Labradors', city: 'Pretoria', region: 'northern', short: 'LAB' },
  { name: 'Elevation', city: 'Potchefstroom', region: 'northern', short: 'ELV' },
  { name: 'Long Donkeys', city: 'Pietermaritzburg', region: 'kzn', short: 'LDK' },
  { name: 'Bunnies', city: 'Durban', region: 'kzn', short: 'BNS' },
  { name: '4th Prime', city: 'Howick', region: 'kzn', short: '4PR' },
  { name: 'Rambs', city: 'KwaZulu-Natal', region: 'kzn', short: 'RMB' },
  { name: 'Gale Force', city: 'Gqeberha', region: 'eastern-cape', short: 'GLF' },
  { name: 'Hammerheads', city: 'East London', region: 'eastern-cape', short: 'HMH' },
  { name: 'Rebels', city: 'East London', region: 'eastern-cape', short: 'RBL' },
];

export const GOVERNANCE = [
  {
    level: 'World',
    name: 'World Flying Disc Federation (WFDF)',
    about: 'The international governing body. It owns the official Rules of Ultimate and runs the free online rules accreditation.',
    links: [
      { label: 'wfdf.sport', url: 'https://wfdf.sport' },
      { label: 'Rules', url: 'https://rules.wfdf.sport' },
    ],
  },
  {
    level: 'Africa',
    name: 'All Africa Flying Disc Federation (AAFDF)',
    about: 'The continental body recognised by WFDF, running the WFDF All African Ultimate Championships.',
    links: [],
  },
  {
    level: 'South Africa',
    name: 'South African Flying Disc Association (SAFDA)',
    about: 'The national body. Develops the sport, runs Nationals and Regionals, and selects national teams.',
    links: [{ label: 'safda.org.za', url: 'https://safda.org.za' }],
  },
];

export const WHAT_IS_ULTIMATE: { title: string; body: string }[] = [
  {
    title: 'The game in one minute',
    body:
      'Two teams of seven play on a field with an end zone at each end. You score by catching the disc in the end zone you are attacking. ' +
      'You cannot run with the disc — you move it by throwing to teammates. If a pass is dropped, blocked, intercepted or goes out of bounds, the other team takes possession where it lands.',
  },
  {
    title: 'Spirit of the Game',
    body:
      'Ultimate has no referees at most levels. Players call their own fouls and resolve disagreements themselves. ' +
      'Competitive play is encouraged, but never at the expense of respect, the rules or the joy of play. After every game each team scores the other’s spirit.',
  },
  {
    title: 'Divisions',
    body:
      'Most South African play is mixed (female and male matching players on the field together, with a set gender ratio on each point). There are also open and women’s divisions, and age divisions such as U17, U20, U24 and masters.',
  },
  {
    title: 'How to start',
    body:
      'You don’t need a team or experience. Most clubs run weekly pickup that is free or cheap and beginner-friendly — just show up. ' +
      'Use the Pickups tab in the Hub to find one by day of the week. Ultimate uses a 175 g disc.',
  },
  {
    title: 'Competing',
    body:
      'League and tournament play needs annual club membership through your regional body. Regional tournaments feed into Nationals, and national teams are selected from there.',
  },
];

export type RuleCard = { title: string; points: string[] };

// Quick reference in plain words. The WFDF rulebook is the authority; link out for detail.
export const RULES: RuleCard[] = [
  {
    title: 'Starting a point',
    points: [
      'Each point starts with a pull: the defending team throws the disc to the offence from their own end zone line.',
      'The offence lines up on its end zone line and may not move until the disc is released.',
      'After a score, the team that scored pulls the next point.',
    ],
  },
  {
    title: 'Moving the disc',
    points: [
      'You cannot run with the disc. Once you catch it you must stop and keep a pivot foot.',
      'The marker counts out a stall count up to ten. If you still hold the disc at the end of the count, it is a turnover.',
      'Only one defender may mark the thrower, and they must leave a disc’s width of space.',
    ],
  },
  {
    title: 'Turnovers',
    points: [
      'A pass that touches the ground, is dropped, is caught by a defender, or ends out of bounds is a turnover.',
      'A stall-out is a turnover.',
      'After a turnover the other team plays on from where the disc stopped (or where it went out).',
    ],
  },
  {
    title: 'Scoring',
    points: [
      'A goal counts when a receiver catches the disc and their first ground contact is entirely inside the attacking end zone.',
      'A defender who intercepts a pass inside the end zone they are attacking scores a callahan.',
    ],
  },
  {
    title: 'Fouls and calls',
    points: [
      'Players make their own calls: foul (contact), travel, pick, strip and more.',
      'Play stops on most calls. If the player fouled agrees, play restarts with the fouled player keeping possession; if contested, the disc goes back to the thrower.',
      'Discuss calls calmly and briefly; captains may step in if a discussion stalls.',
    ],
  },
  {
    title: 'Game length, caps and timeouts',
    points: [
      'Typical tournament games are played to 15 with halftime at 8.',
      'A time cap can end the game early: the soft cap adds one to the highest score, the hard cap ends play after the current point.',
      'Each team usually gets two timeouts per game.',
    ],
  },
  {
    title: 'Mixed ratio (ABBA)',
    points: [
      'In mixed games each line is either four female matching and three male matching players, or four male matching and three female matching players.',
      'The ratio for the first point is chosen, then it alternates in blocks of two: A, B, B, A, A, B, B…',
    ],
  },
  {
    title: 'Spirit scoring',
    points: [
      'After each game, score the opponent 0–4 in five categories: rules knowledge and use, fouls and body contact, fair-mindedness, positive attitude and self-control, and communication.',
      '2 is “good” and the normal score; use the range honestly and add comments that help.',
    ],
  },
];

export const SPIRIT_CATEGORIES = [
  { key: 'rules', label: 'Rules knowledge and use' },
  { key: 'fouls', label: 'Fouls and body contact' },
  { key: 'fairness', label: 'Fair-mindedness' },
  { key: 'attitude', label: 'Positive attitude and self-control' },
  { key: 'communication', label: 'Communication' },
] as const;

export const SPIRIT_SCALE = ['Bad', 'Not good', 'Good', 'Very good', 'Excellent'];

export const RULES_URL = 'https://rules.wfdf.sport';

/**
 * Privacy contact (POPIA information officer). TEMPORARY placeholder: the .example domain can't
 * receive mail. Swap in the real address here; the guide and privacy screen read it from here.
 */
export const PRIVACY_EMAIL = 'privacy@ubuntuultimate.example';

/** Where coordinators send next season's forms, fees and links. TEMPORARY placeholder, like the above. */
export const ADMIN_EMAIL = 'admin@ubuntuultimate.example';

/*
 * Real starting content from the associations' own sites (checked Oct 2026):
 * capetownultimate.co.za (CTFDA, Western) and safda.org.za (SAFDA, national).
 * Other regions' links get added by coordinators in the app (Me → Admin → Forms & payment links).
 * Bump CONTENT_VERSION when this changes so existing phones pick it up.
 */
export const CONTENT_VERSION = 2;

export type LinkKind = 'merch' | 'register' | 'website' | 'community' | 'social' | 'calendar' | 'contact' | 'policy' | 'rules';

export const LINK_KINDS: { kind: LinkKind; title: string; icon: string }[] = [
  { kind: 'merch', title: 'Merch & discs', icon: 'tshirt-crew-outline' },
  { kind: 'register', title: 'Join, register & pay', icon: 'card-account-details-outline' },
  { kind: 'community', title: 'Pickup & community groups', icon: 'whatsapp' },
  { kind: 'calendar', title: 'Leagues, events & standings', icon: 'calendar-star' },
  { kind: 'website', title: 'Websites', icon: 'web' },
  { kind: 'social', title: 'Follow', icon: 'instagram' },
  { kind: 'contact', title: 'Contact & committee', icon: 'email-outline' },
  { kind: 'rules', title: 'Rules & accreditation', icon: 'book-open-variant' },
  { kind: 'policy', title: 'Policies & guidelines', icon: 'shield-check-outline' },
];

/** region_code null = national (SAFDA / WFDF). */
export const STARTER_LINKS: { region: string | null; kind: LinkKind; label: string; url: string }[] = [
  // Western · CTFDA
  { region: 'western', kind: 'merch', label: 'CTFDA merch: discs, Cape Town Ultimate & club kit', url: 'https://www.capetownultimate.co.za/contact/merch' },
  { region: 'western', kind: 'merch', label: 'Order Cape Town Ultimate kit', url: 'https://forms.gle/8zNjKxduqwJVDVz47' },
  { region: 'western', kind: 'register', label: 'CTFDA membership registration', url: 'https://forms.gle/rqDCVoVC5RP317tV6' },
  { region: 'western', kind: 'community', label: 'Cape Town pickup WhatsApp community', url: 'https://chat.whatsapp.com/H9zDUGxsezM8nDM2IBzlOI' },
  { region: 'western', kind: 'calendar', label: 'Cape Town league & tournament calendar', url: 'https://www.capetownultimate.co.za/league/team-schedules' },
  { region: 'western', kind: 'calendar', label: 'CTFDA announcements', url: 'https://www.capetownultimate.co.za/contact/announcements' },
  { region: 'western', kind: 'website', label: 'Cape Town Ultimate (CTFDA)', url: 'https://www.capetownultimate.co.za/' },
  { region: 'western', kind: 'website', label: 'Cape Town clubs & teams', url: 'https://www.capetownultimate.co.za/league/clubs' },
  { region: 'western', kind: 'social', label: 'Instagram @capetownultimate', url: 'https://www.instagram.com/capetownultimate/' },
  { region: 'western', kind: 'social', label: 'Facebook: Cape Town Ultimate', url: 'https://www.facebook.com/capetownultimate/' },
  { region: 'western', kind: 'contact', label: 'Email CTFDA', url: 'mailto:helloctfda@gmail.com' },
  { region: 'western', kind: 'contact', label: 'CTFDA committee', url: 'https://www.capetownultimate.co.za/contact/committee' },
  { region: 'western', kind: 'policy', label: 'CTFDA policies, code of conduct & anti-harassment', url: 'https://www.capetownultimate.co.za/contact/policies-guidelines' },
  { region: 'western', kind: 'policy', label: 'CTFDA inclusion guidelines', url: 'https://drive.google.com/open?id=1p3uxGXHeD2Wl8N0Hwao5fKE23jF-9bDPYepqDxxdKo4' },
  { region: 'western', kind: 'policy', label: 'CTFDA constitution', url: 'https://drive.google.com/open?id=1M6J8if-22sOxGus-Ut3syubY3mKEIGZmmNDvSZYT-ho' },
  { region: 'western', kind: 'website', label: 'Jula iSitya NPO (development)', url: 'https://www.capetownultimate.co.za/what-is-ultimate/development/jula-isitya-npo' },
  // National · SAFDA & WFDF
  { region: null, kind: 'website', label: 'SAFDA: South African Flying Disc Association', url: 'https://safda.org.za/' },
  { region: null, kind: 'calendar', label: 'SAFDA events', url: 'https://safda.org.za/new-safda-events/' },
  { region: null, kind: 'calendar', label: 'SAFDA standings', url: 'https://safda.org.za/new-standings/' },
  { region: null, kind: 'calendar', label: 'Road to Nationals', url: 'https://docs.google.com/document/d/1sqGRiItAwXSNKzZOwN4yZy7I7M6ad1Y0newAAg9oRwg/edit' },
  { region: null, kind: 'website', label: 'SAFDA clubs across the regions', url: 'https://safda.org.za/new-clubs/' },
  { region: null, kind: 'website', label: 'National teams', url: 'https://safda.org.za/new-national-teams/' },
  { region: null, kind: 'rules', label: 'WFDF Rules of Ultimate', url: 'https://rules.wfdf.org/' },
  { region: null, kind: 'rules', label: 'WFDF rules accreditation', url: 'https://rules.wfdf.org/accreditation' },
  { region: null, kind: 'merch', label: 'Custom discs: Discraft (US)', url: 'https://www.discraft.com/' },
  { region: null, kind: 'merch', label: 'Custom discs: Eurodisc (UK)', url: 'https://www.eurodisc.biz/en/' },
];

const CT_PICKUP_GROUP = 'https://chat.whatsapp.com/H9zDUGxsezM8nDM2IBzlOI';

/**
 * Cape Town's current pickups (from the community, Oct 2026). Day: Monday = 0. Free, all levels.
 * The WhatsApp link is the CTFDA pickup community until each game's own group link is added.
 */
export const STARTER_PICKUPS: { name: string; day: number; start: string; venue: string; area: string; notes: string; whatsapp: string; city: string; contact?: string }[] = [
  { name: 'Herzlia pickup', day: 3, start: '17:00', venue: 'Herzlia fields', area: '', notes: 'Wear tekkies: no cleats. Bring your own water.', contact: 'Tev', whatsapp: CT_PICKUP_GROUP, city: 'Cape Town' },
  { name: 'Clifton beach pickup', day: 6, start: '08:30', venue: 'Clifton 1st beach', area: 'Clifton', notes: '8:30 for a 9:00 start. Barefoot on the beach. Bring water.', whatsapp: CT_PICKUP_GROUP, city: 'Cape Town' },
  { name: 'Rondebosch Sunday pickup', day: 6, start: '16:00', venue: 'Rondebosch Boys’ High sports fields, Oakhurst Ave', area: 'Rondebosch', notes: 'Cleats welcome.', whatsapp: CT_PICKUP_GROUP, city: 'Cape Town' },
];

/** Pickups from the CTFDA website that the community says aren't running now (removed in content v2). */
export const RETIRED_PICKUP_KEYS = ['Rondebosch pickup|0', 'Rondebosch pickup|6', 'Pinelands pickup|3', 'Maties pickup|2', 'Maties pickup|6', 'UCT social|4', 'Clifton beach pickup|6', 'Muizenberg beach pickup|5', 'Muizenberg beach pickup|6'];

export const pickupSeedKey = (p: { name: string; day: number }) => `${p.name}|${p.day}`;
