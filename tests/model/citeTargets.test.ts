import { describe, expect, it } from 'vitest';
import {
  citationLabel,
  citationUrl,
  citeCandidates,
  createArrow,
  createMarking,
  parseAnyRef,
  renameMarking,
  resolveCitation,
  type CitationContext,
  type CitationTarget,
  type Project,
  type Thread,
  type ThreadAnchor,
} from '../../src/model';
import { build } from './refColumnFixtures';
import { message, sampleThread } from './threadFixtures';

// Mesmo projeto de citations.test.ts: I1 (a.png) com M1 e M3 sem nome e M2 "Botão"; AM (modelo
// "Cliente": titulo, campos com as linhas cpf e nome, solto), AL (lista) e AF ("Glossário", par
// "termo"); a seta R1 "Fluxo" de M1 para M2.
function baseProject(): Project {
  let p = build();
  p = renameMarking(p, 'M2', 'Botão');
  p = createArrow(p, { id: 'R1', from: 'M1', to: 'M2', name: 'Fluxo' });
  return p;
}

const NAME = 'Meu projeto';
const PROPOSALS = [{ id: 'prop-20261106-ab', title: 'Renomear o botão' }];
const UNNAMED = 'sem nome';

function thread(id: string, text: string, overrides: Partial<Thread> = {}): Thread {
  return sampleThread({
    id,
    messages: [message(`${id}-m0`, '2026-11-06T10:00:00.000Z', undefined, text)],
    ...overrides,
  });
}

const THREADS: readonly Thread[] = [
  thread('c1b2', 'Primeira conversa sobre o botão'),
  thread('c9f0', 'Outra conversa'),
];

function ctxOf(
  project: Project = baseProject(),
  threads: readonly Thread[] = THREADS,
): CitationContext {
  return { project, threads, proposals: PROPOSALS };
}

const OPTIONS = { unnamed: UNNAMED };

function urlOf(ctx: CitationContext, target: CitationTarget): string | null {
  return citationUrl(NAME, ctx.project, ctx.threads, target);
}

describe('citationUrl', () => {
  const ctx = ctxOf();
  const layerId = ctx.project.layers.find((l) => l.spec !== null)!.id;

  const targets: readonly [string, CitationTarget, string][] = [
    ['marcação', { kind: 'marking', id: 'M2' }, 'm/m2'],
    ['seta', { kind: 'arrow', id: 'R1' }, 'm/r1'],
    ['container', { kind: 'container', id: 'I1' }, 'i/i1'],
    ['anotação', { kind: 'annotation', id: 'AM' }, 'a/am'],
    ['conversa', { kind: 'thread', id: 'c1b2' }, 'c/c1b2'],
    ['proposta', { kind: 'proposal', id: 'prop-20261106-ab' }, 'p/prop-20261106-ab'],
    ['campo', { kind: 'field', annotationId: 'AM', key: 'titulo' }, 'a/am/f/titulo'],
    ['par', { kind: 'entry', annotationId: 'AF', entryId: 'E1' }, 'a/af/e/e1'],
    [
      'linha',
      { kind: 'row', annotationId: 'AM', key: 'campos', rowId: 'R1' },
      'a/am/f/campos/r/r1',
    ],
  ];

  it.each(targets)(
    'monta a URL de %s e ela resolve para o mesmo alvo',
    (_n, target, path) => {
      const url = urlOf(ctx, target);
      expect(url).toBe(`mapping://Meu%20projeto/${path}`);
      const parsed = parseAnyRef(url!);
      expect(parsed?.project).toBe(NAME);
      expect(resolveCitation(ctx, parsed!.ref)).toEqual({ found: true, target });
    },
  );

  it('camada: letra l com o código curto da camada', () => {
    const target: CitationTarget = { kind: 'layer', id: layerId };
    const url = urlOf(ctx, target)!;
    expect(url.startsWith('mapping://Meu%20projeto/l/')).toBe(true);
    expect(resolveCitation(ctx, parseAnyRef(url)!.ref)).toEqual({ found: true, target });
  });

  it('campo com chave que pede codificação ainda fecha a ida e volta', () => {
    const target: CitationTarget = {
      kind: 'field',
      annotationId: 'AM',
      key: 'Tabela de dados',
    };
    // O campo não existe na anotação: a URL sai, mas a resolução diz que falta.
    const url = urlOf(ctx, target)!;
    expect(url).toBe('mapping://Meu%20projeto/a/am/f/Tabela%20de%20dados');
    expect(parseAnyRef(url)?.ref).toEqual({
      type: 'field',
      annotation: 'am',
      key: 'Tabela de dados',
    });
  });

  it('alvo que não existe no projeto: null', () => {
    for (const target of [
      { kind: 'marking', id: 'X' },
      { kind: 'container', id: 'X' },
      { kind: 'annotation', id: 'X' },
      { kind: 'layer', id: 'X' },
      { kind: 'thread', id: 'X' },
      { kind: 'field', annotationId: 'X', key: 'titulo' },
      { kind: 'entry', annotationId: 'AF', entryId: 'X' },
      { kind: 'entry', annotationId: 'X', entryId: 'E1' },
      { kind: 'row', annotationId: 'AM', key: 'campos', rowId: 'X' },
      { kind: 'row', annotationId: 'AM', key: 'titulo', rowId: 'R1' },
      { kind: 'proposal', id: 'com espaço' },
    ] as const) {
      expect(urlOf(ctx, target)).toBeNull();
    }
  });

  it('ids que dividem o prefixo ganham código mais longo e ainda resolvem', () => {
    let p = baseProject();
    for (const id of ['abcdefgh-1', 'abcdefgh-2']) {
      p = createMarking(p, {
        id,
        containerId: 'I1',
        rect: { x: 500, y: 500, width: 50, height: 50 },
      });
    }
    const local = ctxOf(p);
    for (const id of ['abcdefgh-1', 'abcdefgh-2']) {
      const target: CitationTarget = { kind: 'marking', id };
      const url = urlOf(local, target)!;
      expect(resolveCitation(local, parseAnyRef(url)!.ref)).toEqual({
        found: true,
        target,
      });
    }
    expect(urlOf(local, { kind: 'marking', id: 'abcdefgh-1' })).not.toBe(
      urlOf(local, { kind: 'marking', id: 'abcdefgh-2' }),
    );
  });

  it('conversas com ids parecidos: o código é único entre todas', () => {
    const threads = [thread('c1b2aaaa-1', 'x'), thread('c1b2aaaa-2', 'y')];
    const local = ctxOf(baseProject(), threads);
    for (const t of threads) {
      const target: CitationTarget = { kind: 'thread', id: t.id };
      const url = urlOf(local, target)!;
      expect(resolveCitation(local, parseAnyRef(url)!.ref)).toEqual({
        found: true,
        target,
      });
    }
  });
});

describe('citationLabel', () => {
  const ctx = ctxOf();

  it('é o nome de agora do alvo', () => {
    expect(citationLabel(ctx, { kind: 'marking', id: 'M2' }, UNNAMED)).toBe('Botão');
    expect(citationLabel(ctx, { kind: 'arrow', id: 'R1' }, UNNAMED)).toBe('Fluxo');
    expect(
      citationLabel(ctx, { kind: 'field', annotationId: 'AM', key: 'titulo' }, UNNAMED),
    ).toBe('titulo');
    expect(citationLabel(ctx, { kind: 'thread', id: 'c9f0' }, UNNAMED)).toBe(
      'Outra conversa',
    );
    expect(
      citationLabel(ctx, { kind: 'proposal', id: 'prop-20261106-ab' }, UNNAMED),
    ).toBe('Renomear o botão');
  });

  it('sem nome ou alvo ausente: o texto neutro recebido', () => {
    expect(citationLabel(ctx, { kind: 'marking', id: 'M1' }, UNNAMED)).toBe(UNNAMED);
    expect(citationLabel(ctx, { kind: 'marking', id: 'nada' }, UNNAMED)).toBe(UNNAMED);
    const empty = ctxOf(baseProject(), [thread('t1', '')]);
    expect(citationLabel(empty, { kind: 'thread', id: 't1' }, UNNAMED)).toBe(UNNAMED);
  });
});

describe('citeCandidates', () => {
  const ctx = ctxOf();
  const hereM1: ThreadAnchor = { kind: 'marking', id: 'M1' };

  const labels = (list: readonly { label: string }[]) => list.map((c) => c.label);

  it('primeiro os campos, linhas e pares do item da conversa, depois os grupos em ordem', () => {
    const list = citeCandidates(ctx, '', hereM1, OPTIONS);
    const here = list.filter((c) => c.group === 'here');
    expect(list.slice(0, here.length)).toEqual(here);
    expect(here.map((c) => [c.label, c.target.kind])).toEqual([
      ['titulo', 'field'],
      ['campos', 'field'],
      ['cpf', 'row'],
      ['nome', 'row'],
      ['solto', 'field'],
    ]);
    const order: string[] = [];
    for (const c of list) if (order[order.length - 1] !== c.group) order.push(c.group);
    expect(order).toEqual([
      'here',
      'marking',
      'container',
      'arrow',
      'annotation',
      'layer',
      'thread',
    ]);
  });

  it('detail é o caminho curto', () => {
    const list = citeCandidates(ctx, '', hereM1, OPTIONS);
    const by = (label: string, kind: string) =>
      list.find((c) => c.label === label && c.target.kind === kind)!;
    expect(by('titulo', 'field').detail).toBe('Modelo · Cliente › titulo');
    expect(by('cpf', 'row').detail).toBe('Modelo · Cliente › campos › cpf');
    expect(by('Botão', 'marking').detail).toBe('a.png › Botão');
    expect(by('Fluxo', 'arrow').detail).toBe(`${UNNAMED} › Botão`);
  });

  it('sem âncora não há grupo here', () => {
    const list = citeCandidates(ctx, '', null, OPTIONS);
    expect(list.some((c) => c.group === 'here')).toBe(false);
    expect(list[0]!.group).toBe('marking');
  });

  it('âncora de campo, linha, anotação ou par abre os campos da anotação', () => {
    const inAf = citeCandidates(
      ctx,
      '',
      { kind: 'entry', annotationId: 'AF', entryId: 'E1' },
      OPTIONS,
    ).filter((c) => c.group === 'here');
    expect(inAf.map((c) => [c.label, c.target.kind, c.detail])).toEqual([
      ['termo', 'entry', 'Glossário › termo'],
    ]);
    const inAl = citeCandidates(
      ctx,
      '',
      { kind: 'annotation', id: 'AL' },
      OPTIONS,
    ).filter((c) => c.group === 'here');
    expect(inAl.map((c) => c.target.kind)).toEqual(['field', 'field', 'row', 'field']);
    expect(inAl.map((c) => c.label)).toEqual(['titulo', 'Alvos', '#1', 'principal']);
    const viaRow = citeCandidates(
      ctx,
      '',
      { kind: 'row', annotationId: 'AL', key: 'alvos', rowId: 'L1' },
      OPTIONS,
    ).filter((c) => c.group === 'here');
    expect(viaRow.map((c) => c.label)).toEqual(inAl.map((c) => c.label));
  });

  it('âncora sem anotações (camada, container, ponto solto) não tem here', () => {
    for (const here of [
      { kind: 'layer', id: ctx.project.layers[0]!.id },
      { kind: 'container', id: 'I1' },
      { kind: 'point', containerId: null, x: 0, y: 0 },
    ] as const) {
      expect(citeCandidates(ctx, '', here, OPTIONS).some((c) => c.group === 'here')).toBe(
        false,
      );
    }
  });

  it('casa por nome sem diferença de caixa nem de acento', () => {
    expect(labels(citeCandidates(ctx, 'botao', null, OPTIONS))).toContain('Botão');
    expect(
      citeCandidates(ctx, 'GLOSSARIO', null, OPTIONS).find(
        (c) => c.group === 'annotation',
      )?.label,
    ).toBe('Glossário');
    expect(citeCandidates(ctx, 'zzzz', null, OPTIONS)).toEqual([]);
  });

  it('todas as palavras da consulta precisam casar (no nome ou no caminho)', () => {
    const list = citeCandidates(ctx, 'cliente titulo', hereM1, OPTIONS);
    expect(list.map((c) => c.label)).toEqual(['titulo']);
  });

  it('só as conversas abertas; excludeThreadId tira a própria conversa', () => {
    const threads = [
      ...THREADS,
      thread('c7aa', 'Resolvida', {
        resolved: {
          by: { kind: 'human', name: 'Marina Alves', email: null },
          at: '2026-11-06T12:00:00.000Z',
        },
      }),
    ];
    const local = ctxOf(baseProject(), threads);
    const all = citeCandidates(local, '', null, OPTIONS).filter(
      (c) => c.group === 'thread',
    );
    expect(all.map((c) => c.target)).toEqual([
      { kind: 'thread', id: 'c1b2' },
      { kind: 'thread', id: 'c9f0' },
    ]);
    expect(all[0]!.label).toBe('Primeira conversa sobre o botão');
    const without = citeCandidates(local, '', null, {
      ...OPTIONS,
      excludeThreadId: 'c1b2',
    });
    expect(without.filter((c) => c.group === 'thread').map((c) => c.target)).toEqual([
      { kind: 'thread', id: 'c9f0' },
    ]);
  });

  it('no mesmo grupo, quem casa pelo nome vem antes de quem casa só pelo caminho', () => {
    const threads = [
      thread('t-por-caminho', 'Outra', { anchor: { kind: 'marking', id: 'M2' } }),
      thread('t-por-nome', 'Sobre o botão'),
    ];
    const local = ctxOf(baseProject(), threads);
    const list = citeCandidates(local, 'botao', null, OPTIONS).filter(
      (c) => c.group === 'thread',
    );
    expect(list.map((c) => c.target)).toEqual([
      { kind: 'thread', id: 't-por-nome' },
      { kind: 'thread', id: 't-por-caminho' },
    ]);
  });

  it('o sem nome usa o texto neutro', () => {
    const marking = citeCandidates(ctx, '', null, OPTIONS).find(
      (c) => c.target.kind === 'marking' && c.target.id === 'M1',
    );
    expect(marking?.label).toBe(UNNAMED);
  });

  it('respeita o limite (padrão 30)', () => {
    let p = baseProject();
    for (let i = 0; i < 40; i++) {
      p = createMarking(p, {
        id: `extra-${i}`,
        containerId: 'I1',
        rect: { x: 600, y: 600, width: 50, height: 50 },
        name: `Extra ${i}`,
      });
    }
    const big = ctxOf(p);
    expect(citeCandidates(big, '', null, OPTIONS)).toHaveLength(30);
    expect(citeCandidates(big, '', null, { ...OPTIONS, limit: 5 })).toHaveLength(5);
    expect(citeCandidates(big, 'extra', null, { ...OPTIONS, limit: 100 })).toHaveLength(
      40,
    );
  });

  it('toda candidata tem URL que resolve para o próprio alvo', () => {
    for (const c of citeCandidates(ctx, '', hereM1, { ...OPTIONS, limit: 200 })) {
      const url = urlOf(ctx, c.target);
      expect(url, JSON.stringify(c.target)).not.toBeNull();
      expect(resolveCitation(ctx, parseAnyRef(url!)!.ref)).toEqual({
        found: true,
        target: c.target,
      });
    }
  });
});
