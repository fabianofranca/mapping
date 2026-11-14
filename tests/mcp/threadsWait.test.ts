import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ok } from './proposalSupport';
import { humanReplies, seedThread } from './threadSupport';
import { codeOf, connect, createWorkspace } from './workspace';
import type { Connection, Workspace } from './workspace';

// `wait_for_comment` (decision 37, path (b) of the spike: Claude Code cuts the tool at 60 s, so
// the default is 45 s and the maximum 50 s): returns the conversation that starts awaiting the agent, or
// `{ changed: false }` at the deadline.

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
  it('at the deadline with nothing new returns { changed: false }', async () => {
    const result = ok(
      await mcp.call<Waited>('wait_for_comment', {
        project: 'cadastro',
        timeoutSeconds: 1,
      }),
    );
    expect(result).toMatchObject({ changed: false });
  });

  it('returns the conversation that starts awaiting the agent', async () => {
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
    setTimeout(() => humanReplies(dir(), t.id, 'One more question', 120), 1500);
    const result = ok(await waiting);
    expect(result.changed).toBe(true);
    expect(result.thread).toMatchObject({ ref: threadRef(t.id), awaiting: 'agent' });
  });

  it('a conversation that was already awaiting before the call does not count', async () => {
    seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [{ by: 'human', text: 'Already waiting' }],
    });
    const result = ok(
      await mcp.call<Waited>('wait_for_comment', {
        project: 'cadastro',
        timeoutSeconds: 2,
      }),
    );
    expect(result.changed).toBe(false);
  });

  it('a new conversation opened by the person during the wait also counts', async () => {
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

  it('the deadline exceeds 50 s: the schema refuses', async () => {
    const { tools } = await mcp.client.listTools();
    const tool = tools.find((t) => t.name === 'wait_for_comment')!;
    const props = tool.inputSchema.properties as Record<string, { maximum: number }>;
    expect(props.timeoutSeconds?.maximum).toBe(50);
  });
});
