// MC5 (#1033, etapa #898), grupo A: snackbar, tooltip e alert-dialog. As posições verticais que eram
// estimadas para o Roboto 14/20 passam a `baselinePadding` com os números do Compose (decisão 19), e o
// snackbar mede 48, 68 ou 81 pelas linhas do texto (decisão 20; `Snackbar.kt` linhas 365 a 394). O botão
// de texto do diálogo cresce com o rótulo longo (decisão 20; `Button.kt` linhas 143 a 148 e 504 a 510).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import {
  drawFitted,
  entryOf,
  fittedSize,
  templateNodes,
} from '../support/material3Fitted';
import type { Mode, Values } from '../support/material3Fitted';

const MODES: Mode[] = ['light', 'dark'];
/** A primeira linha de base do Roboto 14/20 no medidor aproximado (ascent 0,93 e descent 0,24 de 14). */
const BASELINE = 14.83;
const BAD_WARNING =
  /unknown icon|não cabe|text larger than the box|stretched icon|content larger than the box|\$lines instável/;

type Drawing = ReturnType<typeof drawFitted>['drawing'];

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const absOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`nó ausente: ${name}`);
  return absOf(d, node);
};
/** Os nós de texto visíveis cujo nome começa por `prefix`. */
const textsOf = (d: Drawing, prefix: string): TextNode[] =>
  [...walk(d.root)].filter(
    (n): n is TextNode =>
      n.type === 'text' && n.visible && (n.name ?? '').startsWith(prefix),
  );
const oneText = (d: Drawing, prefix: string): TextNode => {
  const found = textsOf(d, prefix);
  if (found.length !== 1) throw new Error(`${found.length} textos visíveis "${prefix}"`);
  return found[0]!;
};
/** As linhas do texto no tamanho dele (o medidor aproximado, o mesmo do ajuste). */
const linesOf = (d: Drawing, prefix: string): number => {
  const node = oneText(d, prefix);
  const style = node.style;
  // o texto fica na largura do nó; com `baselinePadding` a caixa tem mais que as linhas, mas a largura é a mesma
  return approximateMeasurer(
    node.text,
    {
      family: 'sans',
      size: style.fontSize,
      weight: style.fontWeight,
      italic: false,
      lineHeight: style.lineHeight ?? 20,
      letterSpacing: style.letterSpacing ?? 0,
    },
    absOf(d, node).width,
  ).lines!.length;
};
/** A linha de base da primeira linha do texto (y do nó + `baselineTop`, ou a da fonte sem ele). */
const baselineOf = (d: Drawing, prefix: string): number => {
  const node = oneText(d, prefix);
  return absOf(d, node).y + (node.style.baselineTop ?? BASELINE);
};

/** Texto de palavras que quebra em exatamente `lines` linhas na configuração dada (o medidor aproximado). */
function messageWith(lines: number, values: Values, mode: Mode): string {
  for (let words = 1; words < 60; words++) {
    const message = Array.from({ length: words }, () => 'palavra').join(' ');
    const { drawing } = drawFitted('snackbar', { ...values, message }, mode);
    if (linesOf(drawing, 'mensagem') === lines) return message;
  }
  throw new Error(`nenhum texto de ${lines} linhas`);
}

const CONFIGS: { name: string; values: Values }[] = [
  { name: 'sem ação', values: {} },
  { name: 'com ação', values: { actionLabel: 'Desfazer' } },
  {
    name: 'com ação e fechar',
    values: { actionLabel: 'Tentar de novo', dismissAction: 'true' },
  },
];

const stringify = (node: unknown): string => JSON.stringify(node);

describe('MC5 grupo A: snackbar', () => {
  it('nenhum nó com a posição estimada: o texto leva baselinePadding (30 e 11 na fileira; 30 e 12 com a ação em nova linha)', () => {
    const template = stringify(entryOf('snackbar').component!.template);
    // os paddings estimados para o Roboto 14/20 (15 em cima, 7 embaixo) e o respiro de 14 das várias linhas
    expect(template.includes('[15,8,7,0]')).toBe(false);
    const texts = templateNodes('snackbar', 'mensagem').filter((n) => n.type === 'text');
    expect(texts).toHaveLength(1);
    expect(texts[0]!.baselinePadding).toBeUndefined();
    const all = [...walk0(entryOf('snackbar').component!.template)].filter(
      (n) => n.type === 'text' && n.baselinePadding !== undefined,
    );
    expect(all.map((n) => n.baselinePadding)).toEqual(
      expect.arrayContaining([
        { top: 30, bottom: 11 },
        { top: 30, bottom: 12 },
      ]),
    );
  });

  it('1, 2 e 3 linhas medem 48, 68 e 81 no tamanho ajustado, em light e dark, sem ação, com ação e com ação e fechar', () => {
    for (const mode of MODES) {
      for (const { name, values } of CONFIGS) {
        for (const [lines, height] of [
          [1, 48],
          [2, 68],
          [3, 81],
        ] as const) {
          const message = messageWith(lines, values, mode);
          const fit = fittedSize('snackbar', { ...values, message }, mode);
          expect([name, mode, lines, fit.height, fit.width]).toEqual([
            name,
            mode,
            lines,
            height,
            344,
          ]);
          expect(fit.messages.filter((m) => BAD_WARNING.test(m.text))).toEqual([]);
          const { drawing } = drawFitted('snackbar', { ...values, message }, mode);
          expect(drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
          expect(drawing.root.height).toBe(height);
        }
      }
    }
  });

  it('três linhas: a primeira linha de base a 30 do topo (FirstBaseline) e a ação e o fechar centrados na altura de 81', () => {
    const values = { actionLabel: 'Tentar de novo', dismissAction: 'true' };
    const message = messageWith(3, values, 'light');
    const { drawing } = drawFitted('snackbar', { ...values, message });
    const text = absOf(drawing, oneText(drawing, 'mensagem'));
    expect(baselineOf(drawing, 'mensagem')).toBeCloseTo(30, 6);
    expect(text.y).toBe(0);
    const action = box(drawing, 'ação');
    expect(action.y + action.height / 2).toBeCloseTo(81 / 2, 6);
    const close = box(drawing, 'fechar');
    expect(close.y + close.height / 2).toBeCloseTo(81 / 2, 6);
  });

  it('duas linhas: a linha de base a 30 (o texto a 15, e não a 14 do respiro) e a ação centrada em 34', () => {
    const values = { actionLabel: 'Desfazer' };
    const message = messageWith(2, values, 'light');
    const { drawing } = drawFitted('snackbar', { ...values, message });
    expect(baselineOf(drawing, 'mensagem')).toBeCloseTo(30, 6);
    const action = box(drawing, 'ação');
    expect(action.y + action.height / 2).toBe(34);
  });

  it('uma linha continua centrada: texto a 14 do topo, altura 48 e a ação centrada em 24', () => {
    const { drawing } = drawFitted('snackbar', {
      message: 'Arquivada',
      actionLabel: 'Ok',
    });
    expect(drawing.root.height).toBe(48);
    expect(absOf(drawing, oneText(drawing, 'mensagem')).y).toBe(14);
    const action = box(drawing, 'ação');
    expect(action.y + action.height / 2).toBe(24);
  });

  it('ação em nova linha: a linha de base a 30 e a ação 12 abaixo (30 + 12), altura 92 com uma linha e 112 com duas', () => {
    for (const mode of MODES) {
      const values = { actionLabel: 'Desfazer', actionOnNewLine: 'true' };
      const one = drawFitted('snackbar', { ...values, message: 'Uma linha só' }, mode);
      expect(one.drawing.root.height).toBe(92);
      const text = absOf(one.drawing, oneText(one.drawing, 'mensagem'));
      expect(text.x).toBe(16);
      expect(baselineOf(one.drawing, 'mensagem')).toBeCloseTo(30, 6);
      expect(box(one.drawing, 'ação').y).toBe(30 + 12);

      const long = 'palavra '.repeat(9).trim();
      const two = drawFitted('snackbar', { ...values, message: long }, mode);
      expect(linesOf(two.drawing, 'mensagem')).toBe(2);
      expect(two.drawing.root.height).toBe(30 + 20 + 12 + 48 + 2);
      expect(fittedSize('snackbar', { ...values, message: long }, mode).height).toBe(112);
      expect(two.drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('uma mensagem de três linhas com ação mede 81 (o exemplo que a prova da biblioteca ainda não aceita: ela o desenha no size 344 × 48)', () => {
    const values = {
      message:
        'Seu arquivo foi movido para a lixeira e será apagado de vez em trinta dias',
      actionLabel: 'Desfazer',
    };
    for (const mode of MODES) {
      const fit = fittedSize('snackbar', values, mode);
      expect([fit.width, fit.height]).toEqual([344, 81]);
      expect(fit.messages.filter((m) => BAD_WARNING.test(m.text))).toEqual([]);
      const { drawing } = drawFitted('snackbar', values, mode);
      expect(linesOf(drawing, 'mensagem')).toBe(3);
    }
  });

  it('a Fidelidade não diz mais que o 15 e o 7 são estimados nem que três linhas medem 88', () => {
    const doc = readFileSync('libraries/material3-compose/docs/snackbar.md', 'utf8');
    expect(doc.includes('o 15 e o 7 são estimados')).toBe(false);
    expect(doc.includes('com três linhas o desenho mede 88')).toBe(false);
    expect(doc.includes('o motor não alinha por linha de base')).toBe(false);
    expect(doc.includes('três medem 81')).toBe(true);
  });
});

/** Todos os nós (objetos com `type`) de um template JSON. */
function* walk0(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) for (const item of node) yield* walk0(item);
  else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.type === 'string') yield record;
    for (const value of Object.values(record)) yield* walk0(value);
  }
}

describe('MC5 grupo A: tooltip rich', () => {
  const rich = (extra: Values = {}): Values => ({
    style: 'rich',
    text: 'Desliga o Wi-Fi.',
    ...extra,
  });
  const richBox = (extra: Values, mode: Mode = 'light') => {
    const fit = fittedSize('tooltip', rich(extra), mode);
    return { fit, ...drawFitted('tooltip', rich(extra), mode) };
  };

  it('o título e o texto levam baselinePadding do Compose (28; 24 depois da caixa do título, 16 embaixo) e os paddings estimados somem', () => {
    const template = stringify(entryOf('tooltip').component!.template);
    // 13 e 9 de respiro (28 e 24 menos a linha de base 15), o 4 antes do texto e o 16 antes da ação
    expect(template.includes('[13,16,')).toBe(false);
    expect(template.includes('[9,16,')).toBe(false);
    expect(template.includes('[4,0,0,0]')).toBe(false);
    expect(template.includes('[16,0,0,0]')).toBe(false);
    const title = templateNodes('tooltip', 'título')[0]!;
    expect((title.baselinePadding as { top: number }).top).toBe(28);
    const body = templateNodes('tooltip', 'texto').find(
      (n) => n.baselinePadding !== undefined,
    );
    expect(body).toBeDefined();
  });

  it('alturas de uma linha de texto: só texto 28, com título 78, com título e ação 126, com ação 93 (TooltipTest.kt 260 e 265)', () => {
    for (const mode of MODES) {
      expect(richBox({}, mode).fit.height).toBe(28);
      expect(richBox({ title: 'Modo avião' }, mode).fit.height).toBe(78);
      expect(
        richBox({ title: 'Modo avião', action: 'Saiba mais' }, mode).fit.height,
      ).toBe(126);
      expect(richBox({ action: 'Saiba mais' }, mode).fit.height).toBe(93);
      const extras: Values[] = [
        {},
        { title: 'T' },
        { action: 'A' },
        { title: 'T', action: 'A' },
      ];
      for (const extra of extras) {
        expect(
          richBox(extra, mode).drawing.warnings.filter((w) => BAD_WARNING.test(w)),
        ).toEqual([]);
      }
    }
  });

  it('com título: a base do título a 28 do topo e a do texto 24 abaixo do fim da caixa do título (29 de base a base)', () => {
    const { drawing } = richBox({ title: 'Modo avião', action: 'Saiba mais' });
    expect(baselineOf(drawing, 'título')).toBeCloseTo(28, 6);
    // Compose: subheadBound.bottom (13 + 20) + 24 = 57
    expect(baselineOf(drawing, 'texto')).toBeCloseTo(33 + 24, 6);
    // a ação vem 16 abaixo do fim do texto (textBound.bottom = base + 5)
    expect(box(drawing, 'botão da ação').y).toBeCloseTo(
      baselineOf(drawing, 'texto') + 5 + 16,
      0,
    );
  });

  it('título de duas linhas: a base do texto fica 29 abaixo da última base do título', () => {
    const longTitle = 'Palavra '.repeat(8).trim();
    const { drawing } = richBox({ title: longTitle });
    expect(linesOf(drawing, 'título')).toBe(2);
    // a base do título (28) mais a segunda linha (20) mais os 29 do Compose (5 do fim da linha + 24)
    expect(baselineOf(drawing, 'texto')).toBeCloseTo(28 + 20 + 29, 6);
  });

  it('só ação: a base do texto a 24 do topo e 16 até a ação', () => {
    const { drawing } = richBox({ action: 'Saiba mais' });
    expect(baselineOf(drawing, 'texto')).toBeCloseTo(24, 6);
    expect(box(drawing, 'botão da ação').y).toBeCloseTo(24 + 5 + 16, 0);
  });

  it('só texto: 4 em cima e embaixo (padding, sem linha de base) e o texto a 4 do topo', () => {
    const { drawing } = richBox({});
    expect(absOf(drawing, oneText(drawing, 'texto')).y).toBe(4);
    expect(drawing.root.height).toBe(28);
  });
});

describe('MC5 grupo A: alert-dialog', () => {
  const base: Values = {
    title: 'Confirmar',
    text: 'Texto do diálogo.',
    confirmButton: 'OK',
    dismissButton: 'Cancelar',
  };
  const LONG =
    'Confirmar tudo e continuar com a operação agora mesmo sem voltar atrás nunca mais';

  it('a altura do botão de texto é hug com o mínimo de 40 e a fileira dos botões hug com o mínimo de 48 (decisão 20)', () => {
    for (const name of ['dispensar', 'confirmar']) {
      const node = templateNodes('alert-dialog', name)[0]!;
      expect([name, node.height, node.minHeight]).toEqual([name, 'hug', 40]);
    }
    const row = templateNodes('alert-dialog', 'botões')[0]!;
    expect([row.height, row.minHeight]).toEqual(['hug', 48]);
  });

  it('rótulos curtos continuam a 40 num quadro de 48, centrados', () => {
    for (const mode of MODES) {
      const { drawing } = drawFitted('alert-dialog', base, mode);
      expect(box(drawing, 'confirmar').height).toBe(40);
      expect(box(drawing, 'dispensar').height).toBe(40);
      const row = box(drawing, 'botões');
      expect(row.height).toBe(48);
      expect(box(drawing, 'confirmar').y).toBe(row.y + 4);
      expect(drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('rótulo longo quebra, o botão cresce (8 de respiro em cima e embaixo) e a fileira e o diálogo crescem junto', () => {
    for (const mode of MODES) {
      const values = { ...base, confirmButton: LONG, dismissButton: '' };
      const short = fittedSize('alert-dialog', { ...base, dismissButton: '' }, mode);
      const fit = fittedSize('alert-dialog', values, mode);
      const { drawing } = drawFitted('alert-dialog', values, mode);
      const button = box(drawing, 'confirmar');
      // 8 de respiro de cima e de baixo (TextButtonContentPadding) e linhas de 20
      expect((button.height - 16) % 20).toBe(0);
      expect(button.height).toBeGreaterThanOrEqual(56);
      expect(button.width).toBeLessThanOrEqual(264);
      expect(box(drawing, 'botões').height).toBe(button.height);
      expect(fit.height).toBe(short.height - 48 + button.height);
      expect(drawing.root.height).toBe(fit.height);
      expect(drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('a Fidelidade não diz mais que o motor não alinha por linha de base', () => {
    const doc = readFileSync('libraries/material3-compose/docs/alert-dialog.md', 'utf8');
    expect(doc.includes('porque o motor não alinha por linha de base')).toBe(false);
  });
});
