import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ARTICLES, GUIDE, SHOTS, searchGuide, type Article } from '@/content/guide';
import { Button, Chip, EmptyState, Icon, Screen, T } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/**
 * Help & how-to: every feature, why it's there and how to use it. Articles open like Notion
 * toggles; /guide?topic=<id> opens one directly (e.g. from the privacy screen).
 */
export default function Guide() {
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(topic ? [topic] : []));
  const found = searchGuide(q);
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set([...o, id])));
  const linked = topic ? ARTICLES.find((a) => a.id === topic) : null;

  return (
    <>
      <Stack.Screen options={{ title: 'Help & how-to' }} />
      <Screen edges={[]}>
        <T>Everything the app does, why it’s there, and how to use it. Tap a question to open it.</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
          <Icon name="magnify" color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search, e.g. hat, fitness, delete my data"
            placeholderTextColor={colors.faint}
            style={{ flex: 1, minHeight: 48, fontFamily: font.regular, fontSize: 16, color: colors.ink }}
          />
        </View>

        {q.trim() ? (
          found.length ? (
            <View style={{ gap: space.sm }}>
              {found.map((a) => (
                <Toggle key={a.id} a={a} open={open.has(a.id)} onToggle={() => toggle(a.id)} />
              ))}
            </View>
          ) : (
            <EmptyState icon="text-search" title="Nothing found" body="Try another word, or ask us: More → Report a bug or suggest an idea." />
          )
        ) : (
          <>
            {linked ? <Toggle a={linked} open={open.has(linked.id)} onToggle={() => toggle(linked.id)} /> : null}
            {GUIDE.map((s) => (
              <View key={s.id} style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
                  <Icon name={s.icon} color={colors.brand} />
                  <T v="title">{s.title}</T>
                </View>
                {s.articles.map((a) => (a.id === linked?.id ? null : <Toggle key={a.id} a={a} open={open.has(a.id)} onToggle={() => toggle(a.id)} />))}
              </View>
            ))}
          </>
        )}
      </Screen>
    </>
  );
}

/** One question: a row with a turning arrow; open, it shows why, the steps, tips and a screenshot. */
function Toggle({ a, open, onToggle }: { a: Article; open: boolean; onToggle: () => void }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: open ? colors.brand : colors.border, overflow: 'hidden' }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, minHeight: 52 }}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} color={open ? colors.brand : colors.muted} size={22} />
        <T v="bodyStrong" style={{ flex: 1 }}>
          {a.title}
        </T>
        {a.who ? <Chip label={a.who} tone="neutral" /> : null}
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, gap: space.md }}>
          <View style={{ backgroundColor: colors.brandTint, borderRadius: 10, padding: space.md, gap: 4 }}>
            <T style={{ fontFamily: font.bold, fontSize: 12, letterSpacing: 1, color: colors.brandDark }}>WHY IT’S THERE</T>
            <T>{a.why}</T>
          </View>
          {a.steps?.length ? (
            <View style={{ gap: space.sm }}>
              {a.steps.map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <T style={{ color: '#fff', fontFamily: font.bold, fontSize: 13 }}>{i + 1}</T>
                  </View>
                  <T style={{ flex: 1 }}>{step}</T>
                </View>
              ))}
            </View>
          ) : null}
          {a.tips?.map((tip) => (
            <View key={tip} style={{ flexDirection: 'row', gap: space.sm }}>
              <Icon name="lightbulb-on-outline" color={colors.warnInk} size={20} />
              <T v="small" style={{ flex: 1, color: colors.ink }}>
                {tip}
              </T>
            </View>
          ))}
          {a.shot ? (
            <Image
              source={SHOTS[a.shot]}
              contentFit="contain"
              accessibilityLabel={`Screenshot: ${a.title}`}
              style={{ width: '100%', maxWidth: 300, aspectRatio: 390 / 760, alignSelf: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
            />
          ) : null}
          {a.open ? <Button label={a.open.label} icon="arrow-right" kind="primary" onPress={() => router.push(a.open!.href)} /> : null}
        </View>
      ) : null}
    </View>
  );
}
