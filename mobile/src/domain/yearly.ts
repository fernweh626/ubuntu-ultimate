import { COUNTRY } from '@/content/countries';

/*
 * The yearly admin deadline (from the country settings; South Africa: 20 January): coordinators send
 * their region's new registration form, fees and merch links to the admins; admins update the app
 * before fees open. The window runs from 1 December to the deadline.
 */
const D = COUNTRY.infoDeadline;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const deadlineLabel = `${D.day} ${MONTHS[D.month]}`;
const feesLabel = `${COUNTRY.feesOpen.day} ${MONTHS[COUNTRY.feesOpen.month]}`;

/** The season the window is for (the January it ends in), or null outside the window. */
export function yearlyInfoSeason(now: Date) {
  const m = now.getMonth();
  if (m === 11) return now.getFullYear() + 1;
  if (m < D.month || (m === D.month && now.getDate() <= D.day)) return now.getFullYear();
  return null;
}

/** Reminder times for a season: 1 December, every Monday until the deadline, and two days before it. */
export function yearlyInfoReminders(season: number) {
  const out: Date[] = [new Date(season - 1, 11, 1, 9, 0, 0, 0)];
  for (let d = new Date(season - 1, 11, 2, 9, 0, 0, 0); d <= new Date(season, D.month, D.day, 9); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9)) {
    if (d.getDay() === 1) out.push(d);
  }
  out.push(new Date(season, D.month, D.day - 2, 9, 0, 0, 0));
  return out.sort((a, b) => a.getTime() - b.getTime()).filter((d, i, a) => i === 0 || d.getTime() !== a[i - 1].getTime());
}

export function yearlyInfoText(season: number, level: 'admin' | 'coordinator') {
  return level === 'admin'
    ? { title: `Update the ${season} forms & payment links by ${deadlineLabel}`, body: `Coordinators send you their region’s registration form, fees and merch links. Update them in Me → Admin before fees open on ${feesLabel}.` }
    : { title: `Send your ${season} registration info by ${deadlineLabel}`, body: `Email or WhatsApp the admins your region’s new registration form, fee amounts and merch links, so the app is ready before fees open on ${feesLabel}.` };
}
