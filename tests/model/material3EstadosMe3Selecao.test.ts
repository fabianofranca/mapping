// Etapa Material 3 com estados de interação (#869), fase ME3 (#915), grupo de seleção: o campo `interaction`
// do `chip`, do `card` e do `segmented-button` (aparência parada do estado, como o `button` da ME1).
// Referência: Compose `material3` 1.4.0, commit 5113b82a… (`tokens/*ChipTokens.kt`, `*CardTokens.kt`,
// `OutlinedSegmentedButtonTokens.kt` e `StateTokens.kt`).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, typeOf } from '../support/material3Library';

const catalog = buildCatalog(files);
const MODES = ['light', 'dark'] as const;
type Values = Record<string, unknown>;

/** As sombras de nós visíveis (o nó invisível leva a subárvore junto), com y e desfoque. */
function shadows(node: SceneNode, out: { y: number; blur: number }[] = []) {
  if (!node.visible) return out;
  for (const e of node.effects) out.push({ y: e.offset.y, blur: e.blur });
  if ('children' in node) node.children.forEach((c) => shadows(c, out));
  return out;
}
/** Quantos nós `estado` visíveis há (a camada de estado). */
function layers(node: SceneNode, out: SceneNode[] = []): SceneNode[] {
  if (!node.visible) return out;
  if (node.name === 'estado') out.push(node);
  if ('children' in node) node.children.forEach((c) => layers(c, out));
  return out;
}
const L1 = { y: 1, blur: 2 };
const L2 = { y: 2, blur: 6 };
const L3 = { y: 3, blur: 12 };
const L4 = { y: 4, blur: 16 };

function interactionField(id: string) {
  return typeOf(id).fields.find((f) => f.key === 'interaction');
}
function describeField(id: string, options: string[]) {
  const field = interactionField(id);
  it('é um enum opcional com as opções dos tokens do Compose, padrão none, fora do code', () => {
    expect(field).toMatchObject({
      key: 'interaction',
      label: 'Interação',
      type: 'enum',
      default: 'none',
      options,
    });
    expect(field?.required).not.toBe(true);
    expect(JSON.stringify(typeOf(id).code ?? {})).not.toContain('interaction');
  });
  it('a descrição diz o que acontece com o desabilitado', () => {
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
    'tem um exemplo para %s que desenha sem aviso nos dois modos',
    (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `exemplo de ${state} em ${id}`).toBeDefined();
      for (const mode of MODES) {
        const drawing = drawIn(catalog, entry, example?.values ?? {}, mode);
        expect(drawing.warnings, `${state} ${mode}`).toEqual([]);
      }
    },
  );
}

// --- chip -----------------------------------------------------------------------------------

describe('chip: campo interaction', () => {
  describeField('chip', ['none', 'hovered', 'focused', 'pressed', 'dragged']);
  const entry = findEntry(catalog, 'chip')!;
  exampleFor('chip', entry, ['hovered', 'focused', 'pressed', 'dragged']);

  const draw = (values: Values, mode: 'light' | 'dark') =>
    drawIn(catalog, entry, { label: 'Aberto agora', ...values }, mode);
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
    '%s selected=%s (%s): cada estado difere de none (a camada existe)',
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
    '%s selected=%s: com enabled false o interaction não desenha nada',
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

  it('a camada de estado usa a cor do rótulo e a opacidade do estado', () => {
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

  it('a elevação do elevated muda por estado: 1 parado, foco e pressionado, 2 no mouse, 4 arrastado', () => {
    for (const style of ['assist-elevated', 'filter-elevated', 'suggestion-elevated']) {
      const at = (interaction: string) =>
        shadows(draw({ style, interaction }, 'light').root);
      expect(at('none'), style).toEqual([L1]);
      expect(at('focused'), style).toEqual([L1]);
      expect(at('pressed'), style).toEqual([L1]);
      expect(at('hovered'), style).toEqual([L2]);
      expect(at('dragged'), style).toEqual([L4]);
    }
  });

  it('o chip plano só tem sombra arrastado, ou no mouse sobre o filter selecionado (nível 1)', () => {
    for (const style of ['assist', 'filter', 'input', 'suggestion']) {
      const at = (interaction: string, selected = 'false') =>
        shadows(draw({ style, selected, interaction }, 'light').root);
      expect(at('none'), style).toEqual([]);
      expect(at('focused'), style).toEqual([]);
      expect(at('pressed'), style).toEqual([]);
      expect(at('dragged'), style).toEqual([L4]);
      expect(at('hovered'), style).toEqual([]);
    }
    const sel = (interaction: string) =>
      shadows(draw({ style: 'filter', selected: 'true', interaction }, 'light').root);
    expect(sel('hovered')).toEqual([L1]);
    expect(sel('focused')).toEqual([]);
    expect(sel('pressed')).toEqual([]);
  });

  it('o contorno do chip plano muda no foco e some selecionado (FlatFocusOutlineColor)', () => {
    const stroke = (values: Values) => JSON.stringify(draw(values, 'light').root.stroke);
    for (const style of ['assist', 'suggestion', 'filter', 'input']) {
      const none = stroke({ style, interaction: 'none' });
      expect(stroke({ style, interaction: 'focused' }), style).not.toBe(none);
      for (const interaction of ['hovered', 'pressed', 'dragged'])
        expect(stroke({ style, interaction }), `${style} ${interaction}`).toBe(none);
    }
    // assist usa on-surface no foco; os outros, on-surface-variant
    expect(stroke({ style: 'assist', interaction: 'focused' })).not.toBe(
      stroke({ style: 'suggestion', interaction: 'focused' }),
    );
    expect(stroke({ style: 'filter', interaction: 'focused' })).toBe(
      stroke({ style: 'suggestion', interaction: 'focused' }),
    );
    // selecionado e elevated não têm contorno: o contorno não muda em estado nenhum
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

describe('card: campo interaction', () => {
  describeField('card', ['none', 'hovered', 'focused', 'pressed', 'dragged']);
  const entry = findEntry(catalog, 'card')!;
  exampleFor('card', entry, ['hovered', 'focused', 'pressed', 'dragged']);

  const draw = (values: Values, mode: 'light' | 'dark') =>
    drawIn(catalog, entry, { title: 'Praia do Rosa', ...values }, mode);
  const STYLES = ['filled', 'elevated', 'outlined'];
  const STATES = ['hovered', 'focused', 'pressed', 'dragged'];

  it('este tipo não tem enabled, então o interaction sempre desenha', () => {
    expect(typeOf('card').fields.some((f) => f.key === 'enabled')).toBe(false);
    expect(interactionField('card')?.description).toMatch(/não tem enabled/);
  });

  it.each(STYLES.flatMap((s) => MODES.map((m) => [s, m] as const)))(
    '%s (%s): cada estado difere de none (a camada existe)',
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

  it('a camada tem as opacidades dos tokens de estado', () => {
    const opacity = (interaction: string) =>
      layers(draw({ style: 'filled', interaction }, 'light').root)[0]?.opacity;
    expect(opacity('hovered')).toBe(0.08);
    expect(opacity('focused')).toBe(0.1);
    expect(opacity('pressed')).toBe(0.1);
    expect(opacity('dragged')).toBe(0.16);
  });

  it('a elevação muda por estado (nível 0, 1, 2, 3 e 4 dos tokens)', () => {
    const at = (style: string, interaction: string) =>
      shadows(draw({ style, interaction }, 'light').root);
    // filled: 0, mouse 1, foco 0, pressionado 0, arrastado 3
    expect(at('filled', 'none')).toEqual([]);
    expect(at('filled', 'hovered')).toEqual([L1]);
    expect(at('filled', 'focused')).toEqual([]);
    expect(at('filled', 'pressed')).toEqual([]);
    expect(at('filled', 'dragged')).toEqual([L3]);
    // elevated: 1, mouse 2, foco 1, pressionado 1, arrastado 4
    expect(at('elevated', 'none')).toEqual([L1]);
    expect(at('elevated', 'hovered')).toEqual([L2]);
    expect(at('elevated', 'focused')).toEqual([L1]);
    expect(at('elevated', 'pressed')).toEqual([L1]);
    expect(at('elevated', 'dragged')).toEqual([L4]);
    // outlined: como o filled
    expect(at('outlined', 'none')).toEqual([]);
    expect(at('outlined', 'hovered')).toEqual([L1]);
    expect(at('outlined', 'focused')).toEqual([]);
    expect(at('outlined', 'pressed')).toEqual([]);
    expect(at('outlined', 'dragged')).toEqual([L3]);
  });

  it('o contorno do outlined muda só no foco (OutlinedCardTokens.FocusOutlineColor)', () => {
    const stroke = (style: string, interaction: string) =>
      JSON.stringify(draw({ style, interaction }, 'light').root.stroke);
    const none = stroke('outlined', 'none');
    expect(stroke('outlined', 'focused')).not.toBe(none);
    for (const interaction of ['hovered', 'pressed', 'dragged'])
      expect(stroke('outlined', interaction), interaction).toBe(none);
    for (const style of ['filled', 'elevated'])
      expect(stroke(style, 'focused'), style).toBe(stroke(style, 'none'));
  });

  it('a altura do cartão não muda com o estado', () => {
    for (const style of STYLES) {
      const h = (interaction: string) =>
        draw({ style, interaction }, 'light').root.height;
      for (const interaction of STATES) expect(h(interaction)).toBe(h('none'));
    }
  });
});

// --- segmented-button ------------------------------------------------------------------------

describe('segmented-button: campo interaction', () => {
  describeField('segmented-button', ['none', 'hovered', 'focused', 'pressed']);
  const entry = findEntry(catalog, 'segmented-button')!;
  exampleFor('segmented-button', entry, ['hovered', 'focused', 'pressed']);

  const rows = (...selected: boolean[]) =>
    selected.map((s, i) => ({
      label: ['Dia', 'Semana', 'Mês'][i],
      icon: '',
      selected: s ? 'true' : 'false',
    }));
  const draw = (values: Values, mode: 'light' | 'dark') =>
    drawIn(catalog, entry, { options: rows(false, true, false), ...values }, mode);
  const STATES = ['hovered', 'focused', 'pressed'];

  it.each(['single', 'multi'].flatMap((s) => MODES.map((m) => [s, m] as const)))(
    '%s (%s): cada estado difere de none e cai no item selecionado',
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

  it('o estado cai em cada item selecionado (seleção múltipla com dois) e só neles', () => {
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

  it('a camada tem as opacidades dos tokens de estado', () => {
    const opacity = (interaction: string) =>
      layers(draw({ interaction }, 'light').root)[0]?.opacity;
    expect(opacity('hovered')).toBe(0.08);
    expect(opacity('focused')).toBe(0.1);
    expect(opacity('pressed')).toBe(0.1);
  });

  it.each(STATES)(
    '%s com enabled false desenha igual ao desabilitado sem interaction',
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
