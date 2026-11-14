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

// pt-BR kept: the names titulo, campos, alvos, cpf, nome, termo, solto, principal, Modelo, Cliente, Alvos and Glossário come from refColumnFixtures (data of the fixture)
// pt-BR kept: M2 is named "Botão" because the accent-insensitive search test (`botao` matches `Botão`) needs an accented name
// Same project as citations.test.ts: I1 (a.png) with unnamed M1 and M3 and M2 "Botão"; AM (model
// "Cliente": titulo, campos with the rows cpf and nome, solto), AL (list) and AF ("Glossário", pair
// "termo"); the arrow R1 "Flow" from M1 to M2.
function baseProject(): Project {
  let p = build();
  p = renameMarking(p, 'M2', 'Botão');
  p = createArrow(p, { id: 'R1', from: 'M1', to: 'M2', name: 'Flow' });
  return p;
}

const NAME = 'My project';
const PROPOSALS = [{ id: 'prop-20261106-ab', title: 'Rename the button' }];
const UNNAMED = 'unnamed';

function thread(id: string, text: string, overrides: Partial<Thread> = {}): Thread {
  return sampleThread({
    id,
    messages: [message(`${id}-m0`, '2026-11-06T10:00:00.000Z', undefined, text)],
    ...overrides,
  });
}

const THREADS: readonly Thread[] = [
  thread('c1b2', 'First conversation about the button'),
  thread('c9f0', 'Another conversation'),
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
    ['marking', { kind: 'marking', id: 'M2' }, 'm/m2'],
    ['arrow', { kind: 'arrow', id: 'R1' }, 'm/r1'],
    ['container', { kind: 'container', id: 'I1' }, 'i/i1'],
    ['annotation', { kind: 'annotation', id: 'AM' }, 'a/am'],
    ['conversation', { kind: 'thread', id: 'c1b2' }, 'c/c1b2'],
    ['proposal', { kind: 'proposal', id: 'prop-20261106-ab' }, 'p/prop-20261106-ab'],
    ['field', { kind: 'field', annotationId: 'AM', key: 'titulo' }, 'a/am/f/titulo'],
    ['pair', { kind: 'entry', annotationId: 'AF', entryId: 'E1' }, 'a/af/e/e1'],
    [
      'row',
      { kind: 'row', annotationId: 'AM', key: 'campos', rowId: 'R1' },
      'a/am/f/campos/r/r1',
    ],
  ];

  it.each(targets)(
    'builds the URL of %s and it resolves to the same target',
    (_n, target, path) => {
      const url = urlOf(ctx, target);
      expect(url).toBe(`mapping://My%20project/${path}`);
      const parsed = parseAnyRef(url!);
      expect(parsed?.project).toBe(NAME);
      expect(resolveCitation(ctx, parsed!.ref)).toEqual({ found: true, target });
    },
  );

  it('layer: letter l with the short code of the layer', () => {
    const target: CitationTarget = { kind: 'layer', id: layerId };
    const url = urlOf(ctx, target)!;
    expect(url.startsWith('mapping://My%20project/l/')).toBe(true);
    expect(resolveCitation(ctx, parseAnyRef(url)!.ref)).toEqual({ found: true, target });
  });

  it('a field with a key that needs encoding still round-trips', () => {
    const target: CitationTarget = {
      kind: 'field',
      annotationId: 'AM',
      key: 'Data table',
    };
    // The field does not exist on the annotation: the URL comes out, but the resolution says it is missing.
    const url = urlOf(ctx, target)!;
    expect(url).toBe('mapping://My%20project/a/am/f/Data%20table');
    expect(parseAnyRef(url)?.ref).toEqual({
      type: 'field',
      annotation: 'am',
      key: 'Data table',
    });
  });

  it('a target that does not exist in the project: null', () => {
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
      { kind: 'proposal', id: 'with space' },
    ] as const) {
      expect(urlOf(ctx, target)).toBeNull();
    }
  });

  it('ids that share the prefix get a longer code and still resolve', () => {
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

  it('conversations with similar ids: the code is unique among all', () => {
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

  it('is the current name of the target', () => {
    expect(citationLabel(ctx, { kind: 'marking', id: 'M2' }, UNNAMED)).toBe('Botão');
    expect(citationLabel(ctx, { kind: 'arrow', id: 'R1' }, UNNAMED)).toBe('Flow');
    expect(
      citationLabel(ctx, { kind: 'field', annotationId: 'AM', key: 'titulo' }, UNNAMED),
    ).toBe('titulo');
    expect(citationLabel(ctx, { kind: 'thread', id: 'c9f0' }, UNNAMED)).toBe(
      'Another conversation',
    );
    expect(
      citationLabel(ctx, { kind: 'proposal', id: 'prop-20261106-ab' }, UNNAMED),
    ).toBe('Rename the button');
  });

  it('unnamed or missing target: the neutral text received', () => {
    expect(citationLabel(ctx, { kind: 'marking', id: 'M1' }, UNNAMED)).toBe(UNNAMED);
    expect(citationLabel(ctx, { kind: 'marking', id: 'nothing' }, UNNAMED)).toBe(UNNAMED);
    const empty = ctxOf(baseProject(), [thread('t1', '')]);
    expect(citationLabel(empty, { kind: 'thread', id: 't1' }, UNNAMED)).toBe(UNNAMED);
  });
});

describe('citeCandidates', () => {
  const ctx = ctxOf();
  const hereM1: ThreadAnchor = { kind: 'marking', id: 'M1' };

  const labels = (list: readonly { label: string }[]) => list.map((c) => c.label);

  it('first the fields, rows and pairs of the conversation item, then the groups in order', () => {
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

  it('detail is the short path', () => {
    const list = citeCandidates(ctx, '', hereM1, OPTIONS);
    const by = (label: string, kind: string) =>
      list.find((c) => c.label === label && c.target.kind === kind)!;
    expect(by('titulo', 'field').detail).toBe('Modelo · Cliente › titulo');
    expect(by('cpf', 'row').detail).toBe('Modelo · Cliente › campos › cpf');
    expect(by('Botão', 'marking').detail).toBe('a.png › Botão');
    expect(by('Flow', 'arrow').detail).toBe(`${UNNAMED} › Botão`);
  });

  it('without an anchor there is no here group', () => {
    const list = citeCandidates(ctx, '', null, OPTIONS);
    expect(list.some((c) => c.group === 'here')).toBe(false);
    expect(list[0]!.group).toBe('marking');
  });

  it('an anchor of field, row, annotation or pair opens the fields of the annotation', () => {
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

  it('an anchor without annotations (layer, container, loose point) has no here', () => {
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

  it('matches by name regardless of case and accent', () => {
    expect(labels(citeCandidates(ctx, 'botao', null, OPTIONS))).toContain('Botão');
    expect(
      citeCandidates(ctx, 'GLOSSARIO', null, OPTIONS).find(
        (c) => c.group === 'annotation',
      )?.label,
    ).toBe('Glossário');
    expect(citeCandidates(ctx, 'zzzz', null, OPTIONS)).toEqual([]);
  });

  it('all the query words must match (in the name or the path)', () => {
    const list = citeCandidates(ctx, 'cliente titulo', hereM1, OPTIONS);
    expect(list.map((c) => c.label)).toEqual(['titulo']);
  });

  it('only open conversations; excludeThreadId removes the conversation itself', () => {
    const threads = [
      ...THREADS,
      thread('c7aa', 'Resolved', {
        resolved: {
          by: { name: 'Marina Alves', email: 'marina@example.com' },
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
    expect(all[0]!.label).toBe('First conversation about the button');
    const without = citeCandidates(local, '', null, {
      ...OPTIONS,
      excludeThreadId: 'c1b2',
    });
    expect(without.filter((c) => c.group === 'thread').map((c) => c.target)).toEqual([
      { kind: 'thread', id: 'c9f0' },
    ]);
  });

  it('in the same group, whoever matches by name comes before whoever matches only by path', () => {
    const threads = [
      thread('t-by-path', 'Other', { anchor: { kind: 'marking', id: 'M2' } }),
      thread('t-by-name', 'About the button'),
    ];
    const local = ctxOf(baseProject(), threads);
    const list = citeCandidates(local, 'botao', null, OPTIONS).filter(
      (c) => c.group === 'thread',
    );
    expect(list.map((c) => c.target)).toEqual([
      { kind: 'thread', id: 't-by-name' },
      { kind: 'thread', id: 't-by-path' },
    ]);
  });

  it('the unnamed one uses the neutral text', () => {
    const marking = citeCandidates(ctx, '', null, OPTIONS).find(
      (c) => c.target.kind === 'marking' && c.target.id === 'M1',
    );
    expect(marking?.label).toBe(UNNAMED);
  });

  it('respects the limit (default 30)', () => {
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

  it('every candidate has a URL that resolves to its own target', () => {
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
