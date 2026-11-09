// Etapa Material 3 com estados de interação (#869), fase ME4 (#916): o campo `interaction` de
// `text-field`, `secure-text-field`, `search-bar`, `dropdown-menu` e `list-item`, com o padrão do
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
  { light: string; dark: string }
>;
const hex = (token: string, mode: Mode): string =>
  (tokenValues[token]?.[mode] ?? '').toLowerCase();

function entryOf(id: string) {
  const entry = findEntry(catalog, id);
  if (entry === undefined) throw new Error(`entrada ${id} ausente`);
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
/** Cor e largura do traço do primeiro nó visível com o nome. */
function strokeOf(id: string, values: Values, mode: Mode, name: string) {
  const node = visibleNamed(id, values, mode, name)[0];
  const stroke = node !== undefined && 'stroke' in node ? node.stroke : undefined;
  const paint = stroke?.paints[0];
  return {
    width: stroke?.width,
    color: paint?.type === 'solid' ? paint.color.toLowerCase() : undefined,
  };
}
/** O nó (texto ou ícone) visível com o nome tem a cor do token? Procura o hex no JSON do nó. */
function paintedWith(
  id: string,
  values: Values,
  mode: Mode,
  name: string,
  token: string,
) {
  const nodes = visibleNamed(id, values, mode, name);
  expect(nodes.length, `nó ${name} visível`).toBeGreaterThan(0);
  return nodes.every((n) => JSON.stringify(n).toLowerCase().includes(hex(token, mode)));
}

interface Suite {
  id: string;
  states: string[];
  /** Estados que desenham igual ao `none`. */
  same?: string[];
  variants: Values[];
  examples: Record<string, string>;
  /** O tipo tem `enabled`? Sem ele não há desabilitado que vença. */
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
  describe(`${id}: campo interaction`, () => {
    const field = typeOf(id).fields.find((f) => f.key === 'interaction');
    const entry = entryOf(id);
    const visual = states.filter((s) => !same.includes(s));
    const combos = variants.flatMap((v) =>
      MODES.map((m) => [JSON.stringify(v), v, m] as const),
    );

    it('é um enum opcional com as opções dos tokens, padrão none, fora do code', () => {
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

    it('a descrição explica a precedência do desabilitado', () => {
      expect(field?.description).toMatch(
        hasEnabled ? /desabilitad/i : /sem (enabled|desabilitado)|não tem/i,
      );
    });

    it.each(states)('tem o exemplo "%s" sem aviso nos dois modos', (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `exemplo de ${state}`).toBeDefined();
      expect(example?.name).toBe(examples[state]);
      for (const mode of MODES)
        expect(drawIn(catalog, entry, example?.values ?? {}, mode).warnings).toEqual([]);
    });

    it.each(combos)('%s (%s): cada estado desenha sem aviso', (_n, values, mode) => {
      for (const interaction of states)
        expect(draw(id, { ...values, interaction }, mode).warnings).toEqual([]);
    });

    it.each(combos)('%s (%s): os estados visuais diferem de none', (_n, values, mode) => {
      const base = json(id, { ...values, interaction: 'none' }, mode);
      for (const interaction of visual)
        expect(json(id, { ...values, interaction }, mode), interaction).not.toBe(base);
      for (const interaction of same)
        expect(json(id, { ...values, interaction }, mode), interaction).toBe(base);
    });

    if (hasEnabled)
      it.each(variants.map((v) => [JSON.stringify(v), v] as const))(
        '%s: com enabled false o interaction não desenha nada',
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

    it('filled com foco: indicador de 2 em primary e rótulo em primary', () => {
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

    it('filled em erro com foco: indicador e rótulo em error', () => {
      for (const mode of MODES) {
        const v = { ...filled, ...err, interaction: 'focused' };
        expect(strokeOf(id, v, mode, 'indicador')).toEqual({
          width: 2,
          color: hex('error', mode),
        });
        expect(paintedWith(id, v, mode, 'rótulo', 'error')).toBe(true);
      }
    });

    it('filled com o mouse: indicador de 1 em on-surface; em erro, indicador e rótulo em on-error-container', () => {
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

    it('outlined com foco: contorno de 2 em primary (inclusive o vão do rótulo) e rótulo em primary', () => {
      for (const mode of MODES) {
        const v = { ...outlined, interaction: 'focused' };
        const names =
          base.hasText === undefined && base.value === undefined
            ? ['contorno']
            : ['contorno (lados)', 'trecho inicial', 'trecho final'];
        for (const name of names)
          expect(strokeOf(id, v, mode, name), name).toEqual({
            width: 2,
            color: hex('primary', mode),
          });
        expect(paintedWith(id, v, mode, 'rótulo', 'primary')).toBe(true);
      }
    });

    it('outlined com o mouse: contorno de 1 em on-surface e rótulo em on-surface; em erro, on-error-container', () => {
      for (const mode of MODES) {
        const v = { ...outlined, interaction: 'hovered' };
        const name =
          base.hasText === undefined && base.value === undefined
            ? 'contorno'
            : 'contorno (lados)';
        expect(strokeOf(id, v, mode, name)).toEqual({
          width: 1,
          color: hex('on-surface', mode),
        });
        expect(paintedWith(id, v, mode, 'rótulo', 'on-surface')).toBe(true);
        const e = { ...v, ...err };
        expect(strokeOf(id, e, mode, name).color).toBe(hex('on-error-container', mode));
        expect(paintedWith(id, e, mode, 'rótulo', 'on-error-container')).toBe(true);
      }
    });

    it('o ícone final em erro vai a on-error-container só com o mouse; o inicial não muda', () => {
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

textFieldSuite('text-field', { label: 'Nome', value: 'Maria' });
textFieldSuite('secure-text-field', { label: 'Senha', hasText: 'true' });

describe('search-bar (SearchBarTokens.kt)', () => {
  interactionSuite({
    id: 'search-bar',
    states: ['hovered', 'focused', 'pressed'],
    hasEnabled: false,
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
    variants: [
      { placeholder: 'Pesquisar' },
      { query: 'café', style: 'bar' },
      { query: 'café', style: 'docked', expanded: 'true' },
    ],
  });

  it('a camada de estado é do tamanho da barra (56) e leva o raio do componente', () => {
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
  const lines = { headlineContent: 'Ana Souza', supportingContent: 'Vamos almoçar?' };
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
        overlineContent: 'Hoje',
        trailingContent: '12:30',
        leadingIcon: 'Person',
      },
    ],
  });

  it('a camada cobre o item todo e o arrastado ganha a sombra do nível 4', () => {
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
    row('Editar', 'Edit', 'true'),
    row('Compartilhar', 'Share'),
    row('Excluir', 'Delete'),
  ];
  const one = items.slice(0, 1);
  interactionSuite({
    id: 'dropdown-menu',
    states: FIELD_STATES,
    hasEnabled: false,
    examples: FIELD_EXAMPLES,
    variants: [
      { style: 'menu', expanded: 'true', items },
      { style: 'exposed', expanded: 'false', label: 'País', value: 'Brasil', items },
      {
        style: 'exposed',
        expanded: 'true',
        label: 'Idioma',
        value: 'Português',
        items: one,
      },
    ],
  });

  it('a descrição diz que o estado vale para o campo e para o item selecionado', () => {
    const d =
      typeOf('dropdown-menu').fields.find((f) => f.key === 'interaction')?.description ??
      '';
    expect(d).toMatch(/campo/i);
    expect(d).toMatch(/selecionad/i);
  });

  it('o campo exposto tem o indicador de 2 em primary com foco', () => {
    for (const mode of MODES) {
      const v = {
        style: 'exposed',
        expanded: 'false',
        label: 'País',
        value: 'Brasil',
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

  it('no menu só o item selecionado ganha a camada; sem item selecionado, nada muda', () => {
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

  it('o item selecionado e desabilitado ignora o estado', () => {
    for (const mode of MODES) {
      const its = [{ ...row('Editar', 'Edit', 'true'), enabled: 'false' }];
      const layers = visibleNamed(
        'dropdown-menu',
        { style: 'menu', expanded: 'true', items: its, interaction: 'focused' },
        mode,
        'estado',
      );
      expect(layers).toHaveLength(0);
    }
  });
});
