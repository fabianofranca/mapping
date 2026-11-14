// M5 of the "faithful Material 3" stage, group B: tooltip, carousel, pull-to-refresh and swipe-to-dismiss against
// what `Tooltip.kt`, `Carousel.kt`, `PullToRefresh.kt`, `SwipeToDismissBox.kt`, `ListItem.kt` and the token files
// fix at commit 5113b82a. The expected colors come from the specialization tokens (light and dark);
// the geometry, from the Compose constants (dp = component px).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type {
  PathNode,
  SceneNode,
  Shadow,
  TextNode,
} from '../../src/model/components/scene';
import { drawIn, files, solid, spec, text } from '../support/material3Library';

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NAMES = {
  title: 'título',
  text: 'texto',
  actionButton: 'botão da ação',
  refreshingIndicator: 'indicador atualizando',
  pullingIndicator: 'indicador puxando',
  ring: 'anel',
  arrow: 'seta',
  restingItem: 'item em repouso',
  support: 'apoio',
  itemSlidStart: 'item deslizado para o início',
  itemSlidEnd: 'item deslizado para o fim',
  image: 'imagem',
  veil: 'véu',
} as const;

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const MODES: Mode[] = ['light', 'dark'];
const both = (id: string, values: Values) => ({
  light: drawIn(catalog, entryOf(id), values, 'light'),
  dark: drawIn(catalog, entryOf(id), values, 'dark'),
});

/** Draws in a box that is not the `size` one (the marking has the rectangle the person drew). */
function drawBox(
  id: string,
  values: Values,
  width: number,
  height: number,
  mode: Mode = 'light',
): Drawing {
  const entry = entryOf(id);
  const library = catalog.library!;
  return instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, width, height },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
}

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Value of the specialization token in the mode (color). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;
/** Checks the two shadows of the elevation level (point and ambient): y, blur, spread and color of the tokens. */
const expectElevation = (
  effects: readonly Shadow[],
  level: number,
  mode: Mode,
  where = '',
): void => {
  expect(effects, where).toHaveLength(2);
  for (const [i, kind] of (['point', 'ambient'] as const).entries()) {
    const shadow = effects[i];
    expect(shadow?.offset.y, `${where} ${kind}`).toBe(
      num(`elevation-${level}-${kind}-y`),
    );
    expect(shadow?.blur, `${where} ${kind}`).toBe(num(`elevation-${level}-${kind}-blur`));
    expect(shadow?.spread ?? 0, `${where} ${kind}`).toBe(
      num(`elevation-${level}-${kind}-spread`),
    );
    expect(shadow?.color, `${where} ${kind}`).toBe(tok(`elevation-${kind}-shadow`, mode));
  }
};
/** The alpha of a `#rrggbbaa` color (without the suffix, 1), rounded to the hundredth. */
const alphaOf = (color: string): number =>
  color.length === 9 ? Math.round((parseInt(color.slice(7), 16) / 255) * 100) / 100 : 1;

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const absOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`missing node: ${name}`);
  return { node, ...absOf(d, node) };
};
const fillOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.fills ?? []);
const radiusOf = (node: SceneNode | undefined) =>
  node !== undefined && 'cornerRadius' in node ? node.cornerRadius : undefined;
const textIn = (d: Drawing, name: string): TextNode | undefined => {
  const holder = named(d, name);
  if (holder === undefined) return undefined;
  return [...walk(holder)].find((n): n is TextNode => n.type === 'text' && n.visible);
};
const fontOf = (node: TextNode | undefined) =>
  node === undefined
    ? undefined
    : [
        node.style.fontSize,
        node.style.lineHeight,
        node.style.fontWeight,
        node.style.letterSpacing,
      ];
const scale = (name: string): number[] => [
  num(`${name}-size`),
  num(`${name}-line-height`),
  num(`${name}-weight`),
  num(`${name}-tracking`),
];
const numbers = (d: string): number[] =>
  [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe('M5 group B — tooltip', () => {
  const rich = (extra: Record<string, unknown> = {}): Values =>
    ({ style: 'rich', text: 'Turns off Wi-Fi.', ...extra }) as unknown as Values;

  it('plain: 24 pill in inverse-surface with extra-small shape, 8 × 4 padding and body-small text in inverse-on-surface', () => {
    for (const mode of MODES) {
      const d = both('tooltip', { style: 'plain', text: 'Add to favorites' })[mode];
      const plain = box(d, 'plain');
      expect([plain.x, plain.y, plain.height]).toEqual([0, 0, 24]);
      expect(radiusOf(plain.node)).toBe(num('corner-extra-small'));
      expect(fillOf(d, 'plain')).toBe(tok('inverse-surface', mode));
      const label = textIn(d, 'plain')!;
      expect(fontOf(label)).toEqual(scale('body-small'));
      expect(solid(label.fills)).toBe(tok('inverse-on-surface', mode));
      const at = absOf(d, label);
      expect([at.x, at.y]).toEqual([8, 4]);
      expect(plain.width).toBe(8 + at.width + 8);
      expect(named(d, 'rich')).toBeUndefined();
    }
  });

  it('plain: minimum width 40 (TooltipMinWidth) and maximum 200 (plainTooltipMaxWidth), with the text wrapping in lines of 16', () => {
    const short = drawBox('tooltip', { style: 'plain', text: 'Ok' }, 400, 100);
    expect(box(short, 'plain').width).toBe(40);
    expect(box(short, 'plain').height).toBe(24);
    const long = drawBox(
      'tooltip',
      {
        style: 'plain',
        text: 'A very long hint text that needs to wrap onto more than one line inside the tooltip',
      },
      400,
      100,
    );
    const plain = box(long, 'plain');
    expect(plain.width).toBe(200);
    expect((plain.height - 8) % 16).toBe(0);
    expect(plain.height).toBeGreaterThan(24);
    expect(textIn(long, 'plain')!.width).toBe(200 - 16);
  });

  it('rich: surface-container, medium shape (12), level 2 shadow and maximum width 320 (richTooltipMaxWidth)', () => {
    for (const mode of MODES) {
      const d = drawBox('tooltip', rich(), 400, 200, mode);
      const card = box(d, 'rich');
      expect(radiusOf(card.node)).toBe(num('corner-medium'));
      expect(fillOf(d, 'rich')).toBe(tok('surface-container', mode));
      expectElevation(card.node.effects, 2, mode);
      expect(card.width).toBe(320);
      expect(named(d, 'plain')).toBeUndefined();
    }
    expect(box(drawBox('tooltip', rich(), 240, 200), 'rich').width).toBe(240);
  });

  it('rich with text only: vertical padding 4 and horizontal 16, body-medium in on-surface-variant', () => {
    for (const mode of MODES) {
      const d = drawBox('tooltip', rich(), 240, 200, mode);
      expect(box(d, 'rich').height).toBe(4 + 20 + 4);
      const body = textIn(d, NAMES.text)!;
      expect(fontOf(body)).toEqual(scale('body-medium'));
      expect(solid(body.fills)).toBe(tok('on-surface-variant', mode));
      expect([absOf(d, body).x, absOf(d, body).y]).toEqual([16, 4]);
    }
  });

  it('rich with title: first baseline 28 from the top (HeightToSubheadFirstLine), text baseline 24 below the end of the title box (29 from the title baseline) and 16 of bottom', () => {
    for (const mode of MODES) {
      const d = drawBox('tooltip', rich({ title: 'Airplane mode' }), 240, 200, mode);
      const title = textIn(d, NAMES.title)!;
      expect(fontOf(title)).toEqual(scale('title-small'));
      expect(solid(title.fills)).toBe(tok('on-surface-variant', mode));
      // MC5 (#1033): the title box starts at the top and the first baseline stays at 28 (baselinePadding)
      expect([absOf(d, title).x, absOf(d, title).y, title.style.baselineTop]).toEqual([
        16, 0, 28,
      ]);
      // Compose puts the text baseline 24 below the END of the title box (TooltipTest.kt line 260,
      // `subheadBound.bottom + 24`), not 24 below the title baseline: 33 + 24 = 57
      const body = textIn(d, NAMES.text)!;
      expect(absOf(d, body).y + body.style.baselineTop!).toBeCloseTo(33 + 24, 6);
      // 13 + 20 + 9 + 20 + 16 (TextBottomPadding): 78, not the earlier 73
      expect(box(d, 'rich').height).toBe(78);
    }
  });

  it('rich with action: 40 TextButton with label-large in primary, 12 of room, 16 from the text and 8 from the bottom', () => {
    for (const mode of MODES) {
      const d = drawBox(
        'tooltip',
        rich({ title: 'Sync', action: 'Learn more' }),
        240,
        200,
        mode,
      );
      const button = box(d, NAMES.actionButton);
      expect([button.x, button.y, button.height]).toEqual([16, 78, 40]);
      const label = textIn(d, NAMES.actionButton)!;
      expect(fontOf(label)).toEqual(scale('label-large'));
      expect(solid(label.fills)).toBe(tok('primary', mode));
      expect(absOf(d, label).x).toBe(16 + 12);
      expect(button.width).toBe(12 + absOf(d, label).width + 12);
      // 78 + 40 + ActionLabelBottomPadding (8)
      expect(box(d, 'rich').height).toBe(126);
    }
  });

  it('rich with action and without title: text with the baseline 24 from the top (9) and the action 16 below', () => {
    const d = drawBox('tooltip', rich({ action: 'Learn more' }), 240, 200);
    // MC5 (#1033): the text box carries baselinePadding 24 and 21 (16 plus the 5 from the baseline to the end)
    const body = textIn(d, NAMES.text)!;
    expect([absOf(d, body).y, body.style.baselineTop]).toEqual([0, 24]);
    expect(box(d, NAMES.actionButton).y).toBe(9 + 20 + 16);
    expect(box(d, 'rich').height).toBe(9 + 20 + 16 + 40 + 8);
  });

  it('the default and the examples keep the minSize 40 × 24 and draw without a clipping warning', () => {
    expect(entryOf('tooltip').component!.minSize).toEqual({ width: 40, height: 24 });
    for (const mode of MODES) {
      const d = both('tooltip', {})[mode];
      expect(d.warnings.filter((w) => /larger than the box/.test(w))).toEqual([]);
    }
  });
});

describe('M5 group B — pull-to-refresh', () => {
  /** Point of the circle of radius 6.75 (ArcRadius 5.5 + StrokeWidth 2.5 / 2) at the Compose angle (0 = 3 o'clock, clockwise). */
  const R = 6.75;
  const at = (deg: number, c: number) => [
    c + R * Math.cos((deg * Math.PI) / 180),
    c + R * Math.sin((deg * Math.PI) / 180),
  ];
  const close = (got: number[], want: number[]) =>
    want.forEach((v, i) => expect(got[i]!).toBeCloseTo(v, 1));

  it('40 indicator (SpinnerContainerSize), circle in surface-container-high with a level 2 shadow, centered at the top and at 40 (80 of the threshold - 40)', () => {
    for (const mode of MODES) {
      for (const isRefreshing of ['true', 'false']) {
        const d = both('pull-to-refresh', { isRefreshing })[mode];
        const name =
          isRefreshing === 'true' ? NAMES.refreshingIndicator : NAMES.pullingIndicator;
        const other =
          isRefreshing === 'true' ? NAMES.pullingIndicator : NAMES.refreshingIndicator;
        const ind = box(d, name);
        expect([ind.x, ind.y, ind.width, ind.height]).toEqual([
          (360 - 40) / 2,
          40,
          40,
          40,
        ]);
        expect(radiusOf(ind.node)).toBe(num('corner-full'));
        expect(fillOf(d, name)).toBe(tok('surface-container-high', mode));
        expectElevation(ind.node.effects, 2, mode);
        expect(named(d, other)).toBeUndefined();
      }
    }
  });

  it('refreshing: 16 spinner with a 2.5 round-capped stroke in on-surface-variant, radius 6.75 and an arc from the 12 position to half the travel', () => {
    for (const mode of MODES) {
      const d = both('pull-to-refresh', { isRefreshing: 'true' })[mode];
      const ring = named(d, NAMES.ring) as PathNode;
      expect(ring.stroke).toMatchObject({ width: 2.5, cap: 'round' });
      expect(solid(ring.stroke!.paints)).toBe(tok('on-surface-variant', mode));
      expect(ring.fills).toEqual([]);
      const holder = box(d, NAMES.refreshingIndicator);
      const at24 = absOf(d, ring);
      // 24 box with the 16 circle in the middle: the drawing covers the 16 of SpinnerSize
      expect([at24.width, at24.height]).toEqual([24, 24]);
      expect([at24.x - holder.x, at24.y - holder.y]).toEqual([8, 8]);
      const n = numbers(ring.d);
      // M12 5.25 A6.75 6.75 0 0 1 x y: from 12 o'clock (270°) with the 6.75 radius from the center (12, 12)
      close([n[0]!, n[1]!], at(270, 12));
      expect([n[2], n[3]]).toEqual([R, R]);
      // (0.1 + 0.87) / 2 of a turn: CircularIndeterminateMinProgress and MaxProgress
      const sweep = ((0.1 + 0.87) / 2) * 360;
      close([n[7]!, n[8]!], at(270 + sweep, 12));
      expect([n[5], n[6]]).toEqual([0, 1]);
    }
  });

  it('pulling: arc from 27° to 315° with a butt cap and the 10 × 5 arrow in a 2.5 stroke, at radius 6.75 and in on-surface-variant', () => {
    for (const mode of MODES) {
      const d = both('pull-to-refresh', { isRefreshing: 'false' })[mode];
      const ring = named(d, NAMES.ring) as PathNode;
      const arrow = named(d, NAMES.arrow) as PathNode;
      for (const part of [ring, arrow]) {
        expect(part.stroke).toMatchObject({ width: 2.5, cap: 'butt' });
        expect(solid(part.stroke!.paints)).toBe(tok('on-surface-variant', mode));
        expect(part.fills).toEqual([]);
      }
      expect(arrow.stroke).toMatchObject({ join: 'miter' });
      // progress = 1: adjustedPercent 1, endTrim 0.8, rotation 0.075 turn: start 27°, end 315° (288° sweep)
      // (EX6: the `d` is the canonical arc, from 3 o'clock, and the node `rotation` takes it to 27°)
      const n = numbers(ring.d);
      const turned = (x: number, y: number, node: PathNode) => {
        const a = ((node.rotation ?? 0) * Math.PI) / 180;
        return [
          12 + (x - 12) * Math.cos(a) - (y - 12) * Math.sin(a),
          12 + (x - 12) * Math.sin(a) + (y - 12) * Math.cos(a),
        ];
      };
      close(turned(n[0]!, n[1]!, ring), at(27, 12));
      expect([n[2], n[3], n[5], n[6]]).toEqual([R, R, 1, 1]);
      close(turned(n[7]!, n[8]!, ring), at(315, 12));
      // arrow: (0,0) (5,5) (10,0) carried to the end of the arc and rotated by endAngle - strokeWidth (312.5°) around the center
      const raw = numbers(arrow.d);
      expect(raw).toHaveLength(6);
      const pts = [
        ...turned(raw[0]!, raw[1]!, arrow),
        ...turned(raw[2]!, raw[3]!, arrow),
        ...turned(raw[4]!, raw[5]!, arrow),
      ];
      const rotate = (x: number, y: number) => {
        const a = (312.5 * Math.PI) / 180;
        const dx = x - 8;
        const dy = y - 8;
        return [
          4 + 8 + dx * Math.cos(a) - dy * Math.sin(a),
          4 + 8 + dx * Math.sin(a) + dy * Math.cos(a),
        ];
      };
      const want = [rotate(9.75, 5.5), rotate(14.75, 10.5), rotate(19.75, 5.5)].flat();
      close(pts, want);
    }
  });

  it('the content is still the slot and the background is surface', () => {
    for (const mode of MODES) {
      const d = both('pull-to-refresh', {})[mode];
      expect(d.root.fills[0]).toMatchObject({ color: tok('surface', mode) });
      expect(text('components/pull-to-refresh.json')).toContain('"type": "slot"');
    }
  });
});

describe('M5 group B — swipe-to-dismiss', () => {
  /** The backdrop icon: the `icon` node has no node name, so it is the only visible path of the drawing. */
  const backdropIcon = (d: Drawing) => {
    const paths = [...walk(d.root)].filter(
      (n): n is PathNode => n.type === 'path' && n.visible,
    );
    return paths.length === 1
      ? { path: paths[0]!, color: solid(paths[0]!.fills), box: absOf(d, paths[0]!) }
      : undefined;
  };
  const item = (extra: Record<string, unknown> = {}): Values =>
    ({
      title: 'Team meeting',
      supportingText: 'Today, 2:00 PM',
      icon: 'Delete',
      ...extra,
    }) as unknown as Values;

  it('at rest: ListItem item in surface, body-large title in on-surface and body-medium supporting text in on-surface-variant, with 16 of room', () => {
    for (const mode of MODES) {
      const d = both('swipe-to-dismiss', item({ direction: 'Settled' }))[mode];
      const row = box(d, NAMES.restingItem);
      expect([row.x, row.y, row.width, row.height]).toEqual([0, 0, 360, 72]);
      expect(fillOf(d, NAMES.restingItem)).toBe(tok('surface', mode));
      const title = textIn(d, NAMES.title)!;
      const support = textIn(d, NAMES.support)!;
      expect(fontOf(title)).toEqual(scale('body-large'));
      expect(fontOf(support)).toEqual(scale('body-medium'));
      expect(solid(title.fills)).toBe(tok('on-surface', mode));
      expect(solid(support.fills)).toBe(tok('on-surface-variant', mode));
      expect(absOf(d, title).x).toBe(16);
      // 24 + 20 centered in 72
      expect(absOf(d, title).y).toBe(14);
      expect(title.style).toMatchObject({ maxLines: 1, ellipsis: true });
      expect(support.style).toMatchObject({ maxLines: 1, ellipsis: true });
      expect(backdropIcon(d)).toBeUndefined();
    }
  });

  it('EndToStart: the item moves out 56 (positionalThreshold) toward the start and reveals error-container with the 24 icon 24 from the end in on-error-container', () => {
    for (const mode of MODES) {
      const d = both('swipe-to-dismiss', item({ direction: 'EndToStart' }))[mode];
      expect(d.root.fills[0]).toMatchObject({ color: tok('error-container', mode) });
      const moved = box(d, NAMES.itemSlidStart);
      expect([moved.x, moved.width]).toEqual([-56, 360]);
      expect(fillOf(d, NAMES.itemSlidStart)).toBe(tok('surface', mode));
      const icon = backdropIcon(d)!;
      expect(icon.color).toBe(tok('on-error-container', mode));
      expect([icon.box.width, icon.box.height]).toEqual([24, 24]);
      expect([360 - (icon.box.x + icon.box.width), icon.box.y]).toEqual([24, 24]);
      expect(named(d, NAMES.restingItem)).toBeUndefined();
    }
  });

  it('StartToEnd: the item moves out 56 toward the end and reveals primary-container with the icon 24 from the start in on-primary-container', () => {
    for (const mode of MODES) {
      const d = both('swipe-to-dismiss', item({ direction: 'StartToEnd', icon: 'Done' }))[
        mode
      ];
      expect(d.root.fills[0]).toMatchObject({ color: tok('primary-container', mode) });
      const moved = box(d, NAMES.itemSlidEnd);
      expect([moved.x, moved.width]).toEqual([56, 360]);
      const icon = backdropIcon(d)!;
      expect(icon.color).toBe(tok('on-primary-container', mode));
      expect([icon.box.x, icon.box.y, icon.box.width]).toEqual([24, 24, 24]);
    }
  });

  it('a disabled direction goes back to rest, over surface', () => {
    for (const mode of MODES) {
      const d = both(
        'swipe-to-dismiss',
        item({ direction: 'EndToStart', enableDismissFromEndToStart: 'false' }),
      )[mode];
      expect(named(d, NAMES.restingItem)).toBeDefined();
      expect(named(d, NAMES.itemSlidStart)).toBeUndefined();
      expect(d.root.fills[0]).toMatchObject({ color: tok('surface', mode) });
    }
  });

  it('icon from the set: Delete is the default of the empty field, each name draws its own and an unknown one warns', () => {
    const base = item({ direction: 'EndToStart' });
    const del = backdropIcon(both('swipe-to-dismiss', base).light)!.path.d;
    const empty = both(
      'swipe-to-dismiss',
      item({ direction: 'EndToStart', icon: '' }),
    ).light;
    expect(backdropIcon(empty)!.path.d).toBe(del);
    expect(empty.warnings.filter((w) => /unknown icon/.test(w))).toEqual([]);
    const star = both(
      'swipe-to-dismiss',
      item({ direction: 'EndToStart', icon: 'Star' }),
    ).light;
    expect(backdropIcon(star)!.path.d).not.toBe(del);
    const bad = both(
      'swipe-to-dismiss',
      item({ direction: 'EndToStart', icon: 'Does-not-exist' }),
    ).light;
    expect(bad.warnings.some((w) => /unknown icon/.test(w))).toBe(true);
  });

  it('the box clip hides what leaves it', () => {
    expect(
      (
        both('swipe-to-dismiss', item({ direction: 'EndToStart' })).light.root as {
          clip: boolean;
        }
      ).clip,
    ).toBe(true);
  });
});

describe('M5 group B — carousel', () => {
  const items = (n: number, label = true) =>
    Array.from({ length: n }, (_, i) => ({
      image: `https://example.com/${i}.jpg`,
      label: label ? `Item ${i}` : '',
    }));
  const withItems = (extra: Record<string, unknown>, n = 3): Values =>
    ({ items: items(n), ...extra }) as unknown as Values;
  const itemsOf = (d: Drawing): SceneNode[] =>
    [...walk(d.root)].filter((n) => n.name === 'item' && n.visible);

  it('items with a 28 corner (MaterialTheme.shapes.extraLarge, maskClip), clipped, with the image placeholder in surface-container-highest', () => {
    for (const mode of MODES) {
      const d = both('carousel', withItems({ style: 'multi-browse' }))[mode];
      const [first] = itemsOf(d);
      expect(radiusOf(first)).toBe(num('corner-extra-large'));
      expect((first as { clip: boolean }).clip).toBe(true);
      const image = named(d, NAMES.image)!;
      expect(solid(image.fills)).toBe(tok('surface-container-highest', mode));
    }
  });

  it('multi-browse: the item width comes from the Compose strategy (EX6: two large ones of 148 and the small one of 40 in 360, with 150 preferred), with itemSpacing between them', () => {
    for (const mode of MODES) {
      const d = both(
        'carousel',
        withItems({ style: 'multi-browse', preferredItemWidth: 150, itemSpacing: 12 }),
      )[mode];
      const boxes = itemsOf(d).map((n) => absOf(d, n));
      expect(boxes.map((b) => b.width)).toEqual([148, 148, 40]);
      expect(boxes.map((b) => b.x)).toEqual([0, 160, 320]);
      expect(boxes[0]!.height).toBe(205);
    }
  });

  it('uncontained: the item width is the itemWidth, from the edge', () => {
    const d = both(
      'carousel',
      withItems({ style: 'uncontained', itemWidth: 140, itemSpacing: 12 }),
    ).light;
    expect(itemsOf(d).map((n) => absOf(d, n).x)).toEqual([0, 152, 304]);
    // L2 (#1078): the third item crosses the right edge (304 + 140 > 360) and gets only the width that is left
    expect(itemsOf(d).map((n) => absOf(d, n).width)).toEqual([140, 140, 360 - 304]);
  });

  it('centered-hero: 264 large item (360 - 2 x 40 of small items - 2 x 8) with the small item space before the first (40 + 8), like Compose without maxItemWidth', () => {
    // #1504: the Arrangement fit (Arrangement.kt, 198 to 206) shrinks the small ones down to the minimum of 40
    const d = both(
      'carousel',
      withItems({ style: 'centered-hero', itemSpacing: 8 }),
    ).light;
    const boxes = itemsOf(d).map((n) => absOf(d, n));
    expect(boxes[0]!.width).toBe(360 - 2 * 40 - 2 * 8);
    expect(boxes[0]!.x).toBe(40 + 8);
    expect(boxes[1]!.x).toBe(40 + 8 + 264 + 8);
  });

  it('label over the item: label-large in a fixed color in both modes, over the veil in a bottom-to-top gradient, from scrim with alpha 0.55 (solid up to 75%) to 0 at the top (library choice for the 4.5:1 contrast, see material3CarouselRotulo.test.ts)', () => {
    const light = both('carousel', withItems({ style: 'multi-browse' })).light;
    const dark = both('carousel', withItems({ style: 'multi-browse' })).dark;
    for (const [mode, d] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const label = textIn(d, 'item')!;
      expect(label.text).toBe('Item 0');
      expect(fontOf(label)).toEqual(scale('label-large'));
      expect(solid(label.fills)).toBe(tok('secondary-fixed', mode));
      expect(label.style).toMatchObject({ maxLines: 1, ellipsis: true });
      const veil = named(d, NAMES.veil)!;
      const paint = veil.fills[0];
      const scrim = tok('scrim', mode).slice(0, 7);
      expect(paint?.type).toBe('linear');
      const stops = paint?.type === 'linear' ? paint.stops : [];
      // 270°: offset 0 is the bottom of the veil and 1 the top (bottom to top).
      expect(stops.map((x) => x.offset)).toEqual([0, 0.75, 1]);
      expect(stops.map((x) => x.color.slice(0, 7).toLowerCase())).toEqual([
        scrim.toLowerCase(),
        scrim.toLowerCase(),
        scrim.toLowerCase(),
      ]);
      expect(stops.map((x) => alphaOf(x.color))).toEqual([0.55, 0.55, 0]);
      expect(paint?.type === 'linear' && paint.start.y > paint.end.y).toBe(true);
      expect(veil.opacity).toBe(1);
    }
    expect(tok('secondary-fixed', 'light')).toBe(tok('secondary-fixed', 'dark'));
    const bare = both('carousel', {
      items: items(2, false),
      style: 'multi-browse',
    } as Values).light;
    expect(named(bare, NAMES.veil)).toBeUndefined();
  });
});
