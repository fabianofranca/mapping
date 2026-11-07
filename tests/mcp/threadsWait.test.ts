import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ok } from './proposalSupport';
import { humanReplies, seedThread } from './threadSupport';
import { codeOf, connect, createWorkspace } from './workspace';
import type { Connection, Workspace } from './workspace';

// `wait_for_comment` (decisão 37, caminho (b) do spike: o Claude Code corta a tool em 60 s, então
// o padrão é 45 s e o máximo 50 s): devolve na conversa que passa a aguardar o agente, ou
// `{ changed: false }` no prazo.

let ws: Workspace;
let mcp: Connection;
const dir = () => ws.projectDir('apps/cadastro');
const id = (name: string): string => ws.ids[name] as string;
const threadRef = (uuid: string) => `mapping://cadastro/c/${codeOf(uuid)}`;

interface Waited {
  changed: boolean;
  thread?: { ref: string; awaiting: string };
  waitedSeconds?: number;
}

beforeAll(async () => {
  ws = createWorkspace();
  mcp = await connect([ws.root]);
});
afterAll(async () => {
  await mcp?.close();
});

describe('wait_for_comment', () => {
  it('no prazo sem novidade devolve { changed: false }', async () => {
    const result = ok(
      await mcp.call<Waited>('wait_for_comment', {
        project: 'cadastro',
        timeoutSeconds: 1,
      }),
    );
    expect(result).toMatchObject({ changed: false });
  });

  it('devolve a conversa que passa a aguardar o agente', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [
        { by: 'human', text: 'Pergunta' },
        { by: 'agent', text: 'Resposta' },
      ],
    });
    const waiting = mcp.call<Waited>('wait_for_comment', {
      project: 'cadastro',
      timeoutSeconds: 20,
    });
    setTimeout(() => humanReplies(dir(), t.id, 'Mais uma dúvida', 120), 1500);
    const result = ok(await waiting);
    expect(result.changed).toBe(true);
    expect(result.thread).toMatchObject({ ref: threadRef(t.id), awaiting: 'agent' });
  });

  it('uma conversa que já aguardava antes da chamada não conta', async () => {
    seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [{ by: 'human', text: 'Já esperando' }],
    });
    const result = ok(
      await mcp.call<Waited>('wait_for_comment', {
        project: 'cadastro',
        timeoutSeconds: 2,
      }),
    );
    expect(result.changed).toBe(false);
  });

  it('uma conversa nova aberta pela pessoa durante a espera também conta', async () => {
    const waiting = mcp.call<Waited>('wait_for_comment', {
      project: 'cadastro',
      timeoutSeconds: 20,
    });
    let created: string | undefined;
    setTimeout(() => {
      created = seedThread(dir(), {
        anchor: { kind: 'marking', id: id('MC') },
        messages: [{ by: 'human', text: 'Nova pergunta' }],
      }).id;
    }, 1500);
    const result = ok(await waiting);
    expect(result.changed).toBe(true);
    expect(result.thread?.ref).toBe(threadRef(created as string));
  });

  it('o prazo passa de 50 s: o esquema recusa', async () => {
    const { tools } = await mcp.client.listTools();
    const tool = tools.find((t) => t.name === 'wait_for_comment')!;
    const props = tool.inputSchema.properties as Record<string, { maximum: number }>;
    expect(props.timeoutSeconds?.maximum).toBe(50);
  });
});
