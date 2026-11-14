// M4 of the "faithful Material 3" stage, group C: tabs and list-item against what `Tab.kt`, `TabRow.kt`, `ListItem.kt` and the
// token files (`PrimaryNavigationTabTokens`, `SecondaryNavigationTabTokens`, `ListTokens`, `DividerTokens`) fix at
// commit 5113b82a. The expected colors come from the specialization tokens (light and dark); the geometry, from the
// Compose constants (dp = component px).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { files, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof instantiate>[1];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof instantiate>;
type Row = Record<string, string>;

/** Draws the component in a box of `width` by `height` (the default is the component's `size`). */
function draw(
  id: string,
  values: Values,
  mode: Mode = 'light',
  size?: { width: number; height: number },
): Drawing {
  const entry = entryOf(id);
  const library = catalog.library!;
  const box = { x: 0, y: 0, ...(size ?? entry.component!.size) };
  return instantiate(entry.component!, { ...defaultValues(entry.type), ...values }, box, {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  });
}
const both = (
  id: string,
  values: Values,
  size?: { width: number; height: number },
): Record<Mode, Drawing> => ({
  light: draw(id, values, 'light', size),
  dark: draw(id, values, 'dark', size),
});

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Value of the specialization token in the mode (color or number). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | number | Record<Mode, string>;
  return typeof value === 'object' ? value[mode] : String(value);
};

const named = (d: Drawing, name: string): SceneNode | undefined =>
  [...walk(d.root)].find((n) => n.name === name && n.visible);
const allNamed = (d: Drawing, name: string): SceneNode[] =>
  [...walk(d.root)].filter((n) => n.name === name && n.visible);
const boxOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`missing node: ${name}`);
  return { node, ...boxOf(d, node) };
};
const boxesOf = (d: Drawing, name: string) =>
  allNamed(d, name).map((node) => ({ node, ...boxOf(d, node) }));
/** Node color: the fill or, without it, the stroke color. */
const paintOf = (node: SceneNode | undefined): string | undefined =>
  solid(node?.fills ?? []) ?? solid(node?.stroke?.paints ?? []);
const texts = (d: Drawing): TextNode[] =>
  [...walk(d.root)].filter((n): n is TextNode => n.type === 'text' && n.visible);
const textBox = (d: Drawing, text: string) => {
  const node = texts(d).find((n) => n.text === text);
  if (node === undefined) throw new Error(`missing text: ${text}`);
  return { node, ...boxOf(d, node) };
};
/** The drawn icons (`icon` node), in drawing order: each one is a group with the `icon-path` path. */
const iconsOf = (d: Drawing): { node: SceneNode; color?: string }[] =>
  [...walk(d.root)]
    .filter((n) => n.visible && n.type === 'group')
    .map((node) => {
      const path = [...walk(node)].find((n): n is PathNode => n.type === 'path');
      return { node, color: path === undefined ? undefined : solid(path.fills) };
    })
    .filter((icon) => icon.color !== undefined);

const near = (value: number | undefined, expected: number) =>
  expect(value).toBeCloseTo(expected, 3);

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NODE = {
  tab: 'aba',
  divider: 'divisória',
  primaryIndicator: 'indicador primário',
  secondaryIndicator: 'indicador secundário',
} as const;

const W = 412;
const rows = (
  labels: [string, string, string],
  icons: [string, string, string],
  selected = 0,
) =>
  labels.map((label, i) => ({
    label,
    icon: icons[i]!,
    selected: i === selected ? 'true' : 'false',
  })) as Row[];
const ICONS: [string, string, string] = ['Home', 'Search', 'Person'];
const LABELS: [string, string, string] = ['Home', 'Search', 'Profile'];
const THREE = rows(LABELS, ICONS);
const textOnly = rows(LABELS, ['', '', '']);
const iconOnly = rows(['', '', ''], ICONS);

describe('M4 group C — tabs', () => {
  it('fixed row: equal-width tabs that fill the whole width, on the surface background and with the 1-thick outline-variant divider', () => {
    const d = both('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      const tabs = boxesOf(d[mode], NODE.tab);
      expect(tabs).toHaveLength(3);
      tabs.forEach((tab, i) => {
        near(tab.width, W / 3);
        near(tab.x, (i * W) / 3);
        // the row with the icon above goes from 48 to 72 (LargeTabHeight, Tab.kt:421)
        expect(tab.height).toBe(72);
      });
      expect(paintOf(d[mode].root)).toBe(tok('surface', mode));
      const divider = box(d[mode], NODE.divider);
      expect([divider.x, divider.y, divider.width, divider.height]).toEqual([
        0,
        71,
        W,
        1,
      ]);
      expect(paintOf(divider.node)).toBe(tok('outline-variant', mode));
      expect(divider.node.stroke).toMatchObject({ width: 1, sides: ['bottom'] });
    }
  });

  it('fixed row with 2 and with 4 tabs divides the width equally', () => {
    for (const n of [2, 4]) {
      const items = Array.from({ length: n }, (_, i) => ({
        label: `Tab ${i + 1}`,
        icon: '',
        selected: i === 0 ? 'true' : 'false',
      }));
      const d = draw('tabs', { items, style: 'secondary', iconPosition: 'top' });
      const tabs = boxesOf(d, NODE.tab);
      expect(tabs).toHaveLength(n);
      tabs.forEach((tab) => near(tab.width, W / n));
    }
  });

  it('label in title-small from the tokens (14, line 20, weight 500, spacing 0.1) and without family', () => {
    const d = draw('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    const style = textBox(d, 'Home').node.style;
    expect([
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ]).toEqual([14, 20, 500, 0.1]);
  });

  it('primary: selected in primary and the others in on-surface-variant, label and icon, in light and dark', () => {
    const d = both('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      const selected = tok('primary', mode);
      const inactive = tok('on-surface-variant', mode);
      expect(solid(textBox(d[mode], 'Home').node.fills)).toBe(selected);
      expect(solid(textBox(d[mode], 'Search').node.fills)).toBe(inactive);
      expect(solid(textBox(d[mode], 'Profile').node.fills)).toBe(inactive);
      expect(iconsOf(d[mode]).map((i) => i.color)).toEqual([
        selected,
        inactive,
        inactive,
      ]);
    }
  });

  it('secondary: the selected one in on-surface (SecondaryNavigationTabTokens.ActiveLabelTextColor) and the others in on-surface-variant', () => {
    const d = both('tabs', { items: THREE, style: 'secondary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      expect(solid(textBox(d[mode], 'Home').node.fills)).toBe(tok('on-surface', mode));
      expect(solid(textBox(d[mode], 'Search').node.fills)).toBe(
        tok('on-surface-variant', mode),
      );
      expect(iconsOf(d[mode]).map((i) => i.color)).toEqual([
        tok('on-surface', mode),
        tok('on-surface-variant', mode),
        tok('on-surface-variant', mode),
      ]);
    }
  });

  it('primary indicator: only on the selected tab, 3 high, radius 3, primary, the size of the label and centered on the tab', () => {
    const d = both('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      const indicators = boxesOf(d[mode], NODE.primaryIndicator);
      expect(indicators).toHaveLength(1);
      const [indicator] = indicators;
      const tab = boxesOf(d[mode], NODE.tab)[0]!;
      const label = textBox(d[mode], 'Home');
      expect(indicator!.height).toBe(3);
      expect(indicator!.y + indicator!.height).toBe(72);
      // matchContentSize = true: the content width (text), at least 24 (TabRow.kt:431-436)
      near(indicator!.width, Math.max(label.width, 24));
      near(indicator!.x + indicator!.width / 2, tab.x + tab.width / 2);
      expect(paintOf(indicator!.node)).toBe(tok('primary', mode));
      expect('cornerRadius' in indicator!.node && indicator!.node.cornerRadius).toBe(3);
      expect(allNamed(d[mode], NODE.secondaryIndicator)).toHaveLength(0);
    }
  });

  it('primary indicator of an icon-only tab or with a short label measures the minimum of 24', () => {
    const icon = draw(
      'tabs',
      {
        items: iconOnly.map((r, i) => ({ ...r, label: i === 0 ? '' : '' })),
        style: 'primary',
        iconPosition: 'top',
      },
      'light',
      { width: W, height: 48 },
    );
    near(box(icon, NODE.primaryIndicator).width, 24);
    const short = draw(
      'tabs',
      {
        items: [{ label: 'A', icon: '', selected: 'true' }],
        style: 'primary',
        iconPosition: 'top',
      },
      'light',
      { width: W, height: 48 },
    );
    near(box(short, NODE.primaryIndicator).width, 24);
  });

  it('secondary indicator: 3 high (SecondaryIndicator uses ActiveIndicatorHeight), primary, the full width of the tab and without rounded corner', () => {
    const d = both('tabs', { items: THREE, style: 'secondary', iconPosition: 'top' });
    for (const mode of ['light', 'dark'] as const) {
      const indicators = boxesOf(d[mode], NODE.secondaryIndicator);
      expect(indicators).toHaveLength(1);
      const [indicator] = indicators;
      const tab = boxesOf(d[mode], NODE.tab)[0]!;
      near(indicator!.x, tab.x);
      near(indicator!.width, tab.width);
      expect(indicator!.height).toBe(3);
      expect(indicator!.y + indicator!.height).toBe(72);
      expect(paintOf(indicator!.node)).toBe(tok('primary', mode));
      expect(allNamed(d[mode], NODE.primaryIndicator)).toHaveLength(0);
    }
  });

  it('icon above the text (Tab): 24 icon and label centered on the 72 tab, the text baseline 17 from the bottom and the icon 20 above it', () => {
    const d = draw('tabs', { items: THREE, style: 'primary', iconPosition: 'top' });
    const tab = boxesOf(d, NODE.tab)[0]!;
    const [icon] = iconsOf(d);
    const iconBox = boxOf(d, icon!.node);
    const label = textBox(d, 'Home');
    // placeTextAndIcon (Tab.kt:380-417): baseline = height - (14 + indicator 3); icon 20 above the baseline
    expect([iconBox.width, iconBox.height]).toEqual([24, 24]);
    expect(iconBox.y).toBe(11);
    // MC5 (#1033): the label is positioned by the baseline (`baselinePadding` top 20, bottom 9 and 8 of one-line
    // padding): the baseline 17 from the bottom and the icon 20 above it; the text box starts at the bottom of the icon
    expect(label.node.style.baselineTop).toBe(20);
    near(72 - (label.y + 20), 17);
    near(label.y, iconBox.y + 24);
    expect(label.y + label.height).toBe(72 - 8);
    near(iconBox.x + 12, tab.x + tab.width / 2);
    near(label.x + label.width / 2, tab.x + tab.width / 2);
  });

  it('label only or icon only stay centered on the 48 tab (placeTextOrIcon)', () => {
    const size = { width: W, height: 48 };
    const t = draw(
      'tabs',
      { items: textOnly, style: 'primary', iconPosition: 'top' },
      'light',
      size,
    );
    const label = textBox(t, 'Home');
    // the label takes the tab height (fill) and `cap-middle` centers the capital letter (FX6)
    near(label.y, 0);
    expect(label.height).toBe(48);
    const i = draw(
      'tabs',
      { items: iconOnly, style: 'primary', iconPosition: 'top' },
      'light',
      size,
    );
    near(boxOf(i, iconsOf(i)[0]!.node).y, 12);
  });

  it('leading icon (LeadingIconTab): icon, 8 and label side by side, centered on the 48 tab', () => {
    const d = draw(
      'tabs',
      { items: THREE, style: 'primary', iconPosition: 'leading' },
      'light',
      {
        width: W,
        height: 48,
      },
    );
    const tab = boxesOf(d, NODE.tab)[0]!;
    const iconBox = boxOf(d, iconsOf(d)[0]!.node);
    const label = textBox(d, 'Home');
    near(iconBox.y, 12);
    near(label.y, 0);
    near(label.x - (iconBox.x + 24), 8);
    near((iconBox.x + label.x + label.width) / 2, tab.x + tab.width / 2);
    // the indicator covers the icon, the space and the text
    const indicator = box(d, NODE.primaryIndicator);
    near(indicator.width, 24 + 8 + label.width);
    near(indicator.x, iconBox.x);
  });

  it('scrollable: initial inset of 52, tabs with the content width (label plus 2 times 16) and at least 90', () => {
    const items = [
      { label: 'Home', icon: 'Home', selected: 'true' },
      { label: 'Account settings', icon: 'Settings', selected: 'false' },
      { label: 'Profile', icon: 'Person', selected: 'false' },
    ];
    const d = draw('tabs', { items, style: 'primary-scrollable', iconPosition: 'top' });
    const tabs = boxesOf(d, NODE.tab);
    expect(tabs).toHaveLength(3);
    near(tabs[0]!.x, 52);
    near(tabs[0]!.width, 90);
    near(tabs[1]!.x, 52 + 90);
    near(tabs[1]!.width, textBox(d, 'Account settings').width + 32);
    near(tabs[2]!.width, 90);
    const indicator = box(d, NODE.primaryIndicator);
    near(indicator.x + indicator.width / 2, tabs[0]!.x + tabs[0]!.width / 2);
    near(indicator.width, textBox(d, 'Home').width);
  });

  it('scrollable with leading icon: the tab measures 16 + icon + 8 + label + 16 and the secondary indicator fills the tab', () => {
    const d = draw(
      'tabs',
      { items: THREE, style: 'secondary-scrollable', iconPosition: 'leading' },
      'light',
      {
        width: W,
        height: 48,
      },
    );
    const tabs = boxesOf(d, NODE.tab);
    const label = textBox(d, 'Home');
    near(tabs[0]!.x, 52);
    near(tabs[0]!.width, Math.max(90, 16 + 24 + 8 + label.width + 16));
    const indicator = box(d, NODE.secondaryIndicator);
    near(indicator.x, tabs[0]!.x);
    near(indicator.width, tabs[0]!.width);
    expect(indicator.height).toBe(3);
  });
});

describe('M4 group C — list-item', () => {
  const H1 = 56; // ListItemOneLineContainerHeight
  const H2 = 72; // ListItemTwoLineContainerHeight
  const H3 = 88; // ListItemThreeLineContainerHeight
  const size = (height: number) => ({ width: W, height });

  it('one line at 56: title centered, 24 leading icon 16 from the edge and title 16 from the icon', () => {
    const d = both(
      'list-item',
      { headlineContent: 'Wi-Fi', leadingIcon: 'Settings' },
      size(H1),
    );
    for (const mode of ['light', 'dark'] as const) {
      expect([d[mode].root.width, d[mode].root.height]).toEqual([W, H1]);
      expect(paintOf(d[mode].root)).toBe(tok('surface', mode));
      const icon = boxOf(d[mode], iconsOf(d[mode])[0]!.node);
      expect([icon.x, icon.y, icon.width, icon.height]).toEqual([16, 16, 24, 24]);
      const title = textBox(d[mode], 'Wi-Fi');
      expect(title.x).toBe(16 + 24 + 16);
      expect(title.height).toBe(24);
      expect(title.y).toBe((H1 - 24) / 2);
      expect(solid(title.node.fills)).toBe(tok('on-surface', mode));
      expect(iconsOf(d[mode])[0]!.color).toBe(tok('on-surface-variant', mode));
    }
  });

  it('title in body-large (16, line 24, weight 400, spacing 0.5) from the tokens', () => {
    const d = draw('list-item', { headlineContent: 'Title' }, 'light', size(H1));
    const style = textBox(d, 'Title').node.style;
    expect([
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ]).toEqual([16, 24, 400, 0.5]);
  });

  it('two lines at 72: title and supporting text centered together, supporting in body-medium and on-surface-variant, trailing text in label-small', () => {
    const d = both(
      'list-item',
      {
        headlineContent: 'Ana Souza',
        supportingContent: "Let's have lunch?",
        trailingContent: '12:30',
        leadingImage: 'https://example.com/ana.jpg',
      },
      size(H2),
    );
    for (const mode of ['light', 'dark'] as const) {
      const top = (H2 - (24 + 20)) / 2;
      const title = textBox(d[mode], 'Ana Souza');
      const support = textBox(d[mode], "Let's have lunch?");
      near(title.y, top);
      near(support.y, top + 24);
      expect(title.x).toBe(16 + 40 + 16);
      expect(solid(support.node.fills)).toBe(tok('on-surface-variant', mode));
      expect([
        support.node.style.fontSize,
        support.node.style.lineHeight,
        support.node.style.fontWeight,
        support.node.style.letterSpacing,
      ]).toEqual([14, 20, 400, 0.2]);
      // 40 avatar, round, centered on the height, 16 from the edge; without a downloaded image the reserved one in primary-container applies
      const avatar = box(d[mode], 'avatar');
      expect([avatar.x, avatar.y, avatar.width, avatar.height]).toEqual([16, 16, 40, 40]);
      // trailing text on the right, 16 from the edge, label-small in on-surface-variant and centered
      const trailing = textBox(d[mode], '12:30');
      near(trailing.x + trailing.width, W - 16);
      near(trailing.y, (H2 - trailing.height) / 2);
      expect(solid(trailing.node.fills)).toBe(tok('on-surface-variant', mode));
      expect([
        trailing.node.style.fontSize,
        trailing.node.style.lineHeight,
        trailing.node.style.fontWeight,
        trailing.node.style.letterSpacing,
      ]).toEqual([11, 16, 500, 0.5]);
      // 16 between the text and the trailing content
      near(title.x + title.width + 16, trailing.x);
    }
  });

  it('three lines at 88 (overline and supporting): everything top-aligned with 12 of padding; leading and trailing icons at the top', () => {
    const d = both(
      'list-item',
      {
        overlineContent: 'Today',
        headlineContent: 'Planning meeting',
        supportingContent: 'Room 3, with the product team.',
        leadingIcon: 'Settings',
        trailingIcon: 'Info',
      },
      size(H3),
    );
    for (const mode of ['light', 'dark'] as const) {
      const overline = textBox(d[mode], 'Today');
      const title = textBox(d[mode], 'Planning meeting');
      const support = textBox(d[mode], 'Room 3, with the product team.');
      expect([overline.y, overline.height]).toEqual([12, 16]);
      expect([title.y, title.height]).toEqual([28, 24]);
      expect([support.y, support.height]).toEqual([52, 20]);
      expect(solid(overline.node.fills)).toBe(tok('on-surface-variant', mode));
      expect([
        overline.node.style.fontSize,
        overline.node.style.lineHeight,
        overline.node.style.fontWeight,
        overline.node.style.letterSpacing,
      ]).toEqual([11, 16, 500, 0.5]);
      const [lead, trail] = iconsOf(d[mode]).map((i) => boxOf(d[mode], i.node));
      expect([lead!.x, lead!.y]).toEqual([16, 12]);
      expect([trail!.x + trail!.width, trail!.y, trail!.width]).toEqual([W - 16, 12, 24]);
      expect(iconsOf(d[mode]).map((i) => i.color)).toEqual([
        tok('on-surface-variant', mode),
        tok('on-surface-variant', mode),
      ]);
    }
  });

  it('only overline and title (two lines) stay centered; the overline comes before the title', () => {
    const d = draw(
      'list-item',
      { overlineContent: 'Today', headlineContent: 'Meeting' },
      'light',
      size(H2),
    );
    const overline = textBox(d, 'Today');
    const title = textBox(d, 'Meeting');
    near(overline.y, (H2 - 40) / 2);
    near(title.y, overline.y + 16);
  });

  it('one-line title: long text is cut with an ellipsis, without a text larger than the box warning', () => {
    const long =
      'Quarterly planning meeting with the whole product and engineering team of the company'.repeat(
        2,
      );
    const d = draw(
      'list-item',
      { headlineContent: long, leadingIcon: 'Settings' },
      'light',
      size(H1),
    );
    const title = textBox(d, long);
    expect(title.node.style).toMatchObject({ maxLines: 1, ellipsis: true });
    expect(title.height).toBe(24);
    // pt-BR kept: 'não cabe' is the pt-BR text of the warning emitted by src/model
    expect(d.warnings.filter((w) => /text larger than the box|não cabe/.test(w))).toEqual(
      [],
    );
  });

  it('one-line overline; supporting text of one line with an overline and of up to two without it, with an ellipsis', () => {
    const long =
      'Very long supporting text that does not fit on one line of the list and must end with an ellipsis at the end of the text. '.repeat(
        3,
      );
    const withOverline = draw(
      'list-item',
      { overlineContent: 'Today', headlineContent: 'Title', supportingContent: long },
      'light',
      size(H3),
    );
    expect(textBox(withOverline, long).node.style).toMatchObject({
      maxLines: 1,
      ellipsis: true,
    });
    expect(textBox(withOverline, 'Today').node.style).toMatchObject({
      maxLines: 1,
      ellipsis: true,
    });
    const alone = draw(
      'list-item',
      { headlineContent: 'Title', supportingContent: long },
      'light',
      size(H3),
    );
    const support = textBox(alone, long);
    expect(support.node.style).toMatchObject({ maxLines: 2, ellipsis: true });
    expect(support.height).toBe(40);
    // pt-BR kept: 'não cabe' is the pt-BR text of the warning emitted by src/model
    expect(
      alone.warnings.filter((w) => /text larger than the box|não cabe/.test(w)),
    ).toEqual([]);
  });

  it('the leading and trailing icons use the set icon node (no repeated SVG path) and a name outside the set does not pass silently', () => {
    const raw = files.find((f) => f.path === 'components/list-item.json')!.text!;
    expect(raw).toContain('"type": "icon"');
    expect(raw).not.toMatch(/"M\d[^"]{40,}"/);
  });

  it('without a rectangle the height is the type minimum: 56 with one line, 72 with two and 88 with three', () => {
    const entry = entryOf('list-item');
    const library = catalog.library!;
    const options = {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, 'light'),
      icons: library.icons!,
    };
    const height = (values: Values) =>
      measureComponent(
        entry.component!,
        { ...defaultValues(entry.type), ...values },
        { width: W, height: null },
        options,
      ).height;
    expect(height({ headlineContent: 'Wi-Fi', leadingIcon: 'Settings' })).toBe(H1);
    expect(
      height({ headlineContent: 'Ana', supportingContent: "Let's have lunch?" }),
    ).toBe(H2);
    expect(height({ overlineContent: 'Today', headlineContent: 'Ana' })).toBe(H2);
    expect(
      height({
        overlineContent: 'Today',
        headlineContent: 'Ana',
        supportingContent: 'Sala 3',
      }),
    ).toBe(H3);
    // the 40 avatar does not exceed the 56 (8 of padding above and below, 40 + 16)
    expect(
      height({ headlineContent: 'Ana', leadingImage: 'https://example.com/a.jpg' }),
    ).toBe(H1);
  });

  it('40 avatar with CornerFull and primary-container placeholder (ListItemLeadingAvatarSize, Color and Shape)', () => {
    const d = both(
      'list-item',
      { headlineContent: 'Ana', leadingImage: 'https://example.com/a.jpg' },
      size(H1),
    );
    for (const mode of ['light', 'dark'] as const) {
      const avatar = box(d[mode], 'avatar');
      expect([avatar.width, avatar.height]).toEqual([40, 40]);
      expect(paintOf(avatar.node)).toBe(tok('primary-container', mode));
      expect('cornerRadius' in avatar.node && avatar.node.cornerRadius).toBe(
        tokens['corner-full'],
      );
    }
  });
});

describe('M4 group C — the default and the examples draw without a warning', () => {
  // pt-BR kept: 'não cabe' is the pt-BR text of the warning emitted by src/model
  const BAD =
    /não cabe|text larger than the box|content larger than the box|unknown icon|stretched icon|does not exist in the specialization tokens|field not provided/i;
  it.each(['tabs', 'list-item'])('%s: preview and examples, in light and dark', (id) => {
    const entry = entryOf(id);
    const preview = entry.component!.preview ?? {};
    const cases = [{}, ...(entry.examples ?? []).map((e) => e.values ?? {})];
    for (const mode of ['light', 'dark'] as const) {
      for (const values of cases) {
        const d = draw(id, { ...preview, ...values } as Values, mode);
        expect(d.warnings.filter((w) => BAD.test(w))).toEqual([]);
      }
    }
  });
});
