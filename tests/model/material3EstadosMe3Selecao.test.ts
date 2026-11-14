// Material 3 with interaction states stage (#869), phase ME3 (#915), selection group: the `interaction` field
// of the `chip`, the `card` and the `segmented-button` (still appearance of the state, like the `button` of ME1).
// Reference: Compose `material3` 1.4.0, commit 5113b82a… (`tokens/*ChipTokens.kt`, `*CardTokens.kt`,
// `OutlinedSegmentedButtonTokens.kt` and `StateTokens.kt`).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, typeOf } from '../support/material3Library';

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NAMES = {
  state: 'estado',
} as const;

const catalog = buildCatalog(files);
const MODES = ['light', 'dark'] as const;
type Values = Record<string, unknown>;

/** The shadows of visible nodes (an invisible node takes its subtree with it), with y, blur, spread and color. */
function shadows(
  node: SceneNode,
  out: { y: number; blur: number; spread: number; color: string }[] = [],
) {
  if (!node.visible) return out;
  for (const e of node.effects)
    out.push({ y: e.offset.y, blur: e.blur, spread: e.spread ?? 0, color: e.color });
  if ('children' in node) node.children.forEach((c) => shadows(c, out));
  return out;
}
/** The visible `estado` nodes (the state layer). */
function layers(node: SceneNode, out: SceneNode[] = []): SceneNode[] {
  if (!node.visible) return out;
  if (node.name === NAMES.state) out.push(node);
  if ('children' in node) node.children.forEach((c) => layers(c, out));
  return out;
}
/** Shadows of an elevation level: point (black at 30%) and ambient (black at 15%). */
const level = (
  point: [y: number, blur: number, spread: number],
  ambient: [y: number, blur: number, spread: number],
) => [
  { y: point[0], blur: point[1], spread: point[2], color: 'rgba(0, 0, 0, 0.3)' },
  { y: ambient[0], blur: ambient[1], spread: ambient[2], color: 'rgba(0, 0, 0, 0.15)' },
];
const L1 = level([1, 2, 0], [1, 3, 1]);
const L2 = level([1, 2, 0], [2, 6, 2]);
const L3 = level([1, 3, 0], [4, 8, 3]);
const L4 = level([2, 3, 0], [6, 10, 4]);

function interactionField(id: string) {
  return typeOf(id).fields.find((f) => f.key === 'interaction');
}
function describeField(id: string, options: string[]) {
  const field = interactionField(id);
  it('is an optional enum with the Compose token options, default none, outside the code', () => {
    expect(field).toMatchObject({
      key: 'interaction',
      // pt-BR kept: shared library data (field label of libraries/material3-compose)
      label: 'Interação',
      type: 'enum',
      default: 'none',
      options,
    });
    expect(field?.required).not.toBe(true);
    // `interactionSource` is the Compose parameter that the `ignore` leaves out (import, #1079 S5): it is not the field.
    expect(
      JSON.stringify(typeOf(id).code ?? {}).replaceAll('interactionSource', ''),
    ).not.toContain('interaction');
  });
  it('the description says what happens with the disabled state', () => {
    // pt-BR kept: shared library data (field description of libraries/material3-compose)
    expect(field?.description).toMatch(/habilitado|enabled/i);
    expect(field?.description).toMatch(/desabilitad|false/i);
  });
}
function exampleFor(
  id: string,
  entry: NonNullable<ReturnType<typeof findEntry>>,
  states: string[],
) {
  it.each(states)(
    'has an example for %s that draws without a warning in both modes',
    (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `example of ${state} in ${id}`).toBeDefined();
      for (const mode of MODES) {
        const drawing = drawIn(catalog, entry, example?.values ?? {}, mode);
        expect(drawing.warnings, `${state} ${mode}`).toEqual([]);
      }
    },
  );
}

// --- chip -----------------------------------------------------------------------------------

describe('chip: interaction field', () => {
  describeField('chip', ['none', 'hovered', 'focused', 'pressed', 'dragged']);
  const entry = findEntry(catalog, 'chip')!;
  exampleFor('chip', entry, ['hovered', 'focused', 'pressed', 'dragged']);

  const draw = (values: Values, mode: 'light' | 'dark') =>
    drawIn(catalog, entry, { label: 'Open now', ...values }, mode);
  const CASES: [string, string][] = [
    ['assist', 'false'],
    ['assist-elevated', 'false'],
    ['filter', 'false'],
    ['filter', 'true'],
    ['filter-elevated', 'false'],
    ['filter-elevated', 'true'],
    ['input', 'false'],
    ['input', 'true'],
    ['suggestion', 'false'],
    ['suggestion-elevated', 'false'],
  ];
  const STATES = ['hovered', 'focused', 'pressed', 'dragged'];

  it.each(CASES.flatMap(([s, sel]) => MODES.map((m) => [s, sel, m] as const)))(
    '%s selected=%s (%s): each state differs from none (the layer exists)',
    (style, selected, mode) => {
      const base = JSON.stringify(
        draw({ style, selected, interaction: 'none' }, mode).root,
      );
      for (const interaction of STATES) {
        const drawing = draw({ style, selected, interaction }, mode);
        expect(drawing.warnings).toEqual([]);
        expect(layers(drawing.root), `${style} ${interaction}`).toHaveLength(1);
        expect(JSON.stringify(drawing.root), `${style} ${interaction}`).not.toBe(base);
      }
    },
  );

  it.each(CASES)(
    '%s selected=%s: with enabled false the interaction draws nothing',
    (style, selected) => {
      for (const mode of MODES) {
        const off = JSON.stringify(
          draw({ style, selected, enabled: 'false', interaction: 'none' }, mode).root,
        );
        for (const interaction of STATES) {
          expect(
            JSON.stringify(
              draw({ style, selected, enabled: 'false', interaction }, mode).root,
            ),
            `${style} ${interaction} ${mode}`,
          ).toBe(off);
        }
      }
    },
  );

  it('the state layer uses the label color and the state opacity', () => {
    const color = (values: Values) => {
      const [layer] = layers(draw(values, 'light').root);
      return layer?.type === 'rect' ? layer.fills : undefined;
    };
    const opacity = (interaction: string) =>
      layers(draw({ style: 'assist', interaction }, 'light').root)[0]?.opacity;
    expect(opacity('hovered')).toBe(0.08);
    expect(opacity('focused')).toBe(0.1);
    expect(opacity('pressed')).toBe(0.1);
    expect(opacity('dragged')).toBe(0.16);
    const assist = JSON.stringify(color({ style: 'assist', interaction: 'hovered' }));
    const suggestion = JSON.stringify(
      color({ style: 'suggestion', interaction: 'hovered' }),
    );
    const selected = JSON.stringify(
      color({ style: 'filter', selected: 'true', interaction: 'hovered' }),
    );
    expect(assist).not.toBe(suggestion);
    expect(selected).not.toBe(suggestion);
  });

  it('the elevation of the elevated one changes per state: 1 at rest, focus and pressed, 2 on mouse over, 4 dragged', () => {
    for (const style of ['assist-elevated', 'filter-elevated', 'suggestion-elevated']) {
      const at = (interaction: string) =>
        shadows(draw({ style, interaction }, 'light').root);
      expect(at('none'), style).toEqual(L1);
      expect(at('focused'), style).toEqual(L1);
      expect(at('pressed'), style).toEqual(L1);
      expect(at('hovered'), style).toEqual(L2);
      expect(at('dragged'), style).toEqual(L4);
    }
  });

  it('the flat chip only has a shadow when dragged, or on mouse over the selected filter (level 1)', () => {
    for (const style of ['assist', 'filter', 'input', 'suggestion']) {
      const at = (interaction: string, selected = 'false') =>
        shadows(draw({ style, selected, interaction }, 'light').root);
      expect(at('none'), style).toEqual([]);
      expect(at('focused'), style).toEqual([]);
      expect(at('pressed'), style).toEqual([]);
      expect(at('dragged'), style).toEqual(L4);
      expect(at('hovered'), style).toEqual([]);
    }
    const sel = (interaction: string) =>
      shadows(draw({ style: 'filter', selected: 'true', interaction }, 'light').root);
    expect(sel('hovered')).toEqual(L1);
    expect(sel('focused')).toEqual([]);
    expect(sel('pressed')).toEqual([]);
  });

  it('the outline of the flat chip changes on focus and disappears when selected (FlatFocusOutlineColor)', () => {
    const stroke = (values: Values) => JSON.stringify(draw(values, 'light').root.stroke);
    for (const style of ['assist', 'suggestion', 'filter', 'input']) {
      const none = stroke({ style, interaction: 'none' });
      expect(stroke({ style, interaction: 'focused' }), style).not.toBe(none);
      for (const interaction of ['hovered', 'pressed', 'dragged'])
        expect(stroke({ style, interaction }), `${style} ${interaction}`).toBe(none);
    }
    // assist uses on-surface on focus; the others, on-surface-variant
    expect(stroke({ style: 'assist', interaction: 'focused' })).not.toBe(
      stroke({ style: 'suggestion', interaction: 'focused' }),
    );
    expect(stroke({ style: 'filter', interaction: 'focused' })).toBe(
      stroke({ style: 'suggestion', interaction: 'focused' }),
    );
    // selected and elevated have no outline: the outline does not change in any state
    for (const values of [
      { style: 'filter', selected: 'true' },
      { style: 'input', selected: 'true' },
      { style: 'assist-elevated' },
      { style: 'filter-elevated' },
    ]) {
      const none = stroke({ ...values, interaction: 'none' });
      for (const interaction of STATES)
        expect(stroke({ ...values, interaction }), `${values.style} ${interaction}`).toBe(
          none,
        );
    }
  });
});

// --- card -----------------------------------------------------------------------------------

describe('card: interaction field', () => {
  describeField('card', ['none', 'hovered', 'focused', 'pressed', 'dragged']);
  const entry = findEntry(catalog, 'card')!;
  exampleFor('card', entry, ['hovered', 'focused', 'pressed', 'dragged']);

  const draw = (values: Values, mode: 'light' | 'dark') =>
    drawIn(catalog, entry, { title: 'Rosa Beach', ...values }, mode);
  const STYLES = ['filled', 'elevated', 'outlined'];
  const STATES = ['hovered', 'focused', 'pressed', 'dragged'];

  it('this type has no enabled, so the interaction always draws', () => {
    expect(typeOf('card').fields.some((f) => f.key === 'enabled')).toBe(false);
    // pt-BR kept: shared library data (field description of libraries/material3-compose)
    expect(interactionField('card')?.description).toMatch(/não tem enabled/);
  });

  it.each(STYLES.flatMap((s) => MODES.map((m) => [s, m] as const)))(
    '%s (%s): each state differs from none (the layer exists)',
    (style, mode) => {
      const base = JSON.stringify(draw({ style, interaction: 'none' }, mode).root);
      for (const interaction of STATES) {
        const drawing = draw({ style, interaction }, mode);
        expect(drawing.warnings).toEqual([]);
        expect(layers(drawing.root), `${style} ${interaction}`).toHaveLength(1);
        expect(JSON.stringify(drawing.root), `${style} ${interaction}`).not.toBe(base);
      }
    },
  );

  it('the layer has the opacities of the state tokens', () => {
    const opacity = (interaction: string) =>
      layers(draw({ style: 'filled', interaction }, 'light').root)[0]?.opacity;
    expect(opacity('hovered')).toBe(0.08);
    expect(opacity('focused')).toBe(0.1);
    expect(opacity('pressed')).toBe(0.1);
    expect(opacity('dragged')).toBe(0.16);
  });

  it('the elevation changes per state (level 0, 1, 2, 3 and 4 of the tokens)', () => {
    const at = (style: string, interaction: string) =>
      shadows(draw({ style, interaction }, 'light').root);
    // filled: 0, mouse 1, focus 0, pressed 0, dragged 3
    expect(at('filled', 'none')).toEqual([]);
    expect(at('filled', 'hovered')).toEqual(L1);
    expect(at('filled', 'focused')).toEqual([]);
    expect(at('filled', 'pressed')).toEqual([]);
    expect(at('filled', 'dragged')).toEqual(L3);
    // elevated: 1, mouse 2, focus 1, pressed 1, dragged 4
    expect(at('elevated', 'none')).toEqual(L1);
    expect(at('elevated', 'hovered')).toEqual(L2);
    expect(at('elevated', 'focused')).toEqual(L1);
    expect(at('elevated', 'pressed')).toEqual(L1);
    expect(at('elevated', 'dragged')).toEqual(L4);
    // outlined: like the filled one
    expect(at('outlined', 'none')).toEqual([]);
    expect(at('outlined', 'hovered')).toEqual(L1);
    expect(at('outlined', 'focused')).toEqual([]);
    expect(at('outlined', 'pressed')).toEqual([]);
    expect(at('outlined', 'dragged')).toEqual(L3);
  });

  it('the outline of the outlined one changes only on focus (OutlinedCardTokens.FocusOutlineColor)', () => {
    const stroke = (style: string, interaction: string) =>
      JSON.stringify(draw({ style, interaction }, 'light').root.stroke);
    const none = stroke('outlined', 'none');
    expect(stroke('outlined', 'focused')).not.toBe(none);
    for (const interaction of ['hovered', 'pressed', 'dragged'])
      expect(stroke('outlined', interaction), interaction).toBe(none);
    for (const style of ['filled', 'elevated'])
      expect(stroke(style, 'focused'), style).toBe(stroke(style, 'none'));
  });

  it('the card height does not change with the state', () => {
    for (const style of STYLES) {
      const h = (interaction: string) =>
        draw({ style, interaction }, 'light').root.height;
      for (const interaction of STATES) expect(h(interaction)).toBe(h('none'));
    }
  });
});

// --- segmented-button ------------------------------------------------------------------------

describe('segmented-button: interaction field', () => {
  describeField('segmented-button', ['none', 'hovered', 'focused', 'pressed']);
  const entry = findEntry(catalog, 'segmented-button')!;
  exampleFor('segmented-button', entry, ['hovered', 'focused', 'pressed']);

  const rows = (...selected: boolean[]) =>
    selected.map((s, i) => ({
      label: ['Day', 'Week', 'Month'][i],
      icon: '',
      selected: s ? 'true' : 'false',
    }));
  const draw = (values: Values, mode: 'light' | 'dark') =>
    drawIn(catalog, entry, { options: rows(false, true, false), ...values }, mode);
  const STATES = ['hovered', 'focused', 'pressed'];

  it.each(['single', 'multi'].flatMap((s) => MODES.map((m) => [s, m] as const)))(
    '%s (%s): each state differs from none and lands on the selected item',
    (selection, mode) => {
      const base = JSON.stringify(draw({ selection, interaction: 'none' }, mode).root);
      for (const interaction of STATES) {
        const drawing = draw({ selection, interaction }, mode);
        expect(drawing.warnings).toEqual([]);
        expect(layers(drawing.root), `${selection} ${interaction}`).toHaveLength(1);
        expect(JSON.stringify(drawing.root), `${selection} ${interaction}`).not.toBe(
          base,
        );
      }
    },
  );

  it('the state lands on each selected item (multiple selection with two) and only on them', () => {
    const two = draw(
      { selection: 'multi', options: rows(true, false, true), interaction: 'hovered' },
      'light',
    );
    expect(layers(two.root)).toHaveLength(2);
    const none = draw(
      { selection: 'multi', options: rows(false, false, false), interaction: 'hovered' },
      'light',
    );
    expect(layers(none.root)).toHaveLength(0);
  });

  it('the layer has the opacities of the state tokens', () => {
    const opacity = (interaction: string) =>
      layers(draw({ interaction }, 'light').root)[0]?.opacity;
    expect(opacity('hovered')).toBe(0.08);
    expect(opacity('focused')).toBe(0.1);
    expect(opacity('pressed')).toBe(0.1);
  });

  it.each(STATES)(
    '%s with enabled false draws the same as the disabled one without interaction',
    (interaction) => {
      for (const mode of MODES) {
        const off = JSON.stringify(
          draw({ enabled: 'false', interaction: 'none' }, mode).root,
        );
        expect(
          JSON.stringify(draw({ enabled: 'false', interaction }, mode).root),
          mode,
        ).toBe(off);
      }
    },
  );
});
