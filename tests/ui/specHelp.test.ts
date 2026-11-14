import { describe, expect, it } from 'vitest';
import { specHelpSections } from '../../src/i18n/specHelp';
import { parseSpecText } from '../../src/model/spec';
import { HELP_ASSETS } from '../../src/ui/helpAssets';

describe('help: specializations', () => {
  it('both languages have the same sections and blocks, with no empty text', () => {
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

  it('covers references and tags', () => {
    for (const locale of ['pt-BR', 'en-US'] as const) {
      const sections = specHelpSections(locale);
      expect(sections.map((s) => s.id)).toEqual(
        expect.arrayContaining(['format', 'refs', 'validation', 'example']),
      );
      expect(JSON.stringify(sections)).toContain('data-field');
    }
  });

  it('the example snippet is a valid specialization', () => {
    const example = specHelpSections('pt-BR').find((s) => s.id === 'example');
    const code = example?.blocks.find((b) => b.kind === 'code');
    expect(code?.kind).toBe('code');
    if (code?.kind !== 'code') return;
    expect(parseSpecText(code.code).ok).toBe(true);
  });

  it('the platforms and code section exists in both languages and the snippet is a valid v5', () => {
    for (const locale of ['pt-BR', 'en-US'] as const) {
      const section = specHelpSections(locale).find((s) => s.id === 'code');
      expect(section, locale).toBeDefined();
      const text = JSON.stringify(section);
      for (const term of [
        'platforms',
        'repo',
        'code',
        'symbol',
        'path',
        'params',
        'values',
      ]) {
        expect(text, `${locale}: ${term}`).toContain(term);
      }
      // The field type removed in stage 9 is gone from the whole help.
      expect(JSON.stringify(specHelpSections(locale)), locale).not.toMatch(/codeRef/i);
      const code = section?.blocks.find((b) => b.kind === 'code');
      if (code?.kind !== 'code') throw new Error('no code snippet');
      const parsed = parseSpecText(code.code);
      expect(parsed.ok, locale).toBe(true);
      if (parsed.ok) expect(parsed.spec.formatVersion).toBe(5);
    }
  });

  it('the files to download are the examples and the repository schema', () => {
    // pt-BR kept: file names of the downloadable help assets are defined in src/ui/helpAssets
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

  it('the help does not say that the shared validation is still to come', () => {
    for (const locale of ['pt-BR', 'en-US'] as const) {
      const text = JSON.stringify(specHelpSections(locale));
      // pt-BR kept: matches the pt-BR help text
      expect(text).not.toMatch(
        /fase seguinte da etapa Biblioteca|later phase of the Library stage/,
      );
    }
  });

  it('the help says that each origin rewrites only the notices of its own ref', () => {
    for (const [locale, origin] of [
      // pt-BR kept: matches the pt-BR help text
      ['pt-BR', /da sua origem \(o mesmo ref\)/],
      ['en-US', /of its own origin \(the same ref\)/],
    ] as const) {
      const text = JSON.stringify(specHelpSections(locale));
      // pt-BR kept: matches the pt-BR help text
      expect(text, locale).not.toMatch(
        /regravar todos os avisos a cada rodada|rewrite all notices on every run/,
      );
      expect(text, locale).toMatch(origin);
    }
  });
});
