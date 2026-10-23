import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { DIAL_CODES } from '@/content/countries';
import { joinPhone, splitPhone } from '@/domain/phone';

import { Choice, Field, Icon, Sheet, T } from './components';
import { colors, font, space } from './theme';

/**
 * Phone number with a country code: South Africa by default, any country allowed (not everyone has
 * a +27 WhatsApp). Stores "+<code> <number>".
 */
export function PhoneField({ label, value, onChange, hint, placeholder = '82 123 4567' }: { label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string }) {
  const { dial, local } = splitPhone(value);
  const [picking, setPicking] = useState(false);
  const [other, setOther] = useState('');
  return (
    <View style={{ gap: 6 }}>
      <T v="smallStrong">{label}</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Country code +${dial}. Change`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#C9CDC5', backgroundColor: colors.surface }}>
          <T style={{ fontFamily: font.semibold, fontSize: 16 }}>{DIAL_CODES.find((c) => c.dial === dial)?.label ?? `+${dial}`}</T>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        <TextInput
          value={local}
          onChangeText={(t) => onChange(joinPhone(dial, t))}
          keyboardType="phone-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          accessibilityLabel={label}
          style={{ flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#C9CDC5', backgroundColor: colors.surface, paddingHorizontal: space.md, fontFamily: font.regular, fontSize: 16, color: colors.ink }}
        />
      </View>
      {hint ? <T v="small">{hint}</T> : null}
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Country code">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {DIAL_CODES.map((c) => (
            <Choice
              key={c.dial}
              label={c.label}
              selected={c.dial === dial}
              onPress={() => {
                onChange(joinPhone(c.dial, local));
                setPicking(false);
              }}
              style={{ minHeight: 44, paddingHorizontal: 12 }}
            />
          ))}
        </View>
        <Field label="Another code" value={other} onChangeText={(t) => setOther(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="e.g. 351" />
        {other ? (
          <Choice
            label={`Use +${other}`}
            onPress={() => {
              onChange(joinPhone(other, local));
              setPicking(false);
              setOther('');
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
