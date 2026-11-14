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

// Project: I1 (a.png) with M1, M2, M3 (unnamed); AM (model "Cliente", table campos with the
// rows R1 "cpf" and R2 "nome"), AL (list, table alvos with the row L1 without a label) and AF (free
// "Glossário" with the pair E1 "termo"). Here M2 becomes "Button" and the arrow R1 from M1 to M2 is added.
function baseProject(): Project {
  let p = build();
  p = renameMarking(p, 'M2', 'Button');
  p = createArrow(p, { id: 'R1', from: 'M1', to: 'M2', name: 'Flow' });
  return p;
}

const PROPOSALS = [{ id: 'prop-20261106-ab', title: 'Rename the button' }];

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
  thread('c1b2', ['First conversation about the button']),
  thread('c9f0', ['Another conversation']),
];

function ctxOf(
  project: Project = baseProject(),
  threads: readonly Thread[] = THREADS,
  extra: Partial<CitationContext> = {},
): CitationContext {
  return { project, threads, proposals: PROPOSALS, ...extra };
}

/** A reference of any form; the URL folder does not matter (decision 28). */
function refOf(path: string, folder = 'any-folder'): AnyRef {
  const parsed = parseAnyRef(`mapping://${folder}/${path}`);
  if (!parsed) throw new Error(`invalid reference: ${path}`);
  return parsed.ref;
}

const url = (path: string) => `mapping://folder/${path}`;

describe('extractCitations', () => {
  it('returns empty for text without a link', () => {
    expect(extractCitations('just text, nothing else')).toEqual([]);
    expect(extractCitations('')).toEqual([]);
  });

  it('extracts the mapping:// links in order, with label, url and reference', () => {
    const text = `See [Button](${url('m/m2')}) and then [titulo](${url('a/am/f/titulo')}).`;
    const found = extractCitations(text);
    expect(found.map((c) => c.label)).toEqual(['Button', 'titulo']);
    expect(found.map((c) => c.url)).toEqual([url('m/m2'), url('a/am/f/titulo')]);
    expect(found[0]!.ref).toEqual({
      project: 'folder',
      ref: { type: 'item', kind: 'm', code: 'm2' },
    });
    expect(found[1]!.ref?.ref).toEqual({
      type: 'field',
      annotation: 'am',
      key: 'titulo',
    });
  });

  it('ignores a plain link, an anchor and a library link', () => {
    const text = [
      '[site](https://example.com/m/m1)',
      '[anchor](#section)',
      '[Button](mapping://button)',
      '[Button](mapping://spec/button)',
      `[ok](${url('l/ls1')})`,
    ].join(' ');
    expect(extractCitations(text).map((c) => c.label)).toEqual(['ok']);
  });

  it('keeps the mapping:// link that does not fit the grammar, with a null ref', () => {
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

  it('decodes the URL-encoded field', () => {
    const [c] = extractCitations(`[x](${url('a/am/f/Data%20table')})`);
    expect(c!.ref?.ref).toEqual({
      type: 'field',
      annotation: 'am',
      key: 'Data table',
    });
  });

  it('ignores what is in inline code and in a code block', () => {
    const text = [
      `This is not a citation: \`[x](${url('m/m1')})\``,
      '',
      '```',
      `[y](${url('m/m1')})`,
      '```',
      '',
      `This is: [z](${url('m/m1')})`,
    ].join('\n');
    expect(extractCitations(text).map((c) => c.label)).toEqual(['z']);
  });

  it('finds links in a list, quote, heading, table and emphasis', () => {
    const text = [
      `# Heading [h](${url('m/m1')})`,
      '',
      `- item [l](${url('m/m2')})`,
      '',
      `> quoted [q](${url('m/m3')})`,
      '',
      '| a | b |',
      '| - | - |',
      `| [t](${url('i/i1')}) | x |`,
      '',
      `**strong [s](${url('l/ls1')})**`,
    ].join('\n');
    expect(extractCitations(text).map((c) => c.label)).toEqual(['h', 'l', 'q', 't', 's']);
  });

  it('reads the label with escaped [, ] and \\', () => {
    const [c] = extractCitations(`[a\\[1\\] \\\\ b](${url('m/m1')})`);
    expect(c!.label).toBe('a[1] \\ b');
    expect(c!.ref?.ref).toEqual({ type: 'item', kind: 'm', code: 'm1' });
  });
});

describe('escapeCitationLabel / formatCitation', () => {
  it('escapes [, ] and \\', () => {
    expect(escapeCitationLabel('a[b]c\\d')).toBe('a\\[b\\]c\\\\d');
    expect(escapeCitationLabel('nothing here')).toBe('nothing here');
  });

  it('escapes *, _ and backtick: the re-read label does not lose characters', () => {
    for (const label of ['a*b*c', '_x_ and __y__', 'use `code` here', '**bold**']) {
      const [c] = extractCitations(formatCitation(label, url('m/m2')));
      expect(c!.label).toBe(label);
    }
  });

  it('formats [escaped label](url)', () => {
    expect(formatCitation('Button [x]', url('m/m2'))).toBe(
      `[Button \\[x\\]](${url('m/m2')})`,
    );
  });

  it.each([
    'Button',
    'a[1]',
    ']',
    '[',
    '\\',
    '\\]',
    '\\\\[',
    'two [of] three ]]',
    'with (parentheses)',
    'Customer · Buy',
  ])('round-trip with extractCitations: %j', (label) => {
    const text = `before ${formatCitation(label, url('m/m2'))} after`;
    const found = extractCitations(text);
    expect(found).toHaveLength(1);
    expect(found[0]!.label).toBe(label);
    expect(found[0]!.url).toBe(url('m/m2'));
  });

  it('round-trip with several links on the same line', () => {
    const text = `${formatCitation('a]', url('m/m1'))}, ${formatCitation('[b', url('m/m2'))}`;
    expect(extractCitations(text).map((c) => c.label)).toEqual(['a]', '[b']);
  });
});

describe('resolveCitation', () => {
  const ctx = ctxOf();

  const found = (path: string, folder?: string) =>
    resolveCitation(ctx, refOf(path, folder));

  it('marking, arrow, container, annotation and layer', () => {
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

  it('conversation and proposal', () => {
    expect(found('c/c1b2')).toEqual({
      found: true,
      target: { kind: 'thread', id: 'c1b2' },
    });
    expect(found('p/prop-20261106-ab')).toEqual({
      found: true,
      target: { kind: 'proposal', id: 'prop-20261106-ab' },
    });
  });

  it('a proposal resolves only by the exact id, never by prefix (decision 11)', () => {
    const proposals = [{ id: 'buttons-2', title: 'Buttons' }];
    const exact = (path: string) => resolveCitation({ ...ctx, proposals }, refOf(path));
    expect(exact('p/buttons-2')).toEqual({
      found: true,
      target: { kind: 'proposal', id: 'buttons-2' },
    });
    expect(exact('p/buttons')).toEqual({ found: false, reason: 'missing' });
    expect(exact('p/prop2026')).toEqual({ found: false, reason: 'missing' });
  });

  it('a proposal resolves by the short code the MCP emits (8 hex), never by free prefix', () => {
    const proposals = [
      { id: '3f2a9c1e-5b7d-4e21-9a10-0c8d2f6b7a44', title: 'Buttons' },
      { id: 'buttons-2', title: 'Other' },
    ];
    const at = (path: string) => resolveCitation({ ...ctx, proposals }, refOf(path));
    expect(at('p/3f2a9c1e')).toEqual({
      found: true,
      target: { kind: 'proposal', id: '3f2a9c1e-5b7d-4e21-9a10-0c8d2f6b7a44' },
    });
    expect(at('p/3f2a')).toEqual({ found: false, reason: 'missing' });
    expect(at('p/buttons')).toEqual({ found: false, reason: 'missing' });
  });

  it('an annotation field without a type does not come from the prototype', () => {
    const p = ctx.project;
    const untyped: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'AM' ? { ...a, type: { specId: 'none', typeId: 'nothing' } } : a,
      ),
    };
    const at = (path: string) =>
      resolveCitation({ ...ctx, project: untyped }, refOf(path));
    expect(at('a/am/f/constructor')).toEqual({ found: false, reason: 'missing' });
    expect(at('a/am/f/toString')).toEqual({ found: false, reason: 'missing' });
  });

  it('typed field, free annotation pair and table row', () => {
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

  it('ignores the <project> of the URL', () => {
    const a = found('m/m2', 'old-folder');
    const b = found('m/m2', 'any-other-name');
    expect(a).toEqual(b);
    expect(a.found).toBe(true);
  });

  it('accepts the code with the full id or a prefix, in any case', () => {
    expect(found('m/M2')).toEqual({ found: true, target: { kind: 'marking', id: 'M2' } });
  });

  it('nonexistent code: missing target', () => {
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

  it('nonexistent field, pair and row, or of another kind: missing', () => {
    for (const path of [
      'a/am/f/inexistente', // a field the type does not have
      'a/af/f/titulo', // a free annotation has no fields
      'a/af/e/zzz', // nonexistent pair
      'a/am/e/e1', // a typed annotation has no pairs
      'a/am/f/campos/r/zzz', // nonexistent row
      'a/am/f/titulo/r/r1', // titulo is not a table
      'a/am/f/solto/r/r1',
    ]) {
      expect(found(path)).toEqual({ found: false, reason: 'missing' });
    }
  });

  it('ambiguous code: missing target, with the reason', () => {
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

  it('the whole id wins over the prefix of another', () => {
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
  const resolve = (ctx: CitationContext, path: string, fallback = 'fallback') => {
    const res = resolveCitation(ctx, refOf(path));
    return liveLabel(ctx, res, fallback);
  };

  it('marking, arrow and container: the name', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'm/m2')).toEqual({ label: 'Button', broken: false });
    expect(resolve(ctx, 'm/r1')).toEqual({ label: 'Flow', broken: false });
    // The unnamed container shows the file name.
    expect(resolve(ctx, 'i/i1')).toEqual({ label: 'a.png', broken: false });
  });

  it('no name: null label (the interface translates) and not broken', () => {
    expect(resolve(ctxOf(), 'm/m1')).toEqual({ label: null, broken: false });
  });

  it('annotation: the name or the instance label, otherwise the type name', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'a/af').label).toBe('Glossário');
    expect(resolve(ctx, 'a/am').label).toBe('Cliente');
    expect(resolve(ctx, 'a/al').label).toBe('Lista');
    const renamed = ctxOf(renameAnnotation(ctx.project, 'AM', 'Another name'));
    expect(resolve(renamed, 'a/am').label).toBe('Another name');
  });

  it('field: the label from the specialization, otherwise the key', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'a/al/f/alvos')).toEqual({ label: 'Alvos', broken: false });
    expect(resolve(ctx, 'a/am/f/titulo')).toEqual({ label: 'titulo', broken: false });
  });

  it('pair: the key', () => {
    expect(resolve(ctxOf(), 'a/af/e/e1')).toEqual({ label: 'termo', broken: false });
  });

  it('row: the rowLabel column; without rowLabel, the position', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'a/am/f/campos/r/r1').label).toBe('cpf');
    expect(resolve(ctx, 'a/am/f/campos/r/r2').label).toBe('nome');
    expect(resolve(ctx, 'a/al/f/alvos/r/l1').label).toBe('#1');
  });

  it('layer, conversation and proposal', () => {
    const ctx = ctxOf();
    const layer = ctx.project.layers.find((l) => l.spec !== null)!;
    expect(resolve(ctx, `l/${layer.id.toLowerCase()}`).label).toBe(layer.name);
    expect(resolve(ctx, 'p/prop-20261106-ab').label).toBe('Rename the button');
  });

  it('conversation: the injected subject (or the first line, without injection)', () => {
    expect(resolve(ctxOf(), 'c/c1b2').label).toBe('First conversation about the button');
    const ctx = ctxOf(undefined, undefined, { subjectOf: (t) => `subject ${t.id}` });
    expect(resolve(ctx, 'c/c1b2').label).toBe('subject c1b2');
  });

  it('follows the renaming of the target', () => {
    const before = ctxOf();
    const after = ctxOf(renameMarking(before.project, 'M2', 'New button'));
    expect(resolve(before, 'm/m2').label).toBe('Button');
    expect(resolve(after, 'm/m2').label).toBe('New button');
  });

  it('missing target: the fallback label, broken', () => {
    const ctx = ctxOf();
    expect(resolve(ctx, 'm/zzz', 'Old button')).toEqual({
      label: 'Old button',
      broken: true,
    });
    expect(resolve(ctx, 'a/am/f/inexistente', 'old field')).toEqual({
      label: 'old field',
      broken: true,
    });
  });
});

describe('liveCitation', () => {
  it('joins the resolution and the label of an extracted citation', () => {
    const ctx = ctxOf();
    const [ok, gone, bad] = extractCitations(
      [
        `[Stale button](${url('m/m2')})`,
        `[Deleted](${url('m/zzz')})`,
        `[Crooked](${url('m/m1/extra')})`,
      ].join(' '),
    ).map((c) => liveCitation(ctx, c));
    expect(ok).toMatchObject({ label: 'Button', broken: false });
    expect(ok!.resolution).toEqual({
      found: true,
      target: { kind: 'marking', id: 'M2' },
    });
    expect(gone).toMatchObject({ label: 'Deleted', broken: true });
    expect(bad).toMatchObject({ label: 'Crooked', broken: true });
    expect(bad!.resolution).toEqual({ found: false, reason: 'invalid' });
  });
});

describe('backlinks', () => {
  const A = thread('aaaa1111', ['no citation']);
  const B = thread('bbbb2222', [
    `See [A](${url('c/aaaa1111')}) and again [A](${url('c/aaaa1111')})`,
  ]);
  const C = thread('cccc3333', [
    `Myself [C](${url('c/cccc3333')}), another [A](${url('c/aaaa')}) and [B](${url('c/bbbb2222')})`,
    `Second message cites [A](${url('c/aaaa1111')})`,
  ]);
  const D = thread(
    'dddd4444',
    [`Resolved cites [A](${url('c/aaaa1111')}) and [item](${url('m/m1')})`],
    { resolved: { by: { name: 'Marina Alves', email: 'marina@example.com' }, at: T0 } },
  );

  it('map conversation → conversations that cite it, without duplicates or self-citation', () => {
    const map = backlinks([A, B, C, D]);
    expect(map.get('aaaa1111')).toEqual(['bbbb2222', 'cccc3333', 'dddd4444']);
    expect(map.get('bbbb2222')).toEqual(['cccc3333']);
    expect(map.has('cccc3333')).toBe(false);
    expect(map.has('dddd4444')).toBe(false);
  });

  it('ignores a broken citation and a reference to another kind', () => {
    const X = thread('xxxx5555', [
      `[gone](${url('c/does-not-exist')}) [m](${url('m/m1')}) [p](${url('p/xyz')})`,
    ]);
    expect(backlinks([A, X]).size).toBe(0);
  });

  it('a citation with an ambiguous code does not become a backlink', () => {
    const ambiguous = thread('tt-aa', ['x']);
    const other = thread('tt-ab', ['y']);
    const cites = thread('zzzz', [`[?](${url('c/tt')})`]);
    expect(backlinks([ambiguous, other, cites]).size).toBe(0);
  });

  it('empty list', () => {
    expect(backlinks([]).size).toBe(0);
  });
});

describe('citedTargets / citationTargetKey', () => {
  it('cited targets, found and without repetition, in text order', () => {
    const ctx = ctxOf();
    const t = thread('c1b2', [
      `See [Button](${url('m/m2')}) and [titulo](${url('a/am/f/titulo')})`,
      `Again [Button](${url('m/m2')}), [row](${url('a/am/f/campos/r/r1')}) and [c](${url('c/c9f0')})`,
      `Broken [x](${url('m/zzz')}), library [Button](mapping://button), https [s](https://a.com) and [p](${url('p/prop-20261106-ab')})`,
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

  it('conversation without a citation: empty', () => {
    expect(citedTargets(thread('c1b2', ['nothing']), ctxOf())).toEqual([]);
  });

  it('the key identifies the target', () => {
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
