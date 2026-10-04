import { describe, expect, it } from 'vitest';
import { enUS } from '../../src/i18n/en-US';
import { ptBR } from '../../src/i18n/pt-BR';

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const entries = Object.entries(ptBR) as [keyof typeof ptBR, string][];

describe('dicionários', () => {
  it('têm exatamente as mesmas chaves', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(ptBR).sort());
  });

  it.each(entries)('%s: sem texto vazio e com os mesmos {parâmetros}', (key, pt) => {
    const en = enUS[key];
    expect(pt.trim()).not.toBe('');
    expect(en.trim()).not.toBe('');
    expect(placeholders(en)).toEqual(placeholders(pt));
  });

  it('en-US não deixou texto em português (copiado sem traduzir)', () => {
    // Iguais nos dois idiomas só por serem nomes próprios, unidades ou palavras idênticas.
    const allowed = new Set<string>([
      'language.pt-BR',
      'language.en-US',
      'image.dimensions',
      'editor.menu',
      'view.canvas',
      'marking.pathSeparator',
      'marking.x',
      'marking.y',
      'layer.deleteCount',
      'annotation.ownerOption',
      'help.specs.downloads',
      'zoom.value',
      'status.empty',
      'status.schema',
      'marking.rectSummary',
      'details.summary',
      'details.summarySeparator',
      'issue.item',
      'ref.fieldButton',
    ]);
    const same = entries.filter(([key, pt]) => enUS[key] === pt && !allowed.has(key));
    expect(same.map(([key]) => key)).toEqual([]);
  });
});
