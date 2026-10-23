/*
 * Who may hand out which level. Each level can grant the levels below it; scorekeepers and players
 * grant nothing. Team staff only grant within their own team. The server will enforce the same table.
 */

export type Level = 'admin' | 'coordinator' | 'staff' | 'scorekeeper' | 'player';
export type TeamRole = 'player' | 'captain' | 'coach' | 'spirit_captain' | 'manager';
export type Grantable = 'coordinator' | 'scorekeeper' | Exclude<TeamRole, 'player'> | 'player';

export const LEVEL_RANK: Record<Level, number> = { admin: 4, coordinator: 3, staff: 2, scorekeeper: 1, player: 0 };

export const LEVEL_LABEL: Record<Level, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  staff: 'Team staff',
  scorekeeper: 'Scorekeeper',
  player: 'Player',
};

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  player: 'Player',
  captain: 'Captain',
  coach: 'Coach',
  spirit_captain: 'Spirit captain',
  manager: 'Team manager',
};

const GRANTS: Record<Level, Grantable[]> = {
  admin: ['coordinator', 'scorekeeper', 'captain', 'coach', 'spirit_captain', 'manager', 'player'],
  coordinator: ['scorekeeper', 'captain', 'coach', 'spirit_captain', 'manager', 'player'],
  staff: ['scorekeeper', 'captain', 'coach', 'spirit_captain', 'manager', 'player'],
  scorekeeper: [],
  player: [],
};

export function grantsFor(level: Level): Grantable[] {
  return GRANTS[level];
}

/**
 * Can someone at `level` set a team role on `teamId`? Admins and coordinators can on any team;
 * team staff only on teams they are staff of.
 */
export function canSetTeamRole(level: Level, staffTeamIds: string[], teamId: string, role: TeamRole) {
  if (!GRANTS[level].includes(role)) return false;
  if (level === 'staff') return staffTeamIds.includes(teamId);
  return true;
}

export function grantSummary(level: Level) {
  switch (level) {
    case 'admin':
      return 'You can make people coordinators, team staff or scorekeepers.';
    case 'coordinator':
      return 'You can make people team staff (captain, coach, spirit captain, manager) or scorekeepers.';
    case 'staff':
      return 'You can give staff roles and scorekeeper to people on your own team, and approve other staff.';
    case 'scorekeeper':
      return 'Scorekeepers can’t give access to anyone.';
    default:
      return 'Players can’t give access to anyone.';
  }
}

/** Pickups: whoever added it, the (up to 10) editors they picked, and admins. */
export const MAX_PICKUP_EDITORS = 10;
export function pickupEditors(p: { editor_ids?: string | null }): string[] {
  try {
    const v = p.editor_ids ? JSON.parse(p.editor_ids) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function canEditPickup(p: { created_by_person?: string | null; editor_ids?: string | null; is_sample?: number }, level: Level, meId: string | null) {
  if (level === 'admin') return true;
  if (!meId) return false;
  return p.created_by_person === meId || pickupEditors(p).includes(meId);
}
/** Only whoever added it (and admins) choose the editors. */
export function canChoosePickupEditors(p: { created_by_person?: string | null }, level: Level, meId: string | null) {
  return level === 'admin' || (!!meId && p.created_by_person === meId);
}
