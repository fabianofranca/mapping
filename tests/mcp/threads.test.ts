import {
  existsSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { threadFilePath } from '../../src/model';
import {
  HUMAN,
  commentFiles,
  humanReplies,
  humanResolves,
  readThread,
  resolvedFiles,
  seedThread,
  sha,
} from './threadSupport';
import { errorOf, ok } from './proposalSupport';
import { codeOf, createWorkspace, connect } from './workspace';
import type { Connection, Workspace } from './workspace';

// Conversations through dist-mcp/mapping-mcp.js, over stdio (Comments stage, CM6): the
// inbox, reading, opening, replying with the `after` guard, authorship and what the server never
// does (resolve, write to `comments/resolved/`, change `mapping.json`).

let ws: Workspace;
let mcp: Connection;
let hooks: string;
let hooked: Connection;
const dir = () => ws.projectDir('apps/cadastro');
const mapping = () => join(dir(), 'mapping.json');
const ref = (letter: string, id: string) => `mapping://cadastro/${letter}/${codeOf(id)}`;
const threadRef = (id: string) => ref('c', id);

interface Cite {
  kind: string;
  ref: string | null;
  path: string | null;
  label: string | null;
  value?: unknown;
  broken: boolean;
}
interface Row {
  ref: string;
  anchor: unknown;
  kind: string;
  path: string | null;
  orphan: boolean;
  status: string;
  awaiting: string | null;
  messages: number;
  last: {
    id: string;
    author: { kind: string; name: string; email: string | null };
    at: string;
    text: string;
    cites: Cite[];
  };
}
interface Listed {
  total: number;
  offset: number;
  threads: Row[];
  broken?: { id: string; error: string }[];
}
interface Got {
  ref: string;
  id: string;
  status: string;
  awaiting: string | null;
  revision: number;
  anchor: {
    ref?: string;
    point?: { container: string | null; x: number; y: number };
    kind: string;
    path: string | null;
    name?: string | null;
    value?: unknown;
    orphan: boolean;
  };
  messages: {
    id: string;
    author: { kind: string; name: string; email: string | null };
    text: string;
    proposal: string | null;
    cites: Cite[];
  }[];
  citedIn: { ref: string }[];
  proposals: { ref: string; title: string; status: string }[];
}

beforeAll(async () => {
  ws = createWorkspace();
  hooks = join(ws.base, 'hooks.json');
  mcp = await connect([ws.root]);
  hooked = await connect([ws.root], { fsHooks: hooks });
});

afterAll(async () => {
  await mcp?.close();
  await hooked?.close();
});

const id = (name: string): string => ws.ids[name] as string;

describe('list_threads', () => {
  it('the default is the open ones awaiting the agent', async () => {
    const a = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'What is the **variant**?' }],
    });
    const b = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [
        { by: 'human', text: 'Question' },
        { by: 'agent', text: 'Answer' },
      ],
    });
    const c = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Already resolved' }],
      resolved: true,
    });
    const listed = ok(await mcp.call<Listed>('list_threads', { project: 'cadastro' }));
    const refs = listed.threads.map((t) => t.ref);
    expect(refs).toContain(threadRef(a.id));
    expect(refs).not.toContain(threadRef(b.id));
    expect(refs).not.toContain(threadRef(c.id));
    const row = listed.threads.find((t) => t.ref === threadRef(a.id))!;
    expect(row).toMatchObject({
      anchor: ref('m', id('MF')),
      kind: 'marking',
      orphan: false,
      status: 'open',
      awaiting: 'agent',
      messages: 1,
    });
    expect(row.path).toContain('Formulário');
    expect(row.last).toMatchObject({ text: 'What is the **variant**?', cites: [] });
    expect(row.last.author).toEqual({
      kind: 'human',
      name: HUMAN.name,
      email: HUMAN.email,
    });
  });

  it('filters: status, awaiting, anchor and text; without an awaiting filter and with a given status it returns all', async () => {
    const resolved = ok(
      await mcp.call<Listed>('list_threads', { project: 'cadastro', status: 'resolved' }),
    );
    expect(resolved.threads.every((t) => t.status === 'resolved')).toBe(true);
    expect(resolved.threads.length).toBeGreaterThan(0);

    const human = ok(
      await mcp.call<Listed>('list_threads', { project: 'cadastro', awaiting: 'human' }),
    );
    expect(human.threads.length).toBeGreaterThan(0);
    expect(human.threads.every((t) => t.awaiting === 'human')).toBe(true);

    const all = ok(
      await mcp.call<Listed>('list_threads', { project: 'cadastro', status: 'all' }),
    );
    expect(all.threads.map((t) => t.status)).toContain('resolved');

    const anchored = ok(
      await mcp.call<Listed>('list_threads', {
        project: 'cadastro',
        status: 'all',
        anchor: ref('m', id('MN')),
      }),
    );
    expect(anchored.threads.map((t) => t.anchor)).toEqual([ref('m', id('MN'))]);

    const text = ok(
      await mcp.call<Listed>('list_threads', {
        project: 'cadastro',
        status: 'all',
        text: 'VARIANT',
      }),
    );
    expect(text.threads).toHaveLength(1);
    expect(text.threads[0]!.last.text).toContain('variant');
  });

  it('paginates with limit and offset and reports the total', async () => {
    const page1 = ok(
      await mcp.call<Listed>('list_threads', {
        project: 'cadastro',
        status: 'all',
        limit: 1,
      }),
    );
    expect(page1.threads).toHaveLength(1);
    expect(page1.total).toBeGreaterThanOrEqual(3);
    const page2 = ok(
      await mcp.call<Listed>('list_threads', {
        project: 'cadastro',
        status: 'all',
        limit: 1,
        offset: 1,
      }),
    );
    expect(page2.threads).toHaveLength(1);
    expect(page2.threads[0]!.ref).not.toBe(page1.threads[0]!.ref);
    expect(page2.offset).toBe(1);
  });

  it('the orphan stays listed, without an anchor reference', async () => {
    const orphan = seedThread(dir(), {
      anchor: { kind: 'marking', id: 'e0e0e0e0-0000-4000-8000-000000000000' },
      messages: [{ by: 'human', text: 'Item that vanished' }],
    });
    const listed = ok(await mcp.call<Listed>('list_threads', { project: 'cadastro' }));
    const row = listed.threads.find((t) => t.ref === threadRef(orphan.id))!;
    expect(row.orphan).toBe(true);
    expect(row.anchor).toMatchObject({ kind: 'marking' });
  });

  it('an unreadable file goes to broken, without breaking the list', async () => {
    writeFileSync(join(dir(), 'comments', 'quebrada.json'), '{ not JSON');
    const listed = ok(await mcp.call<Listed>('list_threads', { project: 'cadastro' }));
    expect(listed.broken?.map((b) => b.id)).toContain('quebrada');
    rmSync(join(dir(), 'comments', 'quebrada.json'));
  });

  it('a file that is too large goes to broken, without breaking the list', async () => {
    const big = join(dir(), 'comments', 'grande.json');
    writeFileSync(big, '');
    truncateSync(big, 17 * 1024 * 1024);
    const listed = ok(await mcp.call<Listed>('list_threads', { project: 'cadastro' }));
    const row = listed.broken?.find((b) => b.id === 'grande');
    expect(row?.error).toContain('file-too-large');
    expect(listed.threads.length).toBeGreaterThan(0);
    rmSync(big);
  });

  it('the copies of the same conversation in two folders are merged', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('ME') },
      messages: [
        { by: 'human', text: 'Open copy' },
        { by: 'agent', text: 'Answer' },
      ],
    });
    // An old copy, resolved without the reply, left behind in resolved/.
    const stale = { ...t, messages: [t.messages[0]!], resolved: null };
    const resolved = join(dir(), threadFilePath(t.id, true));
    writeFileSync(resolved, `${JSON.stringify(stale, null, 2)}\n`);
    const got = ok(await mcp.call<Got>('get_thread', { ref: threadRef(t.id) }));
    expect(got.messages.map((m) => m.text)).toEqual(['Open copy', 'Answer']);
    rmSync(resolved);
  });
});

describe('get_thread', () => {
  it('returns the resolved anchor (field with its value), the citations and the citedIn', async () => {
    const target = seedThread(dir(), {
      anchor: { kind: 'field', annotationId: id('AC'), key: 'nome' },
      messages: [{ by: 'human', text: 'Is the class name right?' }],
    });
    const cites = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MC') },
      messages: [
        {
          by: 'human',
          text: `See [the name](${ref('a', id('AC'))}/f/nome), [the conversation](${threadRef(target.id)}) and [vanished](${ref('m', 'f0f0f0f0-0000-4000-8000-000000000000')}).`,
        },
      ],
    });
    const got = ok(await mcp.call<Got>('get_thread', { ref: threadRef(cites.id) }));
    expect(got.anchor).toMatchObject({ ref: ref('m', id('MC')), kind: 'marking' });
    expect(got.status).toBe('open');
    expect(got.awaiting).toBe('agent');
    const [field, thread, gone] = got.messages[0]!.cites;
    expect(field).toMatchObject({
      kind: 'field',
      ref: `${ref('a', id('AC'))}/f/nome`,
      value: 'Contato',
      broken: false,
    });
    expect(thread).toMatchObject({
      kind: 'thread',
      ref: threadRef(target.id),
      broken: false,
    });
    expect(gone).toMatchObject({ broken: true, label: 'vanished' });

    const cited = ok(await mcp.call<Got>('get_thread', { ref: threadRef(target.id) }));
    expect(cited.anchor).toMatchObject({
      ref: `${ref('a', id('AC'))}/f/nome`,
      kind: 'field',
      name: expect.any(String),
      value: 'Contato',
    });
    expect(cited.citedIn.map((c) => c.ref)).toEqual([threadRef(cites.id)]);
  });

  it('returns the proposals linked to the conversation, with their state', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Change the title?' }],
    });
    const proposed = ok(
      await mcp.call<{ proposal: { ref: string; id: string } }>('propose_changes', {
        project: 'cadastro',
        title: 'Change the title',
        thread: threadRef(t.id),
        operations: [
          { op: 'update_marking', marking: ref('m', id('MT')), name: 'Header' },
        ],
      }),
    );
    const got = ok(await mcp.call<Got>('get_thread', { ref: threadRef(t.id) }));
    expect(got.proposals).toEqual([
      expect.objectContaining({
        ref: proposed.proposal.ref,
        title: 'Change the title',
        status: 'open',
      }),
    ]);
    expect(got.messages.at(-1)!.proposal).toBe(proposed.proposal.ref);
  });

  it('thread-not-found and invalid reference', async () => {
    const missing = await mcp.call('get_thread', {
      ref: 'mapping://cadastro/c/deadbeef',
    });
    expect(errorOf(missing).code).toBe('thread-not-found');
    const bad = await mcp.call('get_thread', { ref: 'mapping://cadastro/c/abc/extra' });
    expect(errorOf(bad).code).toBe('invalid-ref');
  });
});

describe('open_thread', () => {
  const open = (anchor: unknown, text = 'Which is the variant?') =>
    mcp.call<{ ref: string; id: string; anchor: unknown; warnings?: { code: string }[] }>(
      'open_thread',
      { project: 'cadastro', anchor, text },
    );

  it.each([
    ['marking', () => ref('m', id('MF')), { kind: 'marking', id: () => id('MF') }],
    ['container', () => ref('i', id('I1')), { kind: 'container', id: () => id('I1') }],
    ['annotation', () => ref('a', id('AU')), { kind: 'annotation', id: () => id('AU') }],
    ['layer', () => ref('l', id('LM')), { kind: 'layer', id: () => id('LM') }],
  ])('anchor on %s', async (_name, anchor, expected) => {
    const result = ok(await open(anchor()));
    const stored = readThread(dir(), result.id);
    expect(stored.anchor).toEqual({ kind: expected.kind, id: expected.id() });
    expect(stored.messages).toHaveLength(1);
    expect(result.ref).toBe(threadRef(result.id));
  });

  it('anchor on field, pair and row', async () => {
    const field = ok(await open(`${ref('a', id('AC'))}/f/nome`));
    expect(readThread(dir(), field.id).anchor).toEqual({
      kind: 'field',
      annotationId: id('AC'),
      key: 'nome',
    });
    const entry = ok(await open(`${ref('a', id('AU'))}/e/${codeOf(id('EN'))}`));
    expect(readThread(dir(), entry.id).anchor).toEqual({
      kind: 'entry',
      annotationId: id('AU'),
      entryId: id('EN'),
    });
    const row = ok(await open(`${ref('a', id('AC'))}/f/atributos/r/${codeOf(id('R1'))}`));
    expect(readThread(dir(), row.id).anchor).toEqual({
      kind: 'row',
      annotationId: id('AC'),
      key: 'atributos',
      rowId: id('R1'),
    });
  });

  it('a loose point, in the container and on the canvas', async () => {
    const inside = ok(
      await open({ point: { container: ref('i', id('I1')), x: 120, y: 340 } }),
    );
    expect(readThread(dir(), inside.id).anchor).toEqual({
      kind: 'point',
      containerId: id('I1'),
      x: 120,
      y: 340,
    });
    const canvas = ok(await open({ point: { container: null, x: -10, y: 5 } }));
    expect(readThread(dir(), canvas.id).anchor).toEqual({
      kind: 'point',
      containerId: null,
      x: -10,
      y: 5,
    });
  });

  it("the first message is the agent's: kind agent, null email, the client's name", async () => {
    const result = ok(await open(ref('m', id('MF')), 'Agent question'));
    const stored = readThread(dir(), result.id);
    expect(stored.messages[0]!.author).toEqual({
      kind: 'agent',
      name: 'teste',
      email: null,
    });
    expect(stored.resolved).toBeNull();
    expect(stored.revision).toBe(0);
    const named = ok(
      await mcp.call<{ id: string }>('open_thread', {
        project: 'cadastro',
        anchor: ref('m', id('MF')),
        text: 'With a name',
        author: 'AI reviewer',
      }),
    );
    expect(readThread(dir(), named.id).messages[0]!.author.name).toBe('AI reviewer');
  });

  it('invalid-anchor and anchor-not-found; nothing is written', async () => {
    const before = commentFiles(dir());
    for (const bad of [
      'any text',
      ref('p', 'abcdef01-0000-4000-8000-000000000000'),
      { point: { container: null, x: 'a', y: 1 } },
      { point: { container: ref('m', id('MF')), x: 1, y: 1 } },
      `${ref('a', id('AC'))}/f/nome/extra`,
    ]) {
      expect(errorOf(await open(bad)).code, JSON.stringify(bad)).toBe('invalid-anchor');
    }
    for (const missing of [
      ref('m', 'abcdef12-0000-4000-8000-000000000000'),
      `${ref('a', id('AC'))}/f/campoQueNaoExiste`,
      `${ref('a', id('AU'))}/e/00000000`,
      {
        point: {
          container: ref('i', 'abcdef12-0000-4000-8000-000000000000'),
          x: 1,
          y: 1,
        },
      },
    ]) {
      expect(errorOf(await open(missing)).code, JSON.stringify(missing)).toBe(
        'anchor-not-found',
      );
    }
    expect(commentFiles(dir())).toEqual(before);
  });

  it('empty-message and message-too-long', async () => {
    expect(errorOf(await open(ref('m', id('MF')), '   ')).code).toBe('empty-message');
    expect(errorOf(await open(ref('m', id('MF')), 'x'.repeat(10001))).code).toBe(
      'message-too-long',
    );
  });

  it('a citation that does not resolve is written anyway, with a broken-cite warning', async () => {
    const result = ok(
      await open(
        ref('m', id('MF')),
        `See [what vanished](${ref('m', 'abcdef12-0000-4000-8000-000000000000')}).`,
      ),
    );
    expect(result.warnings?.map((w) => w.code)).toEqual(['broken-cite']);
    expect(readThread(dir(), result.id).messages[0]!.text).toContain('what vanished');
  });

  it('never overwrites: the new file fails if the id already exists', async () => {
    const result = ok(await open(ref('m', id('MF'))));
    const before = readFileSync(join(dir(), threadFilePath(result.id, false)), 'utf8');
    // A second open_thread generates another id and does not touch the first file.
    ok(await open(ref('m', id('MF'))));
    expect(readFileSync(join(dir(), threadFilePath(result.id, false)), 'utf8')).toBe(
      before,
    );
  });
});

describe('post_message', () => {
  const post = (args: Record<string, unknown>) =>
    mcp.call<Record<string, unknown>>('post_message', args);
  const lastId = (id: string) => readThread(dir(), id).messages.at(-1)!.id;

  it('replies with the after guard and writes revision + 1', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'Which is the variant?' }],
    });
    const result = ok(
      await post({ ref: threadRef(t.id), text: 'A **primary**.', after: lastId(t.id) }),
    );
    expect(result).toMatchObject({ ref: threadRef(t.id), awaiting: 'human' });
    const stored = readThread(dir(), t.id);
    expect(stored.revision).toBe(t.revision + 1);
    expect(stored.messages).toHaveLength(2);
    expect(stored.messages[1]).toMatchObject({
      text: 'A **primary**.',
      proposal: null,
      author: { kind: 'agent', name: 'teste', email: null },
    });
    expect(commentFiles(dir())).toContain(`${t.id}.json`);
    expect(resolvedFiles(dir())).not.toContain(`${t.id}.json`);
  });

  it('stale-thread: writes nothing and returns the new messages', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [{ by: 'human', text: 'First' }],
    });
    const seen = lastId(t.id);
    humanReplies(dir(), t.id, 'Second, after you read', 30);
    const path = join(dir(), threadFilePath(t.id, false));
    const before = sha(path);
    const failure = errorOf(
      await post({ ref: threadRef(t.id), text: 'Answer', after: seen }),
    );
    expect(failure.code).toBe('stale-thread');
    expect(failure.newMessages).toEqual([
      expect.objectContaining({ text: 'Second, after you read' }),
    ]);
    expect(sha(path)).toBe(before);
  });

  it('an unknown after is also stale-thread, with all the messages', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [{ by: 'human', text: 'Only one' }],
    });
    const failure = errorOf(
      await post({ ref: threadRef(t.id), text: 'Hi', after: 'does-not-exist' }),
    );
    expect(failure.code).toBe('stale-thread');
    expect((failure.newMessages as unknown[]).length).toBe(1);
  });

  it('thread-resolved: refuses, with the hint to open another conversation that cites this one', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MI') },
      messages: [{ by: 'human', text: 'Already resolved' }],
      resolved: true,
    });
    const path = join(dir(), threadFilePath(t.id, true));
    const before = sha(path);
    const failure = errorOf(
      await post({ ref: threadRef(t.id), text: 'Hi', after: lastId(t.id) }),
    );
    expect(failure.code).toBe('thread-resolved');
    expect(String(failure.hint)).toContain('open_thread');
    expect(sha(path)).toBe(before);
    expect(commentFiles(dir())).not.toContain(`${t.id}.json`);
  });

  it('empty-message and message-too-long; thread-not-found', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MI') },
      messages: [{ by: 'human', text: 'Hi' }],
    });
    const after = lastId(t.id);
    expect(errorOf(await post({ ref: threadRef(t.id), text: ' \n', after })).code).toBe(
      'empty-message',
    );
    expect(
      errorOf(await post({ ref: threadRef(t.id), text: 'x'.repeat(10001), after })).code,
    ).toBe('message-too-long');
    expect(
      errorOf(await post({ ref: 'mapping://cadastro/c/deadbeef', text: 'Hi', after }))
        .code,
    ).toBe('thread-not-found');
  });

  it('the name comes from the author argument; kind is always agent, null email', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MI') },
      messages: [{ by: 'human', text: 'Hi' }],
    });
    ok(
      await post({
        ref: threadRef(t.id),
        text: 'Answer',
        after: lastId(t.id),
        author: 'AI reviewer',
      }),
    );
    expect(readThread(dir(), t.id).messages[1]!.author).toEqual({
      kind: 'agent',
      name: 'AI reviewer',
      email: null,
    });
  });

  it('the reply time is never before the last message', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MI') },
      start: 60 * 24 * 365 * 5,
      messages: [{ by: 'human', text: 'In the future' }],
    });
    ok(await post({ ref: threadRef(t.id), text: 'Answer', after: lastId(t.id) }));
    const messages = readThread(dir(), t.id).messages;
    expect(messages.map((m) => m.author.kind)).toEqual(['human', 'agent']);
    expect(Date.parse(messages[1]!.at)).toBeGreaterThan(Date.parse(messages[0]!.at));
  });

  describe('the app writing midway', () => {
    it("rereads and redoes over the on-disk version: the person's new message becomes stale-thread", async () => {
      const t = seedThread(dir(), {
        anchor: { kind: 'marking', id: id('MI') },
        messages: [{ by: 'human', text: 'Hi' }],
      });
      const after = lastId(t.id);
      const path = join(dir(), threadFilePath(t.id, false));
      // Copy of the file with one more message from a person, which "the app" writes after the 1st read.
      const newer = join(ws.base, 'newer.json');
      const keep = readFileSync(path);
      humanReplies(dir(), t.id, 'I wrote while you were replying', 40);
      copyFileSync(path, newer);
      writeFileSync(path, keep);
      writeFileSync(
        hooks,
        JSON.stringify({
          afterRead: [{ match: `${t.id}.json`, nth: 1, copy: { from: newer, to: path } }],
        }),
      );
      try {
        const failure = errorOf(
          await hooked.call('post_message', {
            ref: threadRef(t.id),
            text: 'Answer',
            after,
          }),
        );
        expect(failure.code).toBe('stale-thread');
        expect(readThread(dir(), t.id).messages.map((m) => m.author.kind)).toEqual([
          'human',
          'human',
        ]);
      } finally {
        rmSync(hooks, { force: true });
      }
    });

    it('a change that does not alter the guard is redone and written', async () => {
      const t = seedThread(dir(), {
        anchor: { kind: 'marking', id: id('MI') },
        messages: [{ by: 'human', text: 'Hi' }],
      });
      const path = join(dir(), threadFilePath(t.id, false));
      writeFileSync(
        hooks,
        JSON.stringify({
          afterRead: [
            { match: `${t.id}.json`, nth: 1, append: { file: path, text: '\n' } },
          ],
        }),
      );
      try {
        ok(
          await hooked.call('post_message', {
            ref: threadRef(t.id),
            text: 'Answer',
            after: lastId(t.id),
          }),
        );
        expect(readThread(dir(), t.id).messages).toHaveLength(2);
      } finally {
        rmSync(hooks, { force: true });
      }
    });

    it('revision-conflict after the attempts, without writing', async () => {
      const t = seedThread(dir(), {
        anchor: { kind: 'marking', id: id('MI') },
        messages: [{ by: 'human', text: 'Hi' }],
      });
      const path = join(dir(), threadFilePath(t.id, false));
      writeFileSync(
        hooks,
        JSON.stringify({
          afterRead: [{ match: `${t.id}.json`, append: { file: path, text: '\n' } }],
        }),
      );
      try {
        const failure = errorOf(
          await hooked.call('post_message', {
            ref: threadRef(t.id),
            text: 'Answer',
            after: lastId(t.id),
          }),
        );
        expect(failure.code).toBe('revision-conflict');
        expect(readThread(dir(), t.id).messages).toHaveLength(1);
      } finally {
        rmSync(hooks, { force: true });
      }
    });
  });
});

describe('what the server never does', () => {
  it('the conversation tools do not change mapping.json nor write to comments/resolved/', async () => {
    const before = sha(mapping());
    const resolvedBefore = resolvedFiles(dir());
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'Hash' }],
    });
    ok(await mcp.call('list_threads', { project: 'cadastro', status: 'all' }));
    ok(await mcp.call('get_thread', { ref: threadRef(t.id) }));
    ok(
      await mcp.call('open_thread', {
        project: 'cadastro',
        anchor: ref('m', id('MF')),
        text: 'New',
      }),
    );
    ok(
      await mcp.call('post_message', {
        ref: threadRef(t.id),
        text: 'Answer',
        after: readThread(dir(), t.id).messages.at(-1)!.id,
      }),
    );
    expect(sha(mapping())).toBe(before);
    expect(resolvedFiles(dir())).toEqual(resolvedBefore);
  });

  it('there is no tool to resolve, reopen or delete a conversation', async () => {
    const { tools } = await mcp.client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_threads',
        'get_thread',
        'open_thread',
        'post_message',
      ]),
    );
    expect(names.filter((n) => /resolve_thread|reopen|delete_thread/.test(n))).toEqual(
      [],
    );
  });

  it('a conversation resolved by the app stays resolved after a read', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'I will resolve it' }],
    });
    humanResolves(dir(), t.id, 50);
    const got = ok(await mcp.call<Got>('get_thread', { ref: threadRef(t.id) }));
    expect(got.status).toBe('resolved');
    expect(got.awaiting).toBeNull();
    expect(existsSync(join(dir(), threadFilePath(t.id, true)))).toBe(true);
  });
});
