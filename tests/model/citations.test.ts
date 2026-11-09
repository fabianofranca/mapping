import { describe, expect, it } from 'vitest';
import {
  backlinks,
  citationTargetKey,
  citedTargets,
  createArrow,
  createMarking,
  escapeCitationLabel,
  extractCitations,
  formatCitation,
  liveCitation,
  liveLabel,
  parseAnyRef,
  renameAnnotation,
  renameMarking,
  resolveCitation,
  type AnyRef,
  type CitationContext,
  type CitationTarget,
  type Project,
  type Thread,
} from '../../src/model';
import { build } from './refColumnFixtures';
import { message, sampleThread, T0 } from './threadFixtures';

// Projeto: I1 (a.png) com M1, M2, M3 (sem nome); AM (modelo "Cliente", tabela campos com as
// linhas R1 "cpf" e R2 "nome"), AL (lista, tabela alvos com a linha L1 sem rótulo) e AF (livre
// "Glossário" com o par E1 "termo"). Aqui M2 vira "Botão" e entra a seta R1 de M1 para M2.
function baseProject(): Project {
  let p = build();
  p = renameMarking(p, 'M2', 'Botão');
  p = createArrow(p, { id: 'R1', from: 'M1', to: 'M2', name: 'Fluxo' });
  return p;
}

const PROPOSALS = [{ id: 'prop-20261106-ab', title: 'Renomear o botão' }];

function thread(id: string, texts: readonly string[], overrides: Partial<Thread> = {}) {
  return sampleThread({
    id,
    messages: texts.map((text, i) =>
      message(`${id}-m${i}`, `2026-11-06T1${i}:00:00.000Z`, undefined, text),
    ),
    ...overrides,
  });
}

const THREADS: readonly Thread[] = [
  thread('c1b2', ['Primeira conversa sobre o botão']),
  thread('c9f0', ['Outra conversa']),
];

function ctxOf(
  project: Project = baseProject(),
  threads: readonly Thread[] = THREADS,
  extra: Partial<CitationContext> = {},
): CitationContext {
  return { project, threads, proposals: PROPOSALS, ...extra };
}

/** Referência de qualquer forma; a pasta da URL não importa (decisão 28). */
function refOf(path: string, folder = 'qualquer-pasta'): AnyRef {
  const parsed = parseAnyRef(`mapping://${folder}/${path}`);
  if (!parsed) throw new Error(`referência inválida: ${path}`);
  return parsed.ref;
}

const url = (path: string) => `mapping://pasta/${path}`;

describe('extractCitations', () => {
  it('devolve vazio para texto sem link', () => {
    expect(extractCitations('só texto, sem nada')).toEqual([]);
    expect(extractCitations('')).toEqual([]);
  });

  it('extrai os links mapping:// em ordem, com rótulo, url e referência', () => {
    const text = `Veja [Botão](${url('m/m2')}) e depois [titulo](${url('a/am/f/titulo')}).`;
    const found = extractCitations(text);
    expect(found.map((c) => c.label)).toEqual(['Botão', 'titulo']);
    expect(found.map((c) => c.url)).toEqual([url('m/m2'), url('a/am/f/titulo')]);
    expect(found[0]!.ref).toEqual({
      project: 'pasta',
      ref: { type: 'item', kind: 'm', code: 'm2' },
    });
    expect(found[1]!.ref?.ref).toEqual({
      type: 'field',
      annotation: 'am',
      key: 'titulo',
    });
  });

  it('ignora link comum, âncora e link de biblioteca', () => {
    const text = [
      '[site](https://exemplo.com/m/m1)',
      '[ancora](#secao)',
      '[Button](mapping://button)',
      '[Button](mapping://spec/button)',
      `[ok](${url('l/ls1')})`,
    ].join(' ');
    expect(extractCitations(text).map((c) => c.label)).toEqual(['ok']);
  });

  it('mantém o link mapping:// que não fecha a gramática, com ref null', () => {
    const found = extractCitations(
      [
        `[a](${url('m/m1/extra')})`,
        `[b](${url('z/m1')})`,
        `[c](${url('a/am/f/x/y/z')})`,
      ].join(' '),
    );
    expect(found.map((c) => c.ref)).toEqual([null, null, null]);
    expect(found.map((c) => c.label)).toEqual(['a', 'b', 'c']);
  });

  it('decodifica o campo codificado da URL', () => {
    const [c] = extractCitations(`[x](${url('a/am/f/Tabela%20de%20dados')})`);
    expect(c!.ref?.ref).toEqual({
      type: 'field',
      annotation: 'am',
      key: 'Tabela de dados',
    });
  });

  it('ignora o que está em código em linha e em bloco de código', () => {
    const text = [
      `Isto não é citação: \`[x](${url('m/m1')})\``,
      '',
      '```',
      `[y](${url('m/m1')})`,
      '```',
      '',
      `Esta é: [z](${url('m/m1')})`,
    ].join('\n');
    expect(extractCitations(text).map((c) => c.label)).toEqual(['z']);
  });

  it('acha links em lista, citação, título, tabela e ênfase', () => {
    const text = [
      `# Título [h](${url('m/m1')})`,
      '',
      `- item [l](${url('m/m2')})`,
      '',
      `> citado [q](${url('m/m3')})`,
      '',
      '| a | b |',
      '| - | - |',
      `| [t](${url('i/i1')}) | x |`,
      '',
      `**forte [s](${url('l/ls1')})**`,
    ].join('\n');
    expect(extractCitations(text).map((c) => c.label)).toEqual(['h', 'l', 'q', 't', 's']);
  });

  it('lê o rótulo com [, ] e \\ escapados', () => {
    const [c] = extractCitations(`[a\\[1\\] \\\\ b](${url('m/m1')})`);
    expect(c!.label).toBe('a[1] \\ b');
    expect(c!.ref?.ref).toEqual({ type: 'item', kind: 'm', code: 'm1' });
  });
});

describe('escapeCitationLabel / formatCitation', () => {
  it('escapa [, ] e \\', () => {
    expect(escapeCitationLabel('a[b]c\\d')).toBe('a\\[b\\]c\\\\d');
    expect(escapeCitationLabel('sem nada')).toBe('sem nada');
  });

  it('escapa *, _ e crase: o rótulo relido não perde os caracteres', () => {
    for (const label of ['a*b*c', '_x_ e __y__', 'use `code` aqui', '**negrito**']) {
      const [c] = extractCitations(formatCitation(label, url('m/m2')));
      expect(c!.label).toBe(label);
    }
  });

  it('formata [rótulo escapado](url)', () => {
    expect(formatCitation('Botão [x]', url('m/m2'))).toBe(
      `[Botão \\[x\\]](${url('m/m2')})`,
    );
  });

  it.each([
    'Botão',
    'a[1]',
    ']',
    '[',
    '\\',
    '\\]',
    '\\\\[',
    'duas [de] três ]]',
    'com (parênteses)',
    'Cliente · Comprar',
  ])('round-trip com extractCitations: %j', (label) => {
    const text = `antes ${formatCitation(label, url('m/m2'))} depois`;
    const found = extractCitations(text);
    expect(found).toHaveLength(1);
    expect(found[0]!.label).toBe(label);
    expect(found[0]!.url).toBe(url('m/m2'));
  });

  it('round-trip com vários links na mesma linha', () => {
    const text = `${formatCitation('a]', url('m/m1'))}, ${formatCitation('[b', url('m/m2'))}`;
    expect(extractCitations(text).map((c) => c.label)).toEqual(['a]', '[b']);
  });
});

describe('resolveCitation', () => {
  const ctx = ctxOf();

  const found = (path: string, folder?: string) =>
    resolveCitation(ctx, refOf(path, folder));

  it('marcação, seta, container, anotação e camada', () => {
    expect(found('m/m2')).toEqual({ found: true, target: { kind: 'marking', id: 'M2' } });
    expect(found('m/r1')).toEqual({ found: true, target: { kind: 'arrow', id: 'R1' } });
    expect(found('i/i1')).toEqual({
      found: true,
      target: { kind: 'container', id: 'I1' },
    });
    expect(found('a/am')).toEqual({
      found: true,
      target: { kind: 'annotation', id: 'AM' },
    });
    const layer = ctx.project.layers.find((l) => l.spec !== null)!;
    expect(found(`l/${layer.id.toLowerCase()}`)).toEqual({
      found: true,
      target: { kind: 'layer', id: layer.id },
    });
  });

  it('conversa e proposta', () => {
    expect(found('c/c1b2')).toEqual({
      found: true,
      target: { kind: 'thread', id: 'c1b2' },
    });
    expect(found('p/prop-20261106-ab')).toEqual({
      found: true,
      target: { kind: 'proposal', id: 'prop-20261106-ab' },
    });
  });

  it('proposta resolve só pelo id exato, nunca por prefixo (decisão 11)', () => {
    const proposals = [{ id: 'botoes-2', title: 'Botões' }];
    const exact = (path: string) => resolveCitation({ ...ctx, proposals }, refOf(path));
    expect(exact('p/botoes-2')).toEqual({
      found: true,
      target: { kind: 'proposal', id: 'botoes-2' },
    });
    expect(exact('p/botoes')).toEqual({ found: false, reason: 'missing' });
    expect(exact('p/prop2026')).toEqual({ found: false, reason: 'missing' });
  });

  it('proposta resolve pelo código curto que o MCP emite (8 hex), nunca por prefixo livre', () => {
    const proposals = [
      { id: '3f2a9c1e-5b7d-4e21-9a10-0c8d2f6b7a44', title: 'Botões' },
      { id: 'botoes-2', title: 'Outra' },
    ];
    const at = (path: string) => resolveCitation({ ...ctx, proposals }, refOf(path));
    expect(at('p/3f2a9c1e')).toEqual({
      found: true,
      target: { kind: 'proposal', id: '3f2a9c1e-5b7d-4e21-9a10-0c8d2f6b7a44' },
    });
    expect(at('p/3f2a')).toEqual({ found: false, reason: 'missing' });
    expect(at('p/botoes')).toEqual({ found: false, reason: 'missing' });
  });

  it('campo de anotação sem tipo não vem do protótipo', () => {
    const p = ctx.project;
    const untyped: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'AM' ? { ...a, type: { specId: 'nenhuma', typeId: 'nada' } } : a,
      ),
    };
    const at = (path: string) =>
      resolveCitation({ ...ctx, project: untyped }, refOf(path));
    expect(at('a/am/f/constructor')).toEqual({ found: false, reason: 'missing' });
    expect(at('a/am/f/toString')).toEqual({ found: false, reason: 'missing' });
  });

  it('campo tipado, par da anotação livre e linha de table', () => {
    expect(found('a/am/f/titulo')).toEqual({
      found: true,
      target: { kind: 'field', annotationId: 'AM', key: 'titulo' },
    });
    expect(found('a/af/e/e1')).toEqual({
      found: true,
      target: { kind: 'entry', annotationId: 'AF', entryId: 'E1' },
    });
    expect(found('a/am/f/campos/r/r1')).toEqual({
      found: true,
      target: { kind: 'row', annotationId: 'AM', key: 'campos', rowId: 'R1' },
    });
  });

  it('ignora o <projeto> da URL', () => {
    const a = found('m/m2', 'pasta-antiga');
    const b = found('m/m2', 'outro-nome-qualquer');
    expect(a).toEqual(b);
    expect(a.found).toBe(true);
  });

  it('aceita o código com o id completo ou prefixo, em qualquer caixa', () => {
    expect(found('m/M2')).toEqual({ found: true, target: { kind: 'marking', id: 'M2' } });
  });

  it('código inexistente: alvo ausente', () => {
    for (const path of [
      'm/zzz',
      'i/zzz',
      'a/zzz',
      'l/zzz',
      'c/zzz',
      'p/zzz',
      'a/zzz/f/titulo',
      'a/zzz/e/e1',
    ]) {
      expect(found(path)).toEqual({ found: false, reason: 'missing' });
    }
  });

  it('campo, par e linha inexistentes ou de outra natureza: ausente', () => {
    for (const path of [
      'a/am/f/inexistente', // campo que o tipo não tem
      'a/af/f/titulo', // anotação livre não tem campos
      'a/af/e/zzz', // par inexistente
      'a/am/e/e1', // anotação tipada não tem pares
      'a/am/f/campos/r/zzz', // linha inexistente
      'a/am/f/titulo/r/r1', // titulo não é table
      'a/am/f/solto/r/r1',
    ]) {
      expect(found(path)).toEqual({ found: false, reason: 'missing' });
    }
  });

  it('código ambíguo: alvo ausente, com o motivo', () => {
    let p = createMarking(baseProject(), {
      id: 'abc1',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    p = createMarking(p, {
      id: 'abc2',
      containerId: 'I1',
      rect: { x: 20, y: 0, width: 10, height: 10 },
    });
    const two = ctxOf(p, [thread('t-aa', ['x']), thread('t-ab', ['y'])]);
    expect(resolveCitation(two, refOf('m/abc'))).toEqual({
      found: false,
      reason: 'ambiguous',
    });
    expect(resolveCitation(two, refOf('m/abc2')).found).toBe(true);
    expect(resolveCitation(two, refOf('c/ta'))).toEqual({
      found: false,
      reason: 'ambiguous',
    });
  });

  it('o id inteiro vence o prefixo de outro', () => {
    const p = createMarking(baseProject(), {
      id: 'M22',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(resolveCitation(ctxOf(p), refOf('m/m2'))).toEqual({
      found: true,
      target: { kind: 'marking', id: 'M2' },
    });
  });
});

describe('liveLabel', () => {
  const resolve = (ctx: CitationContext, path: string, fallback = 'reserva') => {
    const res = resolveCitation(ctx, refOf(path));
    return liveLabel(ctx, res, fallback);
  };

  it('marcação, seta e container: o nome', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'm/m2')).toEqual({ label: 'Botão', broken: false });
    expect(resolve(ctx, 'm/r1')).toEqual({ label: 'Fluxo', broken: false });
    // O container sem nome mostra o nome do arquivo.
    expect(resolve(ctx, 'i/i1')).toEqual({ label: 'a.png', broken: false });
  });

  it('sem nome: rótulo nulo (a interface traduz) e não quebrada', () => {
    expect(resolve(ctxOf(), 'm/m1')).toEqual({ label: null, broken: false });
  });

  it('anotação: o nome ou o rótulo da instância, senão o nome do tipo', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'a/af').label).toBe('Glossário');
    expect(resolve(ctx, 'a/am').label).toBe('Cliente');
    expect(resolve(ctx, 'a/al').label).toBe('Lista');
    const renamed = ctxOf(renameAnnotation(ctx.project, 'AM', 'Outro nome'));
    expect(resolve(renamed, 'a/am').label).toBe('Outro nome');
  });

  it('campo: o label da especialização, senão a key', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'a/al/f/alvos')).toEqual({ label: 'Alvos', broken: false });
    expect(resolve(ctx, 'a/am/f/titulo')).toEqual({ label: 'titulo', broken: false });
  });

  it('par: a key', () => {
    expect(resolve(ctxOf(), 'a/af/e/e1')).toEqual({ label: 'termo', broken: false });
  });

  it('linha: a coluna do rowLabel; sem rowLabel, a posição', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'a/am/f/campos/r/r1').label).toBe('cpf');
    expect(resolve(ctx, 'a/am/f/campos/r/r2').label).toBe('nome');
    expect(resolve(ctx, 'a/al/f/alvos/r/l1').label).toBe('#1');
  });

  it('camada, conversa e proposta', () => {
    const ctx = ctxOf();
    const layer = ctx.project.layers.find((l) => l.spec !== null)!;
    expect(resolve(ctx, `l/${layer.id.toLowerCase()}`).label).toBe(layer.name);
    expect(resolve(ctx, 'p/prop-20261106-ab').label).toBe('Renomear o botão');
  });

  it('conversa: o assunto injetado (ou a primeira linha, sem injeção)', () => {
    expect(resolve(ctxOf(), 'c/c1b2').label).toBe('Primeira conversa sobre o botão');
    const ctx = ctxOf(undefined, undefined, { subjectOf: (t) => `assunto ${t.id}` });
    expect(resolve(ctx, 'c/c1b2').label).toBe('assunto c1b2');
  });

  it('acompanha a renomeação do alvo', () => {
    const before = ctxOf();
    const after = ctxOf(renameMarking(before.project, 'M2', 'Botão novo'));
    expect(resolve(before, 'm/m2').label).toBe('Botão');
    expect(resolve(after, 'm/m2').label).toBe('Botão novo');
  });

  it('alvo ausente: o rótulo de reserva, quebrada', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'm/zzz', 'Botão antigo')).toEqual({
      label: 'Botão antigo',
      broken: true,
    });
    expect(resolve(ctx, 'a/am/f/inexistente', 'campo antigo')).toEqual({
      label: 'campo antigo',
      broken: true,
    });
  });
});

describe('liveCitation', () => {
  it('junta a resolução e o rótulo de uma citação extraída', () => {
    const ctx = ctxOf();
    const [ok, gone, bad] = extractCitations(
      [
        `[Botão velho](${url('m/m2')})`,
        `[Apagado](${url('m/zzz')})`,
        `[Torto](${url('m/m1/extra')})`,
      ].join(' '),
    ).map((c) => liveCitation(ctx, c));
    expect(ok).toMatchObject({ label: 'Botão', broken: false });
    expect(ok!.resolution).toEqual({
      found: true,
      target: { kind: 'marking', id: 'M2' },
    });
    expect(gone).toMatchObject({ label: 'Apagado', broken: true });
    expect(bad).toMatchObject({ label: 'Torto', broken: true });
    expect(bad!.resolution).toEqual({ found: false, reason: 'invalid' });
  });
});

describe('backlinks', () => {
  const A = thread('aaaa1111', ['sem citação']);
  const B = thread('bbbb2222', [
    `Veja [A](${url('c/aaaa1111')}) e de novo [A](${url('c/aaaa1111')})`,
  ]);
  const C = thread('cccc3333', [
    `Eu mesma [C](${url('c/cccc3333')}), outra [A](${url('c/aaaa')}) e [B](${url('c/bbbb2222')})`,
    `Segunda mensagem cita [A](${url('c/aaaa1111')})`,
  ]);
  const D = thread(
    'dddd4444',
    [`Resolvida cita [A](${url('c/aaaa1111')}) e [item](${url('m/m1')})`],
    { resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T0 } },
  );

  it('mapa conversa → conversas que a citam, sem duplicar nem auto-citação', () => {
    const map = backlinks([A, B, C, D]);
    expect(map.get('aaaa1111')).toEqual(['bbbb2222', 'cccc3333', 'dddd4444']);
    expect(map.get('bbbb2222')).toEqual(['cccc3333']);
    expect(map.has('cccc3333')).toBe(false);
    expect(map.has('dddd4444')).toBe(false);
  });

  it('ignora citação quebrada e referência a outro tipo', () => {
    const X = thread('xxxx5555', [
      `[sumiu](${url('c/nao-existe')}) [m](${url('m/m1')}) [p](${url('p/xyz')})`,
    ]);
    expect(backlinks([A, X]).size).toBe(0);
  });

  it('uma citação com código ambíguo não vira backlink', () => {
    const ambiguous = thread('tt-aa', ['x']);
    const other = thread('tt-ab', ['y']);
    const cites = thread('zzzz', [`[?](${url('c/tt')})`]);
    expect(backlinks([ambiguous, other, cites]).size).toBe(0);
  });

  it('lista vazia', () => {
    expect(backlinks([]).size).toBe(0);
  });
});

describe('citedTargets / citationTargetKey', () => {
  it('alvos citados, achados e sem repetição, na ordem do texto', () => {
    const ctx = ctxOf();
    const t = thread('c1b2', [
      `Veja [Botão](${url('m/m2')}) e [titulo](${url('a/am/f/titulo')})`,
      `Outra vez [Botão](${url('m/m2')}), [linha](${url('a/am/f/campos/r/r1')}) e [c](${url('c/c9f0')})`,
      `Quebrado [x](${url('m/zzz')}), biblioteca [Button](mapping://button), https [s](https://a.com) e [p](${url('p/prop-20261106-ab')})`,
    ]);
    const targets = citedTargets(t, ctx);
    expect(targets).toEqual<CitationTarget[]>([
      { kind: 'marking', id: 'M2' },
      { kind: 'field', annotationId: 'AM', key: 'titulo' },
      { kind: 'row', annotationId: 'AM', key: 'campos', rowId: 'R1' },
      { kind: 'thread', id: 'c9f0' },
      { kind: 'proposal', id: 'prop-20261106-ab' },
    ]);
  });

  it('conversa sem citação: vazio', () => {
    expect(citedTargets(thread('c1b2', ['nada']), ctxOf())).toEqual([]);
  });

  it('a chave identifica o alvo', () => {
    const keys = [
      { kind: 'marking', id: 'M2' },
      { kind: 'arrow', id: 'M2' },
      { kind: 'field', annotationId: 'AM', key: 'titulo' },
      { kind: 'entry', annotationId: 'AF', entryId: 'E1' },
      { kind: 'row', annotationId: 'AM', key: 'campos', rowId: 'R1' },
      { kind: 'thread', id: 'M2' },
    ].map((t) => citationTargetKey(t as CitationTarget));
    expect(new Set(keys).size).toBe(keys.length);
    expect(citationTargetKey({ kind: 'marking', id: 'M2' })).toBe(
      citationTargetKey({ kind: 'marking', id: 'M2' }),
    );
  });
});
