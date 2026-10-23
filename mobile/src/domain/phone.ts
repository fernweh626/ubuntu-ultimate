import { COUNTRY, DIAL_CODES } from '@/content/countries';

/** Split a stored number ("+263 77 123 4567", or an old local "082…") into country code and the rest. */
export function splitPhone(value: string | null | undefined) {
  const v = (value ?? '').trim();
  if (v.startsWith('+')) {
    const digits = v.slice(1).replace(/\D/g, '');
    const known = [...DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial));
    const dial = known?.dial ?? digits.slice(0, 3);
    return { dial, local: v.slice(1).trim().slice(dial.length).trim() };
  }
  return { dial: COUNTRY.dial, local: v };
}

/** Stored form: "+27 82 123 4567" (a leading 0 on the local part is dropped). */
export function joinPhone(dial: string, local: string) {
  const l = local.trim().replace(/^0+/, '');
  return l ? `+${dial} ${l}` : '';
}
