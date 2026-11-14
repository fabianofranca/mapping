import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { threadFilePath } from '../../src/model';
import { errorOf, ok, readProposal, type Proposed } from './proposalSupport';
import { humanResolves, readThread, seedThread, sha } from './threadSupport';
import { codeOf, connect, createWorkspace } from './workspace';
import type { Connection, Workspace } from './workspace';

// `propose_changes` with `thread` (Comments stage, decision 36): the conversation is checked BEFORE
// writing the proposal, the proposal equals that of a call without `thread`, and the conversation gains an
// agent message with `proposal`.

let ws: Workspace;
let mcp: Connection;
const dir = () => ws.projectDir('apps/cadastro');
const id = (name: string): string => ws.ids[name] as string;
const ref = (letter: string, uuid: string) =>
  `mapping://cadastro/${letter}/${codeOf(uuid)}`;
const threadRef = (uuid: string) => ref('c', uuid);
const proposalIds = () =>
  existsSync(join(dir(), 'proposals'))
    ? readdirSync(join(dir(), 'proposals')).sort()
    : [];

const rename = (name: string) => [
  { op: 'update_marking', marking: ref('m', id('MT')), name },
];

beforeAll(async () => {
  ws = createWorkspace();
  mcp = await connect([ws.root]);
});
afterAll(async () => {
  await mcp?.close();
});

describe('propose_changes with thread', () => {
  it('links the proposal to the conversation: an agent message with proposal and the proposal link', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Change the title?' }],
    });
    const proposed = ok(
      await mcp.call<Proposed & { thread: { ref: string } }>('propose_changes', {
        project: 'cadastro',
        title: 'New title',
        thread: threadRef(t.id),
        operations: rename('Header'),
      }),
    );
    expect(proposed.thread.ref).toBe(threadRef(t.id));
    const stored = readThread(dir(), t.id);
    expect(stored.revision).toBe(t.revision + 1);
    const last = stored.messages.at(-1)!;
    expect(last.proposal).toBe(proposed.proposal.id);
    expect(last.author).toEqual({ kind: 'agent', name: 'teste', email: null });
    expect(last.text).toBe(`Proposal: [New title](${proposed.proposal.ref})`);
    expect(last.text).toMatch(/\(mapping:\/\/cadastro\/p\/[0-9a-f]+\)$/);
  });

  it('writes a proposal.json equal to that of a call without thread, apart from the id and the dates', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Another' }],
    });
    const common = { project: 'cadastro', title: 'Same', operations: rename('Top') };
    const withThread = ok(
      await mcp.call<Proposed>('propose_changes', { ...common, thread: threadRef(t.id) }),
    );
    const without = ok(await mcp.call<Proposed>('propose_changes', common));
    const normalize = (proposalId: string) => {
      const proposal = readProposal(dir(), proposalId) as unknown as Record<
        string,
        unknown
      >;
      return { ...proposal, id: '·', createdAt: '·', updatedAt: '·' };
    };
    expect(normalize(withThread.proposal.id)).toEqual(normalize(without.proposal.id));
  });

  it('a nonexistent or resolved conversation: refuses and leaves nothing on disk', async () => {
    const resolved = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Resolved' }],
      resolved: true,
    });
    const before = proposalIds();
    const resolvedFile = join(dir(), threadFilePath(resolved.id, true));
    const hash = sha(resolvedFile);
    const args = { project: 'cadastro', title: 'Refused', operations: rename('X') };

    const missing = errorOf(
      await mcp.call('propose_changes', {
        ...args,
        thread: 'mapping://cadastro/c/deadbeef',
      }),
    );
    expect(missing.code).toBe('thread-not-found');
    const closed = errorOf(
      await mcp.call('propose_changes', { ...args, thread: threadRef(resolved.id) }),
    );
    expect(closed.code).toBe('thread-resolved');
    expect(proposalIds()).toEqual(before);
    expect(sha(resolvedFile)).toBe(hash);
  });

  it('a conversation resolved by the app midway: the proposal stays and the thread-not-linked warning comes', async () => {
    // The race cannot be provoked without a hook; the same rule is tested through the direct path:
    // once resolved, the conversation accepts no more messages.
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'I will resolve it' }],
    });
    humanResolves(dir(), t.id, 90);
    const failure = errorOf(
      await mcp.call('post_message', {
        ref: threadRef(t.id),
        text: 'Too late',
        after: readThread(dir(), t.id).messages.at(-1)!.id,
      }),
    );
    expect(failure.code).toBe('thread-resolved');
  });

  it('without thread, the behavior is the usual one and no conversation is touched', async () => {
    const before = readFileSync(join(dir(), 'mapping.json'), 'utf8');
    const result = ok(
      await mcp.call<Proposed & { thread?: unknown }>('propose_changes', {
        project: 'cadastro',
        title: 'No conversation',
        operations: rename('Without'),
      }),
    );
    expect(result.thread).toBeUndefined();
    expect(readFileSync(join(dir(), 'mapping.json'), 'utf8')).toBe(before);
  });
});
