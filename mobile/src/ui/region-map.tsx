import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

import { REGIONS } from '@/content/hub';
import { PROVINCES, REGION_LABEL_AT, SA_MAP } from '@/content/sa-map';

import { Button, Choice, T } from './components';
import { colors, font, space } from './theme';

const IDLE = '#D3DAE4';
const IDLE_ALL = '#E7B39B';
const PAD = 10;
const VB_W = SA_MAP.width + PAD * 2;

// Short names on the map itself (SAFDA's), with the area underneath.
const MAP_LABEL: Record<string, [string, string]> = {
  western: ['Western', 'CTFDA'],
  northern: ['Northern', 'GFDA'],
  kzn: ['Eastern', 'KZN'],
  'eastern-cape': ['Southern', 'EC'],
};

// Province outlines as point lists, for working out which region a tap landed in.
const SHAPES = PROVINCES.map((p) => ({
  region: p.region,
  pts: p.d
    .replace(/[MZ]/g, '')
    .split('L')
    .map((xy) => xy.trim().split(' ').map(Number) as [number, number]),
}));

function inside([x, y]: [number, number], pts: [number, number][]) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Tap a region on the map of South Africa (provinces grouped as SAFDA's four regions), or pick
 * All of SA. The chips underneath do the same for screen readers and small fingers.
 */
export function RegionMap({ value, onChange }: { value: string | null; onChange: (region: string | null) => void }) {
  const [width, setWidth] = useState(0);
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  const all = value == null;
  const fill = (region: string) => (value === region ? colors.brand : all ? IDLE_ALL : IDLE);

  function pick(localX: number, localY: number, w: number) {
    const k = VB_W / w;
    const hit = SHAPES.find((s) => inside([localX * k - PAD, localY * k - PAD], s.pts));
    if (hit) onChange(hit.region);
  }

  function tap(e: GestureResponderEvent) {
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    // Phones report the tap within the map; the web version only gives page coordinates.
    if (locationX != null && locationY != null && width) return pick(locationX, locationY, width);
    ref.current?.measureInWindow((x, y, w) => pick(pageX - x, pageY - y, w));
  }

  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        ref={ref}
        onPress={tap}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Map of South Africa's regions. Use the buttons below to choose."
        style={{ width: '100%', aspectRatio: VB_W / (SA_MAP.height + PAD * 2) }}>
        {/* The drawing ignores touches; the Pressable around it works out which region was tapped. */}
        <View pointerEvents="none" style={{ flex: 1 }}>
          <Svg width="100%" height="100%" viewBox={`${-PAD} ${-PAD} ${VB_W} ${SA_MAP.height + PAD * 2}`}>
            {PROVINCES.map((p, i) => (
              <Path key={i} d={p.d} fill={fill(p.region)} stroke="#FFFFFF" strokeWidth={value === p.region ? 3 : 4} strokeLinejoin="round" />
            ))}
            {REGIONS.map((r) => {
              const at = REGION_LABEL_AT[r.code];
              const [name, sub] = MAP_LABEL[r.code] ?? [r.name, r.body];
              if (!at) return null;
              const x = Math.min(Math.max(at.x, 110), SA_MAP.width - 80);
              // Each label is drawn twice: a thick white outline first, then the text, so it reads on any colour.
              return (
                <G key={r.code}>
                  {[true, false].map((halo) => (
                    <G key={String(halo)}>
                      <SvgText x={x} y={at.y} fontSize={46} fontFamily={font.bold} fontWeight="700" textAnchor="middle" fill={halo ? 'none' : colors.night} stroke={halo ? '#FFFFFF' : 'none'} strokeWidth={halo ? 10 : 0} strokeLinejoin="round">
                        {name}
                      </SvgText>
                      <SvgText x={x} y={at.y + 40} fontSize={30} fontFamily={font.semibold} textAnchor="middle" fill={halo ? 'none' : colors.muted} stroke={halo ? '#FFFFFF' : 'none'} strokeWidth={halo ? 8 : 0} strokeLinejoin="round">
                        {sub}
                      </SvgText>
                    </G>
                  ))}
                </G>
              );
            })}
          </Svg>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {REGIONS.map((r) => (
          <Choice key={r.code} label={r.name} selected={value === r.code} onPress={() => onChange(r.code)} style={{ minHeight: 40, paddingHorizontal: 12 }} />
        ))}
      </View>
      <Button label="All of SA" icon="earth" kind={all ? 'primary' : 'secondary'} onPress={() => onChange(null)} />
      <T v="small">{all ? 'Showing all of South Africa everywhere.' : (REGIONS.find((r) => r.code === value)?.area ?? '')}</T>
    </View>
  );
}
