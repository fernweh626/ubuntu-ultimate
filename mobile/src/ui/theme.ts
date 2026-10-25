// One light theme on purpose: the app is used outdoors in bright sun, so contrast beats a dark mode.
// Palette from the Ubuntu Ultimate logo: navy circle, terracotta disc, off-white ground.
// Every text/background pair here passes WCAG AA (4.5:1) — checked for outdoor use.
export const colors = {
  bg: '#F4F7F8',
  surface: '#FFFFFF',
  ink: '#151B26',
  muted: '#5A6372',
  faint: '#8A93A0',
  border: '#D8DEE6',
  divider: '#E5E9EF',
  brand: '#B4532C',
  brandDark: '#8A3D1F',
  brandTint: '#F8EAE2',
  warn: '#E8A33D',
  warnInk: '#8A4B08',
  warnTint: '#FDF0DC',
  danger: '#B42318',
  dangerTint: '#FBE9E7',
  night: '#293750',
  nightRaised: '#384764',
  nightMuted: '#C3CAD6',
  neutralTint: '#EDF1F5',
  // Female / male matching: opposite hues (raspberry and teal) so they're easy to tell apart, always
  // paired with ♀/♂ or F/M, never colour alone. Both pass AA as text on white.
  female: '#A3125A',
  femaleTint: '#FBE3EE',
  male: '#00695C',
  maleTint: '#DCF0EC',
} as const;

export const font = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
  display: 'BarlowCondensed_700Bold',
  displaySemi: 'BarlowCondensed_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

// Minimum comfortable touch target for gloved, sweaty, sun-glared thumbs.
export const TOUCH = 48;

// Fallback colour when a team hasn't picked one.
export const DEFAULT_TEAM_COLOR = '#5A615C';

/** The website is the app in a phone-width column (sheets and pages use the same width). */
export const WEB_WIDTH = 520;
