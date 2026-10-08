import { describe, expect, it } from 'vitest';
import { specHelpSections } from '../../src/i18n/specHelp';
import { parseSpecText } from '../../src/model/spec';
import { HELP_ASSETS } from '../../src/ui/helpAssets';

describe('ajuda: especializações', () => {
  it('os dois idiomas têm as mesmas seções e blocos, sem texto vazio', () => {
    const pt = specHelpSections('pt-BR');
    const en = specHelpSections('en-US');
    expect(en.map((s) => s.id)).toEqual(pt.map((s) => s.id));
    for (const [i, section] of pt.entries()) {
      const other = en[i];
      expect(other?.blocks.map((b) => b.kind)).toEqual(section.blocks.map((b) => b.kind));
      expect(section.title.trim()).not.toBe('');
      expect(other?.title.trim()).not.toBe('');
    }
  });

  it('cobre referências e etiquetas', () => {
    for (const locale of ['pt-BR', 'en-US'] as const) {
      const sections = specHelpSections(locale);
      expect(sections.map((s) => s.id)).toEqual(
        expect.arrayContaining(['format', 'refs', 'validation', 'example']),
      );
      expect(JSON.stringify(sections)).toContain('data-field');
    }
  });

  it('o trecho de exemplo é uma especialização válida', () => {
    const example = specHelpSections('pt-BR').find((s) => s.id === 'example');
    const code = example?.blocks.find((b) => b.kind === 'code');
    expect(code?.kind).toBe('code');
    if (code?.kind !== 'code') return;
    expect(parseSpecText(code.code).ok).toBe(true);
  });

  it('a seção de plataformas, code e codeRef existe nos dois idiomas e o trecho é uma v2 válida', () => {
    for (const locale of ['pt-BR', 'en-US'] as const) {
      const section = specHelpSections(locale).find((s) => s.id === 'code');
      expect(section, locale).toBeDefined();
      const text = JSON.stringify(section);
      for (const term of ['platforms', 'code', 'codeRef', 'symbol', 'params', 'values']) {
        expect(text, `${locale}: ${term}`).toContain(term);
      }
      const code = section?.blocks.find((b) => b.kind === 'code');
      if (code?.kind !== 'code') throw new Error('sem trecho de código');
      const parsed = parseSpecText(code.code);
      expect(parsed.ok, locale).toBe(true);
      if (parsed.ok) expect(parsed.spec.formatVersion).toBe(2);
    }
  });

  it('os arquivos para baixar são os exemplos e o schema do repositório', () => {
    expect(HELP_ASSETS.map((a) => a.fileName)).toEqual([
      'sdui.json',
      'modelo-de-dados.json',
      'spec.schema.json',
    ]);
    for (const asset of HELP_ASSETS.filter((a) => a.id !== 'schema')) {
      expect(parseSpecText(asset.text).ok).toBe(true);
    }
    expect(JSON.parse(HELP_ASSETS[2]!.text)).toHaveProperty('$schema');
  });
});
