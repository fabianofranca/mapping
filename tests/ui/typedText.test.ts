import { afterEach, describe, expect, it } from 'vitest';
import { cardRows, cardSections, type CardLabels } from '../../src/canvas/semanticText';
import { removeTableRow, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { parseNumberInput } from '../../src/ui/TypedFields';
import {
  annotationDisplayName,
  annotationSourceLabel,
  issueMessage,
  issuesOf,
  ownerTypeNames,
  projectIssues,
} from '../../src/ui/typedText';
import { cadastroProject } from '../model/specFixtures';

function annotation(p: Project, id: string) {
  const a = p.annotations.find((x) => x.id === id);
  if (!a) throw new Error(id);
  return a;
}

describe('textos das anotações tipadas', () => {
  afterEach(() => {
    locale.value = 'pt-BR';
  });

  it('nome exibido e rótulo de origem', () => {
    const p = cadastroProject();
    expect(annotationDisplayName(p, annotation(p, 'AC'))).toBe('Classe · Contato');
    expect(annotationDisplayName(p, annotation(p, 'AU'))).toBe('User');
    expect(annotationSourceLabel(p, annotation(p, 'AIN'))).toBe('Input input_nome');
  });

  it('motivos das pendências com o label do campo', () => {
    locale.value = 'pt-BR';
    let p = cadastroProject();
    const text = annotation(p, 'AT');
    expect(issuesOf(p, 'AT').map((i) => issueMessage(p, text, i))).toEqual([
      'id: obrigatório vazio',
    ]);
    p = removeTableRow(p, 'AC', 'atributos', 'R1');
    expect(
      issuesOf(p, 'AIE').map((i) => issueMessage(p, annotation(p, 'AIE'), i)),
    ).toEqual(['dado: referência quebrada']);
    locale.value = 'en-US';
    expect(
      issuesOf(p, 'AIE').map((i) => issueMessage(p, annotation(p, 'AIE'), i)),
    ).toEqual(['dado — broken reference']);
  });

  it('pendências calculadas uma vez por versão do projeto', () => {
    const p = cadastroProject();
    expect(projectIssues(p)).toBe(projectIssues(p));
    expect([...projectIssues(p).keys()]).toEqual(['AT']);
  });

  it('donos possíveis por nome, ex.: "Button ou Image"', () => {
    const p = cadastroProject();
    expect(ownerTypeNames(p, annotation(p, 'AOC'))).toBe('Button ou Image');
  });

  it('número digitado aceita vírgula e rejeita texto', () => {
    expect(parseNumberInput(' 1,5 ')).toBe(1.5);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeUndefined();
  });
});

describe('zoom semântico com anotações tipadas', () => {
  it('título e valores tipados; alerta no obrigatório vazio', () => {
    const p = cadastroProject();
    const labels: CardLabels = {
      untitled: (n) => `Anotação ${n}`,
      linkedTo: (owner) => `↳ de ${annotationDisplayName(p, owner)}`,
      inheritedFrom: () => '',
      describe: (a) =>
        a.type
          ? {
              title: annotationDisplayName(p, a),
              alert: issuesOf(p, a.id).length > 0,
              lines: [{ text: `x: ${a.id}`, alert: a.id === 'AT' }],
            }
          : null,
    };
    const owners = new Map(p.annotations.map((a) => [a.id, a]));
    const own = p.annotations.filter((a) => a.markingId === 'MT' || a.id === 'AU');
    const rows = cardRows(cardSections(p.layers, own, []), owners, labels);
    expect(rows.filter((r) => r.kind === 'title')).toMatchObject([
      { text: 'User', untitled: false },
      { text: 'Text', alert: true },
    ]);
    expect(rows.filter((r) => r.kind === 'entry')).toMatchObject([
      { text: 'name: string' },
      { text: 'age: number' },
      { text: 'x: AT', alert: true },
    ]);
  });
});
