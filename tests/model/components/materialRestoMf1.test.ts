// Etapa "Material 3 fiel, resto" (MF1): font.align "justify", cor composta (`over`) e os `fit`
// novos da imagem, todos só na formatVersion 4.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import type { FrameNode, SceneNode } from '../../../src/model/components/scene';
import { applyTokens, resolveTokens } from '../../../src/model/components/tokens';

const V4 = 'só é permitido com formatVersion 4';
type Raw = Record<string, unknown>;
const t = (name: string, extra: Raw = {}) => ({ $token: name, ...extra });

function doc(child: Raw, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [child] },
  };
}

const TOKENS = {
  modes: ['light'],
  values: {
    surface: '#ffffff',
    'on-surface': '#000000',
    ink: '#112233',
    weak: '#00000080',
  },
};

function sceneOf(child: Raw, values: FieldValues = {}) {
  const r = parseComponent(doc(child));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  const tokens = resolveTokens(TOKENS, {}, 'light');
  const component: ComponentFile = applyTokens(r.component, tokens);
  return instantiate(
    component,
    values,
    { x: 0, y: 0, width: 100, height: 40 },
    { measure: approximateMeasurer, tokens },
  );
}

describe('MF1: font.align "justify"', () => {
  const text = (align: unknown, version = 4) =>
    doc({ type: 'text', text: 'a b c', font: { align } }, version);

  it('vale na v4 e chega à cena como justify', () => {
    expect(validateComponent(text('justify'))).toEqual([]);
    const { root } = sceneOf({
      type: 'text',
      text: 'um dois tres quatro cinco seis',
      width: 60,
      font: { align: 'justify' },
    });
    const node = (root as FrameNode).children[0] as SceneNode & {
      style: { align: string };
    };
    expect(node.style.align).toBe('justify');
  });

  it('vindo de expressão também chega como justify', () => {
    const { root } = sceneOf(
      { type: 'text', text: 'a b', font: { align: { $field: 'a', default: 'left' } } },
      { a: 'justify' },
    );
    const node = (root as FrameNode).children[0] as SceneNode & {
      style: { align: string };
    };
    expect(node.style.align).toBe('justify');
  });

  it('nas versões 1 a 3 dá o erro de versão, no caminho da chave', () => {
    for (const version of [1, 2, 3]) {
      expect(validateComponent(text('justify', version))).toEqual([
        `template.children[0].font.align: ${V4}`,
      ]);
    }
  });

  it('left, center e right continuam valendo em qualquer versão', () => {
    for (const version of [1, 3, 4])
      expect(validateComponent(text('center', version))).toEqual([]);
  });
});

describe('MF1: cor composta (over)', () => {
  const fillOf = (ref: unknown) => {
    const { root } = sceneOf({ type: 'rect', width: 5, height: 5, fill: ref });
    const fills = (root as FrameNode).children[0]?.fills ?? [];
    return fills[0] && 'color' in fills[0] ? fills[0].color : undefined;
  };
  const fill = (ref: unknown, version = 4) =>
    validateComponent(doc({ type: 'rect', width: 10, height: 10, fill: ref }, version));

  it('on-surface com alpha 0,38 sobre surface dá a cor opaca (conta no teste)', () => {
    // 0 * 0,38 + 255 * 0,62 = 158,1 → 0x9e
    expect(fillOf(t('on-surface', { alpha: 0.38, over: 'surface' }))).toBe('#9e9e9eff');
  });

  it('sem alpha, a cor opaca de cima cobre a de baixo', () => {
    expect(fillOf(t('ink', { over: 'surface' }))).toBe('#112233ff');
  });

  it('over aceita uma cor literal', () => {
    expect(fillOf(t('on-surface', { alpha: 0.5, over: '#ff0000' }))).toBe('#7f0000ff');
  });

  it('cor de baixo translúcida: o resultado leva o alfa dela', () => {
    // base #00000080 (alfa 0,502), topo #112233 opaco com alpha 0,5 → alfa 0,5 + 0,502 * 0,5
    expect(fillOf(t('ink', { alpha: 0.5, over: 'weak' }))).toMatch(/^#[0-9a-f]{6}c0$/);
  });

  it('none continua none', () => {
    const none = resolveTokens(
      { modes: ['light'], values: { nada: 'none' } },
      {},
      'light',
    );
    const r = parseComponent(
      doc({ type: 'rect', width: 5, height: 5, fill: t('nada', { over: '#ffffff' }) }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const { root } = instantiate(
      applyTokens(r.component, none),
      {},
      { x: 0, y: 0, width: 5, height: 5 },
      { measure: approximateMeasurer, tokens: none },
    );
    expect((root as FrameNode).children[0]?.fills).toEqual([]);
  });

  it('vale em cor na v4; o nome de token da cor de baixo é coletado como cor', () => {
    const r = parseComponent(
      doc({
        type: 'rect',
        width: 10,
        height: 10,
        fill: t('on-surface', { alpha: 0.38, over: 'surface' }),
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => [x.path, x.name, x.kind])).toEqual([
      ['template.children[0].fill', 'on-surface', 'color'],
      ['template.children[0].fill.over', 'surface', 'color'],
    ]);
  });

  it('over literal não vira referência de token', () => {
    const r = parseComponent(
      doc({ type: 'rect', width: 10, height: 10, fill: t('ink', { over: '#fff' }) }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => x.name)).toEqual(['ink']);
  });

  it('fora de posição de cor dá "over só vale em $token de cor", no caminho do $token', () => {
    expect(
      validateComponent(
        doc({
          type: 'rect',
          width: 10,
          height: 10,
          cornerRadius: t('radius', { over: 'surface' }),
        }),
      ),
    ).toEqual([
      'template.children[0].cornerRadius.$token: over só vale em $token de cor',
    ]);
  });

  it('over que não é texto é recusado', () => {
    expect(fill(t('ink', { over: 3 }))).toEqual([
      'template.children[0].fill.over: esperava nome de token ou cor',
    ]);
  });

  it('nas versões 1 a 3 o $token já dá o erro de versão', () => {
    expect(fill(t('ink', { over: 'surface' }), 3)).toEqual([
      `template.children[0].fill: ${V4}`,
    ]);
  });
});

describe('MF1: fit novos da imagem', () => {
  const image = (fit: string, version = 4) =>
    doc(
      { type: 'image', src: 'https://example.com/a.png', width: 10, height: 10, fit },
      version,
    );

  it('fill-width, fill-height, scale-down e none valem na v4 e chegam à cena', () => {
    for (const fit of ['fill-width', 'fill-height', 'scale-down', 'none']) {
      expect(validateComponent(image(fit))).toEqual([]);
      const { root } = sceneOf({
        type: 'image',
        src: 'https://example.com/a.png',
        width: 10,
        height: 10,
        fit,
      });
      const paint = (root as FrameNode).children[0]?.fills[0];
      expect(paint && 'fit' in paint ? paint.fit : undefined).toBe(fit);
    }
  });

  it('nas versões 1 a 3 (v3 é a que tem image) dá o erro de versão, no caminho da chave', () => {
    expect(validateComponent(image('none', 3))).toEqual([
      `template.children[0].fit: ${V4}`,
    ]);
  });

  it('cover, contain e fill continuam valendo na v3', () => {
    for (const fit of ['cover', 'contain', 'fill'])
      expect(validateComponent(image(fit, 3))).toEqual([]);
  });

  it('um valor desconhecido continua recusado', () => {
    expect(validateComponent(image('zoom'))[0]).toMatch(
      /^template\.children\[0\]\.fit: /,
    );
  });
});
