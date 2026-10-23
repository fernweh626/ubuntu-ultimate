import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { maskDmy } from '@/domain/format';
import { ratioCode, ratioSlot } from '@/domain/rules';

import { colors, DEFAULT_TEAM_COLOR, font, radius, space, TOUCH } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

type Variant = 'body' | 'bodyStrong' | 'small' | 'smallStrong' | 'label' | 'title' | 'heading' | 'display';

const textStyles: Record<Variant, TextStyle> = {
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: colors.ink },
  bodyStrong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: colors.ink },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: colors.muted },
  smallStrong: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19, color: colors.ink },
  label: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, color: colors.ink },
  heading: { fontFamily: font.bold, fontSize: 26, lineHeight: 32, color: colors.ink },
  display: { fontFamily: font.display, fontSize: 44, lineHeight: 48, color: colors.ink },
};

export function T({ v = 'body', style, ...rest }: TextProps & { v?: Variant }) {
  return <RNText style={[textStyles[v], style]} {...rest} />;
}

/** Scrollable page with safe-area padding. `header` stays fixed above the scroll area. */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  padded = true,
  edges = ['top'],
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.padded, { gap: space.lg, paddingBottom: space.xxl * 2 }, WIDE]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.padded, WIDE]}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.screen, Platform.OS === 'web' && edges.includes('top') && { paddingTop: WEB_TAB_BAR }]} edges={edges}>
      {header}
      <View style={{ flex: 1 }}>{body}</View>
      {footer ? <View style={WIDE}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** On web the tab bar floats over the top of tab pages (screens with a top edge); leave it room. */
const WEB_TAB_BAR = 72;

/** On a computer screen, keep pages at a readable width in the middle instead of edge to edge. */
const WIDE = Platform.OS === 'web' ? ({ width: '100%', maxWidth: 820, alignSelf: 'center' } as const) : undefined;

export function Footer({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>{children}</View>;
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
      <View style={{ flex: 1 }}>
        <T v="heading">{title}</T>
        {subtitle ? <T v="small">{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.neutralTint }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
        <T v="label">{title}</T>
        {action}
      </View>
      {children}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';

export function Button({
  label,
  onPress,
  kind = 'secondary',
  icon,
  disabled,
  big,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const palette: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.brand, fg: '#fff', border: colors.brand },
    secondary: { bg: colors.surface, fg: colors.ink, border: '#C9CDC5' },
    ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
    danger: { bg: colors.surface, fg: colors.danger, border: '#E8B4AE' },
    dark: { bg: colors.nightRaised, fg: '#fff', border: colors.nightRaised },
  };
  const p = palette[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: p.bg, borderColor: p.border, minHeight: big ? 64 : TOUCH },
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      {icon ? <Icon name={icon} size={big ? 24 : 20} color={p.fg} /> : null}
      {label ? (
        <RNText style={{ fontFamily: font.semibold, fontSize: big ? 20 : 16, color: p.fg, letterSpacing: big ? 0.5 : 0 }}>
          {label}
        </RNText>
      ) : null}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color = colors.ink,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.neutralTint }]}>
      <Icon name={icon} color={color} />
    </Pressable>
  );
}

export function Chip({
  label,
  tone = 'brand',
  icon,
}: {
  label: string;
  tone?: 'brand' | 'neutral' | 'warn' | 'danger' | 'dark';
  icon?: IconName;
}) {
  const tones = {
    brand: [colors.brandTint, colors.brandDark],
    neutral: [colors.neutralTint, colors.ink],
    warn: [colors.warnTint, colors.warnInk],
    danger: [colors.dangerTint, colors.danger],
    dark: [colors.nightRaised, '#fff'],
  } as const;
  const [bg, fg] = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <RNText style={{ fontFamily: font.semibold, fontSize: 13, color: fg }}>{label}</RNText>
    </View>
  );
}

/**
 * ABBA ratio for a point as F1/F2/M1/M2 (raspberry for female, teal for male). Icon + words, never colour alone.
 * `compact` is for tight rows (point-by-point log); the full badge is for scoring screens.
 */
export function RatioBadge({ ratio, point, compact, onDark }: { ratio: string | null; point: number; compact?: boolean; onDark?: boolean }) {
  if (ratio !== 'W' && ratio !== 'M') return null;
  const women = ratio === 'W';
  const code = ratioCode(ratio, point);
  const slot = ratioSlot(point);
  const bg = women ? colors.femaleTint : colors.maleTint;
  const fg = women ? colors.female : colors.male;
  return (
    <View
      accessibilityLabel={`${code}: ${women ? 'female' : 'male'} point ${slot}, ${women ? 'four female matching and three male matching players' : 'four male matching and three female matching players'}`}
      style={[
        styles.chip,
        { backgroundColor: onDark ? fg : bg, gap: 6, paddingVertical: compact ? 2 : 6, paddingHorizontal: compact ? 8 : 12 },
      ]}>
      <Icon name={women ? 'gender-female' : 'gender-male'} size={compact ? 14 : 20} color={onDark ? '#fff' : fg} />
      <RNText style={{ fontFamily: font.bold, fontSize: compact ? 12 : 15, color: onDark ? '#fff' : fg }}>
        {compact ? code : `${code} · ${women ? 'female' : 'male'} point ${slot}${slot === 2 ? ' · switches next' : ''}`}
      </RNText>
    </View>
  );
}

/** Selectable pill/tile used for choices: segmented controls, player pickers, filters. */
export function Choice({
  label,
  sublabel,
  selected,
  onPress,
  style,
  dashed,
  tall,
  dot,
}: {
  label: string;
  sublabel?: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  dashed?: boolean;
  tall?: boolean;
  dot?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        tall && { minHeight: 60 },
        selected && styles.choiceOn,
        dashed && { borderStyle: 'dashed' },
        pressed && !selected && { backgroundColor: colors.neutralTint },
        style,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : null}
        <RNText
          numberOfLines={1}
          style={{ fontFamily: font.semibold, fontSize: tall ? 17 : 15, color: selected ? colors.brandDark : colors.ink }}>
          {label}
        </RNText>
      </View>
      {sublabel ? (
        <RNText numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12, color: colors.muted }}>
          {sublabel}
        </RNText>
      ) : null}
    </Pressable>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {options.map((o) => (
        <Choice key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} style={{ flex: 1 }} />
      ))}
    </View>
  );
}

/** Equal-width cells laid out in rows of `columns`. */
export function Grid({ children, columns = 2, gap = space.sm }: { children: ReactNode[]; columns?: number; gap?: number }) {
  const rows: ReactNode[][] = [];
  children.forEach((child, i) => {
    if (i % columns === 0) rows.push([]);
    rows[rows.length - 1].push(child);
  });
  return (
    <View style={{ gap }}>
      {rows.map((cells, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {cells.map((cell, c) => (
            <View key={c} style={{ flex: 1 }}>
              {cell}
            </View>
          ))}
          {Array.from({ length: columns - cells.length }, (_, k) => (
            <View key={`pad-${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron = !!onPress,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T v="small" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" color={colors.faint} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.neutralTint }]}>
      {content}
    </Pressable>
  );
}

export function StatTile({ value, label, tone }: { value: string | number; label: string; tone?: 'brand' | 'warn' }) {
  return (
    <View style={[styles.tile, tone === 'brand' && { backgroundColor: colors.brandTint, borderColor: colors.brandTint }]}>
      <RNText style={{ fontFamily: font.display, fontSize: 28, lineHeight: 32, color: colors.ink }}>{value}</RNText>
      <RNText style={{ fontFamily: font.medium, fontSize: 12, color: colors.muted, textAlign: 'center' }}>{label}</RNText>
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={36} color={colors.faint} />
      <T v="bodyStrong" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {body ? (
        <T v="small" style={{ textAlign: 'center' }}>
          {body}
        </T>
      ) : null}
      {action}
    </View>
  );
}

export function TeamSwatch({ color, size = 'md' }: { color?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: [8, 20], md: [10, 28], lg: [14, 40] }[size];
  return <View style={{ width: dims[0], height: dims[1], borderRadius: 3, backgroundColor: color || DEFAULT_TEAM_COLOR }} />;
}

export function Field({
  label,
  hint,
  ...input
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="smallStrong">{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        {...input}
        style={[styles.input, input.multiline && { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }]}
      />
      {hint ? <T v="small">{hint}</T> : null}
    </View>
  );
}

/** dd/mm/yyyy text field: digits only, slashes added as you type. Convert with dmyToIso on save. */
export function DateField({
  label,
  value,
  onChangeText,
  hint,
  placeholder = 'dd/mm/yyyy',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <Field
      label={label}
      value={value}
      onChangeText={(t) => onChangeText(maskDmy(t))}
      placeholder={placeholder}
      keyboardType="number-pad"
      maxLength={10}
      hint={hint}
    />
  );
}

/** Bottom sheet built on Modal: used for quick pickers mid-game so the scoring screen never navigates away. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
            <T v="title" style={{ flex: 1 }}>
              {title}
            </T>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.divider }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: space.lg, paddingTop: space.lg },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: space.lg,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  choice: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: '#C9CDC5',
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceOn: { borderWidth: 2.5, borderColor: colors.brand, backgroundColor: colors.brandTint },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 56,
    backgroundColor: colors.surface,
  },
  tile: {
    flex: 1,
    minWidth: 72,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    alignItems: 'center',
  },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: '#C9CDC5',
    borderRadius: 10,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    fontFamily: font.regular,
    fontSize: 16,
    color: colors.ink,
  },
  scrim: { flex: 1, backgroundColor: 'rgba(20,24,26,0.45)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    maxHeight: '85%',
  },
});
