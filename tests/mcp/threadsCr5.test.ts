import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { humanReplies, seedThread } from './threadSupport';
import { createWorkspace } from './workspace';
import type { Workspace } from './workspace';

// Phase 5 of the MCP CR (#1050), in-process: the order of `wait_for_comment` reads (19), the
// reply of `post_message`/`propose_changes` when the project cannot be reread after
// writing (20), the `list_threads` filter (21), `invalid-proposal` (22) and cancellation (24).

const hook = vi.hoisted(() => ({ afterBaseline: null as null | (() => void) }));

vi.mock('../../mcp/threadStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../mcp/threadStore')>();
  return {
    ...actual,
    listStoredThreads: (async (...args: Parameters<typeof actual.listStoredThreads>) => {
      const result = await actual.listStoredThreads(...args);
      const run = hook.afterBaseline;
      hook.afterBaseline = null;
      run?.();
      return result;
    }) as typeof actual.listStoredThreads,
  };
});

const { Threads } = await import('../../mcp/threads');
const { Roots } = await import('../../mcp/paths');
const { ToolError } = await import('../../mcp/errors');
const { resolveProposal } = await import('../../mcp/proposalRefs');

let ws: Workspace;
let threads: InstanceType<typeof Threads>;
let roots: InstanceType<typeof Roots>;
const dir = () => ws.projectDir('apps/cadastro');
const id = (name: string): string => ws.ids[name] as string;

beforeAll(() => {
  ws = createWorkspace();
  roots = new Roots([ws.root], ws.root);
  threads = new Threads(roots);
});
afterAll(() => {
  hook.afterBaseline = null;
});

async function failure(
  run: () => Promise<unknown>,
): Promise<InstanceType<typeof ToolError>> {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ToolError);
  return error as InstanceType<typeof ToolError>;
}

describe('wait_for_comment: the order of the reads (19)', () => {
  it('a message written right after the baseline read is returned in the same wait', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [
        { by: 'human', text: 'Question' },
        { by: 'agent', text: 'Answer' },
      ],
    });
    hook.afterBaseline = () => humanReplies(dir(), t.id, 'Arrived midway', 200);
    const result = (await threads.wait({ project: 'cadastro', timeoutSeconds: 4 })) as {
      changed: boolean;
      thread?: { awaiting: string };
    };
    expect(result.changed).toBe(true);
    expect(result.thread?.awaiting).toBe('agent');
  });
});

describe('post_message and propose_changes: the project disappears after writing (20)', () => {
  it('post: the written message comes back as success with a warning, not as an error', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [{ by: 'human', text: 'Can you reply?' }],
    });
    const mapping = join(dir(), 'mapping.json');
    const original = readFileSync(mapping, 'utf8');
    try {
      // After writing the reply, it rereads the project: the unreadable file makes `buildEnv` fail.
      writeFileSync(mapping, '{ not json');
      const posted = (await threads.post({
        ref: t.id,
        text: 'Yes',
        after: t.messages[t.messages.length - 1]!.id,
        project: 'cadastro',
      })) as {
        posted: boolean;
        warnings?: { code: string }[];
        message: { id: string };
      };
      expect(posted.posted).toBe(true);
      expect(posted.message.id).toBeTruthy();
      expect(posted.warnings?.map((w) => w.code)).toContain('reply-incomplete');
    } finally {
      writeFileSync(mapping, original);
    }
  });
});

describe('list_threads: text or anchor without status/awaiting (21)', () => {
  it('lists the open ones of any awaiting, not only those awaiting the agent', async () => {
    seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [
        { by: 'human', text: 'Question about zebra' },
        { by: 'agent', text: 'Answered' },
      ],
    });
    const byText = (await threads.list({ project: 'cadastro', text: 'zebra' })) as {
      threads: { ref: string }[];
    };
    expect(byText.threads).toHaveLength(1);
    const inbox = (await threads.list({ project: 'cadastro' })) as {
      threads: { ref: string }[];
    };
    expect(inbox.threads.map((r) => r.ref)).not.toContain(byText.threads[0]!.ref);
  });
});

describe('unreadable proposal (22)', () => {
  it('gives invalid-proposal, not proposal-not-found', async () => {
    const proposalId = randomUUID();
    mkdirSync(join(dir(), 'proposals', proposalId), { recursive: true });
    writeFileSync(join(dir(), 'proposals', proposalId, 'proposal.json'), '{ broken');
    const byId = await failure(() => resolveProposal(roots, proposalId, 'cadastro'));
    expect(byId.code).toBe('invalid-proposal');
    const byPrefix = await failure(() =>
      resolveProposal(roots, `p/${proposalId.slice(0, 8)}`, 'cadastro'),
    );
    expect(byPrefix.code).toBe('invalid-proposal');
  });
});

describe('wait_for_comment cancelled (24)', () => {
  it('exits with the cancelled code', async () => {
    const controller = new AbortController();
    const waiting = failure(() =>
      threads.wait(
        { project: 'cadastro', timeoutSeconds: 20 },
        { signal: controller.signal },
      ),
    );
    setTimeout(() => controller.abort(), 200);
    expect((await waiting).code).toBe('cancelled');
  });
});
