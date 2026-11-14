// Material 3 stage with interaction states (#869), phase ME4 (#916): the `interaction` field of
// `text-field`, `secure-text-field`, `search-bar`, `dropdown-menu` and `list-item`, following the
// `button` pattern (ME1, `material3Estados.test.ts`). Reference: Compose `material3` 1.4.0, commit 5113b82a….
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, spec, typeOf } from '../support/material3Library';

const catalog = buildCatalog(files);
// pt-BR kept: node names, labels, example names and descriptions of libraries/material3-compose are Portuguese data
type Values = Record<string, unknown>;
type Mode = 'light' | 'dark';
const MODES: Mode[] = ['light', 'dark'];
const tokenValues = (spec.tokens?.values ?? {}) as Record<
  string,
  { light: string; dark: string }
>;
const hex = (token: string, mode: Mode): string =>
  (tokenValues[token]?.[mode] ?? '').toLowerCase();

function entryOf(id: string) {
  const entry = findEntry(catalog, id);
  if (entry === undefined) throw new Error(`entry ${id} missing`);
  return entry;
}
const draw = (id: string, values: Values, mode: Mode) =>
  drawIn(catalog, entryOf(id), values as Record<string, string>, mode);
const json = (id: string, values: Values, mode: Mode): string =>
  JSON.stringify(draw(id, values, mode).root);

function allNodes(node: SceneNode, out: SceneNode[] = []): SceneNode[] {
  out.push(node);
  if ('children' in node) node.children.forEach((c) => allNodes(c, out));
  return out;
}
const visibleNamed = (id: string, values: Values, mode: Mode, name: string) =>
  allNodes(draw(id, values, mode).root).filter((n) => n.name === name && n.visible);
/** Color and width of the stroke of the first visible node with the name. */
function strokeOf(id: string, values: Values, mode: Mode, name: string) {
  const node = visibleNamed(id, values, mode, name)[0];
  const stroke = node !== undefined && 'stroke' in node ? node.stroke : undefined;
  const paint = stroke?.paints[0];
  return {
    width: stroke?.width,
    color: paint?.type === 'solid' ? paint.color.toLowerCase() : undefined,
  };
}
/** Does the visible node (text or icon) with the name have the token's color? Looks for the hex in the node's JSON. */
function paintedWith(
  id: string,
  values: Values,
  mode: Mode,
  name: string,
  token: string,
) {
  const nodes = visibleNamed(id, values, mode, name);
  expect(nodes.length, `node ${name} visible`).toBeGreaterThan(0);
  return nodes.every((n) => JSON.stringify(n).toLowerCase().includes(hex(token, mode)));
}

interface Suite {
  id: string;
  states: string[];
  /** States that draw the same as `none`. */
  same?: string[];
  variants: Values[];
  examples: Record<string, string>;
  /** Does the type have `enabled`? Without it there is no disabled state to win. */
  hasEnabled?: boolean;
}

function interactionSuite({
  id,
  states,
  same = [],
  variants,
  examples,
  hasEnabled = true,
}: Suite) {
  describe(`${id}: interaction field`, () => {
    const field = typeOf(id).fields.find((f) => f.key === 'interaction');
    const entry = entryOf(id);
    const visual = states.filter((s) => !same.includes(s));
    const combos = variants.flatMap((v) =>
      MODES.map((m) => [JSON.stringify(v), v, m] as const),
    );

    it('is an optional enum with the options of the tokens, default none, outside the code', () => {
      expect(field).toMatchObject({
        key: 'interaction',
        label: 'Interação',
        type: 'enum',
        default: 'none',
        options: ['none', ...states],
      });
      expect(field?.required).not.toBe(true);
      expect(JSON.stringify(typeOf(id).code ?? {})).not.toContain('"interaction"');
    });

    it('the description explains the precedence of the disabled state', () => {
      expect(field?.description).toMatch(
        hasEnabled ? /desabilitad/i : /sem (enabled|desabilitado)|não tem/i,
      );
    });

    it.each(states)('has the example "%s" without warnings in both modes', (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `example of ${state}`).toBeDefined();
      expect(example?.name).toBe(examples[state]);
      for (const mode of MODES)
        expect(drawIn(catalog, entry, example?.values ?? {}, mode).warnings).toEqual([]);
    });

    it.each(combos)('%s (%s): each state draws without warnings', (_n, values, mode) => {
      for (const interaction of states)
        expect(draw(id, { ...values, interaction }, mode).warnings).toEqual([]);
    });

    it.each(combos)('%s (%s): the visual states differ from none', (_n, values, mode) => {
      const base = json(id, { ...values, interaction: 'none' }, mode);
      for (const interaction of visual)
        expect(json(id, { ...values, interaction }, mode), interaction).not.toBe(base);
      for (const interaction of same)
        expect(json(id, { ...values, interaction }, mode), interaction).toBe(base);
    });

    if (hasEnabled)
      it.each(variants.map((v) => [JSON.stringify(v), v] as const))(
        '%s: with enabled false the interaction draws nothing',
        (_n, values) => {
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

const FIELD_STATES = ['hovered', 'focused'];
const FIELD_EXAMPLES = { hovered: 'Mouse sobre', focused: 'Com foco' };

function textFieldSuite(id: 'text-field' | 'secure-text-field', base: Values) {
  describe(`${id} (FilledTextFieldTokens.kt, OutlinedTextFieldTokens.kt)`, () => {
    const filled = { ...base, style: 'filled' };
    const outlined = { ...base, style: 'outlined' };
    const err = { isError: 'true' };

    interactionSuite({
      id,
      states: FIELD_STATES,
      examples: FIELD_EXAMPLES,
      variants: [
        filled,
        { ...filled, ...err },
        outlined,
        { ...outlined, ...err, trailingIcon: 'Lock' },
        { ...outlined, ...(id === 'text-field' ? { value: '' } : { hasText: 'false' }) },
      ],
    });

    it('filled with focus: indicator of 2 in primary and label in primary', () => {
      for (const mode of MODES) {
        const v = { ...filled, interaction: 'focused' };
        expect(strokeOf(id, v, mode, 'indicador')).toEqual({
          width: 2,
          color: hex('primary', mode),
        });
        expect(paintedWith(id, v, mode, 'rótulo', 'primary')).toBe(true);
        expect(
          strokeOf(id, { ...filled, interaction: 'none' }, mode, 'indicador').width,
        ).toBe(1);
      }
    });

    it('filled in error with focus: indicator and label in error', () => {
      for (const mode of MODES) {
        const v = { ...filled, ...err, interaction: 'focused' };
        expect(strokeOf(id, v, mode, 'indicador')).toEqual({
          width: 2,
          color: hex('error', mode),
        });
        expect(paintedWith(id, v, mode, 'rótulo', 'error')).toBe(true);
      }
    });

    it('filled with the mouse: indicator of 1 in on-surface; in error, indicator and label in on-error-container', () => {
      for (const mode of MODES) {
        const v = { ...filled, interaction: 'hovered' };
        expect(strokeOf(id, v, mode, 'indicador')).toEqual({
          width: 1,
          color: hex('on-surface', mode),
        });
        expect(paintedWith(id, v, mode, 'rótulo', 'on-surface-variant')).toBe(true);
        const e = { ...filled, ...err, trailingIcon: 'Lock', interaction: 'hovered' };
        expect(strokeOf(id, e, mode, 'indicador').color).toBe(
          hex('on-error-container', mode),
        );
        expect(paintedWith(id, e, mode, 'rótulo', 'on-error-container')).toBe(true);
      }
    });

    // With a value, the minimized label opens the gap in the outline; without value or hint, the label stays inside and there is no gap.
    const hasValue = base.hasText !== undefined || base.value !== undefined;
    const labelName = hasValue ? 'rótulo minimizado' : 'rótulo';
    const outlineOf = (values: Values, mode: Mode) => {
      const nodes = visibleNamed(id, values, mode, 'contorno');
      expect(nodes, 'a single outline').toHaveLength(1);
      return nodes[0]!;
    };
    const gapsOf = (values: Values, mode: Mode) =>
      (outlineOf(values, mode).stroke?.gaps ?? []).length;

    it('outlined with focus: outline of 2 in primary (including the label gap) and label in primary', () => {
      for (const mode of MODES) {
        const v = { ...outlined, interaction: 'focused' };
        // the outline is a single node (the gap is the `stroke.gap`): the same line of 2 in primary goes through the gap
        expect(strokeOf(id, v, mode, 'contorno')).toEqual({
          width: 2,
          color: hex('primary', mode),
        });
        expect(gapsOf(v, mode)).toBe(hasValue ? 1 : 0);
        for (const gone of ['contorno (lados)', 'trecho final'])
          expect(visibleNamed(id, v, mode, gone), gone).toEqual([]);
        expect(paintedWith(id, v, mode, labelName, 'primary')).toBe(true);
      }
    });

    it('outlined with the mouse: outline of 1 in on-surface and label in on-surface; in error, on-error-container', () => {
      for (const mode of MODES) {
        const v = { ...outlined, interaction: 'hovered' };
        expect(strokeOf(id, v, mode, 'contorno')).toEqual({
          width: 1,
          color: hex('on-surface', mode),
        });
        expect(gapsOf(v, mode)).toBe(hasValue ? 1 : 0);
        expect(paintedWith(id, v, mode, labelName, 'on-surface')).toBe(true);
        const e = { ...v, ...err };
        expect(strokeOf(id, e, mode, 'contorno').color).toBe(
          hex('on-error-container', mode),
        );
        expect(paintedWith(id, e, mode, labelName, 'on-error-container')).toBe(true);
      }
    });

    it('the trailing icon in error goes to on-error-container only with the mouse; the leading one does not change', () => {
      for (const mode of MODES) {
        const v = { ...filled, ...err, leadingIcon: 'Home', trailingIcon: 'Lock' };
        const at = (interaction: string, icon: string, token: string) =>
          paintedWith(id, { ...v, interaction }, mode, icon, token);
        expect(at('none', 'lock', 'error')).toBe(true);
        expect(at('hovered', 'lock', 'on-error-container')).toBe(true);
        expect(at('focused', 'lock', 'error')).toBe(true);
        for (const s of ['none', 'hovered', 'focused'])
          expect(at(s, 'home', 'on-surface-variant')).toBe(true);
      }
    });
  });
}

textFieldSuite('text-field', { label: 'Name', value: 'Maria' });
textFieldSuite('secure-text-field', { label: 'Password', hasText: 'true' });

describe('search-bar (SearchBarTokens.kt)', () => {
  interactionSuite({
    id: 'search-bar',
    states: ['hovered', 'focused', 'pressed'],
    hasEnabled: false,
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
    variants: [
      { placeholder: 'Search' },
      { query: 'coffee', style: 'bar' },
      { query: 'coffee', style: 'docked', expanded: 'true' },
    ],
  });

  it('the state layer has the size of the bar (56) and takes the component radius', () => {
    for (const mode of MODES) {
      const layer = visibleNamed(
        'search-bar',
        { interaction: 'pressed' },
        mode,
        'estado',
      );
      expect(layer).toHaveLength(1);
      expect(layer[0]?.height).toBe(56);
      expect(visibleNamed('search-bar', { interaction: 'none' }, mode, 'estado')).toEqual(
        [],
      );
    }
  });
});

describe('list-item (ListTokens.kt)', () => {
  const lines = {
    headlineContent: 'Ana Souza',
    supportingContent: 'Shall we have lunch?',
  };
  interactionSuite({
    id: 'list-item',
    states: ['hovered', 'focused', 'pressed', 'dragged'],
    hasEnabled: false,
    examples: {
      hovered: 'Mouse sobre',
      focused: 'Com foco',
      pressed: 'Pressionado',
      dragged: 'Arrastado',
    },
    variants: [
      { headlineContent: 'Ana Souza' },
      lines,
      {
        ...lines,
        overlineContent: 'Today',
        trailingContent: '12:30',
        leadingIcon: 'Person',
      },
    ],
  });

  it('the layer covers the whole item and the dragged one gets the level 4 shadow', () => {
    for (const mode of MODES) {
      const layer = (interaction: string) =>
        visibleNamed('list-item', { ...lines, interaction }, mode, 'estado');
      expect(layer('none')).toEqual([]);
      for (const s of ['hovered', 'focused', 'pressed', 'dragged'])
        expect(layer(s)).toHaveLength(1);
      const root = (interaction: string) =>
        draw('list-item', { ...lines, interaction }, mode).root;
      const shadow = (interaction: string) => JSON.stringify(root(interaction).effects);
      expect(shadow('dragged')).not.toBe(shadow('none'));
      expect(shadow('pressed')).toBe(shadow('none'));
      const size = (interaction: string) => [
        root(interaction).width,
        root(interaction).height,
      ];
      expect(size('dragged')).toEqual(size('none'));
    }
  });
});

describe('dropdown-menu (MenuTokens.kt)', () => {
  const row = (text: string, leadingIcon: string, selected?: string) => ({
    text,
    leadingIcon,
    trailingIcon: '',
    enabled: 'true',
    ...(selected === undefined ? {} : { selected }),
  });
  const items = [
    row('Edit', 'Edit', 'true'),
    row('Share', 'Share'),
    row('Delete', 'Delete'),
  ];
  const one = items.slice(0, 1);
  interactionSuite({
    id: 'dropdown-menu',
    states: FIELD_STATES,
    hasEnabled: false,
    examples: FIELD_EXAMPLES,
    variants: [
      { style: 'menu', expanded: 'true', items },
      { style: 'exposed', expanded: 'false', label: 'Country', value: 'Brazil', items },
      {
        style: 'exposed',
        expanded: 'true',
        label: 'Language',
        value: 'Portuguese',
        items: one,
      },
    ],
  });

  it('the description says the state applies to the field and to the selected item', () => {
    const d =
      typeOf('dropdown-menu').fields.find((f) => f.key === 'interaction')?.description ??
      '';
    expect(d).toMatch(/campo/i);
    expect(d).toMatch(/selecionad/i);
  });

  it('the exposed field has the indicator of 2 in primary with focus', () => {
    for (const mode of MODES) {
      const v = {
        style: 'exposed',
        expanded: 'false',
        label: 'Country',
        value: 'Brazil',
        items,
        interaction: 'focused',
      };
      expect(strokeOf('dropdown-menu', v, mode, 'indicador')).toEqual({
        width: 2,
        color: hex('primary', mode),
      });
      expect(paintedWith('dropdown-menu', v, mode, 'rótulo', 'primary')).toBe(true);
    }
  });

  it('in the menu only the selected item gets the layer; with no selected item, nothing changes', () => {
    for (const mode of MODES) {
      const layers = (its: unknown[], interaction: string) =>
        visibleNamed(
          'dropdown-menu',
          { style: 'menu', expanded: 'true', items: its, interaction },
          mode,
          'estado',
        );
      expect(layers(items, 'hovered')).toHaveLength(1);
      expect(layers(items, 'none')).toHaveLength(0);
      const none = items.map((r) => ({ ...r, selected: 'false' }));
      const base = json(
        'dropdown-menu',
        { style: 'menu', expanded: 'true', items: none },
        mode,
      );
      for (const interaction of FIELD_STATES)
        expect(
          json(
            'dropdown-menu',
            { style: 'menu', expanded: 'true', items: none, interaction },
            mode,
          ),
        ).toBe(base);
    }
  });

  it('the selected and disabled item ignores the state', () => {
    for (const mode of MODES) {
      const its = [{ ...row('Edit', 'Edit', 'true'), enabled: 'false' }];
      const layers = visibleNamed(
        'dropdown-menu',
        { style: 'menu', expanded: 'true', items: its, interaction: 'focused' },
        mode,
        'estado',
      );
      expect(layers).toHaveLength(0);
    }
  });

  it('the selected and disabled item does not get the secondary-container background', () => {
    for (const mode of MODES) {
      const its = [{ ...row('Edit', 'Edit', 'true'), enabled: 'false' }];
      const on = json(
        'dropdown-menu',
        { style: 'menu', expanded: 'true', items: its },
        mode,
      );
      expect(on.toLowerCase()).not.toContain(hex('secondary-container', mode));
    }
  });
});
