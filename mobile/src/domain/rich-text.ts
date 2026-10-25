/*
 * Formatting in text boxes: a small, safe subset of Markdown that reads fine as plain text too.
 *   **bold**   _italic_   - bullet   [words](https://link)   and bare https:// links
 */

export type Span = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type Block = { bullet: boolean; spans: Span[] };

const INLINE = /\*\*(.+?)\*\*|(?<![\w*])_(.+?)_(?!\w)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g;

function inline(line: string, style: Omit<Span, 'text'> = {}): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    if (m.index! > last) out.push({ text: line.slice(last, m.index), ...style });
    if (m[1] !== undefined) out.push(...inline(m[1], { ...style, bold: true }));
    else if (m[2] !== undefined) out.push(...inline(m[2], { ...style, italic: true }));
    else if (m[3] !== undefined) out.push({ text: m[3], ...style, href: m[4] });
    else out.push({ text: m[5], ...style, href: m[5] });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), ...style });
  return out;
}

export function parseRich(text: string | null | undefined): Block[] {
  if (!text) return [];
  return text.split('\n').map((line) => {
    const b = /^\s*[-•*]\s+(.*)$/.exec(line);
    return { bullet: !!b, spans: inline(b ? b[1] : line) };
  });
}

/** The same text without the formatting marks, for previews and notifications. */
export function plainText(text: string | null | undefined) {
  return parseRich(text)
    .map((b) => (b.bullet ? '• ' : '') + b.spans.map((s) => s.text).join(''))
    .join('\n');
}

export type Edit = { value: string; start: number; end: number };

/** Toolbar actions: wrap the selection (or insert a placeholder), keeping the cursor sensible. */
export function applyFormat(value: string, sel: { start: number; end: number }, kind: 'bold' | 'italic' | 'bullet' | 'link'): Edit {
  const { start, end } = sel;
  const picked = value.slice(start, end);
  if (kind === 'bullet') {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndRaw = value.indexOf('\n', end);
    const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const all = lines.every((l) => /^\s*[-•]\s/.test(l));
    const next = lines.map((l) => (all ? l.replace(/^\s*[-•]\s/, '') : `- ${l}`)).join('\n');
    const v = value.slice(0, lineStart) + next + value.slice(lineEnd);
    return { value: v, start: lineStart + next.length, end: lineStart + next.length };
  }
  if (kind === 'link') {
    const label = picked || 'link text';
    const ins = `[${label}](https://)`;
    const v = value.slice(0, start) + ins + value.slice(end);
    const at = start + label.length + 3 + 'https://'.length;
    return { value: v, start: at, end: at };
  }
  const mark = kind === 'bold' ? '**' : '_';
  const inner = picked || (kind === 'bold' ? 'bold' : 'italic');
  const v = value.slice(0, start) + mark + inner + mark + value.slice(end);
  return { value: v, start: start + mark.length, end: start + mark.length + inner.length };
}
