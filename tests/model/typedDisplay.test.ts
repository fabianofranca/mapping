import { describe, expect, it } from 'vitest';
import {
  annotationShortLabel,
  annotationTitle,
  buildListing,
  getProjectIssues,
  ownerTypesOf,
  removeTableRow,
  renameAnnotation,
  typedDisplayLines,
  updateEntry,
  type Project,
} from '../../src/model';
import { cadastroProject } from './specFixtures';

function annotation(p: Project, id: string) {
  const a = p.annotations.find((x) => x.id === id);
  if (!a) throw new Error(id);
  return a;
}

const texts = (p: Project, id: string, tables: 'summary' | 'full' = 'summary') =>
  typedDisplayLines(p, annotation(p, id), { tables }).map((l) =>
    l.kind === 'value' ? `${l.label}: ${l.text}${l.alert ? ' !' : ''}` : `${l.label}[]`,
  );

describe('exibição tipada', () => {
  it('título: tipo + rótulo da instância (labelField ou name)', () => {
    const p = cadastroProject();
    expect(annotationTitle(p, annotation(p, 'AC'))).toBe('Classe · Contato');
    expect(annotationTitle(p, annotation(p, 'AB'))).toBe('Button');
    const named = renameAnnotation(p, 'AB', 'Comprar');
    expect(annotationTitle(named, annotation(named, 'AB'))).toBe('Button · Comprar');
    expect(annotationTitle(p, annotation(p, 'AU'))).toBe('User');
  });

  it('rótulo curto de quem referencia: tipo + primeiro texto preenchido', () => {
    const p = cadastroProject();
    expect(annotationShortLabel(p, annotation(p, 'AIN'))).toBe('Input input_nome');
    expect(annotationShortLabel(p, annotation(p, 'AC'))).toBe('Classe Contato');
    expect(annotationShortLabel(p, annotation(p, 'AOH'))).toBe('onHold');
  });

  it('valores na ordem dos campos, com label; opcionais vazios omitidos', () => {
    const p = cadastroProject();
    expect(texts(p, 'AB')).toEqual([
      'id: btn_cadastrar',
      'texto: Cadastrar',
      'estilo: primary',
      'habilitado: sim',
    ]);
    expect(texts(p, 'AOH')).toEqual(['ação: track', 'duração (ms): 500']);
  });

  it('obrigatório vazio como "—" em alerta', () => {
    const p = cadastroProject();
    expect(texts(p, 'AT')).toEqual([
      'id: — !',
      'conteúdo: Crie sua conta',
      'estilo: corpo',
    ]);
  });

  it('ref com o rótulo do alvo; renomear a tupla atualiza; quebrada em alerta', () => {
    let p = cadastroProject();
    expect(texts(p, 'AIN')).toContain('dado: → User.name');
    p = updateEntry(p, 'AU', 0, { key: 'nome', value: 'string' });
    expect(texts(p, 'AIN')).toContain('dado: → User.nome');
    expect(texts(p, 'AIE')).toContain('dado: → Contato.email');
    p = removeTableRow(p, 'AC', 'atributos', 'R1');
    expect(texts(p, 'AIE')).toContain('dado: → (referência quebrada) !');
  });

  it('tabela: resumo no zoom semântico e completa no painel/lista', () => {
    const p = cadastroProject();
    expect(texts(p, 'AOC')).toContain('parâmetros: 1 linha');
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

  it('anotação livre não tem linhas tipadas', () => {
    const p = cadastroProject();
    expect(typedDisplayLines(p, annotation(p, 'AU'), { tables: 'full' })).toEqual([]);
  });

  it('tipos donos possíveis de um filho com requiresOwner', () => {
    const p = cadastroProject();
    expect(
      ownerTypesOf(p, { specId: 'sdui', typeId: 'onClick' }).map((t) => t.name),
    ).toEqual(['Button', 'Image']);
  });
});

describe('Lista: filtro Incompletas', () => {
  it('só as anotações incompletas, sem herdadas nem marcações vazias', () => {
    const p = cadastroProject();
    const only = new Set(getProjectIssues(p).keys());
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
