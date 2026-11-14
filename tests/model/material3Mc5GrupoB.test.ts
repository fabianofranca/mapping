// MC5 (#1033, stage #898), group B: tabs, top-app-bar and list-item. The vertical positions that were estimated for
// Roboto 14/20 move to the Compose baseline (`baselinePadding`) and the height now follows the measured lines
// (`$lines`) or the `style` (`sizing` by expression). Reference (commit 5113b82a…, androidx/compose/material3/
// material3/src/commonMain/kotlin/androidx/compose/material3):
//  - Tab.kt 367 to 417 (`placeTextAndIcon`: the last baseline sits `SingleLineTextBaselineWithIcon` 14 or
//    `DoubleLineTextBaselineWithIcon` 6 plus the 3 indicator above the tab bottom; the icon sits `IconDistanceFromBaseline`
//    20 above the first baseline) and 420 to 438 (the constants);
//  - AppBar.kt 3213 to 3231 (the large title has its baseline `titleBottomPadding` above the bar bottom) and 3510 and 3511
//    (`MediumTitleBottomPadding` 24 and `LargeTitleBottomPadding` 28); tokens/AppBar{Small,Medium,Large}Tokens.kt
//    (`ContainerHeight` 64, 112 and 152);
//  - ListItem.kt 191 to 330 (`isSupportingMultiline` by the baselines of the supporting text), 451 to 473 (`calculateHeight`),
//    475 to 524 (`place`: the three-line item pins the content to the top, at `topPadding` 12) and 712 to 757 (`ListItemType`).
// pt-BR kept: node names ('aba', 'rótulo empilhado', 'pilha', 'indicador primário', 'título grande', 'corpo', 'apoio',
// 'textos') and the example name 'Apoio de duas linhas' are the Portuguese data of libraries/material3-compose
import { describe, expect, it } from 'vitest';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import {
  drawFitted,
  entryOf,
  fittedSize,
  templateNodes,
} from '../support/material3Fitted';
import type { Mode, Values } from '../support/material3Fitted';

type Drawing = ReturnType<typeof drawFitted>['drawing'];
type Row = Record<string, string>;
const MODES: Mode[] = ['light', 'dark'];

const near = (value: number | undefined, expected: number, digits = 3) =>
  expect(value).toBeCloseTo(expected, digits);

const visible = (d: Drawing, name: string): SceneNode[] =>
  [...walk(d.root)].filter((n) => n.name === name && n.visible);
const boxOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const boxesOf = (d: Drawing, name: string) =>
  visible(d, name).map((node) => ({ node, ...boxOf(d, node) }));
const textBox = (d: Drawing, text: string) => {
  const node = [...walk(d.root)].find(
    (n): n is TextNode => n.type === 'text' && n.visible && n.text === text,
  );
  if (node === undefined) throw new Error(`missing text: ${text}`);
  return { node, ...boxOf(d, node) };
};
/** The drawn icons (the `icon` node is a 24 group with a path), in drawing order. */
const iconBoxes = (d: Drawing) =>
  [...walk(d.root)]
    .filter(
      (n) =>
        n.visible && n.type === 'group' && [...walk(n)].some((c) => c.type === 'path'),
    )
    .map((node) => ({ node, ...boxOf(d, node) }));

/** The template `text` nodes with `baselinePadding` (in any branch). */
function textsWithBaseline(id: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walkJson = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walkJson);
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.type === 'text' && record.baselinePadding !== undefined)
      found.push(record);
    Object.values(record).forEach(walkJson);
  };
  walkJson(entryOf(id).component!.template);
  return found;
}

// ---------------------------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------------------------
const row = (label: string, selected = false, icon = 'Home'): Row => ({
  label,
  icon,
  selected: String(selected),
});
const THREE = [
  row('Home', true),
  row('Search', false, 'Search'),
  row('Profile', false, 'Person'),
];
const TWO_LINES = [
  row('Account settings', true),
  row('Search', false, 'Search'),
  row('Profile', false, 'Person'),
];
const STYLES = ['primary', 'secondary', 'primary-scrollable', 'secondary-scrollable'];

/** The tab table (a single row, icon above) at the given marking height. */
const drawTabs = (
  items: Row[],
  style: string,
  height: number,
  mode: Mode = 'light',
): Drawing =>
  drawFitted('tabs', { items, style, iconPosition: 'top' } as unknown as Values, mode, {
    width: 412,
    height,
  }).drawing;

/** The label baseline: it only exists when the node carries `baselinePadding.top` (the estimate had none). */
function baselineOf(node: TextNode, y: number): number {
  const top = node.style.baselineTop;
  if (top === undefined)
    throw new Error(`the label has no declared baseline (baselineTop)`);
  return y + top;
}

describe('MC5 group B — tabs, icon above the text by the baseline (Tab.kt 367 to 417)', () => {
  it('the stacked label carries baselinePadding.top 20 and the stack lost the estimated [0,0,12,0] padding', () => {
    // Fixed and scrollable: one text node each, with top = IconDistanceFromBaseline (Tab.kt 438).
    const labels = textsWithBaseline('tabs');
    expect(labels).toHaveLength(2);
    for (const label of labels)
      expect((label.baselinePadding as { top: number }).top).toBe(20);
    const stacks = templateNodes('tabs', 'pilha');
    expect(stacks.length).toBeGreaterThan(0);
    for (const stack of stacks)
      expect(
        JSON.stringify((stack.layout as { padding?: unknown }).padding),
      ).not.toContain('12');
  });

  it.each(STYLES)(
    '%s, one line: the last baseline sits 17 above the bottom (14 + 3 indicator) and the icon 20 above it, in light and dark',
    (style) => {
      for (const mode of MODES) {
        const d = drawTabs(THREE, style, 72, mode);
        const label = textBox(d, 'Home');
        const baseline = baselineOf(label.node, label.y);
        near(72 - baseline, 17);
        const icon = iconBoxes(d)[0]!;
        near(icon.height, 24);
        // Tab.kt 399 to 411: the icon bottom sits IconDistanceFromBaseline (20) above the first baseline
        near(baseline - (icon.y + icon.height), 20);
        near(icon.y, 11);
      }
    },
  );

  it('the 72 tab leaves the others alone: the icon of an icon-only tab and the text one stay centered', () => {
    const only = drawFitted(
      'tabs',
      {
        items: [row('', true), row('', false, 'Search')],
        style: 'primary',
        iconPosition: 'top',
      } as unknown as Values,
      'light',
      { width: 412, height: 72 },
    ).drawing;
    near(iconBoxes(only)[0]!.y, 24);
  });

  it('two lines (fixed row): the label breaks in two, the last baseline sits 9 above the bottom (6 + 3) and the icon 20 above the first', () => {
    // In the Compose tab the height becomes max(72, icon + text + 20) = 84; here the marking provides the height.
    for (const mode of MODES) {
      const d = drawTabs(TWO_LINES, 'primary', 84, mode);
      const long = boxesOf(d, 'rótulo empilhado').find(
        (b) => (b.node as TextNode).text === 'Account settings',
      )!;
      expect(long, 'two-line label').toBeDefined();
      const first = baselineOf(long.node as TextNode, long.y);
      const last = first + 20;
      near(84 - last, 9);
      const icon = iconBoxes(d)[0]!;
      near(first - (icon.y + icon.height), 20);
      // The short tab in the same row follows the one-line distance (17), by its own tab.
      const short = textBox(d, 'Search');
      near(84 - baselineOf(short.node, short.y), 17);
    }
  });

  it('two lines: the text takes the tab width minus the 2 × 16 of HorizontalTextPadding', () => {
    const d = drawTabs(TWO_LINES, 'primary', 84);
    const tab = boxesOf(d, 'aba')[0]!;
    const long = textBox(d, 'Account settings');
    expect(long.width).toBeLessThanOrEqual(tab.width - 32 + 1e-6);
    near(long.height, 49);
  });

  it('the primary indicator stays the size of the content (matchContentSize)', () => {
    const d = drawTabs(THREE, 'primary', 72);
    const indicator = boxesOf(d, 'indicador primário')[0]!;
    near(indicator.width, textBox(d, 'Home').width);
    const long = drawTabs(TWO_LINES, 'primary', 84);
    const wide = boxesOf(long, 'indicador primário')[0]!;
    const text = textBox(long, 'Account settings');
    near(wide.width, text.width);
    const tab = boxesOf(long, 'aba')[0]!;
    expect(wide.width).toBeLessThanOrEqual(tab.width - 32 + 1e-6);
  });

  it.each(MODES)(
    'the tabs examples draw without warnings, at the size and at the fitted size (%s)',
    (mode) => {
      for (const example of entryOf('tabs').examples) {
        const values = example.values as Values;
        const fit = fittedSize('tabs', values, mode);
        expect(fit.messages, example.name).toEqual([]);
        const { drawing } = drawFitted('tabs', values, mode);
        expect(drawing.warnings, example.name).toEqual([]);
        const size = entryOf('tabs').component!.size;
        const { drawing: atSize } = drawFitted('tabs', values, mode, size);
        expect(atSize.warnings, example.name).toEqual([]);
      }
    },
  );

  // the scrollable ones do not break the label (the tab has the content width) and a long label overflows the row, as before
  it.each(['primary', 'secondary'])(
    '%s: the two-line label draws without warnings, in light and dark',
    (style) => {
      for (const mode of MODES) {
        expect(drawTabs(TWO_LINES, style, 84, mode).warnings).toEqual([]);
        expect(drawTabs(TWO_LINES, style, 72, mode).warnings).toEqual([]);
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
// top-app-bar
// ---------------------------------------------------------------------------------------------
const BAR_HEIGHT: Record<string, number> = {
  small: 64,
  center: 64,
  medium: 112,
  large: 152,
};

describe('MC5 group B — top-app-bar, large title by the baseline and the height by the style', () => {
  it('the large titles (medium and large) carry baselinePadding.bottom 24 and 28, without the estimated bottom anchor', () => {
    const nodes = templateNodes('top-app-bar', 'título grande');
    expect(nodes).toHaveLength(2);
    expect(
      nodes.map((n) => (n.baselinePadding as { bottom: number } | undefined)?.bottom),
    ).toEqual([24, 28]);
    // the 16 and 20 anchors were the Roboto estimate: the box now goes down to the bar bottom
    for (const node of nodes) expect((node.anchors as { bottom: number }).bottom).toBe(0);
  });

  it.each([
    ['medium', 24, 24, 32],
    ['large', 28, 28, 36],
  ])(
    '%s: the title baseline sits %i above the bar bottom (AppBar.kt 3213 to 3231)',
    (style, bottom, size, lineHeight) => {
      for (const mode of MODES) {
        const { box, drawing } = drawFitted(
          'top-app-bar',
          { title: 'Settings', style, navigationIcon: 'ArrowBack' },
          mode,
        );
        expect(box.height).toBe(BAR_HEIGHT[style]);
        const title = boxesOf(drawing, 'título grande')[0]!;
        const first = lineHeight / 2 + ((0.93 - 0.24) * size) / 2;
        near(box.height - (title.y + first), bottom, 1);
      }
    },
  );

  it('sizing.height is the expression by style and the size stays 412 × 152', () => {
    const component = entryOf('top-app-bar').component!;
    expect(component.size).toEqual({ width: 412, height: 152 });
    expect(typeof component.sizing?.height).toBe('object');
  });

  it.each(Object.entries(BAR_HEIGHT))(
    'style %s: the fitted size is %i high and the marking width',
    (style, height) => {
      for (const mode of MODES) {
        const fit = fittedSize(
          'top-app-bar',
          { title: 'Home', style, navigationIcon: 'Menu' },
          mode,
        );
        expect(fit.height).toBe(height);
        expect(fit.messages).toEqual([]);
        const { drawing } = drawFitted(
          'top-app-bar',
          { title: 'Home', style, navigationIcon: 'Menu' },
          mode,
          { width: 412 },
        );
        expect(drawing.warnings, `${style} (${mode})`).toEqual([]);
      }
    },
  );

  it('without a style (the default is small) the fit gives 64', () => {
    expect(fittedSize('top-app-bar', { title: 'Home' }).height).toBe(64);
  });

  it.each(MODES)(
    'the bar examples draw without warnings at the size and at the fitted size (%s)',
    (mode) => {
      for (const example of entryOf('top-app-bar').examples) {
        const values = example.values as Values;
        const { drawing } = drawFitted('top-app-bar', values, mode, { width: 412 });
        expect(drawing.warnings, example.name).toEqual([]);
        const size = entryOf('top-app-bar').component!.size;
        const { drawing: atSize } = drawFitted('top-app-bar', values, mode, {
          width: size.width,
          height: size.height,
        });
        expect(atSize.warnings, example.name).toEqual([]);
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
// list-item
// ---------------------------------------------------------------------------------------------
const LONG_SUPPORT =
  'Room 3, with the product team, to agree on the semester planning and the next steps';
const twoLineSupport = {
  headlineContent: 'Planning meeting',
  supportingContent: LONG_SUPPORT,
  leadingIcon: 'DateRange',
  trailingContent: '12:30',
};

describe('MC5 group B — list-item, a two-line supporting text makes the three-line item (ListItem.kt 191 to 330)', () => {
  it('the body cites the supporting lines (isSupportingMultiline) in the minHeight, the padding and the alignment', () => {
    const [body] = templateNodes('list-item', 'corpo');
    expect(body).toBeDefined();
    const json = JSON.stringify(body);
    expect(json).toContain('"$lines":"apoio"');
    // the 12 breathing room and the 88 of the three-line item now also hold through this path
    const layout = JSON.stringify((body as { layout: unknown }).layout);
    expect(layout).toContain('"$lines":"apoio"');
    expect((body as { minHeight: unknown }).minHeight).toBeDefined();
    expect(JSON.stringify((body as { minHeight: unknown }).minHeight)).toContain(
      '"$lines":"apoio"',
    );
  });

  it('2-line supporting text without overline: the fitted size gives 88 (calculateHeight, three lines)', () => {
    for (const mode of MODES) {
      const fit = fittedSize('list-item', twoLineSupport, mode);
      expect(fit.messages).toEqual([]);
      expect(fit.height).toBe(88);
    }
  });

  it('1-line supporting text gives 72; headline only, 56; overline and supporting text, 88', () => {
    expect(
      fittedSize('list-item', {
        headlineContent: 'Ana',
        supportingContent: 'Shall we have lunch?',
      }).height,
    ).toBe(72);
    expect(fittedSize('list-item', { headlineContent: 'Ana' }).height).toBe(56);
    expect(
      fittedSize('list-item', {
        headlineContent: 'Ana',
        overlineContent: 'Today',
        supportingContent: 'Shall we have lunch?',
      }).height,
    ).toBe(88);
  });

  it('2-line supporting text: the leading icon and the trailing text start 12 from the top (the three-line breathing room), not centered in 88', () => {
    for (const mode of MODES) {
      const { box, drawing } = drawFitted('list-item', twoLineSupport, mode);
      expect(box.height).toBe(88);
      const icon = iconBoxes(drawing)[0]!;
      near(icon.y, 12);
      near(textBox(drawing, 'Planning meeting').y, 12);
      const trailing = textBox(drawing, '12:30');
      near(trailing.y, 12);
    }
  });

  it('2-line supporting text: the avatar is also pinned to the top (12)', () => {
    const { drawing } = drawFitted('list-item', {
      ...twoLineSupport,
      leadingIcon: '',
      leadingImage: 'https://example.com/ana.jpg',
    });
    const avatar = boxesOf(drawing, 'avatar')[0]!;
    near(avatar.y, 12);
    near(avatar.height, 40);
  });

  it('1-line supporting text: 72 and the leading and trailing content centered as before (breathing room of 8)', () => {
    for (const mode of MODES) {
      const { box, drawing } = drawFitted(
        'list-item',
        {
          headlineContent: 'Ana Souza',
          supportingContent: 'Shall we have lunch?',
          leadingIcon: 'Person',
          trailingContent: '12:30',
        },
        mode,
      );
      expect(box.height).toBe(72);
      near(iconBoxes(drawing)[0]!.y, 24);
      const trailing = textBox(drawing, '12:30');
      near(trailing.y + trailing.height / 2, 36);
      const texts = boxesOf(drawing, 'textos')[0]!;
      near(texts.y + texts.height / 2, 36);
    }
  });

  it('the three-line text block by supporting text sits at the top (12) and ends inside the 88 item', () => {
    const { box, drawing } = drawFitted('list-item', twoLineSupport);
    const texts = boxesOf(drawing, 'textos')[0]!;
    near(texts.y, 12);
    near(texts.height, 24 + 40, 3);
    expect(texts.y + texts.height).toBeLessThanOrEqual(box.height - 12 + 1e-6);
  });

  it('the three-line item from the overline stays the same (88, content pinned to the top)', () => {
    const { box, drawing } = drawFitted('list-item', {
      headlineContent: 'Meeting',
      overlineContent: 'Today',
      supportingContent: 'Room 3',
      leadingIcon: 'DateRange',
    });
    expect(box.height).toBe(88);
    near(iconBoxes(drawing)[0]!.y, 12);
  });

  it.each(MODES)(
    'the list-item examples draw without warnings at the size and at the fitted size (%s)',
    (mode) => {
      for (const example of entryOf('list-item').examples) {
        const values = example.values as Values;
        const fit = fittedSize('list-item', values, mode);
        expect(fit.messages, example.name).toEqual([]);
        const { drawing } = drawFitted('list-item', values, mode);
        expect(drawing.warnings, example.name).toEqual([]);
        const size = entryOf('list-item').component!.size;
        const { drawing: atSize } = drawFitted('list-item', values, mode, size);
        expect(atSize.warnings, example.name).toEqual([]);
      }
    },
  );

  it('the "Apoio de duas linhas" example exists and measures 88', () => {
    const example = entryOf('list-item').examples.find(
      (e) => e.name === 'Apoio de duas linhas',
    );
    expect(example, 'Apoio de duas linhas example').toBeDefined();
    expect(fittedSize('list-item', example!.values as Values).height).toBe(88);
  });
});
