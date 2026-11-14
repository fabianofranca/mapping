// MC5 (#1033, stage #898), group C: button, extended-fab, chip, text-field, secure-text-field and search-bar. The height
// now follows the content (the long label breaks and the height grows) or the fields (the text-field supporting text), and
// the root limits (280 for the field, 360 and 720 for the bar) enter the template. Reference (commit 5113b82a…,
// androidx/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3):
//  - Button.kt 144 to 150: `Row(Modifier.defaultMinSize(58, 40).padding(contentPadding))`, `ContentPadding` 24/8 (479 to 486);
//  - FloatingActionButton.kt 107 to 123 and 159 to 161: the `Box` of the `ExtendedFloatingActionButton` has `defaultMinSize` 56 by 56
//    (`FabBaselineTokens`), without vertical padding; 396 to 433: `Row` with `sizeIn(minWidth)` 80 and side padding only;
//  - Chip.kt 2059: `defaultMinSize(minHeight = 32).padding(paddingValues)` with horizontal-only `paddingValues` (2943 to 2964);
//  - TextFieldDefaults.kt 66 to 82 and 885 to 902 (`MinHeight` 56 and `MinWidth` 280), 466 to 470 (`supportingTextPadding`, top 4),
//    TextField.kt 301 to 308 and 799 to 801, OutlinedTextField.kt 246 to 261 (`padding(top = minimizedLabelHalfHeight())`, 8) and
//    internal/TextFieldImpl.kt (`MinSupportingTextLineHeight` 16);
//  - SearchBar.kt 1356 to 1360 (`sizeIn(360, 720, 56)` of the field), 665 (the docked: `width(SearchBarMinWidth)`) and 2711 to 2714.
// pt-BR kept: node names ('conteúdo', 'rótulo', 'texto', 'contêiner', 'apoio (linha)') are the Portuguese data of libraries/material3-compose
import { describe, expect, it } from 'vitest';
import { fitComponentSize } from '../../src/model/components/sizing';
import {
  approximateMeasurer,
  measureComponent,
} from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import {
  catalog,
  drawFitted,
  entryOf,
  fittedSize,
  templateNodes,
} from '../support/material3Fitted';
import type { Mode, Values } from '../support/material3Fitted';

type Drawing = ReturnType<typeof drawFitted>['drawing'];
const MODES: Mode[] = ['light', 'dark'];

const optionsOf = (mode: Mode) => {
  const library = catalog.library!;
  return {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  };
};
const allValues = (id: string, values: Values) =>
  ({ ...defaultValues(entryOf(id).type), ...values }) as never;

/**
 * The size the app's Arrange gives to the marking of `width` × `height`: its width stays
 * (`auto: { width: false }`) and the height follows the `sizing`. Without an adjustable axis, the marking does not change.
 */
function arrange(id: string, values: Values, width: number, height: number, mode: Mode) {
  const fit = fitComponentSize(
    entryOf(id).component!,
    allValues(id, values),
    optionsOf(mode),
    { base: { width, height }, auto: { width: false } },
  );
  return { width: fit?.width ?? width, height: fit?.height ?? height };
}

const visible = (d: Drawing, name: string): SceneNode[] =>
  [...walk(d.root)].filter((n) => n.name === name && n.visible);
const boxOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const textOf = (d: Drawing, name: string): TextNode => {
  const node = visible(d, name).find((n): n is TextNode => n.type === 'text');
  if (node === undefined) throw new Error(`missing text: ${name}`);
  return node;
};
const near = (value: number | undefined, expected: number, digits = 3) =>
  expect(value).toBeCloseTo(expected, digits);
/** The text lines (the node height divided by the line height). */
const linesOf = (d: Drawing, name: string): number => {
  const node = textOf(d, name);
  const lineHeight = node.style.lineHeight;
  if (lineHeight === undefined) throw new Error(`text without a line height: ${name}`);
  return Math.round(boxOf(d, node).height / lineHeight);
};
/** The first drawn icon (a group with a path), in drawing order. */
const firstIcon = (d: Drawing) =>
  [...walk(d.root)].find(
    (n) => n.visible && n.type === 'group' && [...walk(n)].some((c) => c.type === 'path'),
  )!;

// ---------------------------------------------------------------------------------------------
// button
// ---------------------------------------------------------------------------------------------
describe('MC5 group C — button, the height follows the label lines (Button.kt 144 to 150)', () => {
  const STYLES = ['filled', 'tonal', 'outlined', 'text', 'elevated'];

  it('sizing.height is hug, the root keeps the minimum of 40 and the content and the label hug the height', () => {
    const comp = entryOf('button').component!;
    expect(comp.sizing?.height).toBe('hug');
    expect(comp.size.height).toBe(40);
    expect(comp.template.minHeight).toBe(40);
    expect(templateNodes('button', 'conteúdo')[0]!.height).toBe('hug');
    expect(templateNodes('button', 'rótulo')[0]!.height).toBe('hug');
  });

  it.each(MODES)(
    'the 136-wide marking: 1 line measures 40 and 2 lines measure 56 (8 + 40 + 8) (%s)',
    (mode) => {
      expect(arrange('button', { label: 'Save' }, 136, 40, mode)).toEqual({
        width: 136,
        height: 40,
      });
      expect(arrange('button', { label: 'Save and continue' }, 136, 40, mode)).toEqual({
        width: 136,
        height: 56,
      });
    },
  );

  it.each(MODES)(
    'the long-label example grows by lines: height = 16 + 20 × lines, width kept (%s)',
    (mode) => {
      const values = {
        label: 'Save changes and keep editing',
        style: 'filled',
      };
      const fit = arrange('button', values, 136, 40, mode);
      const { drawing } = drawFitted('button', values, mode, fit);
      const lines = linesOf(drawing, 'rótulo');
      expect(lines).toBeGreaterThanOrEqual(3);
      expect(fit).toEqual({ width: 136, height: 16 + 20 * lines });
      // The text fits the fitted box, with 8 above and below.
      const text = boxOf(drawing, textOf(drawing, 'rótulo'));
      near(text.y, 8);
      near(text.y + text.height, fit.height - 8);
      expect(drawing.warnings).toEqual([]);
    },
  );

  it.each(STYLES.flatMap((style) => MODES.map((mode) => [style, mode] as const)))(
    'the %s button with a long label draws without warnings at the fitted size (%s)',
    (style, mode) => {
      const values = { label: 'Save and continue', style, icon: 'Add' };
      const fit = arrange('button', values, 136, 40, mode);
      expect(fit.height).toBe(56);
      const { drawing } = drawFitted('button', values, mode, fit);
      expect(drawing.warnings).toEqual([]);
      // The icon is centered on the height of the text block (Row with CenterVertically).
      const icon = boxOf(drawing, firstIcon(drawing));
      near(icon.y + icon.height / 2, fit.height / 2);
    },
  );

  it('the one-line label stays centered by the capital letter in the 40 box', () => {
    const { drawing } = drawFitted('button', { label: 'Save' }, 'light', {
      width: 136,
      height: 40,
    });
    const text = boxOf(drawing, textOf(drawing, 'rótulo'));
    near(text.y + text.height / 2, 20, 0);
    expect(textOf(drawing, 'rótulo').style.verticalAlign).toBe('cap-middle');
  });
});

// ---------------------------------------------------------------------------------------------
// extended-fab
// ---------------------------------------------------------------------------------------------
describe('MC5 group C — extended-fab, the height follows the label lines (FloatingActionButton.kt 159 to 161)', () => {
  const base = { text: 'Create', icon: 'Add' };

  it('sizing.height is hug, the root keeps the minimum of 56 and the content and the label hug the height', () => {
    const comp = entryOf('extended-fab').component!;
    expect(comp.sizing?.height).toBe('hug');
    expect(comp.size.height).toBe(56);
    expect(comp.template.minHeight).toBe(56);
    expect(templateNodes('extended-fab', 'conteúdo')[0]!.height).toBe('hug');
    expect(templateNodes('extended-fab', 'texto')[0]!.height).toBe('hug');
  });

  it.each(MODES)(
    'one and two lines stay at the 56 minimum (40 < 56) and three lines measure 60 (%s)',
    (mode) => {
      expect(arrange('extended-fab', base, 142, 56, mode).height).toBe(56);
      const two = { ...base, text: 'Create note' };
      const { drawing: d2 } = drawFitted('extended-fab', two, mode, { width: 142 });
      expect(linesOf(d2, 'texto')).toBe(2);
      expect(arrange('extended-fab', two, 142, 56, mode).height).toBe(56);
      const three = { ...base, text: 'Create invoice note' };
      const { drawing: d3 } = drawFitted('extended-fab', three, mode, { width: 142 });
      expect(linesOf(d3, 'texto')).toBe(3);
      expect(arrange('extended-fab', three, 142, 56, mode)).toEqual({
        width: 142,
        height: 60,
      });
      expect(
        drawFitted('extended-fab', three, mode, { width: 142, height: 60 }).drawing
          .warnings,
      ).toEqual([]);
    },
  );

  it.each(MODES)('collapsed (icon only) stays at the 56 minimum (%s)', (mode) => {
    const values = { text: 'Create a new invoice note', icon: 'Add', expanded: 'false' };
    expect(arrange('extended-fab', values, 56, 56, mode)).toEqual({
      width: 56,
      height: 56,
    });
  });
});

// ---------------------------------------------------------------------------------------------
// chip
// ---------------------------------------------------------------------------------------------
describe('MC5 group C — chip, the height follows the label lines (Chip.kt 2059)', () => {
  const long = 'Add meeting to the shared calendar';

  it('sizing.height is hug, the root keeps the minimum of 32 and the content and the label hug the height', () => {
    const comp = entryOf('chip').component!;
    expect(comp.sizing?.height).toBe('hug');
    expect(comp.size.height).toBe(32);
    expect(comp.template.minHeight).toBe(32);
    expect(templateNodes('chip', 'conteúdo')[0]!.height).toBe('hug');
    expect(templateNodes('chip', 'rótulo')[0]!.height).toBe('hug');
  });

  it.each(MODES)(
    'one line measures 32 and two lines measure 40 (Compose adds no vertical padding) (%s)',
    (mode) => {
      expect(arrange('chip', { label: 'Open now' }, 232, 32, mode)).toEqual({
        width: 232,
        height: 32,
      });
      const values = { label: long, style: 'assist' };
      const fit = arrange('chip', values, 232, 32, mode);
      const { drawing } = drawFitted('chip', values, mode, fit);
      expect(linesOf(drawing, 'rótulo')).toBe(2);
      expect(fit).toEqual({ width: 232, height: 40 });
      expect(drawing.warnings).toEqual([]);
    },
  );

  const STYLES = [
    'assist',
    'assist-elevated',
    'filter',
    'filter-elevated',
    'input',
    'suggestion',
    'suggestion-elevated',
  ];
  const ICONS: Values[] = [
    {},
    { leadingIcon: 'DateRange' },
    { trailingIcon: 'Close' },
    { leadingIcon: 'DateRange', trailingIcon: 'Close' },
    { selected: 'true' },
    { selected: 'true', trailingIcon: 'Close' },
    { avatar: 'https://example.com/ana.png', trailingIcon: 'Close' },
  ];
  const cases = STYLES.flatMap((style) =>
    ICONS.flatMap((icons) =>
      MODES.map((mode) => ({ style, icons, mode, name: JSON.stringify(icons) })),
    ),
  );
  it.each(cases)(
    'the long label breaks in the width that is left: the content takes the marking width, without warnings ($style $name, $mode)',
    ({ style, icons, mode }) => {
      const values = { label: long, style, ...icons };
      const fit = arrange('chip', values, 200, 32, mode);
      const { drawing } = drawFitted('chip', values, mode, fit);
      const content = boxOf(drawing, visible(drawing, 'conteúdo')[0]!);
      near(content.x, 0);
      near(content.width, fit.width);
      expect(drawing.warnings).toEqual([]);
      expect(fit.height).toBe(Math.max(32, 20 * linesOf(drawing, 'rótulo')));
    },
  );
});

// ---------------------------------------------------------------------------------------------
// text-field e secure-text-field
// ---------------------------------------------------------------------------------------------
describe.each(['text-field', 'secure-text-field'])(
  'MC5 group C — %s, the height by the style and the supporting text (TextFieldDefaults.kt 66 to 82, 466 to 470)',
  (id) => {
    const filled = { label: 'Name', style: 'filled' };
    const support = { supportingText: 'At least 8 characters' };
    const cases: [string, Values, number][] = [
      ['filled without supporting text', filled, 56],
      ['filled with supporting text (56 + 4 + 16)', { ...filled, ...support }, 76],
      ['outlined without supporting text (8 + 56)', { label: 'Name', style: 'outlined' }, 64],
      [
        'outlined with supporting text (8 + 56 + 4 + 16)',
        { label: 'Name', style: 'outlined', ...support },
        84,
      ],
    ];

    it('the size stays 280 by 84 and sizing.height is an expression (not a fixed 84)', () => {
      const comp = entryOf(id).component!;
      expect(comp.size).toEqual({ width: 280, height: 84 });
      expect(typeof comp.sizing?.height).toBe('object');
    });

    it('the template root keeps the minimum width of 280 (Compose defaultMinSize)', () => {
      expect(entryOf(id).component!.template.minWidth).toBe(280);
    });

    it.each(
      cases.flatMap(([name, values, height]) =>
        MODES.map((mode) => ({ name, values, height, mode })),
      ),
    )(
      '$name measures $height high and 280 wide ($mode)',
      ({ values, height, mode }) => {
        const size = fittedSize(id, values, mode);
        expect({ width: size.width, height: size.height }).toEqual({
          width: 280,
          height,
        });
      },
    );

    it.each(
      cases.flatMap(([name, values, height]) =>
        MODES.map((mode) => ({ name, values, height, mode })),
      ),
    )(
      '$name draws without empty pixels at the bottom: the last node ends at the fitted height ($mode)',
      ({ values, height, mode }) => {
        const { drawing, box } = drawFitted(id, values, mode);
        expect(box.height).toBe(height);
        expect(drawing.warnings).toEqual([]);
        const field = boxOf(drawing, visible(drawing, 'contêiner')[0]!);
        near(field.y, 0);
        const support = visible(drawing, 'apoio (linha)')[0];
        const bottom = support === undefined ? field : boxOf(drawing, support);
        near(bottom.y + bottom.height, height);
      },
    );

    it.each(MODES)('the measured width never falls below the 280 of the root (%s)', (mode) => {
      const measured = measureComponent(
        entryOf(id).component!,
        allValues(id, filled),
        { width: null, height: null },
        optionsOf(mode),
      );
      expect(measured.width).toBeGreaterThanOrEqual(280);
    });
  },
);

// ---------------------------------------------------------------------------------------------
// search-bar
// ---------------------------------------------------------------------------------------------
describe('MC5 group C — search-bar, the width limits of the root (SearchBar.kt 1356 to 1360, 665 and 2711 to 2714)', () => {
  const bar = { placeholder: 'Search', leadingIcon: 'Search', style: 'bar' };
  const docked = { ...bar, style: 'docked' };

  it('the root keeps minWidth 360 and maxWidth 720 (the docked one pins both at 360)', () => {
    const root = entryOf('search-bar').component!.template as unknown as Record<
      string,
      unknown
    >;
    expect(root.minWidth).toBeDefined();
    expect(root.maxWidth).toBeDefined();
    expect(JSON.stringify(root.minWidth)).toContain('360');
    expect(JSON.stringify(root.maxWidth)).toContain('720');
    expect(JSON.stringify(root.maxWidth)).toContain('360');
  });

  it.each(MODES)(
    'the measured width stays between 360 and 720 (the docked one, at 360) (%s)',
    (mode) => {
      const measure = (values: Values) =>
        measureComponent(
          entryOf('search-bar').component!,
          allValues('search-bar', values),
          { width: null, height: null },
          optionsOf(mode),
        ).width;
      expect(measure(bar)).toBe(360);
      expect(measure(docked)).toBe(360);
    },
  );

  it.each(MODES)(
    'the docked one is 360 wide in the instance fit and the bar keeps the width it has (%s)',
    (mode) => {
      const comp = entryOf('search-bar').component!;
      const fit = (values: Values) =>
        fitComponentSize(comp, allValues('search-bar', values), optionsOf(mode), {
          base: { width: 500, height: 56 },
        });
      expect(fit(docked)?.width).toBe(360);
      expect(fit(bar)?.width ?? 500).toBe(500);
    },
  );
});
