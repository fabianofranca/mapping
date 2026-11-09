import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { humanReplies, seedThread } from './threadSupport';
import { createWorkspace } from './workspace';
import type { Workspace } from './workspace';

// Fase 5 do CR do MCP (#1050), em processo: a ordem das leituras de `wait_for_comment` (19), a
// resposta de `post_message`/`propose_changes` quando o projeto não pode ser relido depois de
// gravar (20), o filtro de `list_threads` (21), `invalid-proposal` (22) e o cancelamento (24).

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

describe('wait_for_comment: a ordem das leituras (19)', () => {
  it('uma mensagem gravada logo depois da leitura do baseline é devolvida na mesma espera', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [
        { by: 'human', text: 'Pergunta' },
        { by: 'agent', text: 'Resposta' },
      ],
    });
    hook.afterBaseline = () => humanReplies(dir(), t.id, 'Chegou no meio', 200);
    const result = (await threads.wait({ project: 'cadastro', timeoutSeconds: 4 })) as {
      changed: boolean;
      thread?: { awaiting: string };
    };
    expect(result.changed).toBe(true);
    expect(result.thread?.awaiting).toBe('agent');
  });
});

describe('post_message e propose_changes: o projeto some depois de gravar (20)', () => {
  it('post: a mensagem gravada vem como sucesso com aviso, não como erro', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [{ by: 'human', text: 'Pode responder?' }],
    });
    const mapping = join(dir(), 'mapping.json');
    const original = readFileSync(mapping, 'utf8');
    try {
      // Depois de gravar a resposta, relê o projeto: o arquivo ilegível faz o `buildEnv` falhar.
      writeFileSync(mapping, '{ não é json');
      const posted = (await threads.post({
        ref: t.id,
        text: 'Sim',
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

describe('list_threads: text ou anchor sem status/awaiting (21)', () => {
  it('lista as abertas de qualquer awaiting, não só as que aguardam o agente', async () => {
    seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [
        { by: 'human', text: 'Pergunta sobre zebrinha' },
        { by: 'agent', text: 'Respondi' },
      ],
    });
    const byText = (await threads.list({ project: 'cadastro', text: 'zebrinha' })) as {
      threads: { ref: string }[];
    };
    expect(byText.threads).toHaveLength(1);
    const inbox = (await threads.list({ project: 'cadastro' })) as {
      threads: { ref: string }[];
    };
    expect(inbox.threads.map((r) => r.ref)).not.toContain(byText.threads[0]!.ref);
  });
});

describe('proposta ilegível (22)', () => {
  it('dá invalid-proposal, não proposal-not-found', async () => {
    const proposalId = randomUUID();
    mkdirSync(join(dir(), 'proposals', proposalId), { recursive: true });
    writeFileSync(join(dir(), 'proposals', proposalId, 'proposal.json'), '{ quebrado');
    const byId = await failure(() => resolveProposal(roots, proposalId, 'cadastro'));
    expect(byId.code).toBe('invalid-proposal');
    const byPrefix = await failure(() =>
      resolveProposal(roots, `p/${proposalId.slice(0, 8)}`, 'cadastro'),
    );
    expect(byPrefix.code).toBe('invalid-proposal');
  });
});

describe('wait_for_comment cancelada (24)', () => {
  it('sai com o código cancelled', async () => {
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
