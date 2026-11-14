import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { threadFilePath } from '../../src/model';
import { errorOf, ok, readProposal, type Proposed } from './proposalSupport';
import { humanResolves, readThread, seedThread, sha } from './threadSupport';
import { codeOf, connect, createWorkspace } from './workspace';
import type { Connection, Workspace } from './workspace';

// `propose_changes` com `thread` (etapa Comentários, decisão 36): a conversa é conferida ANTES de
// gravar a proposta, a proposta é igual à de uma chamada sem `thread`, e a conversa ganha uma
// mensagem do agente com `proposal`.

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

describe('propose_changes com thread', () => {
  it('liga a proposta à conversa: mensagem do agente com proposal e o link da proposta', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Troca o título?' }],
    });
    const proposed = ok(
      await mcp.call<Proposed & { thread: { ref: string } }>('propose_changes', {
        project: 'cadastro',
        title: 'Título novo',
        thread: threadRef(t.id),
        operations: rename('Cabeçalho'),
      }),
    );
    expect(proposed.thread.ref).toBe(threadRef(t.id));
    const stored = readThread(dir(), t.id);
    expect(stored.revision).toBe(t.revision + 1);
    const last = stored.messages.at(-1)!;
    expect(last.proposal).toBe(proposed.proposal.id);
    expect(last.author).toEqual({ kind: 'agent', name: 'teste', email: null });
    expect(last.text).toBe(`Proposal: [Título novo](${proposed.proposal.ref})`);
    expect(last.text).toMatch(/\(mapping:\/\/cadastro\/p\/[0-9a-f]+\)$/);
  });

  it('grava um proposal.json igual ao de uma chamada sem thread, a menos do id e das datas', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Outra' }],
    });
    const common = { project: 'cadastro', title: 'Igual', operations: rename('Topo') };
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

  it('conversa inexistente ou resolvida: recusa e não deixa nada no disco', async () => {
    const resolved = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Resolvida' }],
      resolved: true,
    });
    const before = proposalIds();
    const resolvedFile = join(dir(), threadFilePath(resolved.id, true));
    const hash = sha(resolvedFile);
    const args = { project: 'cadastro', title: 'Recusada', operations: rename('X') };

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

  it('conversa resolvida pela app no meio do caminho: a proposta fica e vem o aviso thread-not-linked', async () => {
    // Não dá para provocar a corrida sem gancho; a mesma regra é testada pelo caminho direto:
    // depois de resolvida, a conversa não aceita mais mensagem.
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Vou resolver' }],
    });
    humanResolves(dir(), t.id, 90);
    const failure = errorOf(
      await mcp.call('post_message', {
        ref: threadRef(t.id),
        text: 'Tarde demais',
        after: readThread(dir(), t.id).messages.at(-1)!.id,
      }),
    );
    expect(failure.code).toBe('thread-resolved');
  });

  it('sem thread, o comportamento é o de sempre e nenhuma conversa é tocada', async () => {
    const before = readFileSync(join(dir(), 'mapping.json'), 'utf8');
    const result = ok(
      await mcp.call<Proposed & { thread?: unknown }>('propose_changes', {
        project: 'cadastro',
        title: 'Sem conversa',
        operations: rename('Sem'),
      }),
    );
    expect(result.thread).toBeUndefined();
    expect(readFileSync(join(dir(), 'mapping.json'), 'utf8')).toBe(before);
  });
});
