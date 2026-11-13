// Etapa Material 3 com estados de interação (#869), fase ME3 (#915), grupo das ações: o campo `interaction`
// do fab, do extended-fab, do icon-button e do icon-toggle-button. Referência: Compose `material3` 1.4.0,
// commit 5113b82a… (`FabPrimaryContainerTokens`, `ExtendedFabPrimaryTokens`, `IconButtonTokens` e os
// `Filled*`, `FilledTonal*` e `Outlined*IconButtonTokens`).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { resolveTokens } from '../../src/model/components/tokens';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, solid, typeOf } from '../support/material3Library';

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

/** Sombras de um nível de elevação: ponto (preto a 30%) e ambiente (preto a 15%). */
const level = (
  point: [y: number, blur: number, spread: number],
  ambient: [y: number, blur: number, spread: number],
) => [
  { y: point[0], blur: point[1], spread: point[2], color: 'rgba(0, 0, 0, 0.3)' },
  { y: ambient[0], blur: ambient[1], spread: ambient[2], color: 'rgba(0, 0, 0, 0.15)' },
];
/** Sombras (y, blur, spread e cor) dos nós visíveis, na ordem do desenho. */
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

/** Camada de estado: o nó `estado` visível, com a cor e a opacidade resolvidas. */
function layer(id: string, values: Record<string, string>, mode: 'light' | 'dark') {
  const node = byName(draw(id, values, mode).root, 'estado');
  if (node === undefined || !node.visible) return undefined;
  return { color: solid(node.fills), opacity: node.opacity };
}

function checkField(id: string, descriptionPattern: RegExp) {
  const type = typeOf(id);
  const field = type.fields.find((f) => f.key === 'interaction');
  expect(field).toMatchObject({
    key: 'interaction',
    label: 'Interação',
    type: 'enum',
    default: 'none',
    options: ['none', 'hovered', 'focused', 'pressed'],
  });
  expect(field?.required).not.toBe(true);
  // `interactionSource` é o parâmetro do Compose que o `ignore` deixa de fora (importação, #1079 S5): não é o campo.
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
    expect(example, `exemplo de ${state}`).toBeDefined();
    for (const mode of MODES) {
      const drawing = drawIn(catalog, entry, example?.values ?? {}, mode);
      expect(drawing.warnings, `${state} ${mode}`).toEqual([]);
    }
  }
}

describe.each(['fab', 'extended-fab'])('%s: campo interaction', (id) => {
  const base: Record<string, string> =
    id === 'fab' ? { icon: 'Add' } : { text: 'Criar', icon: 'Add' };

  it('é um enum opcional com as opções dos tokens, padrão none, fora do code e das variants', () => {
    checkField(id, /sem enabled|não tem/i);
  });

  it('tem um exemplo por estado que desenha sem aviso nos dois modos', () =>
    checkExamples(id));

  const colors = ['primaryContainer', 'tertiary', 'surface', 'errorContainer'];
  it.each(colors.flatMap((c) => MODES.map((m) => [c, m] as const)))(
    '%s (%s): hovered, focused e pressed diferem de none; o mouse sobre difere dos outros (elevação)',
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
      // Foco e pressionado têm a mesma opacidade (0,10) e o mesmo nível de elevação (3): o quadro é o mesmo.
      expect(drawn.focused).toBe(drawn.pressed);
    },
  );

  it('a camada tem a cor do conteúdo do contêiner e a opacidade do estado', () => {
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

  it('a camada acompanha a forma de cada tamanho do fab', () => {
    if (id !== 'fab') return;
    for (const size of ['small', 'regular', 'large']) {
      for (const mode of MODES) {
        const none = json(id, { ...base, size, interaction: 'none' }, mode);
        expect(json(id, { ...base, size, interaction: 'pressed' }, mode)).not.toBe(none);
      }
    }
  });

  it('só o mouse sobre sobe a elevação (nível 4); foco e pressionado ficam no nível 3', () => {
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

  it('o contêiner continua no lugar: a sombra do nível 4 usa o mesmo fundo e a mesma forma', () => {
    const t = tokensOf('light');
    const drawing = draw(id, { ...base, interaction: 'hovered' }, 'light');
    const lifted = byName(drawing.root, 'sombra elevada');
    expect(lifted?.visible).toBe(true);
    expect(solid(lifted?.fills ?? [])).toBe(t['primary-container']);
    expect(drawing.root.width).toBe(draw(id, base, 'light').root.width);
  });
});

describe('extended-fab: recolhido e só texto', () => {
  it.each(MODES)('a camada existe com expanded false e sem ícone (%s)', (mode) => {
    const cases: Record<string, string>[] = [
      { text: 'Editar', icon: 'Edit', expanded: 'false' },
      { text: 'Criar' },
    ];
    for (const values of cases) {
      const none = json('extended-fab', { ...values, interaction: 'none' }, mode);
      for (const interaction of STATES) {
        expect(json('extended-fab', { ...values, interaction }, mode)).not.toBe(none);
      }
    }
  });
});

const BUTTON_STYLES = ['standard', 'filled', 'tonal', 'outlined'] as const;
const BUTTON_LAYER: Record<(typeof BUTTON_STYLES)[number], string> = {
  standard: 'on-surface-variant',
  filled: 'on-primary',
  tonal: 'on-secondary-container',
  outlined: 'on-surface-variant',
};

describe('icon-button: campo interaction', () => {
  it('é um enum opcional com as opções dos tokens, padrão none, fora do code e das variants', () => {
    checkField('icon-button', /enabled/i);
    expect(
      typeOf('icon-button').fields.find((f) => f.key === 'interaction')?.description,
    ).toMatch(/desabilitado/i);
  });

  it('tem um exemplo por estado que desenha sem aviso nos dois modos', () =>
    checkExamples('icon-button'));

  it.each(BUTTON_STYLES.flatMap((s) => MODES.map((m) => [s, m] as const)))(
    '%s (%s): hovered, focused e pressed diferem de none, com a camada do estilo',
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
    '%s: com enabled false o interaction não desenha nada',
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

  it('não muda a elevação nem o contorno entre os estados (os tokens não têm)', () => {
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
          'contorno',
        ),
      );
    expect(outline('hovered')).toBe(outline('none'));
    expect(outline('pressed')).toBe(outline('none'));
  });
});

const TOGGLE_LAYER: Record<(typeof BUTTON_STYLES)[number], [string, string]> = {
  // [ligado, desligado]
  standard: ['primary', 'on-surface-variant'],
  filled: ['on-primary', 'on-surface-variant'],
  tonal: ['on-secondary', 'on-secondary-container'],
  outlined: ['inverse-on-surface', 'on-surface-variant'],
};

describe('icon-toggle-button: campo interaction', () => {
  it('é um enum opcional com as opções dos tokens, padrão none, fora do code e das variants', () => {
    checkField('icon-toggle-button', /enabled/i);
    expect(
      typeOf('icon-toggle-button').fields.find((f) => f.key === 'interaction')
        ?.description,
    ).toMatch(/desabilitado/i);
  });

  it('tem um exemplo por estado que desenha sem aviso nos dois modos', () =>
    checkExamples('icon-toggle-button'));

  const cases = BUTTON_STYLES.flatMap((s) =>
    ['true', 'false'].flatMap((c) => MODES.map((m) => [s, c, m] as const)),
  );
  it.each(cases)(
    '%s ligado=%s (%s): hovered, focused e pressed diferem de none, com a camada da seleção',
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
    '%s ligado=%s (%s): com enabled false o interaction não desenha nada',
    (style, checked, mode) => {
      const base = { icon: 'Favorite', style, checked, enabled: 'false' };
      const off = json('icon-toggle-button', base, mode);
      for (const interaction of STATES) {
        expect(json('icon-toggle-button', { ...base, interaction }, mode)).toBe(off);
      }
    },
  );

  it('o contorno do outlined desligado e a falta dele ligado não mudam com o estado', () => {
    const outline = (checked: string, interaction: string) =>
      JSON.stringify(
        byName(
          draw(
            'icon-toggle-button',
            { icon: 'Favorite', style: 'outlined', checked, interaction },
            'light',
          ).root,
          'contorno',
        ),
      );
    for (const checked of ['true', 'false']) {
      expect(outline(checked, 'hovered')).toBe(outline(checked, 'none'));
      expect(outline(checked, 'pressed')).toBe(outline(checked, 'none'));
    }
  });
});
