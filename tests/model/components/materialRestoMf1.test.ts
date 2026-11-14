// Stage "Faithful Material 3, the rest" (MF1): font.align "justify", composite color (`over`) and the new
// image `fit` values, all only in formatVersion 4.
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

const V4 = 'only allowed with formatVersion 4';
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

  it('applies in v4 and reaches the scene as justify', () => {
    expect(validateComponent(text('justify'))).toEqual([]);
    const { root } = sceneOf({
      type: 'text',
      text: 'one two three four five six',
      width: 60,
      font: { align: 'justify' },
    });
    const node = (root as FrameNode).children[0] as SceneNode & {
      style: { align: string };
    };
    expect(node.style.align).toBe('justify');
  });

  it('rich text (runs) draws on the left and the scene says left, without promising justify', () => {
    const { root } = sceneOf({
      type: 'text',
      runs: [{ text: 'one two three four' }],
      width: 60,
      font: { align: 'justify' },
    });
    const node = (root as FrameNode).children[0] as SceneNode & {
      style: { align: string };
    };
    expect(node.style.align).toBe('left');
  });

  it('coming from an expression it also reaches as justify', () => {
    const { root } = sceneOf(
      { type: 'text', text: 'a b', font: { align: { $field: 'a', default: 'left' } } },
      { a: 'justify' },
    );
    const node = (root as FrameNode).children[0] as SceneNode & {
      style: { align: string };
    };
    expect(node.style.align).toBe('justify');
  });

  it('in versions 1 to 3 it gives the version error, at the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(validateComponent(text('justify', version))).toEqual([
        `template.children[0].font.align: ${V4}`,
      ]);
    }
  });

  it('left, center and right remain valid in any version', () => {
    for (const version of [1, 3, 4])
      expect(validateComponent(text('center', version))).toEqual([]);
  });
});

describe('MF1: composite color (over)', () => {
  const fillOf = (ref: unknown) => {
    const { root } = sceneOf({ type: 'rect', width: 5, height: 5, fill: ref });
    const fills = (root as FrameNode).children[0]?.fills ?? [];
    return fills[0] && 'color' in fills[0] ? fills[0].color : undefined;
  };
  const fill = (ref: unknown, version = 4) =>
    validateComponent(doc({ type: 'rect', width: 10, height: 10, fill: ref }, version));

  it('on-surface with alpha 0.38 over surface gives the opaque color (calculation in the test)', () => {
    // 0 * 0.38 + 255 * 0.62 = 158.1 → 0x9e
    expect(fillOf(t('on-surface', { alpha: 0.38, over: 'surface' }))).toBe('#9e9e9eff');
  });

  it('without alpha, the opaque top color covers the bottom one', () => {
    expect(fillOf(t('ink', { over: 'surface' }))).toBe('#112233ff');
  });

  it('over accepts a literal color', () => {
    expect(fillOf(t('on-surface', { alpha: 0.5, over: '#ff0000' }))).toBe('#7f0000ff');
  });

  it('translucent bottom color: the result carries its alpha', () => {
    // base #00000080 (alpha 0.502), top #112233 opaque with alpha 0.5 → alpha 0.5 + 0.502 * 0.5
    expect(fillOf(t('ink', { alpha: 0.5, over: 'weak' }))).toMatch(/^#[0-9a-f]{6}c0$/);
  });

  it('none stays none', () => {
    const none = resolveTokens(
      { modes: ['light'], values: { nothing: 'none' } },
      {},
      'light',
    );
    const r = parseComponent(
      doc({ type: 'rect', width: 5, height: 5, fill: t('nothing', { over: '#ffffff' }) }),
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

  it('applies to color in v4; the token name of the bottom color is collected as a color', () => {
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

  it('a literal over does not become a token reference', () => {
    const r = parseComponent(
      doc({ type: 'rect', width: 10, height: 10, fill: t('ink', { over: '#fff' }) }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => x.name)).toEqual(['ink']);
  });

  it('outside a color position it gives "over is only valid in a color $token", at the $token path', () => {
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
      'template.children[0].cornerRadius.$token: over is only valid in a color $token',
    ]);
  });

  it('an over that is not text is rejected', () => {
    expect(fill(t('ink', { over: 3 }))).toEqual([
      'template.children[0].fill.over: expected a token name or a color',
    ]);
  });

  it('in versions 1 to 3 the $token already gives the version error', () => {
    expect(fill(t('ink', { over: 'surface' }), 3)).toEqual([
      `template.children[0].fill: ${V4}`,
    ]);
  });
});

describe('MF1: new image fit values', () => {
  const image = (fit: string, version = 4) =>
    doc(
      { type: 'image', src: 'https://example.com/a.png', width: 10, height: 10, fit },
      version,
    );

  it('fill-width, fill-height, scale-down and none apply in v4 and reach the scene', () => {
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

  it('in versions 1 to 3 (v3 is the one that has image) it gives the version error, at the key path', () => {
    expect(validateComponent(image('none', 3))).toEqual([
      `template.children[0].fit: ${V4}`,
    ]);
  });

  it('cover, contain and fill remain valid in v3', () => {
    for (const fit of ['cover', 'contain', 'fill'])
      expect(validateComponent(image(fit, 3))).toEqual([]);
  });

  it('an unknown value is still rejected', () => {
    expect(validateComponent(image('zoom'))[0]).toMatch(
      /^template\.children\[0\]\.fit: /,
    );
  });
});
