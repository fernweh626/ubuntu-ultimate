export type Gender = 'W' | 'M' | 'X';
export type Position = 'handler' | 'cutter' | 'hybrid';
export type TrackingMode = 'lite' | 'standard' | 'full';
export type EventKind = 'tournament' | 'league' | 'scrimmage' | 'practice' | 'pickup';
export type EventLevel = 'international' | 'national' | 'regional' | 'league' | 'minor' | 'social';
export type Division = 'mixed' | 'open' | 'women' | 'u17' | 'u20' | 'u24' | 'masters';
export type PullOutcome = 'in' | 'out' | 'brick' | 'unknown';

export type Person = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  email: string | null;
  birth_date: string | null;
  gender: Gender | null;
  preferred_number: string | null;
  position: Position | null;
  is_placeholder: number;
  photo_uri: string | null;
};

export type Team = {
  id: string;
  name: string;
  short_name: string | null;
  kind: string;
  region: string | null;
  city: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  logo_uri: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  social: string | null;
  about: string | null;
  is_sample: number;
};

export type Membership = {
  id: string;
  person_id: string;
  team_id: string;
  kind: 'core' | 'guest' | 'mercenary';
  role: 'player' | 'captain' | 'coach' | 'spirit_captain' | 'manager';
  jersey_number: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type RosterEntry = Person & {
  membership_id: string;
  membership_kind: Membership['kind'];
  role: Membership['role'];
  jersey_number: string | null;
};

export type GameEventType =
  | 'pass'
  | 'score'
  | 'drop'
  | 'throwaway'
  | 'stall'
  | 'intercept'
  | 'callahan'
  | 'timeout'
  | 'halftime'
  | 'stoppage_start'
  | 'stoppage_end'
  | 'injury_sub'
  | 'end';

export type GameEvent = {
  id: string;
  game_id: string;
  point_id: string | null;
  seq: number;
  type: GameEventType;
  team_id: string | null;
  actor_id: string | null;
  secondary_id: string | null;
  tertiary_id: string | null;
  value: string | null;
  recorded_at: string;
  voided_at: string | null;
};

export type Point = {
  id: string;
  game_id: string;
  number: number;
  half: number;
  offense_team_id: string;
  ratio: string | null;
  puller_id: string | null;
  pull_outcome: PullOutcome | null;
  pulled_at: string | null;
  scored_at: string | null;
  scoring_team_id: string | null;
};

export type Game = {
  id: string;
  event_id: string | null;
  venue_id: string | null;
  field: string | null;
  team_a_id: string;
  team_b_id: string;
  scheduled_at: string | null;
  status: 'scheduled' | 'live' | 'final' | 'cancelled';
  tracking_mode: TrackingMode;
  rules_json: string;
  first_pull_team_id: string | null;
  ratio_point1: 'M' | 'W' | null;
  weather_json: string | null;
  video_url: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type GamePlayer = {
  id: string;
  game_id: string;
  team_id: string;
  person_id: string;
  jersey_number: string | null;
  position: Position | null;
  status: 'available' | 'tired' | 'injured' | 'out';
};

export type EventRow = {
  id: string;
  name: string;
  kind: EventKind;
  level: EventLevel;
  division: Division;
  region: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  video_url: string | null;
  photos_url: string | null;
  notes: string | null;
};

export type SavedLine = { id: string; team_id: string; name: string; side: 'O' | 'D' | 'any'; member_ids: string[] };

export type SpiritScore = {
  id: string;
  game_id: string;
  from_team_id: string;
  to_team_id: string;
  rules: number;
  fouls: number;
  fairness: number;
  attitude: number;
  communication: number;
  comments_json: string | null;
  overall_comment: string | null;
  submitted_at: string;
};

export type PickupSpot = {
  id: string;
  name: string;
  region: string | null;
  city: string;
  area: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string | null;
  venue_text: string | null;
  map_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  whatsapp_url: string | null;
  level: 'all' | 'beginner' | 'competitive';
  cost: string | null;
  notes: string | null;
  is_sample: number;
};

export type CalendarEntry = {
  id: string;
  name: string;
  kind: string;
  level: string | null;
  region: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  month_hint: string | null;
  status: 'confirmed' | 'tbc';
  url: string | null;
  notes: string | null;
};
