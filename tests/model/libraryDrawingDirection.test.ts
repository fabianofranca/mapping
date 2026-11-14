// R1 (#1096): a prova de desenho roda cada caso em ltr e em rtl; o aviso que só aparece em rtl é
// relatado como os de hoje (com o prefixo "em rtl"); os que valem nos dois saem uma vez.
import { describe, expect, it } from 'vitest';
import { isDirectionSensitive } from '../../src/model/components/direction';
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
    expect(texts.filter((m) => m.includes('content larger than the box'))).toHaveLength(
      texts.length,
    );
    expect(texts.some((m) => m.includes('rtl'))).toBe(false);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('o componente que estoura só em rtl é relatado, com "in rtl"', () => {
    const report = validate(
      frame([rect('a', 30), rect('largo', 300, { visible: { $direction: 'rtl' } })]),
    );
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((m) => m.includes('in rtl'))).toBe(true);
    // o mesmo componente sem a condição estoura nos dois: aviso comum, sem "in rtl"
    const both = validate(frame([rect('a', 30), rect('largo', 300)]));
    const bothTexts = [...both.errors, ...both.warnings].map((i) => i.message);
    expect(bothTexts.length).toBeGreaterThan(0);
    expect(bothTexts.some((m) => m.includes('in rtl'))).toBe(false);
  });

  it('o aviso que só aparece em ltr não é novidade do rtl (nada de "em rtl")', () => {
    const report = validate(
      frame([rect('a', 30), rect('largo', 300, { visible: { $direction: 'ltr' } })]),
    );
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((m) => m.includes('in rtl'))).toBe(false);
  });
});

// A passada em `rtl` dobra o custo da prova, então ela só roda no componente que pode render aviso
// novo: o que fala de direção (`direction`, `$direction`) ou espelha (`mirror`). Nos outros o `rtl`
// é o espelho exato do `ltr` (mesmos tamanhos; o `approximateMeasurer` não olha a direção), e um
// aviso novo é impossível.
describe('a prova em rtl só roda no componente sensível à direção', () => {
  it('componente sem direção nem espelho não é provado em rtl', () => {
    expect(isDirectionSensitive(frame([rect('a', 30), rect('b', 30)]))).toBe(false);
  });

  it('`$direction` numa condição pede a prova em rtl', () => {
    expect(
      isDirectionSensitive(frame([rect('a', 30, { visible: { $direction: 'rtl' } })])),
    ).toBe(true);
  });

  it('`direction` num nó pede a prova em rtl', () => {
    expect(isDirectionSensitive(frame([rect('a', 30, { direction: 'ltr' })]))).toBe(true);
  });

  it('`mirror` pede a prova em rtl', () => {
    expect(isDirectionSensitive(frame([rect('a', 30, { mirror: true })]))).toBe(true);
  });

  it('`mirror: false` e o `direction` do `repeat` (row/column) não pedem', () => {
    expect(isDirectionSensitive(frame([rect('a', 30, { mirror: false })]))).toBe(false);
    expect(
      isDirectionSensitive({
        type: 'repeat',
        name: 'r',
        direction: 'row',
        children: [rect('a', 30)],
      }),
    ).toBe(false);
  });

  it('âncora lógica (`start`/`end`) pede a prova em rtl', () => {
    expect(
      isDirectionSensitive(frame([rect('a', 30, { anchors: { right: 20, start: 5 } })])),
    ).toBe(true);
    expect(
      isDirectionSensitive(frame([rect('a', 30, { anchors: { left: 5, right: 20 } })])),
    ).toBe(false);
  });

  it('o que estoura só em rtl por âncora lógica com física é relatado', () => {
    // Em `ltr` o `start` (esquerda) com o `right` esticam a barra para 75 px, que cabe; em `rtl` o
    // `start` vira a direita, perde do `right` físico e a largura declarada (300) volta a valer.
    const report = validate({
      type: 'frame',
      name: 'raiz',
      layout: { type: 'none' },
      children: [rect('barra', 300, { anchors: { right: 20, start: 5 } })],
    });
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((m) => m.includes('in rtl'))).toBe(true);
  });

  it('o componente sensível continua sendo provado nos dois sentidos', () => {
    const report = validate(
      frame([rect('a', 30), rect('largo', 300, { visible: { $direction: 'rtl' } })]),
    );
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.every((m) => m.includes('in rtl'))).toBe(true);
  });
});
