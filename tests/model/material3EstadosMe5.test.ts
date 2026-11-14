// Material 3 stage with interaction states (#869), phase ME5 (#917): the `interaction` field of `tabs`,
// `navigation-bar`, `short-navigation-bar`, `navigation-rail` and `navigation-drawer`, following the
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
  { light: string; dark: string } | number
>;
const hex = (token: string, mode: Mode): string => {
  const v = tokenValues[token];
  return typeof v === 'object' ? v[mode].toLowerCase() : '';
};
const OPACITY: Record<string, number> = { hovered: 0.08, focused: 0.1, pressed: 0.1 };
const STATES = ['hovered', 'focused', 'pressed'];
const EXAMPLES = { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' };

function entryOf(id: string) {
  const entry = findEntry(catalog, id);
  if (entry === undefined) throw new Error(`entry ${id} missing`);
  return entry;
}
const draw = (id: string, values: Values, mode: Mode) =>
  drawIn(catalog, entryOf(id), values as Record<string, string>, mode);
const json = (id: string, values: Values, mode: Mode): string =>
  JSON.stringify(draw(id, values, mode).root);

/** The nodes with a name, without descending into an invisible node (one style draws at a time). */
function visibleNamed(node: SceneNode, name: string, out: SceneNode[] = []): SceneNode[] {
  if (!node.visible) return out;
  if (node.name === name) out.push(node);
  if ('children' in node) node.children.forEach((c) => visibleNamed(c, name, out));
  return out;
}
const layers = (id: string, values: Values, mode: Mode) =>
  visibleNamed(draw(id, values, mode).root, 'estado');
const solid = (node: SceneNode | undefined): string | undefined => {
  const fills = node !== undefined && 'fills' in node ? node.fills : undefined;
  const paint = fills?.[0];
  return paint?.type === 'solid' ? paint.color.toLowerCase() : undefined;
};

const row = (label: string, icon: string, selected: boolean) => ({
  label,
  icon,
  selected: String(selected),
  badge: '', // the badge column of `navigation-drawer`; the other types ignore it
});
const items = [row('Home', 'Home', true), row('Search', 'Search', false)];
const unselected = [row('Home', 'Home', false), row('Search', 'Search', false)];

interface Suite {
  id: string;
  variants: Values[];
  /** Token of the layer color (the ripple's in Compose). */
  color: (v: Values) => string;
}

function suite({ id, variants, color }: Suite) {
  describe(`${id}: interaction field`, () => {
    const field = typeOf(id).fields.find((f) => f.key === 'interaction');
    const entry = entryOf(id);
    const combos = variants.flatMap((v) =>
      MODES.map((m) => [JSON.stringify(v), v, m] as const),
    );

    it('is an optional enum with the options of the tokens, default none, outside the code', () => {
      expect(field).toMatchObject({
        key: 'interaction',
        label: 'Interação',
        type: 'enum',
        default: 'none',
        options: ['none', ...STATES],
      });
      expect(field?.required).not.toBe(true);
      expect(JSON.stringify(typeOf(id).code ?? {})).not.toContain('"interaction"');
    });

    it('the description says it applies to the selected item and that the type has no disabled state', () => {
      expect(field?.description).toMatch(/selecionad/i);
      expect(field?.description).toMatch(/sem enabled|não tem/i);
    });

    it.each(STATES)('has the example "%s" without warnings in both modes', (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `example of ${state}`).toBeDefined();
      expect(example?.name).toBe(EXAMPLES[state as keyof typeof EXAMPLES]);
      for (const mode of MODES)
        expect(drawIn(catalog, entry, example?.values ?? {}, mode).warnings).toEqual([]);
    });

    it.each(combos)('%s (%s): each state draws without warnings', (_n, values, mode) => {
      for (const interaction of STATES)
        expect(draw(id, { ...values, interaction }, mode).warnings).toEqual([]);
    });

    it.each(combos)(
      '%s (%s): the selected layer, in the content color and with the state opacity',
      (_n, values, mode) => {
        expect(layers(id, { ...values, interaction: 'none' }, mode)).toEqual([]);
        for (const interaction of STATES) {
          const found = layers(id, { ...values, interaction }, mode);
          expect(found, interaction).toHaveLength(1);
          expect(solid(found[0]), interaction).toBe(hex(color(values), mode));
          expect(found[0]?.opacity, interaction).toBe(OPACITY[interaction]);
        }
        const base = json(id, { ...values, interaction: 'none' }, mode);
        for (const interaction of STATES)
          expect(json(id, { ...values, interaction }, mode), interaction).not.toBe(base);
      },
    );

    it.each(combos)(
      '%s (%s): with no selected item nothing changes',
      (_n, values, mode) => {
        const v = { ...values, items: unselected };
        const base = json(id, { ...v, interaction: 'none' }, mode);
        for (const interaction of STATES)
          expect(json(id, { ...v, interaction }, mode), interaction).toBe(base);
      },
    );
  });
}

/** The first node whose `children` branch contains the `estado` and its content (icon). */
function drawOrder(node: SceneNode, out: string[] = []): string[] {
  if ('children' in node) {
    const names = node.children.filter((c) => c.visible).map((c) => c.name ?? c.type);
    if (names.includes('estado')) out.push(names.join('>'));
    node.children.forEach((c) => drawOrder(c, out));
  }
  return out;
}

describe('the layer stays behind the content where Compose draws it behind (indicator ripple)', () => {
  const cases: [string, Values][] = [
    ['navigation-bar', { items, interaction: 'pressed' }],
    [
      'short-navigation-bar',
      { items, arrangement: 'EqualWeight', iconPosition: 'Top', interaction: 'pressed' },
    ],
    [
      'short-navigation-bar',
      { items, arrangement: 'Centered', iconPosition: 'Start', interaction: 'pressed' },
    ],
    ['navigation-rail', { items, style: 'rail', interaction: 'pressed' }],
    [
      'navigation-rail',
      { items, style: 'wide', initialValue: 'Expanded', interaction: 'pressed' },
    ],
  ];
  it.each(cases)('%s: the state comes before the content', (id, values) => {
    for (const mode of MODES) {
      const orders = drawOrder(draw(id, values, mode).root);
      expect(orders, id).toHaveLength(1);
      expect(orders[0]?.startsWith('estado>'), orders[0]).toBe(true);
    }
  });
});

describe('the catalog shows the state in the preview (the table comes from the preview)', () => {
  it.each([
    'tabs',
    'navigation-bar',
    'short-navigation-bar',
    'navigation-rail',
    'navigation-drawer',
  ])('%s: previewValues + interaction desenha a camada', (id) => {
    const entry = entryOf(id);
    for (const mode of MODES) {
      const values = { ...(entry.previewValues ?? {}), interaction: 'pressed' };
      expect(layers(id, values, mode), id).toHaveLength(1);
    }
  });
});

describe('tabs (PrimaryNavigationTabTokens.kt, SecondaryNavigationTabTokens.kt)', () => {
  const tabStyle = (style: string, iconPosition: string): Values => ({
    items,
    style,
    iconPosition,
  });
  suite({
    id: 'tabs',
    variants: [
      tabStyle('primary', 'top'),
      tabStyle('secondary', 'leading'),
      tabStyle('primary-scrollable', 'leading'),
      tabStyle('secondary-scrollable', 'top'),
    ],
    color: (v) => (String(v.style).startsWith('secondary') ? 'on-surface' : 'primary'),
  });
});

describe('navigation-bar (NavigationBarTokens.kt)', () => {
  suite({
    id: 'navigation-bar',
    variants: [
      { items, alwaysShowLabel: 'true' },
      { items, alwaysShowLabel: 'false' },
    ],
    color: () => 'on-surface',
  });

  it('the layer has the size of the indicator, 56 × 32', () => {
    for (const mode of MODES) {
      const [layer] = layers('navigation-bar', { items, interaction: 'pressed' }, mode);
      expect([layer?.width, layer?.height]).toEqual([56, 32]);
    }
  });
});

describe('short-navigation-bar (NavigationBarVerticalItemTokens.kt)', () => {
  suite({
    id: 'short-navigation-bar',
    variants: [
      { items, arrangement: 'EqualWeight', iconPosition: 'Top' },
      { items, arrangement: 'Centered', iconPosition: 'Start' },
    ],
    color: () => 'on-surface',
  });
});

describe('navigation-rail (NavigationRailCollapsedTokens.kt)', () => {
  suite({
    id: 'navigation-rail',
    variants: [
      { items, style: 'rail', alwaysShowLabel: 'true' },
      { items, style: 'wide', initialValue: 'Collapsed' },
      { items, style: 'wide', initialValue: 'Expanded' },
      { items, style: 'modal-wide', initialValue: 'Expanded' },
    ],
    color: () => 'on-surface',
  });
});

describe('navigation-drawer (NavigationDrawerTokens.kt)', () => {
  suite({
    id: 'navigation-drawer',
    variants: [
      { items, style: 'modal', headline: 'Mapping' },
      { items, style: 'permanent' },
    ],
    color: () => 'on-secondary-container',
  });

  it('the layer covers the 56 item and takes the full radius', () => {
    for (const mode of MODES) {
      const [layer] = layers(
        'navigation-drawer',
        { items, style: 'modal', interaction: 'focused' },
        mode,
      );
      expect(layer?.height).toBe(56);
      expect(layer).toMatchObject({ cornerRadius: tokenValues['corner-full'] });
    }
  });
});
