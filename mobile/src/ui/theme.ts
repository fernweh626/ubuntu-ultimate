// One light theme on purpose: the app is used outdoors in bright sun, so contrast beats a dark mode.
export const colors = {
  bg: '#F6F7F4',
  surface: '#FFFFFF',
  ink: '#14181A',
  muted: '#5A615C',
  faint: '#8B918C',
  border: '#DADDD6',
  divider: '#E6E8E3',
  brand: '#1F6B4A',
  brandDark: '#164E36',
  brandTint: '#E7EFE9',
  warn: '#E8A33D',
  warnInk: '#8A4B08',
  warnTint: '#FDF0DC',
  danger: '#B42318',
  dangerTint: '#FBE9E7',
  night: '#14181A',
  nightRaised: '#2A3033',
  nightMuted: '#C9CDC5',
  neutralTint: '#F1F2EE',
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
