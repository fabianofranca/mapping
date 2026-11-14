import { describe, expect, it } from 'vitest';
import {
  annotationShortLabel,
  annotationTitle,
  buildListing,
  projectIssues,
  ownerTypesOf,
  removeTableRow,
  renameAnnotation,
  typedDisplayLines,
  updateEntry,
  type Project,
} from '../../src/model';
import { cadastroProject, codeProject } from './specFixtures';

function annotation(p: Project, id: string) {
  const a = p.annotations.find((x) => x.id === id);
  if (!a) throw new Error(id);
  return a;
}

const texts = (p: Project, id: string, tables: 'summary' | 'full' = 'summary') =>
  typedDisplayLines(p, annotation(p, id), { tables }).map((l) =>
    l.kind === 'value' ? `${l.label}: ${l.text}${l.alert ? ' !' : ''}` : `${l.label}[]`,
  );

// pt-BR kept: shared fixture data asserted by tests/mcp, tests/components, tests/examples (cadastroProject/codeProject)
describe('typed display', () => {
  it('title: type + instance label (labelField or name)', () => {
    const p = cadastroProject();
    expect(annotationTitle(p, annotation(p, 'AC'))).toBe('Classe · Contato');
    expect(annotationTitle(p, annotation(p, 'AB'))).toBe('Button');
    const named = renameAnnotation(p, 'AB', 'Buy');
    expect(annotationTitle(named, annotation(named, 'AB'))).toBe('Button · Buy');
    expect(annotationTitle(p, annotation(p, 'AU'))).toBe('User');
  });

  it('short label of the referrer: type + first filled text', () => {
    const p = cadastroProject();
    expect(annotationShortLabel(p, annotation(p, 'AIN'))).toBe('Input input_nome');
    expect(annotationShortLabel(p, annotation(p, 'AC'))).toBe('Classe Contato');
    expect(annotationShortLabel(p, annotation(p, 'AOH'))).toBe('onHold');
  });

  it('values in field order, with label; empty optionals omitted', () => {
    const p = cadastroProject();
    expect(texts(p, 'AB')).toEqual([
      'id: btn_cadastrar',
      'texto: Cadastrar',
      'estilo: primary',
      'habilitado: sim',
    ]);
    expect(texts(p, 'AOH')).toEqual(['ação: track', 'duração (ms): 500']);
  });

  it('empty required as "—" in alert', () => {
    const p = cadastroProject();
    expect(texts(p, 'AT')).toEqual([
      'id: — !',
      'conteúdo: Crie sua conta',
      'estilo: corpo',
    ]);
  });

  it('ref with the target label; renaming the tuple updates; broken one in alert', () => {
    let p = cadastroProject();
    expect(texts(p, 'AIN')).toContain('dado: → User.name');
    p = updateEntry(p, 'AU', 'EN', { key: 'fullname', value: 'string' });
    expect(texts(p, 'AIN')).toContain('dado: → User.fullname');
    expect(texts(p, 'AIE')).toContain('dado: → Contato.email');
    p = removeTableRow(p, 'AC', 'atributos', 'R1');
    expect(texts(p, 'AIE')).toContain('dado: → (broken reference) !');
  });

  it('table: summary in the semantic zoom and complete in the panel/list', () => {
    const p = cadastroProject();
    expect(texts(p, 'AOC')).toContain('parâmetros: 1 row');
    const full = typedDisplayLines(p, annotation(p, 'AOC'), { tables: 'full' });
    const table = full.find((l) => l.kind === 'table');
    expect(table).toMatchObject({
      label: 'parâmetros',
      columns: [
        { key: 'nome', label: 'nome' },
        { key: 'valor', label: 'valor' },
      ],
      rows: [{ id: 'RP1', cells: ['origem', 'cadastro'] }],
      alert: false,
    });
  });

  it('a free annotation has no typed lines', () => {
    const p = cadastroProject();
    expect(typedDisplayLines(p, annotation(p, 'AU'), { tables: 'full' })).toEqual([]);
  });

  it('possible owner types of a child with requiresOwner', () => {
    const p = cadastroProject();
    expect(
      ownerTypesOf(p, { specId: 'sdui', typeId: 'onClick' }).map((t) => t.name),
    ).toEqual(['Button', 'Image']);
  });
});

// pt-BR kept: shared fixture data asserted by tests/mcp, tests/components, tests/examples (cadastroProject/codeProject)
describe('List: Incomplete filter', () => {
  it('only the incomplete annotations, without inherited ones or empty markings', () => {
    const p = cadastroProject();
    const only = new Set(projectIssues(p).keys());
    expect([...only]).toEqual(['AT']);
    const listing = buildListing(p, p.layers, { showEmpty: true, onlyAnnotations: only });
    expect(listing).toHaveLength(1);
    const markings = listing[0]?.markings ?? [];
    expect(markings.map((m) => m.marking.name)).toEqual(['Título']);
    expect(markings[0]?.sections.flatMap((s) => s.annotations.map((a) => a.id))).toEqual([
      'AT',
    ]);
  });
});

// pt-BR kept: shared fixture data asserted by tests/mcp, tests/components, tests/examples (cadastroProject/codeProject)
describe('display without the removed code field (stage 9)', () => {
  it('Details, List and semantic zoom show only the type fields', () => {
    const p = codeProject();
    expect(texts(p, 'AS')).toEqual(['nome: Cadastro', 'rota: /cadastro']);
    expect(texts(p, 'AS', 'full')).toEqual(['nome: Cadastro', 'rota: /cadastro']);
    expect(
      typedDisplayLines(p, annotation(p, 'AS'), { tables: 'full' }).map((l) => l.kind),
    ).toEqual(['value', 'value']);
  });

  it('a leftover value for a key outside the type does not appear in the typed display', () => {
    const p = codeProject();
    const leftover: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'AS'
          ? {
              ...a,
              values: {
                ...(a.values ?? {}),
                implementation: [{ _id: 'X1', platform: 'android', path: 'a.kt' }],
              },
            }
          : a,
      ),
    };
    expect(texts(leftover, 'AS', 'full')).toEqual(['nome: Cadastro', 'rota: /cadastro']);
  });
});
