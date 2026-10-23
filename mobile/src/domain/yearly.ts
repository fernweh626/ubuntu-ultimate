/*
 * The yearly admin deadline: coordinators send their region's new registration form, fees and merch
 * links to the admins by 20 January; admins update the app before fees open on 1 February.
 * The window runs from 1 December to 20 January.
 */

/** The season the window is for (the January it ends in), or null outside the window. */
export function yearlyInfoSeason(now: Date) {
  const m = now.getMonth();
  if (m === 11) return now.getFullYear() + 1;
  if (m === 0 && now.getDate() <= 20) return now.getFullYear();
  return null;
}

/** Reminder times for a season: 1 December, every Monday until 20 January, and 18 January. */
export function yearlyInfoReminders(season: number) {
  const out: Date[] = [new Date(season - 1, 11, 1, 9, 0, 0, 0)];
  for (let d = new Date(season - 1, 11, 2, 9, 0, 0, 0); d <= new Date(season, 0, 20, 9); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9)) {
    if (d.getDay() === 1) out.push(d);
  }
  out.push(new Date(season, 0, 18, 9, 0, 0, 0));
  return out.sort((a, b) => a.getTime() - b.getTime()).filter((d, i, a) => i === 0 || d.getTime() !== a[i - 1].getTime());
}

export function yearlyInfoText(season: number, level: 'admin' | 'coordinator') {
  return level === 'admin'
    ? { title: `Update the ${season} forms & payment links by 20 January`, body: 'Coordinators send you their region’s registration form, fees and merch links. Update them in Me → Admin before fees open on 1 February.' }
    : { title: `Send your ${season} registration info by 20 January`, body: 'Email or WhatsApp the admins your region’s new registration form, fee amounts and merch links, so the app is ready before fees open on 1 February.' };
}
