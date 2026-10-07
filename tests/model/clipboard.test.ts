import { describe, expect, it } from 'vitest';
import {
  ITEM_CLIPBOARD_FORMAT,
  ITEM_CLIPBOARD_MIME,
  itemClipboardData,
} from '../../src/model';
import { sampleProject } from './fixtures';

const extra = { project: 'mapeamento', ref: 'mapping://mapeamento/m/x' };

describe('itemClipboardData', () => {
  const p = sampleProject();

  it('o tipo MIME do formato próprio é um formato web personalizado válido', () => {
    expect(ITEM_CLIPBOARD_MIME).toBe('application/x-mapping-item+json');
  });

  it('marcação: ela, as descendentes e as anotações de todas', () => {
    const data = itemClipboardData(p, 'm', 'M1', extra);
    expect(data).toMatchObject({
      format: ITEM_CLIPBOARD_FORMAT,
      version: 1,
      kind: 'm',
      project: 'mapeamento',
      ref: 'mapping://mapeamento/m/x',
    });
    expect(data.item.id).toBe('M1');
    expect(data.markings.map((m) => m.id).sort()).toEqual(['M2', 'M3']);
    expect(data.annotations.map((a) => a.id).sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('marcação sem filhas leva só as anotações dela', () => {
    const data = itemClipboardData(p, 'm', 'M4', extra);
    expect(data.markings).toEqual([]);
    expect(data.annotations.map((a) => a.id)).toEqual(['A4']);
  });

  it('imagem: todas as marcações e anotações dela', () => {
    const data = itemClipboardData(p, 'i', 'I1', extra);
    expect(data.item.id).toBe('I1');
    expect(data.markings.map((m) => m.id).sort()).toEqual(['M1', 'M2', 'M3']);
    expect(data.annotations.map((a) => a.id).sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('anotação: só ela', () => {
    const data = itemClipboardData(p, 'a', 'A1', extra);
    expect(data.item.id).toBe('A1');
    expect(data.markings).toEqual([]);
    expect(data.annotations).toEqual([]);
  });

  it('item inexistente falha com not-found', () => {
    expect(() => itemClipboardData(p, 'm', 'nada', extra)).toThrow();
    expect(() => itemClipboardData(p, 'i', 'nada', extra)).toThrow();
    expect(() => itemClipboardData(p, 'a', 'nada', extra)).toThrow();
  });

  it('é serializável em JSON (é o que vai para a área de transferência)', () => {
    const data = itemClipboardData(p, 'm', 'M1', extra);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
