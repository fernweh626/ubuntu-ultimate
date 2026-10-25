import { View } from 'react-native';

import { Icon, type IconName } from './components';
import { colors } from './theme';

export type ItemKind = 'game' | 'practice' | 'pickup' | 'hat' | 'meeting';

// Each kind gets its own icon and colour, so a glance down the left edge tells you what's what.
const KIND: Record<ItemKind, { icon: IconName; fg: string; bg: string; label: string }> = {
  game: { icon: 'whistle', fg: colors.brandDark, bg: colors.brandTint, label: 'Game' },
  practice: { icon: 'run', fg: colors.night, bg: colors.neutralTint, label: 'Practice' },
  pickup: { icon: 'account-group', fg: '#1E6B4F', bg: '#E3F2EC', label: 'Pickup' },
  hat: { icon: 'hat-fedora', fg: colors.warnInk, bg: colors.warnTint, label: 'Hat' },
  meeting: { icon: 'account-voice', fg: '#0E5E6F', bg: '#E1F1F4', label: 'Meeting' },
};

export function KindIcon({ kind, size = 36 }: { kind: ItemKind; size?: number }) {
  const k = KIND[kind];
  return (
    <View accessibilityLabel={k.label} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: k.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={k.icon} color={k.fg} size={Math.round(size * 0.55)} />
    </View>
  );
}
