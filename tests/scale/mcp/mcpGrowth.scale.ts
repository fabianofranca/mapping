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

// MCP read tools in process (createServer + InMemoryTransport) over the scale project written
// to a temporary folder (#881): the same call with 1,250 and 5,000 markings, ratio < 6×. The server reads the
// project from disk on every call; that is the cost of a call on a large project.
const PROJECT = 'scale';
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
/** One server per size, reused across the tools (building the large project costs more than measuring). */
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
  const client = new Client({ name: 'scale', version: '0' });
  await client.connect(clientSide);
  clients.push(client);
  // An item from the middle of the project (the per-item call must not be cheaper at the start of the file).
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
  if (result.isError) throw new Error(`${name} failed: ${text.slice(0, 300)}`);
  return text;
}

interface Case {
  readonly tool: string;
  readonly args: (ctx: Ctx) => Record<string, unknown>;
  /** What the response must contain, so the measurement is of a call that finds what it looks for. */
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
    expects: () => 'mapping://scale/m/',
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
    // pt-BR kept: shared fixture data (thread text `Dúvida` of buildScaleThreads in tests/model/scaleProject.ts)
    expects: () => 'Dúvida',
  },
];

describe('growth of the MCP read tools (n = 1,250, 4n = 5,000 markings)', () => {
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
