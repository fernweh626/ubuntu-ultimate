import { COUNTRY, countryOfRegion, REGIONS } from '@/content/countries';
import { joinPhone, splitPhone } from '@/domain/phone';
import { internationalDigits, whatsappLink } from '@/domain/standing';
import { deadlineLabel } from '@/domain/yearly';
const ok = (n: string, c: boolean, x: unknown = '') => console.log(c ? 'ok  ' : 'FAIL', n, c ? '' : JSON.stringify(x).slice(0, 300));
ok('South Africa is the app country', COUNTRY.code === 'ZA' && COUNTRY.nationalBody.short === 'SAFDA' && COUNTRY.dial === '27');
ok('every region knows its country', REGIONS.length === 4 && REGIONS.every((r) => r.country === 'ZA') && countryOfRegion('kzn').code === 'ZA');
ok('deadline from settings', deadlineLabel === '20 January');
ok('local SA number → +27', internationalDigits('082 123 4567') === '27821234567');
ok('international numbers kept', internationalDigits('+263 77 123 4567') === '263771234567' && internationalDigits('0044 7700 900123') === '447700900123');
ok('WhatsApp link for a Zimbabwe number', whatsappLink('+263 77 123 4567') === 'https://wa.me/263771234567');
ok('stored form', joinPhone('27', '082 123 4567') === '+27 82 123 4567' && joinPhone('263', '77 123 4567') === '+263 77 123 4567' && joinPhone('27', '') === '');
const s1 = splitPhone('+263 77 123 4567'),
  s2 = splitPhone('082 123 4567'),
  s3 = splitPhone('+1 555 0100');
ok('split: Zimbabwe, old local SA, US', s1.dial === '263' && s1.local === '77 123 4567' && s2.dial === '27' && s2.local === '082 123 4567' && s3.dial === '1' && s3.local === '555 0100', [s1, s2, s3]);
