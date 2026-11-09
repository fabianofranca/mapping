import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from '../../../mcp/server';
import {
  serialize,
  serializeThread,
  shortCode,
  specFiles,
  threadFilePath,
  type Project,
} from '../../../src/model';
import { buildScaleProject, buildScaleThreads } from '../../model/scaleProject';
import { GROWTH_OPTIONS, expectLinearGrowthAsync } from '../../support/growth';

// Tools de leitura do MCP em processo (createServer + InMemoryTransport) sobre o projeto de escala gravado
// numa pasta temporária (#881): a mesma chamada com 1.250 e 5.000 marcações, razão < 6×. O servidor lê o
// projeto do disco a cada chamada; é esse o custo de uma chamada num projeto grande.
const PROJECT = 'escala';
const roots: string[] = [];
const clients: Client[] = [];

afterAll(async () => {
  for (const client of clients) await client.close();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface Ctx {
  readonly client: Client;
  readonly mid: Project['markings'][number];
  readonly markingRef: string;
  readonly annotationRef: string;
  readonly midBlock: number;
}

function writeProject(root: string, p: Project): void {
  const dir = join(root, PROJECT);
  const put = (rel: string, text: string): void => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  put('mapping.json', serialize(p));
  for (const [file, text] of specFiles(p)) put(file, text);
  for (const thread of buildScaleThreads(p)) {
    put(threadFilePath(thread.id, false), serializeThread(thread));
  }
}

const contexts = new Map<number, Promise<Ctx>>();
/** Um servidor por tamanho, reaproveitado entre as tools (montar o projeto grande custa mais que medir). */
function setup(markings: number): Promise<Ctx> {
  let ctx = contexts.get(markings);
  if (!ctx) {
    ctx = start(markings);
    contexts.set(markings, ctx);
  }
  return ctx;
}

async function start(markings: number): Promise<Ctx> {
  const root = mkdtempSync(join(tmpdir(), 'mapping-scale-'));
  roots.push(root);
  const p = buildScaleProject({ markings });
  writeProject(root, p);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [root] }).connect(serverSide);
  const client = new Client({ name: 'escala', version: '0' });
  await client.connect(clientSide);
  clients.push(client);
  // Um item do meio do projeto (a chamada por item não pode ser mais barata no começo do arquivo).
  const midBlock = Math.floor(markings / 25 / 2);
  const mid = p.markings.find((m) => m.id === `B${midBlock}-0-0`)!;
  const annotation = p.annotations.find((a) => a.markingId === mid.id)!;
  return {
    client,
    mid,
    midBlock,
    markingRef: `mapping://${PROJECT}/m/${shortCode(p, 'm', mid.id)}`,
    annotationRef: `mapping://${PROJECT}/a/${shortCode(p, 'a', annotation.id)}`,
  };
}

async function call(
  ctx: Ctx,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await ctx.client.callTool({ name, arguments: args });
  const text = JSON.stringify(result.content);
  if (result.isError) throw new Error(`${name} falhou: ${text.slice(0, 300)}`);
  return text;
}

interface Case {
  readonly tool: string;
  readonly args: (ctx: Ctx) => Record<string, unknown>;
  /** O que a resposta tem de ter, para a medida ser de uma chamada que acha o que procura. */
  readonly expects: (ctx: Ctx) => string;
}

const CASES: readonly Case[] = [
  {
    tool: 'get_project',
    args: () => ({ project: PROJECT }),
    expects: () => 'markings',
  },
  {
    tool: 'list_markings',
    args: () => ({ project: PROJECT }),
    expects: () => 'mapping://escala/m/',
  },
  {
    tool: 'get_marking',
    args: (c) => ({ ref: c.markingRef }),
    expects: (c) => c.markingRef,
  },
  {
    tool: 'get_annotation',
    args: (c) => ({ ref: c.annotationRef }),
    expects: (c) => c.annotationRef,
  },
  {
    tool: 'find_by_code',
    args: () => ({ project: PROJECT, symbol: 'com.app.ds.DSButton' }),
    expects: () => 'com.app.ds.DSButton',
  },
  {
    tool: 'find_by_source',
    args: (c) => ({ project: PROJECT, system: 'figma', id: `N${c.midBlock}` }),
    expects: (c) => `N${c.midBlock}`,
  },
  {
    tool: 'list_threads',
    args: () => ({ project: PROJECT }),
    expects: () => 'Dúvida',
  },
];

describe('crescimento das tools de leitura do MCP (n = 1.250, 4n = 5.000 marcações)', () => {
  it.each(CASES.map((c) => [c.tool, c] as const))(
    '%s',
    GROWTH_OPTIONS,
    async (_tool, c) => {
      const probe = await setup(25);
      expect(await call(probe, c.tool, c.args(probe))).toContain(c.expects(probe));
      await expectLinearGrowthAsync(`MCP ${c.tool}`, {
        build: setup,
        run: (ctx) => call(ctx, c.tool, c.args(ctx)),
        warmup: 2,
        runs: 21,
      });
    },
  );
});
