import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useData } from '@/db/live';
import { getMe } from '@/db/repo';
import { initials, shortName } from '@/domain/format';

import { Icon } from './components';
import { colors, font } from './theme';

/** Top-right account shortcut on every main tab: your initials, or a person icon until you've said who you are. */
export function MeButton() {
  const me = useData(getMe);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={me ? `My account, ${shortName(me)}` : 'My account'}
      onPress={() => router.push('/me')}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: me ? colors.brand : colors.surface,
        borderWidth: me ? 0 : 1,
        borderColor: colors.border,
        opacity: pressed ? 0.75 : 1,
      })}>
      {me ? (
        <Text style={{ fontFamily: font.bold, fontSize: 16, color: '#fff' }}>{initials(`${me.first_name} ${me.last_name}`)}</Text>
      ) : (
        <Icon name="account-outline" color={colors.ink} />
      )}
    </Pressable>
  );
}
