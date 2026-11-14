// Material 3 with interaction states stage (#869), phase ME3 (#915), controls group: the
// `interaction` field of `checkbox`, `radio-button`, `switch` and `slider`, with the same pattern as the `button`
// (ME1, `material3Estados.test.ts`). Reference: Compose `material3` 1.4.0, commit 5113b82a….
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, typeOf } from '../support/material3Library';

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NAMES = {
  state: 'estado',
  box: 'caixa',
  ring: 'anel',
  handle: 'alça',
} as const;

const catalog = buildCatalog(files);
type Values = Record<string, string>;
const MODES = ['light', 'dark'] as const;

function entryOf(id: string) {
  const entry = findEntry(catalog, id);
  if (entry === undefined) throw new Error(`missing entry ${id}`);
  return entry;
}
const drawer = (id: string) => {
  const entry = entryOf(id);
  return (values: Values, mode: 'light' | 'dark') => drawIn(catalog, entry, values, mode);
};
const json = (id: string, values: Values, mode: 'light' | 'dark'): string =>
  JSON.stringify(drawer(id)(values, mode).root);

function allNodes(node: SceneNode, out: SceneNode[] = []): SceneNode[] {
  out.push(node);
  if ('children' in node) node.children.forEach((c) => allNodes(c, out));
  return out;
}
const visibleNamed = (id: string, values: Values, mode: 'light' | 'dark', name: string) =>
  allNodes(drawer(id)(values, mode).root).filter((n) => n.name === name && n.visible);

interface Suite {
  id: string;
  /** States that the `*Tokens.kt` defines for the type, in field order. */
  states: string[];
  /** States that draw the same as `none` (Compose changes nothing in them). */
  same?: string[];
  /** Field combinations that cover the drawing paths. */
  variants: Values[];
  /** Expected example per state (name from the pt-BR library data). */
  examples: Record<string, string>;
}

function interactionSuite({ id, states, same = [], variants, examples }: Suite) {
  describe(`${id}: interaction field`, () => {
    const field = typeOf(id).fields.find((f) => f.key === 'interaction');
    const entry = entryOf(id);
    const visual = states.filter((s) => !same.includes(s));

    it('is an optional enum with the token options, default none, outside the code', () => {
      expect(field).toMatchObject({
        key: 'interaction',
        // pt-BR kept: shared library data (field label of libraries/material3-compose)
        label: 'Interação',
        type: 'enum',
        default: 'none',
        options: ['none', ...states],
      });
      expect(field?.required).not.toBe(true);
      expect(JSON.stringify(typeOf(id).code ?? {})).not.toContain('"interaction"');
    });

    it('the description says the disabled state wins', () => {
      // pt-BR kept: shared library data (field description of libraries/material3-compose)
      expect(field?.description).toMatch(/habilitado|enabled/i);
      expect(field?.description).toMatch(/desabilitad|false/i);
    });

    it.each(states)('has the "%s" example without a warning in both modes', (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `example of ${state}`).toBeDefined();
      expect(example?.name).toBe(examples[state]);
      for (const mode of MODES) {
        expect(drawIn(catalog, entry, example?.values ?? {}, mode).warnings).toEqual([]);
      }
    });

    it.each(
      variants.flatMap((v) => MODES.map((m) => [JSON.stringify(v), v, m] as const)),
    )('%s (%s): each state draws without a warning', (_name, values, mode) => {
      for (const interaction of states)
        expect(drawer(id)({ ...values, interaction }, mode).warnings).toEqual([]);
    });

    it.each(
      variants.flatMap((v) => MODES.map((m) => [JSON.stringify(v), v, m] as const)),
    )('%s (%s): the visual states differ from none', (_name, values, mode) => {
      const base = json(id, { ...values, interaction: 'none' }, mode);
      for (const interaction of visual)
        expect(json(id, { ...values, interaction }, mode), interaction).not.toBe(base);
      for (const interaction of same)
        expect(json(id, { ...values, interaction }, mode), interaction).toBe(base);
    });

    it.each(variants.map((v) => [JSON.stringify(v), v] as const))(
      '%s: with enabled false the interaction draws nothing',
      (_name, values) => {
        for (const mode of MODES) {
          const off = json(
            id,
            { ...values, enabled: 'false', interaction: 'none' },
            mode,
          );
          for (const interaction of states)
            expect(
              json(id, { ...values, enabled: 'false', interaction }, mode),
              interaction,
            ).toBe(off);
        }
      },
    );
  });
}

describe('checkbox (CheckboxTokens.kt)', () => {
  interactionSuite({
    id: 'checkbox',
    states: ['hovered', 'focused', 'pressed'],
    variants: [
      { label: 'Accept', state: 'unchecked' },
      { label: 'Accept', state: 'checked' },
      { label: 'Accept', state: 'indeterminate' },
    ],
    // pt-BR kept: shared library data (example names of libraries/material3-compose)
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
  });

  it('the state layer is a 40 circle (StateLayerSize) and changes color with the selection', () => {
    for (const mode of MODES) {
      for (const state of ['unchecked', 'checked']) {
        const layer = visibleNamed(
          'checkbox',
          { state, interaction: 'hovered' },
          mode,
          NAMES.state,
        );
        expect(layer).toHaveLength(1);
        expect(layer[0]?.width).toBe(40);
        expect(layer[0]?.height).toBe(40);
      }
      const unchecked = visibleNamed(
        'checkbox',
        { state: 'unchecked', interaction: 'hovered' },
        mode,
        NAMES.state,
      );
      const checked = visibleNamed(
        'checkbox',
        { state: 'checked', interaction: 'hovered' },
        mode,
        NAMES.state,
      );
      expect(JSON.stringify(unchecked)).not.toBe(JSON.stringify(checked));
      expect(
        visibleNamed('checkbox', { interaction: 'none' }, mode, NAMES.state),
      ).toEqual([]);
    }
  });

  it('the outline of the unchecked one goes from on-surface-variant to on-surface with the state', () => {
    for (const mode of MODES) {
      const stroke = (interaction: string) =>
        JSON.stringify(
          visibleNamed(
            'checkbox',
            { state: 'unchecked', interaction },
            mode,
            NAMES.box,
          ).map((n) => ('stroke' in n ? n.stroke : null)),
        );
      expect(stroke('hovered')).not.toBe(stroke('none'));
      expect(stroke('hovered')).toBe(stroke('focused'));
      expect(stroke('hovered')).toBe(stroke('pressed'));
    }
  });
});

describe('radio-button (RadioButtonTokens.kt)', () => {
  interactionSuite({
    id: 'radio-button',
    states: ['hovered', 'focused', 'pressed'],
    variants: [
      { label: 'Pix', selected: 'false' },
      { label: 'Pix', selected: 'true' },
    ],
    // pt-BR kept: shared library data (example names of libraries/material3-compose)
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
  });

  it('the state layer is a 24 circle, the width of the ring area: the StateLayerSize (40) would exceed the component box (L2, #1078)', () => {
    for (const mode of MODES) {
      for (const selected of ['true', 'false']) {
        const layer = visibleNamed(
          'radio-button',
          { selected, interaction: 'pressed' },
          mode,
          NAMES.state,
        );
        expect(layer).toHaveLength(1);
        expect(layer[0]?.width).toBe(24);
        expect(layer[0]?.height).toBe(24);
      }
      expect(
        visibleNamed('radio-button', { interaction: 'none' }, mode, NAMES.state),
      ).toEqual([]);
    }
  });

  it('the ring of the unselected one goes to on-surface with the state; the selected one stays primary', () => {
    for (const mode of MODES) {
      const ring = (selected: string, interaction: string) =>
        JSON.stringify(
          visibleNamed('radio-button', { selected, interaction }, mode, NAMES.ring).map(
            (n) => ('stroke' in n ? n.stroke : null),
          ),
        );
      expect(ring('false', 'hovered')).not.toBe(ring('false', 'none'));
      expect(ring('false', 'hovered')).toBe(ring('false', 'focused'));
      expect(ring('false', 'hovered')).toBe(ring('false', 'pressed'));
      expect(ring('true', 'hovered')).toBe(ring('true', 'none'));
    }
  });
});

describe('switch (SwitchTokens.kt)', () => {
  interactionSuite({
    id: 'switch',
    states: ['hovered', 'focused', 'pressed'],
    variants: [
      { label: 'Wi-Fi', checked: 'false' },
      { label: 'Wi-Fi', checked: 'true' },
      { label: 'Wi-Fi', checked: 'true', thumbIcon: 'true' },
      { label: 'Wi-Fi', checked: 'false', thumbIcon: 'true' },
    ],
    // pt-BR kept: shared library data (example names of libraries/material3-compose)
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
  });

  const handle = (values: Values, mode: 'light' | 'dark') =>
    visibleNamed('switch', values, mode, NAMES.handle)[0];

  it('the state layer is a 32 circle, the track height, around the handle: the StateLayerSize (40) would exceed the component box (L2, #1078)', () => {
    for (const mode of MODES) {
      for (const checked of ['true', 'false']) {
        const layer = visibleNamed(
          'switch',
          { checked, interaction: 'focused' },
          mode,
          NAMES.state,
        );
        expect(layer).toHaveLength(1);
        expect(layer[0]?.width).toBe(32);
        expect(layer[0]?.height).toBe(32);
      }
      expect(visibleNamed('switch', { interaction: 'none' }, mode, NAMES.state)).toEqual(
        [],
      );
    }
  });

  it('the pressed handle becomes 28 (PressedHandleWidth) in both positions; mouse and focus do not change the size', () => {
    for (const mode of MODES) {
      for (const checked of ['true', 'false']) {
        expect(handle({ checked, interaction: 'pressed' }, mode)?.width).toBe(28);
        expect(handle({ checked, interaction: 'pressed' }, mode)?.height).toBe(28);
        for (const interaction of ['none', 'hovered', 'focused'])
          expect(handle({ checked, interaction }, mode)?.width).toBe(
            checked === 'true' ? 24 : 16,
          );
      }
      expect(
        handle({ checked: 'false', thumbIcon: 'true', interaction: 'none' }, mode)?.width,
      ).toBe(24);
      expect(
        handle({ checked: 'false', thumbIcon: 'true', interaction: 'pressed' }, mode)
          ?.width,
      ).toBe(28);
    }
  });

  it('disabled ignores the 28 handle', () => {
    for (const mode of MODES)
      expect(
        handle({ checked: 'true', enabled: 'false', interaction: 'pressed' }, mode)
          ?.width,
      ).toBe(24);
  });

  it('the handle color changes with the state (primary-container when on, on-surface-variant when off) and is the same in all three', () => {
    for (const mode of MODES) {
      for (const checked of ['true', 'false']) {
        const fill = (interaction: string) =>
          JSON.stringify(handle({ checked, interaction }, mode)?.fills);
        expect(fill('hovered')).not.toBe(fill('none'));
        expect(fill('hovered')).toBe(fill('focused'));
        expect(fill('hovered')).toBe(fill('pressed'));
      }
    }
  });
});

describe('slider (SliderTokens.kt)', () => {
  interactionSuite({
    id: 'slider',
    states: ['hovered', 'focused', 'pressed'],
    // HoverHandleWidth (4) is the usual width and no color token changes on mouse over.
    same: ['hovered'],
    variants: [
      { type: 'single', value: '0.5' },
      { type: 'single', value: '0.4', steps: '4' },
      { type: 'single', value: '0' },
      { type: 'range', valueStart: '0.2', valueEnd: '0.8' },
    ],
    // pt-BR kept: shared library data (example names of libraries/material3-compose)
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
  });

  const handleWidths = (values: Values, mode: 'light' | 'dark') =>
    visibleNamed('slider', values, mode, NAMES.handle).map((n) => n.width);

  it('with focus or pressed the handle goes from 4 to 2 (FocusHandleWidth and PressedHandleWidth)', () => {
    for (const mode of MODES) {
      expect(handleWidths({ type: 'single', interaction: 'none' }, mode)).toEqual([4]);
      expect(handleWidths({ type: 'single', interaction: 'hovered' }, mode)).toEqual([4]);
      expect(handleWidths({ type: 'single', interaction: 'focused' }, mode)).toEqual([2]);
      expect(handleWidths({ type: 'single', interaction: 'pressed' }, mode)).toEqual([2]);
    }
  });

  it('in the range only the end handle (the single one) narrows; the start one stays at 4', () => {
    for (const mode of MODES) {
      const base = { type: 'range', valueStart: '0.2', valueEnd: '0.8' };
      expect(handleWidths({ ...base, interaction: 'none' }, mode).sort()).toEqual([4, 4]);
      expect(handleWidths({ ...base, interaction: 'pressed' }, mode).sort()).toEqual([
        2, 4,
      ]);
    }
  });

  it('disabled keeps the 4 handle', () => {
    for (const mode of MODES)
      expect(
        handleWidths({ type: 'single', enabled: 'false', interaction: 'pressed' }, mode),
      ).toEqual([4]);
  });

  it('the handle stays centered at the same position when narrowing (single, value 0.5 and 1)', () => {
    for (const mode of MODES) {
      for (const value of ['0.5', '1', '0']) {
        const centers = (interaction: string) => {
          const root = drawer('slider')(
            { type: 'single', value, interaction },
            mode,
          ).root;
          const [node] = allNodes(root).filter(
            (n) => n.name === NAMES.handle && n.visible,
          );
          return node === undefined ? null : centerX(root, node);
        };
        expect(centers('pressed'), value).toBeCloseTo(centers('none') ?? Number.NaN, 5);
      }
    }
  });
});

/** Horizontal center of the node in the root (sums the translations of the parent chain). */
function centerX(root: SceneNode, target: SceneNode): number | null {
  const walk = (node: SceneNode, x: number): number | null => {
    const here = x + node.transform[4];
    if (node === target) return here + node.width / 2;
    if ('children' in node)
      for (const child of node.children) {
        const found = walk(child, here);
        if (found !== null) return found;
      }
    return null;
  };
  return walk(root, 0);
}
