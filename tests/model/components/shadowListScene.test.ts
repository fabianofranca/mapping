// MF2: a cena recebe a lista de sombras com `spread`, o recorte ampliado conta o `spread` e as
// sombras todas, e `stroke.gap` vira os trechos de vão (`Stroke.gaps`) pela caixa do nó nomeado.
import { describe, expect, it } from 'vitest';
import type { FieldValues } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import { clipBoxOf } from '../../../src/model/components/clipBox';
import {
  baseNode,
  type FrameNode,
  type SceneNode,
  type Shadow,
} from '../../../src/model/components/scene';
import { resolveTokens } from '../../../src/model/components/tokens';

type Raw = Record<string, unknown>;

const TOKENS = { modes: ['light'], values: { spread: 3, ink: '#112233' } };

function run(template: Raw, values: FieldValues = {}, width = 100, height = 40) {
  const r = parseComponent({
    format: 'mapping-component',
    formatVersion: 4,
    id: 't',
    name: 'T',
    size: { width, height },
    template,
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  const tokens = resolveTokens(TOKENS, {}, 'light');
  const out = instantiate(
    r.component,
    values,
    { x: 0, y: 0, width, height },
    { measure: approximateMeasurer, tokens },
  );
  return { root: out.root as FrameNode, warnings: out.warnings };
}

const box = (extra: Raw): Raw => ({ type: 'rect', width: 20, height: 20, ...extra });

describe('lista de sombras na cena (decisão 3)', () => {
  it('a lista vira os efeitos na ordem, e o objeto único continua um efeito só', () => {
    const list = run({
      type: 'frame',
      children: [
        box({
          shadow: [
            { color: '#000000', y: 2, blur: 4 },
            { color: '#ff0000', x: 1, y: 8, blur: 12, spread: 2 },
          ],
        }),
      ],
    }).root.children[0]!;
    expect(list.effects).toEqual([
      { color: '#000000', offset: { x: 0, y: 2 }, blur: 4 },
      { color: '#ff0000', offset: { x: 1, y: 8 }, blur: 12, spread: 2 },
    ]);
    const one = run({
      type: 'frame',
      children: [box({ shadow: { color: '#000000', y: 2, blur: 4 } })],
    }).root.children[0]!;
    expect(one.effects).toEqual([{ color: '#000000', offset: { x: 0, y: 2 }, blur: 4 }]);
  });

  it('uma sombra de cor none sai da lista; sem spread, a cena não leva a chave', () => {
    const node = run({
      type: 'frame',
      children: [box({ shadow: [{ color: 'none' }, { color: '#000000', blur: 2 }] })],
    }).root.children[0]!;
    expect(node.effects).toHaveLength(1);
    expect(node.effects[0]).not.toHaveProperty('spread');
  });
});

describe('shadow.spread na cena (decisão 4)', () => {
  it('literal, negativo e $token de número chegam à sombra', () => {
    const effects = run({
      type: 'frame',
      children: [
        box({
          shadow: [
            { color: '#000', spread: 2 },
            { color: '#000', spread: -4 },
            { color: '#000', spread: { $token: 'spread' } },
          ],
        }),
      ],
    }).root.children[0]!.effects;
    expect(effects.map((e) => e.spread)).toEqual([2, -4, 3]);
  });
});

describe('recorte ampliado com várias sombras e spread (decisão 4)', () => {
  const frameWith = (...effects: Shadow[]): FrameNode => ({
    ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
    type: 'frame',
    clip: true,
    cornerRadius: 0,
    children: [
      {
        ...baseNode({ id: 'c', name: 'c', width: 20, height: 10, effects }),
        type: 'rect',
        cornerRadius: 0,
      },
    ],
  });

  it('o spread soma ao blur e ao deslocamento em cada lado', () => {
    const clip = clipBoxOf(
      frameWith({ color: '#000', offset: { x: 0, y: 2 }, blur: 4, spread: 3 }),
    );
    expect(clip).toEqual({ x: -7, y: -5, width: 107, height: 45 });
  });

  it('conta todas as sombras externas (vale a que passa mais), não só a primeira', () => {
    const clip = clipBoxOf(
      frameWith(
        { color: '#000', offset: { x: 0, y: 0 }, blur: 2 },
        { color: '#000', offset: { x: 0, y: 0 }, blur: 6, spread: 4 },
      ),
    );
    expect(clip).toEqual({ x: -10, y: -10, width: 110, height: 50 });
  });

  it('um spread negativo encolhe a sombra e pode tirar o recorte ampliado', () => {
    expect(
      clipBoxOf(
        frameWith({ color: '#000', offset: { x: 0, y: 0 }, blur: 2, spread: -5 }),
      ),
    ).toBeUndefined();
  });
});

describe('stroke.gap na cena (decisão 7)', () => {
  /** Um contorno do tamanho da instância e um rótulo `hug` que cruza o lado de cima. */
  const outlined = (label: Raw, stroke: Raw = {}, outline: Raw = {}) =>
    run(
      {
        type: 'frame',
        children: [
          {
            type: 'frame',
            name: 'outline',
            anchors: { left: 0, top: 0, right: 0, bottom: 0 },
            cornerRadius: 6,
            stroke: {
              color: '#000',
              width: 2,
              align: 'center',
              gap: { node: 'label', padding: 4 },
              ...stroke,
            },
            ...outline,
          },
          { type: 'text', name: 'label', text: 'Nome', ...label },
        ],
      },
      {},
      100,
      40,
    ).root;

  const label = (root: FrameNode): SceneNode => root.children[1]!;

  it('o vão no lado de cima sai da largura medida do rótulo hug, mais o padding', () => {
    const root = outlined({
      width: 'hug',
      height: 'hug',
      anchors: { left: 12, top: -6 },
    });
    const node = label(root);
    const x = node.transform[4];
    expect(node.width).toBeGreaterThan(0);
    expect(root.children[0]!.stroke?.gaps).toEqual([
      { side: 'top', from: x - 4, to: x + node.width + 4 },
    ]);
  });

  it('sem padding o vão é a largura do nó', () => {
    const root = outlined(
      { width: 20, height: 12, anchors: { left: 30, top: -6 } },
      { gap: { node: 'label' } },
    );
    expect(root.children[0]!.stroke?.gaps).toEqual([{ side: 'top', from: 30, to: 50 }]);
  });

  it('o vão não passa da parte reta do lado (os cantos com raio ficam inteiros)', () => {
    const root = outlined({ width: 40, height: 12, anchors: { left: 0, top: -6 } });
    // raio 6 e padding 4: o vão começaria em -4; a parte reta começa em 6
    expect(root.children[0]!.stroke?.gaps).toEqual([{ side: 'top', from: 6, to: 44 }]);
  });

  it('um nó invisível não abre vão', () => {
    const root = outlined({
      width: 20,
      height: 12,
      anchors: { left: 30, top: -6 },
      visible: false,
    });
    expect(root.children[0]!.stroke).toBeDefined();
    expect(root.children[0]!.stroke).not.toHaveProperty('gaps');
  });

  it('um nó que não atravessa nenhum lado não abre vão', () => {
    const root = outlined({ width: 20, height: 12, anchors: { left: 30, top: 14 } });
    expect(root.children[0]!.stroke).not.toHaveProperty('gaps');
  });

  it('sem a chave gap a cena não muda', () => {
    const root = run({
      type: 'frame',
      children: [box({ stroke: { color: '#000' } })],
    }).root;
    expect(root.children[0]!.stroke).not.toHaveProperty('gaps');
  });

  it('vale o primeiro nó com esse nome, na ordem do template', () => {
    const root = run({
      type: 'frame',
      children: [
        {
          type: 'frame',
          anchors: { left: 0, top: 0, right: 0, bottom: 0 },
          stroke: { color: '#000', gap: { node: 'label' } },
        },
        {
          type: 'text',
          name: 'label',
          text: 'A',
          width: 10,
          height: 12,
          anchors: { left: 10, top: -6 },
        },
        {
          type: 'text',
          name: 'label',
          text: 'B',
          width: 10,
          height: 12,
          anchors: { left: 60, top: -6 },
        },
      ],
    }).root;
    expect(root.children[0]!.stroke?.gaps).toEqual([{ side: 'top', from: 10, to: 20 }]);
  });
});
