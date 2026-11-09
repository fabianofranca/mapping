// Etapa Material 3 com estados de interação (#869), fase ME3 (#915), grupo dos controles: o campo
// `interaction` de `checkbox`, `radio-button`, `switch` e `slider`, com o mesmo padrão do `button`
// (ME1, `material3Estados.test.ts`). Referência: Compose `material3` 1.4.0, commit 5113b82a….
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, typeOf } from '../support/material3Library';

const catalog = buildCatalog(files);
type Values = Record<string, string>;
const MODES = ['light', 'dark'] as const;

function entryOf(id: string) {
  const entry = findEntry(catalog, id);
  if (entry === undefined) throw new Error(`entrada ${id} ausente`);
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
  /** Estados que o `*Tokens.kt` define para o tipo, na ordem do campo. */
  states: string[];
  /** Estados que desenham igual ao `none` (o Compose não muda nada neles). */
  same?: string[];
  /** Combinações de campos que cobrem os caminhos do desenho. */
  variants: Values[];
  /** Exemplo esperado por estado (nome pt-BR). */
  examples: Record<string, string>;
}

function interactionSuite({ id, states, same = [], variants, examples }: Suite) {
  describe(`${id}: campo interaction`, () => {
    const field = typeOf(id).fields.find((f) => f.key === 'interaction');
    const entry = entryOf(id);
    const visual = states.filter((s) => !same.includes(s));

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

    it('a descrição diz que o desabilitado vence', () => {
      expect(field?.description).toMatch(/habilitado|enabled/i);
      expect(field?.description).toMatch(/desabilitad|false/i);
    });

    it.each(states)('tem o exemplo "%s" sem aviso nos dois modos', (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `exemplo de ${state}`).toBeDefined();
      expect(example?.name).toBe(examples[state]);
      for (const mode of MODES) {
        expect(drawIn(catalog, entry, example?.values ?? {}, mode).warnings).toEqual([]);
      }
    });

    it.each(
      variants.flatMap((v) => MODES.map((m) => [JSON.stringify(v), v, m] as const)),
    )('%s (%s): cada estado desenha sem aviso', (_name, values, mode) => {
      for (const interaction of states)
        expect(drawer(id)({ ...values, interaction }, mode).warnings).toEqual([]);
    });

    it.each(
      variants.flatMap((v) => MODES.map((m) => [JSON.stringify(v), v, m] as const)),
    )('%s (%s): os estados visuais diferem de none', (_name, values, mode) => {
      const base = json(id, { ...values, interaction: 'none' }, mode);
      for (const interaction of visual)
        expect(json(id, { ...values, interaction }, mode), interaction).not.toBe(base);
      for (const interaction of same)
        expect(json(id, { ...values, interaction }, mode), interaction).toBe(base);
    });

    it.each(variants.map((v) => [JSON.stringify(v), v] as const))(
      '%s: com enabled false o interaction não desenha nada',
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
      { label: 'Aceito', state: 'unchecked' },
      { label: 'Aceito', state: 'checked' },
      { label: 'Aceito', state: 'indeterminate' },
    ],
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
  });

  it('a camada de estado é um círculo de 40 (StateLayerSize) e muda de cor com a seleção', () => {
    for (const mode of MODES) {
      for (const state of ['unchecked', 'checked']) {
        const layer = visibleNamed(
          'checkbox',
          { state, interaction: 'hovered' },
          mode,
          'estado',
        );
        expect(layer).toHaveLength(1);
        expect(layer[0]?.width).toBe(40);
        expect(layer[0]?.height).toBe(40);
      }
      const unchecked = visibleNamed(
        'checkbox',
        { state: 'unchecked', interaction: 'hovered' },
        mode,
        'estado',
      );
      const checked = visibleNamed(
        'checkbox',
        { state: 'checked', interaction: 'hovered' },
        mode,
        'estado',
      );
      expect(JSON.stringify(unchecked)).not.toBe(JSON.stringify(checked));
      expect(visibleNamed('checkbox', { interaction: 'none' }, mode, 'estado')).toEqual(
        [],
      );
    }
  });

  it('o contorno do desmarcado passa de on-surface-variant a on-surface com o estado', () => {
    for (const mode of MODES) {
      const stroke = (interaction: string) =>
        JSON.stringify(
          visibleNamed(
            'checkbox',
            { state: 'unchecked', interaction },
            mode,
            'caixa',
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
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
  });

  it('a camada de estado é um círculo de 40 (StateLayerSize)', () => {
    for (const mode of MODES) {
      for (const selected of ['true', 'false']) {
        const layer = visibleNamed(
          'radio-button',
          { selected, interaction: 'pressed' },
          mode,
          'estado',
        );
        expect(layer).toHaveLength(1);
        expect(layer[0]?.width).toBe(40);
        expect(layer[0]?.height).toBe(40);
      }
      expect(
        visibleNamed('radio-button', { interaction: 'none' }, mode, 'estado'),
      ).toEqual([]);
    }
  });

  it('o anel do não selecionado vai a on-surface com o estado; o selecionado segue primary', () => {
    for (const mode of MODES) {
      const ring = (selected: string, interaction: string) =>
        JSON.stringify(
          visibleNamed('radio-button', { selected, interaction }, mode, 'anel').map(
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
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
  });

  const handle = (values: Values, mode: 'light' | 'dark') =>
    visibleNamed('switch', values, mode, 'alça')[0];

  it('a camada de estado é um círculo de 40 em volta da alça', () => {
    for (const mode of MODES) {
      for (const checked of ['true', 'false']) {
        const layer = visibleNamed(
          'switch',
          { checked, interaction: 'focused' },
          mode,
          'estado',
        );
        expect(layer).toHaveLength(1);
        expect(layer[0]?.width).toBe(40);
        expect(layer[0]?.height).toBe(40);
      }
      expect(visibleNamed('switch', { interaction: 'none' }, mode, 'estado')).toEqual([]);
    }
  });

  it('a alça pressionada vira 28 (PressedHandleWidth) nas duas posições; mouse e foco não mudam o tamanho', () => {
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

  it('desabilitado ignora a alça de 28', () => {
    for (const mode of MODES)
      expect(
        handle({ checked: 'true', enabled: 'false', interaction: 'pressed' }, mode)
          ?.width,
      ).toBe(24);
  });

  it('a cor da alça muda com o estado (primary-container ligada, on-surface-variant desligada) e é a mesma nos três', () => {
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
    // HoverHandleWidth (4) é a largura de sempre e nenhum token de cor muda no mouse sobre.
    same: ['hovered'],
    variants: [
      { type: 'single', value: '0.5' },
      { type: 'single', value: '0.4', steps: '4' },
      { type: 'single', value: '0' },
      { type: 'range', valueStart: '0.2', valueEnd: '0.8' },
    ],
    examples: { hovered: 'Mouse sobre', focused: 'Com foco', pressed: 'Pressionado' },
  });

  const handleWidths = (values: Values, mode: 'light' | 'dark') =>
    visibleNamed('slider', values, mode, 'alça').map((n) => n.width);

  it('com foco ou pressionado a alça passa de 4 para 2 (FocusHandleWidth e PressedHandleWidth)', () => {
    for (const mode of MODES) {
      expect(handleWidths({ type: 'single', interaction: 'none' }, mode)).toEqual([4]);
      expect(handleWidths({ type: 'single', interaction: 'hovered' }, mode)).toEqual([4]);
      expect(handleWidths({ type: 'single', interaction: 'focused' }, mode)).toEqual([2]);
      expect(handleWidths({ type: 'single', interaction: 'pressed' }, mode)).toEqual([2]);
    }
  });

  it('no range só a alça do fim (a do single) estreita; a do início fica em 4', () => {
    for (const mode of MODES) {
      const base = { type: 'range', valueStart: '0.2', valueEnd: '0.8' };
      expect(handleWidths({ ...base, interaction: 'none' }, mode).sort()).toEqual([4, 4]);
      expect(handleWidths({ ...base, interaction: 'pressed' }, mode).sort()).toEqual([
        2, 4,
      ]);
    }
  });

  it('desabilitado mantém a alça de 4', () => {
    for (const mode of MODES)
      expect(
        handleWidths({ type: 'single', enabled: 'false', interaction: 'pressed' }, mode),
      ).toEqual([4]);
  });

  it('a alça continua centrada na mesma posição ao estreitar (single, valor 0.5 e 1)', () => {
    for (const mode of MODES) {
      for (const value of ['0.5', '1', '0']) {
        const centers = (interaction: string) => {
          const root = drawer('slider')(
            { type: 'single', value, interaction },
            mode,
          ).root;
          const [node] = allNodes(root).filter((n) => n.name === 'alça' && n.visible);
          return node === undefined ? null : centerX(root, node);
        };
        expect(centers('pressed'), value).toBeCloseTo(centers('none') ?? Number.NaN, 5);
      }
    }
  });
});

/** Centro horizontal do nó na raiz (soma as translações da cadeia de pais). */
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
