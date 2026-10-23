/* Calendar entry kinds. Meetings (AGM, SGM, general) have times and an online link. */

export const KIND_LABEL: Record<string, string> = { agm: 'AGM', sgm: 'SGM', meeting: 'Meeting', tournament: 'Tournament', league: 'League', hat: 'Hat', camp: 'Camp', other: 'Other' };

export const isMeeting = (kind: string) => kind === 'agm' || kind === 'sgm' || kind === 'meeting';

/** ISO start of a meeting in local time (date + HH:MM), or null without a time. */
export function meetingStart(e: { start_date: string | null; start_time?: string | null }) {
  if (!e.start_date || !e.start_time) return null;
  const [h, m] = e.start_time.split(':').map(Number);
  const d = new Date(`${e.start_date.slice(0, 10)}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}
