// Etapa Material 3 com estados de interação (#869), fase ME5 (#917): o campo `interaction` de `tabs`,
// `navigation-bar`, `short-navigation-bar`, `navigation-rail` e `navigation-drawer`, com o padrão do
// `button` (ME1, `material3Estados.test.ts`). Referência: Compose `material3` 1.4.0, commit 5113b82a….
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, spec, typeOf } from '../support/material3Library';

const catalog = buildCatalog(files);
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
  if (entry === undefined) throw new Error(`entrada ${id} ausente`);
  return entry;
}
const draw = (id: string, values: Values, mode: Mode) =>
  drawIn(catalog, entryOf(id), values as Record<string, string>, mode);
const json = (id: string, values: Values, mode: Mode): string =>
  JSON.stringify(draw(id, values, mode).root);

/** Os nós de um nome, sem descer por um nó invisível (um estilo de cada vez desenha). */
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
  badge: '', // a coluna do selo do `navigation-drawer`; os outros tipos a ignoram
});
const items = [row('Início', 'Home', true), row('Buscar', 'Search', false)];
const unselected = [row('Início', 'Home', false), row('Buscar', 'Search', false)];

interface Suite {
  id: string;
  variants: Values[];
  /** Token da cor da camada (a do ripple no Compose). */
  color: (v: Values) => string;
}

function suite({ id, variants, color }: Suite) {
  describe(`${id}: campo interaction`, () => {
    const field = typeOf(id).fields.find((f) => f.key === 'interaction');
    const entry = entryOf(id);
    const combos = variants.flatMap((v) =>
      MODES.map((m) => [JSON.stringify(v), v, m] as const),
    );

    it('é um enum opcional com as opções dos tokens, padrão none, fora do code', () => {
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

    it('a descrição diz que vale para o item selecionado e que o tipo não tem desabilitado', () => {
      expect(field?.description).toMatch(/selecionad/i);
      expect(field?.description).toMatch(/sem enabled|não tem/i);
    });

    it.each(STATES)('tem o exemplo "%s" sem aviso nos dois modos', (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `exemplo de ${state}`).toBeDefined();
      expect(example?.name).toBe(EXAMPLES[state as keyof typeof EXAMPLES]);
      for (const mode of MODES)
        expect(drawIn(catalog, entry, example?.values ?? {}, mode).warnings).toEqual([]);
    });

    it.each(combos)('%s (%s): cada estado desenha sem aviso', (_n, values, mode) => {
      for (const interaction of STATES)
        expect(draw(id, { ...values, interaction }, mode).warnings).toEqual([]);
    });

    it.each(combos)(
      '%s (%s): a camada do selecionado, na cor do conteúdo e com a opacidade do estado',
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

    it.each(combos)('%s (%s): sem item selecionado nada muda', (_n, values, mode) => {
      const v = { ...values, items: unselected };
      const base = json(id, { ...v, interaction: 'none' }, mode);
      for (const interaction of STATES)
        expect(json(id, { ...v, interaction }, mode), interaction).toBe(base);
    });
  });
}

/** O primeiro nó cujo ramo `children` contém o `estado` e o conteúdo (ícone) dele. */
function drawOrder(node: SceneNode, out: string[] = []): string[] {
  if ('children' in node) {
    const names = node.children.filter((c) => c.visible).map((c) => c.name ?? c.type);
    if (names.includes('estado')) out.push(names.join('>'));
    node.children.forEach((c) => drawOrder(c, out));
  }
  return out;
}

describe('a camada fica atrás do conteúdo onde o Compose a desenha atrás (ripple do indicador)', () => {
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
  it.each(cases)('%s: o estado vem antes do conteúdo', (id, values) => {
    for (const mode of MODES) {
      const orders = drawOrder(draw(id, values, mode).root);
      expect(orders, id).toHaveLength(1);
      expect(orders[0]?.startsWith('estado>'), orders[0]).toBe(true);
    }
  });
});

describe('o catálogo mostra o estado na prévia (a tabela vem do preview)', () => {
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

  it('a camada tem o tamanho do indicador, 56 × 32', () => {
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

  it('a camada cobre o item de 56 e leva o raio full', () => {
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
