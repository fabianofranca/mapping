// NC1 (decisão 4 da #1631): o motor avisa `texto maior que a caixa: <nó>` também quando a palavra mais
// larga do texto passa da largura do nó (o texto só quebra entre palavras), sem mudar o desenho.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { defaultValues } from '../../../src/model/libraryDrawing';
import { catalog, entryOf } from '../../support/material3Fitted';
import { instantiateOptions } from '../../support/material3Library';

type Json = Record<string, unknown>;

/** Instancia o tipo da Material 3 em `width × height` com os valores dados. */
function drawBox(id: string, values: Json, width: number, height: number) {
  const entry = entryOf(id);
  return instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values } as never,
    { x: 0, y: 0, width, height },
    instantiateOptions(catalog, 'light'),
  );
}

const tooBig = (warnings: readonly string[]): string[] =>
  warnings.filter((w) => w.startsWith('texto maior que a caixa'));

describe('palavra mais larga que a caixa do texto avisa', () => {
  it('button "Salvar" em 58 × 40 avisa o rótulo; em 96 × 40 não avisa', () => {
    const small = drawBox('button', { label: 'Salvar' }, 58, 40);
    expect(tooBig(small.warnings)).toEqual(['texto maior que a caixa: rótulo']);
    const fits = drawBox('button', { label: 'Salvar' }, 96, 40);
    expect(tooBig(fits.warnings)).toEqual([]);
  });

  it('extended-fab "Novo" em 50 × 56 e "Confirmar compra" em 60 × 56 avisam o texto', () => {
    const novo = drawBox('extended-fab', { text: 'Novo' }, 50, 56);
    expect(tooBig(novo.warnings)).toEqual(['texto maior que a caixa: texto']);
    const longo = drawBox('extended-fab', { text: 'Confirmar compra' }, 60, 56);
    expect(tooBig(longo.warnings)).toEqual(['texto maior que a caixa: texto']);
  });

  it('button "Confirmar compra" em 58 × 40 mantém o aviso de conteúdo e ganha o do rótulo', () => {
    const made = drawBox('button', { label: 'Confirmar compra' }, 58, 40);
    expect(made.warnings).toContain('conteúdo maior que a caixa: button');
    expect(tooBig(made.warnings)).toEqual(['texto maior que a caixa: rótulo']);
  });
});

const file = (text: Json): never =>
  ({
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 40, height: 60 },
    template: {
      type: 'frame',
      name: 'raiz',
      width: 'fill',
      height: 'fill',
      layout: { type: 'none' },
      children: [text],
    },
  }) as never;

const run = (text: Json) =>
  instantiate(
    file(text),
    {} as never,
    { x: 0, y: 0, width: 40, height: 60 },
    { measure: approximateMeasurer },
  );

describe('o que não avisa e o texto rico', () => {
  const longWord = 'Extraordinariamente';

  it('texto com maxLines ou ellipsis não avisa', () => {
    const base = { type: 'text', name: 't', width: 40, height: 60, text: longWord };
    expect(tooBig(run({ ...base, font: { size: 14, maxLines: 1 } }).warnings)).toEqual(
      [],
    );
    expect(tooBig(run({ ...base, font: { size: 14, ellipsis: true } }).warnings)).toEqual(
      [],
    );
  });

  it('o mesmo texto sem maxLines nem ellipsis avisa', () => {
    const base = { type: 'text', name: 't', width: 40, height: 60, text: longWord };
    expect(tooBig(run({ ...base, font: { size: 14 } }).warnings)).toEqual([
      'texto maior que a caixa: t',
    ]);
  });

  it('texto rico com um chip mais largo que a caixa avisa', () => {
    const made = run({
      type: 'text',
      name: 'rico',
      width: 40,
      height: 60,
      font: { size: 14 },
      runs: [{ text: 'a ' }, { text: 'chipmuitolargo', background: '#cccccc' }],
    });
    expect(tooBig(made.warnings)).toEqual(['texto maior que a caixa: rico']);
  });
});
