// R1 (#1096): a prova de desenho roda cada caso em ltr e em rtl; o aviso que só aparece em rtl é
// relatado como os de hoje (com o prefixo "em rtl"); os que valem nos dois saem uma vez.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, unknown>;

const SPEC_PATH = 'dir.spec.json';

function validate(template: Raw, formatVersion = 4) {
  const comp = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'dir',
    name: 'Dir',
    size: { width: 100, height: 40 },
    template,
  };
  const spec = {
    format: 'mapping-spec',
    formatVersion,
    id: 'dir',
    name: 'Dir',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 'dir', name: 'Dir', component: 'components/dir.json', fields: [] },
        ],
      },
    ],
  };
  return validateLibrary({
    specPath: SPEC_PATH,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec) },
      { path: 'components/dir.json', text: JSON.stringify(comp) },
    ],
  });
}

const rect = (name: string, width: number, extra: Raw = {}): Raw => ({
  type: 'rect',
  name,
  width,
  height: 10,
  fill: '#000000',
  ...extra,
});

const frame = (children: Raw[]): Raw => ({
  type: 'frame',
  name: 'raiz',
  layout: { type: 'row' },
  children,
});

describe('prova de desenho nos dois sentidos', () => {
  it('um componente são não gera nada a mais', () => {
    const report = validate(frame([rect('a', 30), rect('b', 30)]));
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('o aviso que vale nos dois sentidos sai uma vez só', () => {
    const report = validate(frame([rect('a', 80), rect('b', 80)]));
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.filter((m) => m.includes('conteúdo maior que a caixa'))).toHaveLength(
      texts.length,
    );
    expect(texts.some((m) => m.includes('rtl'))).toBe(false);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('o componente que estoura só em rtl é relatado, com "em rtl"', () => {
    const report = validate(
      frame([rect('a', 30), rect('largo', 300, { visible: { $direction: 'rtl' } })]),
    );
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((m) => m.includes('em rtl'))).toBe(true);
    // o mesmo componente sem a condição estoura nos dois: aviso comum, sem "em rtl"
    const both = validate(frame([rect('a', 30), rect('largo', 300)]));
    const bothTexts = [...both.errors, ...both.warnings].map((i) => i.message);
    expect(bothTexts.length).toBeGreaterThan(0);
    expect(bothTexts.some((m) => m.includes('em rtl'))).toBe(false);
  });

  it('o aviso que só aparece em ltr não é novidade do rtl (nada de "em rtl")', () => {
    const report = validate(
      frame([rect('a', 30), rect('largo', 300, { visible: { $direction: 'ltr' } })]),
    );
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((m) => m.includes('em rtl'))).toBe(false);
  });
});
