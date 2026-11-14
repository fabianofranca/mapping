// Material 3 with interaction states stage (#869), phase ME3 (#915), actions group: the `interaction` field
// of the fab, the extended-fab, the icon-button and the icon-toggle-button. Reference: Compose `material3` 1.4.0,
// commit 5113b82a… (`FabPrimaryContainerTokens`, `ExtendedFabPrimaryTokens`, `IconButtonTokens` and the
// `Filled*`, `FilledTonal*` and `Outlined*IconButtonTokens`).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { resolveTokens } from '../../src/model/components/tokens';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, solid, typeOf } from '../support/material3Library';

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NAMES = {
  state: 'estado',
  liftedShadow: 'sombra elevada',
  outline: 'contorno',
} as const;

const catalog = buildCatalog(files);
const MODES = ['light', 'dark'] as const;
const STATES = ['hovered', 'focused', 'pressed'] as const;
const OPACITY = { hovered: 0.08, focused: 0.1, pressed: 0.1 } as const;

const tokensOf = (mode: 'light' | 'dark') =>
  resolveTokens(catalog.library?.tokens, {}, mode) as Record<string, unknown>;

function draw(id: string, values: Record<string, string>, mode: 'light' | 'dark') {
  const entry = findEntry(catalog, id)!;
  return drawIn(catalog, entry, values, mode);
}
const json = (id: string, values: Record<string, string>, mode: 'light' | 'dark') =>
  JSON.stringify(draw(id, values, mode).root);

function byName(node: SceneNode, name: string): SceneNode | undefined {
  if (node.name === name) return node;
  if ('children' in node) {
    for (const child of node.children) {
      const found = byName(child, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Shadows of an elevation level: point (black at 30%) and ambient (black at 15%). */
const level = (
  point: [y: number, blur: number, spread: number],
  ambient: [y: number, blur: number, spread: number],
) => [
  { y: point[0], blur: point[1], spread: point[2], color: 'rgba(0, 0, 0, 0.3)' },
  { y: ambient[0], blur: ambient[1], spread: ambient[2], color: 'rgba(0, 0, 0, 0.15)' },
];
/** Shadows (y, blur, spread and color) of the visible nodes, in drawing order. */
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

/** State layer: the visible `estado` node, with the color and opacity resolved. */
function layer(id: string, values: Record<string, string>, mode: 'light' | 'dark') {
  const node = byName(draw(id, values, mode).root, NAMES.state);
  if (node === undefined || !node.visible) return undefined;
  return { color: solid(node.fills), opacity: node.opacity };
}

function checkField(id: string, descriptionPattern: RegExp) {
  const type = typeOf(id);
  const field = type.fields.find((f) => f.key === 'interaction');
  expect(field).toMatchObject({
    key: 'interaction',
    // pt-BR kept: shared library data (field label of libraries/material3-compose)
    label: 'Interação',
    type: 'enum',
    default: 'none',
    options: ['none', 'hovered', 'focused', 'pressed'],
  });
  expect(field?.required).not.toBe(true);
  // `interactionSource` is the Compose parameter that the `ignore` leaves out (import, #1079 S5): it is not the field.
  expect(
    JSON.stringify(type.code ?? {}).replaceAll('interactionSource', ''),
  ).not.toContain('interaction');
  expect(JSON.stringify((type as { variants?: unknown }).variants ?? {})).not.toContain(
    'interaction',
  );
  expect(field?.description).toMatch(descriptionPattern);
  const keys = type.fields.map((f) => f.key);
  const after = id.endsWith('fab')
    ? keys.indexOf('containerColor')
    : keys.indexOf('enabled');
  expect(keys.indexOf('interaction')).toBe(after + 1);
}

function checkExamples(id: string) {
  const entry = findEntry(catalog, id)!;
  for (const state of STATES) {
    const example = entry.examples.find((e) => e.values?.interaction === state);
    expect(example, `example of ${state}`).toBeDefined();
    for (const mode of MODES) {
      const drawing = drawIn(catalog, entry, example?.values ?? {}, mode);
      expect(drawing.warnings, `${state} ${mode}`).toEqual([]);
    }
  }
}

describe.each(['fab', 'extended-fab'])('%s: interaction field', (id) => {
  const base: Record<string, string> =
    id === 'fab' ? { icon: 'Add' } : { text: 'Create', icon: 'Add' };

  it('is an optional enum with the token options, default none, outside the code and the variants', () => {
    // pt-BR kept: shared library data (field description of libraries/material3-compose)
    checkField(id, /sem enabled|não tem/i);
  });

  it('has an example per state that draws without a warning in both modes', () =>
    checkExamples(id));

  const colors = ['primaryContainer', 'tertiary', 'surface', 'errorContainer'];
  it.each(colors.flatMap((c) => MODES.map((m) => [c, m] as const)))(
    '%s (%s): hovered, focused and pressed differ from none; the mouse over differs from the others (elevation)',
    (color, mode) => {
      const values = { ...base, containerColor: color };
      const none = json(id, { ...values, interaction: 'none' }, mode);
      const drawn: Record<string, string> = {};
      for (const interaction of STATES) {
        const drawing = draw(id, { ...values, interaction }, mode);
        expect(drawing.warnings).toEqual([]);
        drawn[interaction] = JSON.stringify(drawing.root);
        expect(drawn[interaction], `${color} ${interaction}`).not.toBe(none);
      }
      expect(drawn.hovered).not.toBe(drawn.focused);
      // Focus and pressed have the same opacity (0.10) and the same elevation level (3): the frame is the same.
      expect(drawn.focused).toBe(drawn.pressed);
    },
  );

  it('the layer has the container content color and the state opacity', () => {
    for (const mode of MODES) {
      const t = tokensOf(mode);
      for (const [container, content] of [
        ['primaryContainer', 'on-primary-container'],
        ['tertiary', 'on-tertiary'],
        ['surface', 'on-surface'],
      ] as const) {
        for (const interaction of STATES) {
          expect(
            layer(id, { ...base, containerColor: container, interaction }, mode),
            `${container} ${interaction} ${mode}`,
          ).toEqual({ color: t[content], opacity: OPACITY[interaction] });
        }
      }
      expect(layer(id, { ...base, interaction: 'none' }, mode)).toBeUndefined();
    }
  });

  it('the layer follows the shape of each fab size', () => {
    if (id !== 'fab') return;
    for (const size of ['small', 'regular', 'large']) {
      for (const mode of MODES) {
        const none = json(id, { ...base, size, interaction: 'none' }, mode);
        expect(json(id, { ...base, size, interaction: 'pressed' }, mode)).not.toBe(none);
      }
    }
  });

  it('only the mouse over raises the elevation (level 4); focus and pressed stay at level 3', () => {
    for (const mode of MODES) {
      expect(shadows(draw(id, { ...base, interaction: 'none' }, mode).root)).toEqual(
        level([1, 3, 0], [4, 8, 3]),
      );
      expect(shadows(draw(id, { ...base, interaction: 'hovered' }, mode).root)).toEqual(
        level([2, 3, 0], [6, 10, 4]),
      );
      for (const interaction of ['focused', 'pressed']) {
        expect(shadows(draw(id, { ...base, interaction }, mode).root)).toEqual(
          level([1, 3, 0], [4, 8, 3]),
        );
      }
    }
  });

  it('the container stays in place: the level 4 shadow uses the same background and the same shape', () => {
    const t = tokensOf('light');
    const drawing = draw(id, { ...base, interaction: 'hovered' }, 'light');
    const lifted = byName(drawing.root, NAMES.liftedShadow);
    expect(lifted?.visible).toBe(true);
    expect(solid(lifted?.fills ?? [])).toBe(t['primary-container']);
    expect(drawing.root.width).toBe(draw(id, base, 'light').root.width);
  });
});

describe('extended-fab: collapsed and text only', () => {
  it.each(MODES)(
    'the layer exists with expanded false and without an icon (%s)',
    (mode) => {
      const cases: Record<string, string>[] = [
        { text: 'Edit', icon: 'Edit', expanded: 'false' },
        { text: 'Create' },
      ];
      for (const values of cases) {
        const none = json('extended-fab', { ...values, interaction: 'none' }, mode);
        for (const interaction of STATES) {
          expect(json('extended-fab', { ...values, interaction }, mode)).not.toBe(none);
        }
      }
    },
  );
});

const BUTTON_STYLES = ['standard', 'filled', 'tonal', 'outlined'] as const;
const BUTTON_LAYER: Record<(typeof BUTTON_STYLES)[number], string> = {
  standard: 'on-surface-variant',
  filled: 'on-primary',
  tonal: 'on-secondary-container',
  outlined: 'on-surface-variant',
};

describe('icon-button: interaction field', () => {
  it('is an optional enum with the token options, default none, outside the code and the variants', () => {
    checkField('icon-button', /enabled/i);
    // pt-BR kept: shared library data (field description of libraries/material3-compose)
    expect(
      typeOf('icon-button').fields.find((f) => f.key === 'interaction')?.description,
    ).toMatch(/desabilitado/i);
  });

  it('has an example per state that draws without a warning in both modes', () =>
    checkExamples('icon-button'));

  it.each(BUTTON_STYLES.flatMap((s) => MODES.map((m) => [s, m] as const)))(
    '%s (%s): hovered, focused and pressed differ from none, with the style layer',
    (style, mode) => {
      const none = json(
        'icon-button',
        { icon: 'Edit', style, interaction: 'none' },
        mode,
      );
      const t = tokensOf(mode);
      for (const interaction of STATES) {
        const values = { icon: 'Edit', style, interaction };
        expect(draw('icon-button', values, mode).warnings).toEqual([]);
        expect(json('icon-button', values, mode), `${style} ${interaction}`).not.toBe(
          none,
        );
        expect(layer('icon-button', values, mode)).toEqual({
          color: t[BUTTON_LAYER[style]],
          opacity: OPACITY[interaction],
        });
      }
      expect(
        layer('icon-button', { icon: 'Edit', style, interaction: 'none' }, mode),
      ).toBe(undefined);
    },
  );

  it.each(BUTTON_STYLES)(
    '%s: with enabled false the interaction draws nothing',
    (style) => {
      for (const mode of MODES) {
        const off = json('icon-button', { icon: 'Edit', style, enabled: 'false' }, mode);
        for (const interaction of STATES) {
          expect(
            json(
              'icon-button',
              { icon: 'Edit', style, enabled: 'false', interaction },
              mode,
            ),
            `${style} ${interaction}`,
          ).toBe(off);
        }
      }
    },
  );

  it('does not change the elevation or the outline between states (the tokens have none)', () => {
    for (const style of BUTTON_STYLES) {
      for (const interaction of STATES) {
        expect(
          shadows(
            draw('icon-button', { icon: 'Edit', style, interaction }, 'light').root,
          ),
        ).toEqual([]);
      }
    }
    const outline = (interaction: string) =>
      JSON.stringify(
        byName(
          draw('icon-button', { icon: 'Edit', style: 'outlined', interaction }, 'light')
            .root,
          NAMES.outline,
        ),
      );
    expect(outline('hovered')).toBe(outline('none'));
    expect(outline('pressed')).toBe(outline('none'));
  });
});

const TOGGLE_LAYER: Record<(typeof BUTTON_STYLES)[number], [string, string]> = {
  // [on, off]
  standard: ['primary', 'on-surface-variant'],
  filled: ['on-primary', 'on-surface-variant'],
  tonal: ['on-secondary', 'on-secondary-container'],
  outlined: ['inverse-on-surface', 'on-surface-variant'],
};

describe('icon-toggle-button: interaction field', () => {
  it('is an optional enum with the token options, default none, outside the code and the variants', () => {
    checkField('icon-toggle-button', /enabled/i);
    // pt-BR kept: shared library data (field description of libraries/material3-compose)
    expect(
      typeOf('icon-toggle-button').fields.find((f) => f.key === 'interaction')
        ?.description,
    ).toMatch(/desabilitado/i);
  });

  it('has an example per state that draws without a warning in both modes', () =>
    checkExamples('icon-toggle-button'));

  const cases = BUTTON_STYLES.flatMap((s) =>
    ['true', 'false'].flatMap((c) => MODES.map((m) => [s, c, m] as const)),
  );
  it.each(cases)(
    '%s checked=%s (%s): hovered, focused and pressed differ from none, with the selection layer',
    (style, checked, mode) => {
      const none = json('icon-toggle-button', { icon: 'Favorite', style, checked }, mode);
      const t = tokensOf(mode);
      const [on, off] = TOGGLE_LAYER[style];
      for (const interaction of STATES) {
        const values = { icon: 'Favorite', style, checked, interaction };
        expect(draw('icon-toggle-button', values, mode).warnings).toEqual([]);
        expect(
          json('icon-toggle-button', values, mode),
          `${style} ${interaction}`,
        ).not.toBe(none);
        expect(layer('icon-toggle-button', values, mode)).toEqual({
          color: t[checked === 'true' ? on : off],
          opacity: OPACITY[interaction],
        });
      }
    },
  );

  it.each(cases)(
    '%s checked=%s (%s): with enabled false the interaction draws nothing',
    (style, checked, mode) => {
      const base = { icon: 'Favorite', style, checked, enabled: 'false' };
      const off = json('icon-toggle-button', base, mode);
      for (const interaction of STATES) {
        expect(json('icon-toggle-button', { ...base, interaction }, mode)).toBe(off);
      }
    },
  );

  it('the outline of the unchecked outlined and its absence when checked do not change with the state', () => {
    const outline = (checked: string, interaction: string) =>
      JSON.stringify(
        byName(
          draw(
            'icon-toggle-button',
            { icon: 'Favorite', style: 'outlined', checked, interaction },
            'light',
          ).root,
          NAMES.outline,
        ),
      );
    for (const checked of ['true', 'false']) {
      expect(outline(checked, 'hovered')).toBe(outline(checked, 'none'));
      expect(outline(checked, 'pressed')).toBe(outline(checked, 'none'));
    }
  });
});
