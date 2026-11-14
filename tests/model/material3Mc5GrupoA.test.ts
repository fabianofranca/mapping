// MC5 (#1033, stage #898), group A: snackbar, tooltip and alert-dialog. The vertical positions that were
// estimated for Roboto 14/20 become `baselinePadding` with the Compose numbers (decision 19), and the
// snackbar measures 48, 68 or 81 by the lines of the text (decision 20; `Snackbar.kt` lines 365 to 394). The text
// button of the dialog grows with the long label (decision 20; `Button.kt` lines 143 to 148 and 504 to 510).
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

// pt-BR kept: node names of libraries/material3-compose are Portuguese data
const MODES: Mode[] = ['light', 'dark'];
/** The first baseline of Roboto 14/20 in the approximate measurer (ascent 0.93 and descent 0.24 of 14). */
const BASELINE = 14.83;
// pt-BR kept: the warning texts may come in pt-BR (`não cabe`, `$lines instável`) as well as in English
const BAD_WARNING =
  /unknown icon|não cabe|text larger than the box|stretched icon|content larger than the box|\$lines instável|\$lines unstable/;

type Drawing = ReturnType<typeof drawFitted>['drawing'];

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const absOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`node missing: ${name}`);
  return absOf(d, node);
};
/** The visible text nodes whose name starts with `prefix`. */
const textsOf = (d: Drawing, prefix: string): TextNode[] =>
  [...walk(d.root)].filter(
    (n): n is TextNode =>
      n.type === 'text' && n.visible && (n.name ?? '').startsWith(prefix),
  );
const oneText = (d: Drawing, prefix: string): TextNode => {
  const found = textsOf(d, prefix);
  if (found.length !== 1) throw new Error(`${found.length} visible texts "${prefix}"`);
  return found[0]!;
};
/** The lines of the text at its size (the approximate measurer, the same as the fit). */
const linesOf = (d: Drawing, prefix: string): number => {
  const node = oneText(d, prefix);
  const style = node.style;
  // the text stays at the node width; with `baselinePadding` the box has more than the lines, but the width is the same
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
/** The baseline of the first line of the text (node y + `baselineTop`, or the font's without it). */
const baselineOf = (d: Drawing, prefix: string): number => {
  const node = oneText(d, prefix);
  return absOf(d, node).y + (node.style.baselineTop ?? BASELINE);
};

/** Text of words that breaks into exactly `lines` lines in the given configuration (the approximate measurer). */
function messageWith(lines: number, values: Values, mode: Mode): string {
  for (let words = 1; words < 60; words++) {
    const message = Array.from({ length: words }, () => 'message').join(' ');
    const { drawing } = drawFitted('snackbar', { ...values, message }, mode);
    if (linesOf(drawing, 'mensagem') === lines) return message;
  }
  throw new Error(`no text of ${lines} lines`);
}

const CONFIGS: { name: string; values: Values }[] = [
  { name: 'no action', values: {} },
  { name: 'with action', values: { actionLabel: 'Undo' } },
  {
    name: 'with action and close',
    values: { actionLabel: 'Try again', dismissAction: 'true' },
  },
];

const stringify = (node: unknown): string => JSON.stringify(node);

describe('MC5 group A: snackbar', () => {
  it('no node with the estimated position: the text carries baselinePadding (30 and 11 in the row; 30 and 12 with the action on a new line)', () => {
    const template = stringify(entryOf('snackbar').component!.template);
    // the paddings estimated for Roboto 14/20 (15 on top, 7 on the bottom) and the 14 breathing room of the multi-line case
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

  it('1, 2 and 3 lines measure 48, 68 and 81 at the fitted size, in light and dark, with no action, with action and with action and close', () => {
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

  it('three lines: the first baseline at 30 from the top (FirstBaseline) and the action and the close centered on the height of 81', () => {
    const values = { actionLabel: 'Try again', dismissAction: 'true' };
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

  it('two lines: the baseline at 30 (the text at 15, and not the 14 of the breathing room) and the action centered at 34', () => {
    const values = { actionLabel: 'Undo' };
    const message = messageWith(2, values, 'light');
    const { drawing } = drawFitted('snackbar', { ...values, message });
    expect(baselineOf(drawing, 'mensagem')).toBeCloseTo(30, 6);
    const action = box(drawing, 'ação');
    expect(action.y + action.height / 2).toBe(34);
  });

  it('one line stays centered: text at 14 from the top, height 48 and the action centered at 24', () => {
    const { drawing } = drawFitted('snackbar', {
      message: 'Archived',
      actionLabel: 'Ok',
    });
    expect(drawing.root.height).toBe(48);
    expect(absOf(drawing, oneText(drawing, 'mensagem')).y).toBe(14);
    const action = box(drawing, 'ação');
    expect(action.y + action.height / 2).toBe(24);
  });

  it('action on a new line: the baseline at 30 and the action 12 below (30 + 12), height 92 with one line and 112 with two', () => {
    for (const mode of MODES) {
      const values = { actionLabel: 'Undo', actionOnNewLine: 'true' };
      const one = drawFitted('snackbar', { ...values, message: 'Just one line' }, mode);
      expect(one.drawing.root.height).toBe(92);
      const text = absOf(one.drawing, oneText(one.drawing, 'mensagem'));
      expect(text.x).toBe(16);
      expect(baselineOf(one.drawing, 'mensagem')).toBeCloseTo(30, 6);
      expect(box(one.drawing, 'ação').y).toBe(30 + 12);

      const long = 'message '.repeat(9).trim();
      const two = drawFitted('snackbar', { ...values, message: long }, mode);
      expect(linesOf(two.drawing, 'mensagem')).toBe(2);
      expect(two.drawing.root.height).toBe(30 + 20 + 12 + 48 + 2);
      expect(fittedSize('snackbar', { ...values, message: long }, mode).height).toBe(112);
      expect(two.drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('a three-line message with an action measures 81 (the example that the library proof does not accept yet: it draws it at size 344 × 48)', () => {
    const values = {
      message:
        'Your file was moved to the trash and will be permanently deleted in thirty days',
      actionLabel: 'Undo',
    };
    for (const mode of MODES) {
      const fit = fittedSize('snackbar', values, mode);
      expect([fit.width, fit.height]).toEqual([344, 81]);
      expect(fit.messages.filter((m) => BAD_WARNING.test(m.text))).toEqual([]);
      const { drawing } = drawFitted('snackbar', values, mode);
      expect(linesOf(drawing, 'mensagem')).toBe(3);
    }
  });

  it('the Fidelidade no longer says that the 15 and the 7 are estimated nor that three lines measure 88', () => {
    const doc = readFileSync('libraries/material3-compose/docs/snackbar.md', 'utf8');
    // pt-BR kept: the Portuguese text of libraries/material3-compose/docs is the object of this test
    expect(doc.includes('o 15 e o 7 são estimados')).toBe(false);
    expect(doc.includes('com três linhas o desenho mede 88')).toBe(false);
    expect(doc.includes('o motor não alinha por linha de base')).toBe(false);
    expect(doc.includes('três medem 81')).toBe(true);
  });
});

/** All the nodes (objects with `type`) of a JSON template. */
function* walk0(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) for (const item of node) yield* walk0(item);
  else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.type === 'string') yield record;
    for (const value of Object.values(record)) yield* walk0(value);
  }
}

describe('MC5 group A: tooltip rich', () => {
  const rich = (extra: Values = {}): Values => ({
    style: 'rich',
    text: 'Turns off Wi-Fi.',
    ...extra,
  });
  const richBox = (extra: Values, mode: Mode = 'light') => {
    const fit = fittedSize('tooltip', rich(extra), mode);
    return { fit, ...drawFitted('tooltip', rich(extra), mode) };
  };

  it('the title and the text carry the Compose baselinePadding (28; 24 after the title box, 16 below) and the estimated paddings are gone', () => {
    const template = stringify(entryOf('tooltip').component!.template);
    // 13 and 9 of breathing room (28 and 24 minus the baseline 15), the 4 before the text and the 16 before the action
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

  it('heights of a line of text: text only 28, with title 78, with title and action 126, with action 93 (TooltipTest.kt 260 and 265)', () => {
    for (const mode of MODES) {
      expect(richBox({}, mode).fit.height).toBe(28);
      expect(richBox({ title: 'Airplane mode' }, mode).fit.height).toBe(78);
      expect(
        richBox({ title: 'Airplane mode', action: 'Learn more' }, mode).fit.height,
      ).toBe(126);
      expect(richBox({ action: 'Learn more' }, mode).fit.height).toBe(93);
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

  it('with title: the title baseline at 28 from the top and the text one 24 below the end of the title box (29 from baseline to baseline)', () => {
    const { drawing } = richBox({ title: 'Airplane mode', action: 'Learn more' });
    expect(baselineOf(drawing, 'título')).toBeCloseTo(28, 6);
    // Compose: subheadBound.bottom (13 + 20) + 24 = 57
    expect(baselineOf(drawing, 'texto')).toBeCloseTo(33 + 24, 6);
    // the action comes 16 below the end of the text (textBound.bottom = baseline + 5)
    expect(box(drawing, 'botão da ação').y).toBeCloseTo(
      baselineOf(drawing, 'texto') + 5 + 16,
      0,
    );
  });

  it('two-line title: the text baseline sits 29 below the last title baseline', () => {
    const longTitle = 'Heading '.repeat(8).trim();
    const { drawing } = richBox({ title: longTitle });
    expect(linesOf(drawing, 'título')).toBe(2);
    // the title baseline (28) plus the second line (20) plus the Compose 29 (5 from the end of the line + 24)
    expect(baselineOf(drawing, 'texto')).toBeCloseTo(28 + 20 + 29, 6);
  });

  it('action only: the text baseline at 24 from the top and 16 to the action', () => {
    const { drawing } = richBox({ action: 'Learn more' });
    expect(baselineOf(drawing, 'texto')).toBeCloseTo(24, 6);
    expect(box(drawing, 'botão da ação').y).toBeCloseTo(24 + 5 + 16, 0);
  });

  it('text only: 4 above and below (padding, no baseline) and the text at 4 from the top', () => {
    const { drawing } = richBox({});
    expect(absOf(drawing, oneText(drawing, 'texto')).y).toBe(4);
    expect(drawing.root.height).toBe(28);
  });
});

describe('MC5 group A: alert-dialog', () => {
  const base: Values = {
    title: 'Confirm',
    text: 'Dialog text.',
    confirmButton: 'OK',
    dismissButton: 'Cancel',
  };
  const LONG =
    'Confirm everything and continue with the operation right now without ever going back again';

  it('the text button height is hug with a minimum of 40 and the button row is hug with a minimum of 48 (decision 20)', () => {
    for (const name of ['dispensar', 'confirmar']) {
      const node = templateNodes('alert-dialog', name)[0]!;
      expect([name, node.height, node.minHeight]).toEqual([name, 'hug', 40]);
    }
    const row = templateNodes('alert-dialog', 'botões')[0]!;
    expect([row.height, row.minHeight]).toEqual(['hug', 48]);
  });

  it('short labels stay at 40 in a frame of 48, centered', () => {
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

  it('a long label wraps, the button grows (8 of breathing room above and below) and the row and the dialog grow along', () => {
    for (const mode of MODES) {
      const values = { ...base, confirmButton: LONG, dismissButton: '' };
      const short = fittedSize('alert-dialog', { ...base, dismissButton: '' }, mode);
      const fit = fittedSize('alert-dialog', values, mode);
      const { drawing } = drawFitted('alert-dialog', values, mode);
      const button = box(drawing, 'confirmar');
      // 8 of breathing room above and below (TextButtonContentPadding) and lines of 20
      expect((button.height - 16) % 20).toBe(0);
      expect(button.height).toBeGreaterThanOrEqual(56);
      expect(button.width).toBeLessThanOrEqual(264);
      expect(box(drawing, 'botões').height).toBe(button.height);
      expect(fit.height).toBe(short.height - 48 + button.height);
      expect(drawing.root.height).toBe(fit.height);
      expect(drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
    }
  });

  it('the Fidelidade no longer says that the engine does not align by baseline', () => {
    const doc = readFileSync('libraries/material3-compose/docs/alert-dialog.md', 'utf8');
    // pt-BR kept: the Portuguese text of libraries/material3-compose/docs is the object of this test
    expect(doc.includes('porque o motor não alinha por linha de base')).toBe(false);
  });
});
