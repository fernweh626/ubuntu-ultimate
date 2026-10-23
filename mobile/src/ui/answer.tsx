import { useState } from 'react';
import { View } from 'react-native';

import { Button, Choice, Field, Sheet, T } from './components';
import { space } from './theme';

export type Answer = 'yes' | 'late' | 'no';

const LATE = ['10 min', '20 min', '30 min', 'An hour+'];

/**
 * Going / Late / Can't, used for practices and games. Late and Can't ask for an optional note
 * ("20 min", "work") that staff see. Tapping your current answer clears it.
 */
export function AnswerButtons({
  value,
  onAnswer,
  yesLabel = 'Going',
  noLabel = 'Can’t make it',
  compact,
}: {
  value: Answer | null;
  onAnswer: (a: Answer | null, note: string | null) => void;
  yesLabel?: string;
  noLabel?: string;
  compact?: boolean;
}) {
  const [asking, setAsking] = useState<null | 'late' | 'no'>(null);
  const [note, setNote] = useState('');
  const h = compact ? { minHeight: 40, paddingHorizontal: 6 } : {};
  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label={yesLabel} icon="check" kind={value === 'yes' ? 'primary' : 'secondary'} onPress={() => onAnswer(value === 'yes' ? null : 'yes', null)} style={{ flex: 1.1, ...h }} />
        <Button
          label="Late"
          icon="clock-outline"
          kind={value === 'late' ? 'dark' : 'secondary'}
          onPress={() => {
            if (value === 'late') return onAnswer(null, null);
            setNote('');
            setAsking('late');
          }}
          style={{ flex: 0.9, ...h }}
        />
        <Button
          label={compact ? 'Can’t' : noLabel}
          icon="close"
          kind={value === 'no' ? 'danger' : 'secondary'}
          onPress={() => {
            if (value === 'no') return onAnswer(null, null);
            setNote('');
            setAsking('no');
          }}
          style={{ flex: 1.1, ...h }}
        />
      </View>
      <Sheet visible={!!asking} onClose={() => setAsking(null)} title={asking === 'late' ? 'How late will you be?' : noLabel}>
        {asking === 'late' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {LATE.map((l) => (
              <Choice key={l} label={l} selected={note === l} onPress={() => setNote(l)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
            ))}
          </View>
        ) : null}
        <Field
          label={asking === 'late' ? 'Or a note (optional)' : 'Reason (optional, only staff see it)'}
          value={note}
          onChangeText={setNote}
          placeholder={asking === 'late' ? 'Stuck at work, there by 18:30' : 'Work, injury, away…'}
        />
        <T v="small">{asking === 'late' ? 'You still count as coming.' : 'Thanks for letting them know.'}</T>
        <Button
          label="Send"
          kind="primary"
          onPress={() => {
            const a = asking!;
            setAsking(null);
            onAnswer(a, note.trim() || null);
          }}
        />
      </Sheet>
    </>
  );
}
