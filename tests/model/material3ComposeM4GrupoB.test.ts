// M4 of the "faithful Material 3" stage, group B: navigation-bar, short-navigation-bar, navigation-rail and
// navigation-drawer against what `NavigationBar.kt`, `ShortNavigationBar.kt`, `NavigationItem.kt`,
// `NavigationRail.kt`, `WideNavigationRail.kt`, `NavigationDrawer.kt` and the token files fix at
// commit 5113b82a. The expected colors come from the specialization tokens (light and dark); the geometry,
// from the Compose constants (dp = component px).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { files, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof instantiate>[1];
type Mode = 'light' | 'dark';
const MODES: readonly Mode[] = ['light', 'dark'];

/** Draws the component in a `width` × `height` box (the default is its own `size`). */
function draw(
  id: string,
  values: Values,
  mode: Mode = 'light',
  box?: { width: number; height: number },
) {
  const entry = entryOf(id);
  const library = catalog.library!;
  const size = box ?? entry.component!.size;
  const drawing = instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, ...size },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
  return { ...drawing, boxes: absoluteBoxes(drawing.root) };
}
type Drawing = ReturnType<typeof draw>;

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Value of the specialization token in the mode (color or number). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;

/** All visible nodes with the name, in drawing order. */
const all = (d: Drawing, name: string): SceneNode[] => {
  const found: SceneNode[] = [];
  for (const node of walk(d.root))
    if (node.name === name && node.visible) found.push(node);
  return found;
};
// pt-BR kept: the quoted node names ('rótulo', 'trilho', ...) are the names in the material3-compose library (libraries/*.json, outside this phase)
const named = (d: Drawing, name: string): SceneNode | undefined => all(d, name)[0];
const at = (d: Drawing, node: SceneNode | undefined) => {
  if (node === undefined) throw new Error('missing node');
  const b = d.boxes.get(node.id)!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const fillOf = (node: SceneNode | undefined) => solid(node?.fills ?? []);
const textOf = (node: SceneNode | undefined): TextNode => {
  if (node?.type !== 'text') throw new Error('not a text node');
  return node;
};
const radiusOf = (node: SceneNode | undefined) =>
  node !== undefined && 'cornerRadius' in node ? node.cornerRadius : undefined;
const iconColor = (node: SceneNode | undefined): string | undefined => {
  const path = node && [...walk(node)].find((n): n is PathNode => n.type === 'path');
  return path === undefined ? undefined : solid(path.fills);
};
const typo = (scale: string) => [
  num(`${scale}-size`),
  num(`${scale}-line-height`),
  num(`${scale}-weight`),
  num(`${scale}-tracking`),
];
const fontOf = (node: SceneNode | undefined) => {
  const style = textOf(node).style;
  return [style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing];
};

const ITEMS = [
  { label: 'Home', icon: 'Home', selected: 'true' },
  { label: 'Search', icon: 'Search', selected: 'false' },
  { label: 'Profile', icon: 'Person', selected: 'false' },
];
const ITEMS_5 = [
  ...ITEMS,
  { label: 'Saved', icon: 'Favorite', selected: 'false' },
  { label: 'Settings', icon: 'Settings', selected: 'false' },
];
const BAR = { width: 412, height: 80 };

describe('M4 group B — navigation-bar', () => {
  it('80 container (TallContainerHeight) in surface-container, with no shadow and no corner (Elevation Level0)', () => {
    for (const mode of MODES) {
      const d = draw('navigation-bar', { items: ITEMS }, mode, BAR);
      expect(at(d, d.root)).toMatchObject({ w: 412, h: 80 });
      expect(fillOf(d.root)).toBe(tok('surface-container', mode));
      expect(d.root.effects).toEqual([]);
      expect(radiusOf(d.root)).toBe(0);
    }
  });

  it('destinations of equal width (weight 1) with 8 of space between them (NavigationBarItemHorizontalPadding)', () => {
    const three = draw('navigation-bar', { items: ITEMS }, 'light', BAR);
    expect(all(three, 'destino').map((n) => [at(three, n).x, at(three, n).w])).toEqual([
      [0, 132],
      [140, 132],
      [280, 132],
    ]);
    const five = draw('navigation-bar', { items: ITEMS_5 }, 'light', BAR);
    const widths = all(five, 'destino').map((n) => at(five, n).w);
    expect(widths).toEqual([76, 76, 76, 76, 76]);
    expect(at(five, all(five, 'destino')[4]).x).toBe(4 * 84);
  });

  it('selected indicator: 56 × 32 (ActiveIndicatorWidth/Height) in secondary-container, full shape, 12 from the top', () => {
    for (const mode of MODES) {
      const d = draw('navigation-bar', { items: ITEMS }, mode, BAR);
      const [selected, other] = all(d, 'indicador');
      const bar = at(d, all(d, 'destino')[0]);
      const ind = at(d, selected);
      expect([ind.w, ind.h]).toEqual([56, 32]);
      expect(ind.x).toBe(bar.x + (bar.w - 56) / 2);
      // contentVerticalPadding = (80 - (24 + 4 + 4 + 16)) / 2 = 16, minus the vertical breathing room of 4
      expect(ind.y).toBe(12);
      expect(radiusOf(selected)).toBeGreaterThanOrEqual(16);
      expect(fillOf(selected)).toBe(tok('secondary-container', mode));
      expect(fillOf(other)).toBeUndefined();
    }
  });

  it('24 icon centered in the indicator: on-secondary-container when selected, on-surface-variant on the others', () => {
    for (const mode of MODES) {
      const d = draw('navigation-bar', { items: ITEMS }, mode, BAR);
      const home = named(d, 'home');
      const ind = at(d, all(d, 'indicador')[0]);
      expect(at(d, home)).toEqual({ x: ind.x + 16, y: ind.y + 4, w: 24, h: 24 });
      expect(iconColor(home)).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'search'))).toBe(tok('on-surface-variant', mode));
      expect(at(d, named(d, 'search')).y).toBe(16);
    }
  });

  it('label in label-medium, 4 below the indicator (y = 48): secondary when selected and on-surface-variant on the others', () => {
    for (const mode of MODES) {
      const d = draw('navigation-bar', { items: ITEMS }, mode, BAR);
      const [first, second] = all(d, 'rótulo');
      expect(fontOf(first)).toEqual(typo('label-medium'));
      expect(at(d, first).y).toBe(48);
      expect(at(d, first).h).toBe(16);
      expect(fillOf(first)).toBe(tok('secondary', mode));
      expect(fillOf(second)).toBe(tok('on-surface-variant', mode));
      const dest = at(d, all(d, 'destino')[0]);
      expect(at(d, first).x + at(d, first).w / 2).toBeCloseTo(dest.x + dest.w / 2, 5);
    }
  });

  it('alwaysShowLabel=false: the label disappears on unselected ones and their icon is centered in height (y = 28)', () => {
    const d = draw(
      'navigation-bar',
      { items: ITEMS, alwaysShowLabel: 'false' },
      'light',
      BAR,
    );
    expect(all(d, 'rótulo')).toHaveLength(1);
    expect(at(d, named(d, 'home')).y).toBe(16);
    expect(at(d, named(d, 'search')).y).toBe(28);
    const without = draw(
      'navigation-bar',
      { items: ITEMS, alwaysShowLabel: 'true' },
      'light',
      BAR,
    );
    expect(all(without, 'rótulo')).toHaveLength(3);
  });
});

describe('M4 group B — short-navigation-bar', () => {
  const SHORT = { width: 412, height: 64 };

  it('64 container (NavigationBarTokens.ContainerHeight) in surface-container, with no shadow', () => {
    for (const mode of MODES) {
      const d = draw('short-navigation-bar', { items: ITEMS }, mode, SHORT);
      expect(at(d, d.root)).toMatchObject({ w: 412, h: 64 });
      expect(fillOf(d.root)).toBe(tok('surface-container', mode));
      expect(d.root.effects).toEqual([]);
    }
  });

  it('EqualWeight: the destinations split the width equally, with no space between them', () => {
    const d = draw('short-navigation-bar', { items: ITEMS, arrangement: 'EqualWeight' });
    const w = 412 / 3;
    const items = all(d, 'destino').map((n) => at(d, n));
    expect(items.map((i) => i.w)).toEqual([w, w, w]);
    expect(items.map((i) => i.x)).toEqual([0, w, 2 * w]);
  });

  it('icon on top: 56 × 32 indicator 6 from the top (TopIconItemVerticalPadding), label 4 below, in label-medium', () => {
    for (const mode of MODES) {
      const d = draw(
        'short-navigation-bar',
        { items: ITEMS, iconPosition: 'Top' },
        mode,
        SHORT,
      );
      const [selected, other] = all(d, 'indicador');
      const ind = at(d, selected);
      expect([ind.w, ind.h, ind.y]).toEqual([56, 32, 6]);
      expect(radiusOf(selected)).toBeGreaterThanOrEqual(16);
      expect(fillOf(selected)).toBe(tok('secondary-container', mode));
      expect(fillOf(other)).toBeUndefined();
      const dest = at(d, all(d, 'destino')[0]);
      expect(ind.x).toBeCloseTo(dest.x + (dest.w - 56) / 2, 5);
      const home = at(d, named(d, 'home'));
      expect(home).toMatchObject({ w: 24, h: 24, y: 10 });
      const [label, otherLabel] = all(d, 'rótulo');
      expect(fontOf(label)).toEqual(typo('label-medium'));
      expect(at(d, label).y).toBe(42);
      expect(fillOf(label)).toBe(tok('secondary', mode));
      expect(fillOf(otherLabel)).toBe(tok('on-surface-variant', mode));
      expect(iconColor(named(d, 'home'))).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'search'))).toBe(tok('on-surface-variant', mode));
    }
  });

  it('icon on the side: 40 pill (16 of padding, 4 between icon and label), full shape, centered in height', () => {
    for (const mode of MODES) {
      const d = draw(
        'short-navigation-bar',
        { items: ITEMS, iconPosition: 'Start' },
        mode,
        SHORT,
      );
      const [selected, other] = all(d, 'indicador');
      const pill = at(d, selected);
      expect([pill.h, pill.y]).toEqual([40, 12]);
      expect(radiusOf(selected)).toBeGreaterThanOrEqual(20);
      expect(fillOf(selected)).toBe(tok('secondary-container', mode));
      expect(fillOf(other)).toBeUndefined();
      const icon = at(d, named(d, 'home'));
      expect(icon).toMatchObject({ w: 24, h: 24, x: pill.x + 16, y: 20 });
      const label = at(d, all(d, 'rótulo')[0]);
      expect(label.x).toBe(icon.x + 24 + 4);
      expect(label.y + label.h / 2).toBe(32);
      // pill width = 16 + 24 + 4 + label + 16
      expect(pill.w).toBeCloseTo(16 + 24 + 4 + label.w + 16, 5);
      expect(fontOf(all(d, 'rótulo')[0])).toEqual(typo('label-medium'));
      expect(fillOf(all(d, 'rótulo')[0])).toBe(tok('secondary', mode));
    }
  });

  it('Centered: groups the destinations at the center, with equal margins on both sides', () => {
    const d = draw('short-navigation-bar', { items: ITEMS, arrangement: 'Centered' });
    const items = all(d, 'destino').map((n) => at(d, n));
    const left = items[0]!.x;
    const right = 412 - (items[2]!.x + items[2]!.w);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeCloseTo(left, 5);
    const equal = draw('short-navigation-bar', {
      items: ITEMS,
      arrangement: 'EqualWeight',
    });
    expect(at(equal, all(equal, 'destino')[0]).x).toBe(0);
  });
});

describe('M4 group B — navigation-rail', () => {
  const RAIL = { width: 220, height: 400 };
  const rail = (values: Values, mode: Mode = 'light') =>
    draw('navigation-rail', { items: ITEMS, ...values }, mode, RAIL);

  it('narrow rail: 80 sheet in surface, 4 vertical padding and 56 destinations with 4 between them', () => {
    for (const mode of MODES) {
      const d = rail({ style: 'rail' }, mode);
      const sheet = named(d, 'folha da rail');
      expect(at(d, sheet)).toMatchObject({ x: 0, y: 0, w: 80, h: 400 });
      expect(fillOf(sheet)).toBe(tok('surface', mode));
      expect(radiusOf(sheet)).toBe(0);
      expect(all(d, 'destino').map((n) => [at(d, n).y, at(d, n).h, at(d, n).w])).toEqual([
        [4, 56, 80],
        [64, 56, 80],
        [124, 56, 80],
      ]);
    }
  });

  it('narrow rail: 56 × 32 indicator at the top of the destination, icon at 4, label at 36 (label-medium)', () => {
    for (const mode of MODES) {
      const d = rail({ style: 'rail' }, mode);
      const ind = at(d, all(d, 'indicador')[0]);
      expect(ind).toEqual({ x: 12, y: 4, w: 56, h: 32 });
      expect(radiusOf(all(d, 'indicador')[0])).toBeGreaterThanOrEqual(16);
      expect(fillOf(all(d, 'indicador')[0])).toBe(tok('secondary-container', mode));
      expect(fillOf(all(d, 'indicador')[1])).toBeUndefined();
      expect(at(d, named(d, 'home'))).toEqual({ x: 28, y: 8, w: 24, h: 24 });
      const [label, other] = all(d, 'rótulo');
      expect(at(d, label).y).toBe(4 + 36);
      expect(fontOf(label)).toEqual(typo('label-medium'));
      expect(fillOf(label)).toBe(tok('secondary', mode));
      expect(fillOf(other)).toBe(tok('on-surface-variant', mode));
      expect(iconColor(named(d, 'home'))).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'search'))).toBe(tok('on-surface-variant', mode));
    }
  });

  it('alwaysShowLabel=false: the label disappears on unselected ones and the icon is centered in the 56 destination (y = 16)', () => {
    const d = rail({ style: 'rail', alwaysShowLabel: 'false' });
    expect(all(d, 'rótulo')).toHaveLength(1);
    expect(at(d, named(d, 'home')).y).toBe(4 + 4);
    expect(at(d, named(d, 'search')).y).toBe(64 + 16);
  });

  it('wide collapsed: 96 sheet in surface, 44 top, 64 destinations with 4 between them and 56 indicator 20 from the edge', () => {
    for (const mode of MODES) {
      const d = rail({ style: 'wide', initialValue: 'Collapsed' }, mode);
      const sheet = named(d, 'folha da rail');
      expect(at(d, sheet)).toMatchObject({ w: 96, h: 400 });
      expect(fillOf(sheet)).toBe(tok('surface', mode));
      expect(all(d, 'destino').map((n) => [at(d, n).y, at(d, n).h, at(d, n).w])).toEqual([
        [44, 64, 96],
        [112, 64, 96],
        [180, 64, 96],
      ]);
      expect(at(d, all(d, 'indicador')[0])).toEqual({ x: 20, y: 44, w: 56, h: 32 });
      expect(at(d, all(d, 'rótulo')[0]).y).toBe(44 + 36);
      expect(fontOf(all(d, 'rótulo')[0])).toEqual(typo('label-medium'));
    }
  });

  it('wide expanded: 220 sheet, 56 destinations with no space, pill 20 from the edge with 16 of padding and 8 between icon and label', () => {
    for (const mode of MODES) {
      const d = rail({ style: 'wide', initialValue: 'Expanded' }, mode);
      const sheet = named(d, 'folha da rail');
      expect(at(d, sheet)).toMatchObject({ w: 220, h: 400 });
      expect(fillOf(sheet)).toBe(tok('surface', mode));
      expect(all(d, 'destino').map((n) => [at(d, n).y, at(d, n).h])).toEqual([
        [44, 56],
        [100, 56],
        [156, 56],
      ]);
      const [selected, other] = all(d, 'indicador');
      const pill = at(d, selected);
      expect([pill.x, pill.y, pill.h]).toEqual([20, 44, 56]);
      expect(radiusOf(selected)).toBeGreaterThanOrEqual(28);
      expect(fillOf(selected)).toBe(tok('secondary-container', mode));
      expect(fillOf(other)).toBeUndefined();
      const icon = at(d, named(d, 'home'));
      expect(icon).toEqual({ x: 36, y: 60, w: 24, h: 24 });
      const label = at(d, all(d, 'rótulo')[0]);
      expect(label.x).toBe(36 + 24 + 8);
      expect(label.y + label.h / 2).toBe(44 + 28);
      expect(pill.w).toBeCloseTo(16 + 24 + 8 + label.w + 16, 5);
      expect(fontOf(all(d, 'rótulo')[0])).toEqual(typo('label-large'));
      expect(fillOf(all(d, 'rótulo')[0])).toBe(tok('secondary', mode));
      expect(iconColor(named(d, 'home'))).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'search'))).toBe(tok('on-surface-variant', mode));
    }
  });

  it('width follows the content: wide expanded grows up to 360 (ContainerWidthMaximum), and the collapsed one stays at 96', () => {
    const items = [
      {
        label: 'A very long label for the navigation rail destination',
        icon: 'Home',
        selected: 'true',
      },
    ];
    const big = { width: 500, height: 400 };
    const drawn = (values: Values) =>
      draw('navigation-rail', { items, ...values }, 'light', big);
    const sheetWidth = (d: Drawing) => at(d, named(d, 'folha da rail')).w;
    const open = drawn({ style: 'wide', initialValue: 'Expanded' });
    const pill = at(open, named(open, 'indicador'));
    // pill + 20 on each side (ItemHorizontalPadding) would exceed 360: the rail stops at the maximum
    expect(pill.x + pill.w + 20).toBeGreaterThan(360);
    expect(sheetWidth(open)).toBe(360);
    expect(sheetWidth(drawn({ style: 'wide', initialValue: 'Collapsed' }))).toBe(96);
  });

  it('modal-wide: expanded in surface-container with corners of 16 (CornerLarge); collapsed same as wide, in surface', () => {
    for (const mode of MODES) {
      const open = named(
        rail({ style: 'modal-wide', initialValue: 'Expanded' }, mode),
        'folha da rail',
      );
      expect(fillOf(open)).toBe(tok('surface-container', mode));
      expect(radiusOf(open)).toBe(16);
      const closed = named(
        rail({ style: 'modal-wide', initialValue: 'Collapsed' }, mode),
        'folha da rail',
      );
      expect(fillOf(closed)).toBe(tok('surface', mode));
      expect(radiusOf(closed)).toBe(0);
    }
  });
});

describe('M4 group B — navigation-drawer', () => {
  const DRAWER = { width: 360, height: 400 };
  const drawer = (values: Values, mode: Mode = 'light') =>
    draw(
      'navigation-drawer',
      {
        items: [
          { label: 'Inbox', icon: 'Email', selected: 'true', badge: '24' },
          { label: 'Favorites', icon: 'Favorite', selected: 'false', badge: '' },
          { label: 'Settings', icon: 'Settings', selected: 'false', badge: '' },
        ],
        ...values,
      },
      mode,
      DRAWER,
    );

  it('modal: surface-container-low with end corners of 16 (CornerLargeEnd); dismissible and permanent: surface, no corner', () => {
    for (const mode of MODES) {
      const modal = drawer({ style: 'modal' }, mode);
      expect(at(modal, modal.root)).toMatchObject({ w: 360 });
      expect(fillOf(modal.root)).toBe(tok('surface-container-low', mode));
      expect(radiusOf(modal.root)).toEqual([0, 16, 16, 0]);
      expect(modal.root.effects).toEqual([]);
      for (const style of ['dismissible', 'permanent']) {
        const d = drawer({ style }, mode);
        expect(fillOf(d.root)).toBe(tok('surface', mode));
        expect(radiusOf(d.root)).toBe(0);
      }
    }
  });

  it('56 items with a 12 margin (ItemPadding), 336 wide, full shape and no space between them', () => {
    for (const mode of MODES) {
      const d = drawer({ style: 'modal' }, mode);
      const items = all(d, 'destino');
      expect(items.map((n) => at(d, n))).toEqual([
        { x: 12, y: 12, w: 336, h: 56 },
        { x: 12, y: 68, w: 336, h: 56 },
        { x: 12, y: 124, w: 336, h: 56 },
      ]);
      expect(radiusOf(items[0])).toBeGreaterThanOrEqual(28);
      expect(fillOf(items[0])).toBe(tok('secondary-container', mode));
      expect(fillOf(items[1])).toBeUndefined();
    }
  });

  it('24 icon 16 from the edge of the item and label 12 after, in label-large; selected on-secondary-container', () => {
    for (const mode of MODES) {
      const d = drawer({ style: 'modal' }, mode);
      expect(at(d, named(d, 'email'))).toEqual({ x: 28, y: 28, w: 24, h: 24 });
      expect(iconColor(named(d, 'email'))).toBe(tok('on-secondary-container', mode));
      expect(iconColor(named(d, 'favorite'))).toBe(tok('on-surface-variant', mode));
      const [first, second] = all(d, 'rótulo');
      expect(at(d, first).x).toBe(28 + 24 + 12);
      expect(at(d, first).y + at(d, first).h / 2).toBe(12 + 28);
      expect(fontOf(first)).toEqual(typo('label-large'));
      expect(fillOf(first)).toBe(tok('on-secondary-container', mode));
      expect(fillOf(second)).toBe(tok('on-surface-variant', mode));
    }
  });

  it('badge at the end of the item (24 of padding on the right), in the color of the label and in label-large', () => {
    for (const mode of MODES) {
      const d = drawer({ style: 'modal' }, mode);
      const badge = named(d, 'selo');
      expect(at(d, badge).x + at(d, badge).w).toBe(360 - 12 - 24);
      expect(fontOf(badge)).toEqual(typo('label-large'));
      expect(fillOf(badge)).toBe(tok('on-secondary-container', mode));
      expect(all(d, 'selo')).toHaveLength(1);
    }
  });

  it('56 header in title-small and on-surface-variant, with a 16 margin; the items move down 56', () => {
    for (const mode of MODES) {
      const d = drawer({ style: 'modal', headline: 'Mapping' }, mode);
      const title = named(d, 'título');
      expect(fontOf(title)).toEqual(typo('title-small'));
      expect(fillOf(title)).toBe(tok('on-surface-variant', mode));
      expect(at(d, title).x).toBe(12 + 16);
      expect(at(d, title).y + at(d, title).h / 2).toBe(12 + 28);
      expect(at(d, all(d, 'destino')[0]).y).toBe(12 + 56);
    }
    expect(named(drawer({ style: 'modal' }), 'título')).toBeUndefined();
  });
});
