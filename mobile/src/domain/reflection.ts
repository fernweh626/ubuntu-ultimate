export type ReflectionKind = 'game' | 'practice' | 'pickup';
export type PlayingTime = 'too_little' | 'right' | 'too_much';
export type NiggleSeverity = 'mild' | 'moderate' | 'bad';

/** Answers beyond the numeric columns. Every field is optional: players can skip anything. */
export type Answers = {
  pointsPlayedConfirmed?: boolean;
  pointsPlayedClaimed?: number;
  teamOffence?: number;
  teamDefence?: number;
  roleClear?: 'yes' | 'mostly' | 'no';
  connectedWith?: string[];
  bestMoment?: string;
  wentWell?: string;
  workOn?: string;
  spirit?: number;
  spiritComment?: string;
  leadership?: string;
  drill?: string;
  staffLines?: string;
  staffStrategies?: string;
  staffScouting?: string;
};

export type ReflectionRow = {
  id: string;
  person_id: string;
  team_id: string | null;
  game_id: string | null;
  session_id: string | null;
  kind: ReflectionKind;
  minutes: number | null;
  rpe: number | null;
  self_rating: number | null;
  playing_time: PlayingTime | null;
  niggle_area: string | null;
  niggle_severity: NiggleSeverity | null;
  answers_json: string;
  created_at: string;
};

/**
 * Which questions each kind asks (the table agreed in the spec). Gym and physio are saved as personal
 * practice reflections (no team), but ask their own, shorter questions.
 */
export const ASKS: Record<ReflectionKind | 'gym' | 'physio', Set<string>> = {
  game: new Set(['points', 'playingTime', 'rpe', 'niggles', 'selfRating', 'team', 'role', 'connections', 'shoutout', 'bestMoment', 'wentWell', 'workOn', 'spirit', 'leadership']),
  practice: new Set(['minutes', 'rpe', 'niggles', 'selfRating', 'shoutout', 'wentWell', 'workOn', 'drill', 'leadership']),
  pickup: new Set(['minutes', 'rpe', 'niggles', 'selfRating', 'spirit', 'shoutout']),
  gym: new Set(['minutes', 'rpe', 'niggles', 'workOn']),
  physio: new Set(['minutes', 'niggles', 'workOn']),
};

export const PLAYING_TIME_LABEL: Record<PlayingTime, string> = { too_little: 'Too little', right: 'About right', too_much: 'Too much' };

export const BODY_AREAS = ['Hamstring', 'Quad', 'Calf', 'Knee', 'Ankle', 'Foot', 'Hip / groin', 'Back', 'Shoulder', 'Wrist / hand', 'Head', 'Other'];

export function parseAnswers(json: string | null | undefined): Answers {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

/** Session-RPE training load: effort (1–10) × minutes. A common, simple way to track how hard someone is working. */
export function load(r: Pick<ReflectionRow, 'rpe' | 'minutes'>) {
  return r.rpe && r.minutes ? r.rpe * r.minutes : 0;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export type StaffSummary = {
  responses: number;
  avgRpe: number | null;
  avgSelf: number | null;
  avgOffence: number | null;
  avgDefence: number | null;
  avgSpirit: number | null;
  playingTime: Record<PlayingTime, string[]>;
  roleUnclear: string[];
  niggles: { name: string; area: string; severity: NiggleSeverity | null }[];
  wentWell: { name: string; text: string }[];
  workOn: { name: string; text: string }[];
  leadership: { name: string; text: string }[];
  drills: { name: string; text: string }[];
  staffNotes: { name: string; text: string }[];
};

/** Roll everyone's answers up for coaches and captains (named — staff see who said what). */
export function summarise(rows: ReflectionRow[], nameOf: (personId: string) => string): StaffSummary {
  const a = rows.map((r) => ({ r, ans: parseAnswers(r.answers_json), name: nameOf(r.person_id) }));
  const playingTime: Record<PlayingTime, string[]> = { too_little: [], right: [], too_much: [] };
  for (const x of a) if (x.r.playing_time) playingTime[x.r.playing_time].push(x.name);
  const texts = (k: keyof Answers) =>
    a.filter((x) => typeof x.ans[k] === 'string' && (x.ans[k] as string).trim()).map((x) => ({ name: x.name, text: (x.ans[k] as string).trim() }));
  return {
    responses: rows.length,
    avgRpe: avg(rows.map((r) => r.rpe).filter((v): v is number => v != null)),
    avgSelf: avg(rows.map((r) => r.self_rating).filter((v): v is number => v != null)),
    avgOffence: avg(a.map((x) => x.ans.teamOffence).filter((v): v is number => v != null)),
    avgDefence: avg(a.map((x) => x.ans.teamDefence).filter((v): v is number => v != null)),
    avgSpirit: avg(a.map((x) => x.ans.spirit).filter((v): v is number => v != null)),
    playingTime,
    roleUnclear: a.filter((x) => x.ans.roleClear === 'no').map((x) => x.name),
    niggles: a.filter((x) => x.r.niggle_area).map((x) => ({ name: x.name, area: x.r.niggle_area!, severity: x.r.niggle_severity })),
    wentWell: texts('wentWell'),
    workOn: texts('workOn'),
    leadership: texts('leadership'),
    drills: texts('drill'),
    staffNotes: [...texts('staffLines'), ...texts('staffStrategies'), ...texts('staffScouting')],
  };
}

/** Plain-text debrief for staff to edit and share (WhatsApp, email). */
export function debriefText(title: string, s: StaffSummary, squadSize: number) {
  const lines: string[] = [`*${title}* — team debrief`, `${s.responses} of ${squadSize} players replied.`];
  const nums = [
    s.avgRpe != null ? `effort ${s.avgRpe}/10` : null,
    s.avgOffence != null ? `offence ${s.avgOffence}/5` : null,
    s.avgDefence != null ? `defence ${s.avgDefence}/5` : null,
  ].filter(Boolean);
  if (nums.length) lines.push(`Averages: ${nums.join(', ')}.`);
  const bullets = (head: string, items: { text: string }[]) => {
    if (!items.length) return;
    lines.push('', `*${head}*`, ...items.map((i) => `• ${i.text}`));
  };
  bullets('What went well', s.wentWell);
  bullets('What to work on', s.workOn);
  if (s.drills.length) bullets('Drills that helped', s.drills);
  lines.push('', 'Thanks everyone 🙌');
  return lines.join('\n');
}
