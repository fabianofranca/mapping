// M3 of the "faithful Material 3" stage, group C: slider and segmented-button against what `Slider.kt`,
// `SegmentedButton.kt` and the token files (`SliderTokens`, `OutlinedSegmentedButtonTokens`) fix at
// commit 5113b82a. The expected colors come from the specialization tokens (light and dark); the geometry, from the
// Compose constants (dp = component px).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { compositeOver, expectComposite } from '../support/material3Composite';
import { drawIn, files, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const draw = (id: string, values: Values, mode: Mode = 'light'): Drawing =>
  drawIn(catalog, entryOf(id), values, mode);
const both = (id: string, values: Values) => ({
  light: draw(id, values, 'light'),
  dark: draw(id, values, 'dark'),
});

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Value of the specialization token in the mode (color or number). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | number | Record<Mode, string>;
  return typeof value === 'object' ? value[mode] : String(value);
};

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
/** Like `named`, but a segment that does not exist (width 0, EX6: the empty track is no longer hidden) does not count. */
const shown = (d: Drawing, name: string): SceneNode | undefined => {
  const node = named(d, name);
  return node !== undefined && boxOf(d, node).width > 1e-6 ? node : undefined;
};
const allNamed = (d: Drawing, name: string): SceneNode[] =>
  [...walk(d.root)].filter((n) => n.name === name && n.visible);
const boxes = (d: Drawing) => absoluteBoxes(d.root);
const boxOf = (d: Drawing, node: SceneNode) => boxes(d).get(node.id)!;
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`missing node: ${name}`);
  return { node, ...boxOf(d, node) };
};
const fillOf = (node: SceneNode | undefined): string | undefined =>
  solid(node?.fills ?? []);
const strokeOf = (node: SceneNode | undefined): string | undefined =>
  solid(node?.stroke?.paints ?? []);
const radiusOf = (node: SceneNode | undefined) =>
  node !== undefined && 'cornerRadius' in node ? node.cornerRadius : undefined;
const iconOf = (d: Drawing, name: string) => {
  const node = [...walk(d.root)].find((n) => n.name === name && n.visible);
  const path = node && [...walk(node)].find((n): n is PathNode => n.type === 'path');
  return { node, color: path === undefined ? undefined : solid(path.fills) };
};
const texts = (d: Drawing): TextNode[] =>
  [...walk(d.root)].filter((n): n is TextNode => n.type === 'text' && n.visible);

const near = (value: number | undefined, expected: number) =>
  expect(value).toBeCloseTo(expected, 3);

describe('M3 group C — slider', () => {
  const W = 328; // the component's size.width
  const T = W - 4; // track: the width minus half the thumb on each side (trackOffsetX = 2)
  const GAP = 8; // endGap = half the thumb (2) + ThumbTrackGapSize (6)

  it('single continuous: track of 16 (inactive secondary-container, active primary), 4 by 44 thumb and stop indicator', () => {
    const { light, dark } = both('slider', { type: 'single', value: '0.5' });
    expect([light.root.width, light.root.height]).toEqual([W, 48]);

    const active = box(light, 'trilho ativo');
    // SliderTokens.ActiveTrackHeight / InactiveTrackHeight = 16; track 2 from the edge, centered in the 44 of the strip, which is centered in the 48 (ME2): 2 + 14
    near(active.x, 2);
    near(active.y, 16);
    expect(active.height).toBe(16);
    // drawTrack: active goes from 0 to (value * track width) - endGap
    near(active.width, T * 0.5 - GAP);
    expect(fillOf(active.node)).toBe(tok('primary', 'light'));
    expect(fillOf(box(dark, 'trilho ativo').node)).toBe(tok('primary', 'dark'));

    const inactive = box(light, 'trilho inativo');
    near(inactive.x, 2 + T * 0.5 + GAP);
    near(inactive.width, T * 0.5 - GAP);
    expect(inactive.height).toBe(16);
    near(inactive.x + inactive.width, W - 2);
    expect(fillOf(inactive.node)).toBe(tok('secondary-container', 'light'));
    expect(fillOf(box(dark, 'trilho inativo').node)).toBe(
      tok('secondary-container', 'dark'),
    );

    // thumb: HandleWidth 4, HandleHeight 44, CornerFull shape, primary color; center at 2 + track width * value
    const thumb = box(light, 'alça');
    expect([thumb.width, thumb.height, thumb.y]).toEqual([4, 44, 2]);
    near(thumb.x, T * 0.5);
    expect(fillOf(thumb.node)).toBe(tok('primary', 'light'));
    expect(fillOf(box(dark, 'alça').node)).toBe(tok('primary', 'dark'));
    expect(radiusOf(thumb.node)).toBe(Number(tok('corner-full', 'light')));
    // the gap between the thumb and each segment is ThumbTrackGapSize = 6
    near(thumb.x - (active.x + active.width), 6);
    near(inactive.x - (thumb.x + thumb.width), 6);

    // corners: the outer is half the height (8), the inner is TrackInsideCornerSize (2)
    expect(radiusOf(active.node)).toEqual([8, 2, 2, 8]);
    expect(radiusOf(inactive.node)).toEqual([2, 8, 8, 2]);

    // stop indicator: circle of StopIndicatorSize 4 at 8 from the end of the track, in the active track color
    const stops = allNamed(light, 'marca').filter((n) => n.type === 'ellipse');
    const stop = stops.map((n) => ({ n, ...boxOf(light, n) })).at(-1)!;
    expect([stop.width, stop.height]).toEqual([4, 4]);
    near(stop.x + 2, 2 + T - 8);
    near(stop.y + 2, 24);
    expect(fillOf(stop.n)).toBe(tok('primary', 'light'));
  });

  it('the value (0 to 1) moves the thumb to 2 + value * track width and the empty segment disappears', () => {
    for (const value of [
      '0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '1',
    ]) {
      const f = Number(value);
      const d = draw('slider', { type: 'single', value });
      near(box(d, 'alça').x, T * f);
      const active = shown(d, 'trilho ativo');
      const inactive = shown(d, 'trilho inativo');
      if (f === 0) expect(active).toBeUndefined();
      else near(boxOf(d, active!).width, T * f - GAP);
      if (f === 1) expect(inactive).toBeUndefined();
      else {
        near(boxOf(d, inactive!).x, 2 + T * f + GAP);
        near(boxOf(d, inactive!).width, T * (1 - f) - GAP);
      }
    }
  });

  it('disabled (SliderTokens): thumb and active segment on-surface at 0.38, inactive segment at 0.12, composited over surface in an opaque color', () => {
    const { light, dark } = both('slider', {
      type: 'single',
      value: '0.5',
      enabled: 'false',
    });
    for (const [d, mode] of [
      [light, 'light'],
      [dark, 'dark'],
    ] as const) {
      const over = (alpha: string) =>
        compositeOver(
          tok('on-surface', mode),
          Number(tok(alpha, mode)),
          tok('surface', mode),
        );
      for (const name of ['alça', 'trilho ativo']) {
        const node = named(d, name)!;
        expectComposite(fillOf(node), over('state-disabled-content'));
        expect(node.opacity).toBe(1);
      }
      const inactive = named(d, 'trilho inativo')!;
      expectComposite(fillOf(inactive), over('state-disabled-container'));
      expect(inactive.opacity).toBe(1);
    }
  });

  it('range: two thumbs, active segment with inner corners of 2 and the outer segments with the outer corner of 8', () => {
    const { light, dark } = both('slider', {
      type: 'range',
      valueStart: '0.2',
      valueEnd: '0.8',
    });
    const [thumbA, thumbB] = allNamed(light, 'alça');
    near(boxOf(light, thumbA!).x, T * 0.2);
    near(boxOf(light, thumbB!).x, T * 0.8);

    const left = box(light, 'trilho inativo');
    near(left.x, 2);
    near(left.width, T * 0.2 - GAP);
    expect(radiusOf(left.node)).toEqual([8, 2, 2, 8]);

    const active = box(light, 'trilho ativo');
    near(active.x, 2 + T * 0.2 + GAP);
    near(active.width, T * 0.6 - 2 * GAP);
    expect(radiusOf(active.node)).toBe(2);
    expect(fillOf(active.node)).toBe(tok('primary', 'light'));
    expect(fillOf(box(dark, 'trilho ativo').node)).toBe(tok('primary', 'dark'));

    const [, right] = allNamed(light, 'trilho inativo').map((n) => ({
      n,
      ...boxOf(light, n),
    }));
    near(right!.x, 2 + T * 0.8 + GAP);
    near(right!.x + right!.width, W - 2);
    expect(radiusOf(right!.n)).toEqual([2, 8, 8, 2]);

    // the two stop indicators: 8 after the start and 8 before the end of the track
    const stops = allNamed(light, 'marca')
      .filter((n) => n.type === 'ellipse')
      .map((n) => boxOf(light, n).x + 2)
      .sort((a, b) => a - b);
    near(stops[0], 2 + 8);
    near(stops.at(-1), 2 + T - 8);
  });

  it('steps: the ticks sit at 8 + (width - 16) * k / (steps + 1), the thumb lands on one of them and the colors invert per segment', () => {
    const { light, dark } = both('slider', {
      type: 'single',
      value: '0.4',
      steps: 4,
    });
    for (const [d, mode] of [
      [light, 'light'],
      [dark, 'dark'],
    ] as const) {
      // Slider.kt: with steps, the thumb sits at (track width - 2 * 8) * value + 8
      const thumb = box(d, 'alça');
      near(thumb.x, (T - 16) * 0.4 + 8);
      const active = box(d, 'trilho ativo');
      near(active.x, 2);
      near(active.width, (T - 16) * 0.4 + 8 - GAP);
      const inactive = box(d, 'trilho inativo');
      near(inactive.x, 2 + (T - 16) * 0.4 + 8 + GAP);

      // what is seen at each point: the top tick, after applying the frames' clipping
      const centers = [0, 1, 2, 3, 4, 5].map((k) => 2 + 8 + ((T - 16) * k) / 5);
      const seen = centers.map((x) => dotColorAt(d, x));
      const sc = tok('secondary-container', mode);
      const p = tok('primary', mode);
      // activeTick = inactiveTrackColor, inactiveTick = activeTrackColor, the thumb's tick is skipped
      // (the thumb covers tick 2) and 5 is the stop indicator
      expect(seen[0]).toBe(sc);
      expect(seen[1]).toBe(sc);
      expect([seen[3], seen[4], seen[5]]).toEqual([p, p, p]);
      // outside those positions there is no tick
      expect(dotColorAt(d, 2 + 8 + (T - 16) * 0.1)).toBeUndefined();
    }
  });

  it('steps: at the first and last step the thumb goes to the end (full width), as in Slider.kt', () => {
    const first = draw('slider', { type: 'single', value: '0', steps: 4 });
    near(box(first, 'alça').x, 0);
    expect(shown(first, 'trilho ativo')).toBeUndefined();
    near(box(first, 'trilho inativo').x, 2 + GAP);
    const last = draw('slider', { type: 'single', value: '1', steps: 4 });
    near(box(last, 'alça').x, T);
    near(box(last, 'trilho ativo').width, T - GAP);
    expect(shown(last, 'trilho inativo')).toBeUndefined();
    // without the inactive segment there is no stop indicator
    expect(dotsOf(last).filter((dot) => dot.x > 300)).toEqual([]);
  });

  it('steps: 1, 2 and 9 steps draw steps + 2 tick positions, equally spaced (single and range), minus the one under the thumb', () => {
    for (const steps of [1, 2, 9]) {
      const positions = Array.from(
        { length: steps + 2 },
        (_, k) => 2 + 8 + ((T - 16) * k) / (steps + 1),
      );
      for (const values of [
        { type: 'single', value: '0.5', steps },
        { type: 'range', valueStart: '0.2', valueEnd: '0.8', steps },
      ]) {
        const d = draw('slider', values);
        // EX6: the tick that would fall under a thumb is not drawn (the thumb covered it)
        const thumbs = allNamed(d, 'alça').map((n) => boxOf(d, n).x + 2);
        const expected = positions.filter((p) =>
          thumbs.every((t) => Math.abs(t - p) > 0.01),
        );
        const xs = [...new Set(dotCenters(d).map((x) => x.toFixed(3)))]
          .map(Number)
          .sort((a, b) => a - b);
        expect(xs).toHaveLength(expected.length);
        expect(expected.length).toBeGreaterThan(steps - 1);
        xs.forEach((x, k) => near(x, expected[k]!));
      }
    }
  });

  it('without steps there are no ticks besides the stop indicators', () => {
    const xs = dotCenters(draw('slider', { type: 'single', value: '0.3' }));
    expect(xs).toHaveLength(1);
    near(xs[0], 2 + T - 8);
  });

  it('width: the track follows the rectangle (fill) keeping the thumb and gaps', () => {
    const entry = entryOf('slider');
    const wide = instantiateAt(entry, { type: 'single', value: '0.5' }, 500);
    near(box(wide, 'alça').x, (500 - 4) * 0.5);
    near(box(wide, 'trilho inativo').x + box(wide, 'trilho inativo').width, 498);
  });
});

/** Centers (absolute x) of the visible circles (after clipping) with a tick name. */
function dotCenters(d: Drawing): number[] {
  return dotsOf(d).map((dot) => dot.x + dot.width / 2);
}

interface Dot {
  readonly node: SceneNode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string | undefined;
}

/** Visible "marca" (tick) circles, in paint order, already discounting what a frame's clipping hides. */
function dotsOf(d: Drawing): Dot[] {
  const all = boxes(d);
  const out: Dot[] = [];
  const visit = (
    node: SceneNode,
    clips: { x: number; y: number; w: number; h: number }[],
  ) => {
    if (!node.visible) return;
    const b = all.get(node.id)!;
    if (node.name === 'marca' && node.type === 'ellipse') {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if (
        clips.every((c) => cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h)
      ) {
        out.push({ node, ...b, color: solid(node.fills) });
      }
    }
    if ('children' in node) {
      const next =
        node.type === 'frame' && node.clip
          ? [...clips, { x: b.x, y: b.y, w: b.width, h: b.height }]
          : clips;
      for (const child of node.children) visit(child, next);
    }
  };
  visit(d.root, []);
  return out;
}

/** The color of the tick on top at the point (center within 0.01), or `undefined` with no tick. */
function dotColorAt(d: Drawing, x: number): string | undefined {
  const here = dotsOf(d).filter((dot) => Math.abs(dot.x + dot.width / 2 - x) < 0.01);
  return here.at(-1)?.color;
}

function instantiateAt(
  entry: NonNullable<ReturnType<typeof findEntry>>,
  values: Values,
  width: number,
): Drawing {
  const sized = {
    ...entry,
    component: { ...entry.component!, size: { ...entry.component!.size, width } },
  };
  return drawIn(catalog, sized, values, 'light');
}

describe('M3 group C — segmented-button', () => {
  const W = 328;
  const option = (label: string, selected = 'false', icon = '') => ({
    label,
    icon,
    selected,
  });
  const three = [option('Day'), option('Week', 'true'), option('Month')];
  const segments = (d: Drawing) =>
    allNamed(d, 'segmento').map((n) => ({ n, ...boxOf(d, n) }));

  it('segments of equal width (repeat distribute fill) with 2, 3 and 4 options, height 40', () => {
    for (const count of [2, 3, 4]) {
      const options = Array.from({ length: count }, (_, i) =>
        option(`Option ${i + 1}`, i === 0 ? 'true' : 'false'),
      );
      const d = draw('segmented-button', { options, selection: 'single' });
      expect([d.root.width, d.root.height]).toEqual([W, 40]);
      const segs = segments(d);
      expect(segs).toHaveLength(count);
      const widths = segs.map((s) => s.width);
      widths.forEach((w) => near(w, widths[0]!));
      segs.forEach((s) => expect(s.height).toBe(40));
      // the segments touch and fill the whole row (the first advances 1 over the border, see the divider)
      segs.slice(1).forEach((s, i) => near(s.x, segs[i]!.x + segs[i]!.width));
      near(segs.at(-1)!.x + segs.at(-1)!.width, W);
      expect(segs[0]!.x).toBeLessThanOrEqual(0);
    }
  });

  it('selected: secondary-container, 18 check in on-secondary-container and 8 to the label; the others have no fill', () => {
    const { light, dark } = both('segmented-button', { options: three });
    for (const [d, mode] of [
      [light, 'light'],
      [dark, 'dark'],
    ] as const) {
      const [first, second, third] = segments(d);
      expect(fillOf(second!.n)).toBe(tok('secondary-container', mode));
      expect(first!.n.fills).toEqual([]);
      expect(third!.n.fills).toEqual([]);
      const check = iconOf(d, 'check');
      expect(check.color).toBe(tok('on-secondary-container', mode));
      const checkBox = boxOf(d, check.node!);
      expect([checkBox.width, checkBox.height]).toEqual([18, 18]);
      const labels = texts(d);
      const selectedLabel = labels.find((t) => t.text === 'Semana')!;
      expect(solid(selectedLabel.fills)).toBe(tok('on-secondary-container', mode));
      const other = labels.find((t) => t.text === 'Dia')!;
      expect(solid(other.fills)).toBe(tok('on-surface', mode));
      // SegmentedButtonContent: 18 icon, IconSpacing 8, label
      const labelBox = boxOf(d, selectedLabel);
      near(labelBox.x - (checkBox.x + checkBox.width), 8);
      // the icon + label group is centered in the segment (padding 12 on both sides)
      const mid = second!.x + second!.width / 2;
      near((checkBox.x + labelBox.x + labelBox.width) / 2, mid);
    }
  });

  it('label in label-large and, without an icon, centered in the segment', () => {
    const d = draw('segmented-button', { options: three });
    const dia = texts(d).find((t) => t.text === 'Dia')!;
    const style = dia.style;
    expect([
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ]).toEqual([14, 20, 500, 0.1]);
    const [first] = segments(d);
    const b = boxOf(d, dia);
    near(b.x + b.width / 2, first!.x + first!.width / 2);
    // with no icon in the column and unselected, there is no icon in the segment
    expect(iconOf(d, 'check').node).toBeDefined(); // the selected one's
    expect(allNamed(d, 'ícone').length + allNamed(d, 'check').length).toBe(1);
  });

  it('the icon column appears in the unselected segment; when selected the check replaces it', () => {
    const d = draw('segmented-button', {
      options: [option('House', 'false', 'Home'), option('Find', 'true', 'Search')],
    });
    const home = iconOf(d, 'home');
    expect(home.node).toBeDefined();
    expect(boxOf(d, home.node!).width).toBe(18);
    expect(home.color).toBe(tok('on-surface', 'light'));
    expect(iconOf(d, 'search').node).toBeUndefined();
    expect(iconOf(d, 'check').node).toBeDefined();
  });

  it('1 outline in outline in the full shape, 1 dividers between segments and full radius at the ends', () => {
    const { light, dark } = both('segmented-button', { options: three });
    for (const [d, mode] of [
      [light, 'light'],
      [dark, 'dark'],
    ] as const) {
      expect(radiusOf(d.root)).toBe(Number(tok('corner-full', mode)));
      const outline = named(d, 'contorno')!;
      expect(strokeOf(outline)).toBe(tok('outline', mode));
      expect(outline.stroke?.width).toBe(1);
      expect(radiusOf(outline)).toBe(Number(tok('corner-full', mode)));
      const b = boxOf(d, outline);
      expect([b.x, b.y, b.width, b.height]).toEqual([0, 0, W, 40]);
      // inside the box there is a divider at each boundary between segments
      const dividers = allNamed(d, 'divisor')
        .map((n) => ({ n, ...boxOf(d, n) }))
        .filter((r) => r.x > 0);
      const segs = segments(d);
      expect(dividers.map((r) => r.x)).toEqual(segs.slice(1).map((s) => s.x));
      dividers.forEach((r) => {
        expect([r.width, r.height]).toEqual([1, 40]);
        expect(fillOf(r.n)).toBe(tok('outline', mode));
      });
    }
  });

  it('disabled: outline and dividers outline at 0.12, icon and label on-surface at 0.38 and the selected one keeps its fill', () => {
    const { light, dark } = both('segmented-button', {
      options: three,
      enabled: 'false',
    });
    for (const [d, mode] of [
      [light, 'light'],
      [dark, 'dark'],
    ] as const) {
      const outline = named(d, 'contorno')!;
      expect(strokeOf(outline)).toBe(tok('outline', mode));
      expect(outline.opacity).toBe(Number(tok('state-disabled-container', mode)));
      for (const r of allNamed(d, 'divisor')) {
        expect(fillOf(r)).toBe(tok('outline', mode));
        expect(r.opacity).toBe(Number(tok('state-disabled-container', mode)));
      }
      // DisabledActiveContainerColor = SelectedContainerColor (no transparency)
      expect(fillOf(segments(d)[1]!.n)).toBe(tok('secondary-container', mode));
      expect(segments(d)[1]!.n.opacity).toBe(1);
      for (const t of texts(d)) {
        expect(solid(t.fills)).toBe(tok('on-surface', mode));
        expect(t.opacity).toBe(Number(tok('state-disabled-content', mode)));
      }
      const check = iconOf(d, 'check');
      expect(check.color).toBe(tok('on-surface', mode));
      expect(check.node!.opacity).toBe(Number(tok('state-disabled-content', mode)));
    }
  });

  it('the multi selector draws the same as the single one', () => {
    const single = draw('segmented-button', { options: three, selection: 'single' });
    const multi = draw('segmented-button', { options: three, selection: 'multi' });
    expect(segments(multi).map((s) => [s.x, s.width])).toEqual(
      segments(single).map((s) => [s.x, s.width]),
    );
  });
});
