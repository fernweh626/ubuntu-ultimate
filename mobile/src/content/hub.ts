// Static info-hub content. Club and region lists come from the community hub in the current Stall Count
// app (Oct 2026). Contact details are filled in per team in the app.

export type Region = { code: string; name: string; body: string; area: string };

export const REGIONS: Region[] = [
  {
    code: 'western',
    name: 'Western',
    body: 'CTFDA',
    area: 'Western Cape & Northern Cape. One of the oldest and deepest scenes, centred on Cape Town and Stellenbosch.',
  },
  {
    code: 'northern',
    name: 'Northern',
    body: 'GFDA',
    area: 'Gauteng, Free State, Mpumalanga, North West & Limpopo. The largest region, centred on Johannesburg and Pretoria.',
  },
  {
    code: 'kzn',
    name: 'KwaZulu-Natal',
    body: 'KZN',
    area: 'Durban, Pietermaritzburg and the Midlands, with several long-standing competitive clubs.',
  },
  {
    code: 'eastern-cape',
    name: 'Eastern Cape',
    body: 'EC',
    area: 'Gqeberha, East London and surrounds — a developing region with a growing set of teams.',
  },
];

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

export const SPIRIT_SCALE = ['Poor', 'Not good', 'Good', 'Very good', 'Excellent'];

export const RULES_URL = 'https://rules.wfdf.sport';
