import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, describe, expect, it } from 'vitest';
import { runBatch } from '../../mcp/batch';
import { createServer } from '../../mcp/server';
import { serialize, type Project } from '../../src/model';
import { buildLargeProject } from '../model/largeProject';
import { GROWTH_LIMIT, GROWTH_OPTIONS } from '../support/growth';
import { NOW } from '../model/fixtures';

// MCP batch at scale (#882, phase 3): N `create_marking` in a container of a large project.
// Runs in `npm run test:perf`, alone and without coverage, like the other budgets. The cause that the
// tests guard against: the batch summary rebuilt the project index and sorted the short codes of
// all markings at every creation (~2.6 µs per project marking per operation: 1,000 creations
// in a project of 10,000 markings took ~26 s); now the cost per creation does not depend on the project.
const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');
const OPTIONS = { ...GROWTH_OPTIONS, timeout: 120_000 };
/** Absolute budgets (measured in the cloud: see the PR; ~0.3 s and ~0.5 s), with headroom for the runner. */
const BUDGET_1000_MS = 1000;
const BUDGET_TOOL_1000_MS = 2000;

/** The i-th new marking of `I0`: on a grid below the fixture groups. */
const newRect = (i: number) => ({
  x: (i % 190) * 21 + 5,
  y: 2750 + Math.floor(i / 190) * 22,
  width: 20,
  height: 20,
});
/** `count` creations in `I0`, cited by the `mapping://` reference, as the agent cites a container. */
const creations = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    op: 'create_marking',
    container: 'mapping://grande/i/i0',
    rect: newRect(i),
  }));

const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function batchMs(project: Project, count: number): Promise<number> {
  const start = performance.now();
  const result = await runBatch(
    { project, location: { name: 'grande' } } as never,
    creations(count) as never,
    {
      readSource: () => Promise.reject(new Error('no files')),
      readSpecInput: () => Promise.reject(new Error('no files')),
      takenImageFiles: new Set<string>(),
      now: () => new Date(NOW),
    } as never,
  );
  const ms = performance.now() - start;
  expect(result.errors).toEqual([]);
  expect(result.created).toHaveLength(count);
  return ms;
}

async function medianBatchMs(project: Project, count: number): Promise<number> {
  await batchMs(project, count); // aquecimento
  const times: number[] = [];
  for (let i = 0; i < 5; i++) times.push(await batchMs(project, count));
  return median(times);
}

describe('MCP batch at scale', () => {
  budgetIt(
    'creations in a container of a project of 10,000 markings: 250 → 1,000, ratio < 6×',
    OPTIONS,
    async () => {
      const project = buildLargeProject({ images: 400 });
      const small = await medianBatchMs(project, 250);
      const large = await medianBatchMs(project, 1000);
      const ratio = large / small;
      console.info(
        `growth · batch of creations: 250 ${small.toFixed(0)} ms · 1000 ${large.toFixed(0)} ms · ratio ${ratio.toFixed(2)}× (teto ${GROWTH_LIMIT}×)`,
      );
      expect(ratio, 'ratio 1000/250').toBeLessThan(GROWTH_LIMIT);
    },
  );

  budgetIt(
    '1,000 creations in a project of 10,000 markings under 1 s',
    OPTIONS,
    async () => {
      const project = buildLargeProject({ images: 400 });
      const ms = await medianBatchMs(project, 1000);
      console.info(
        `budget · batch of 1,000 creations: ${ms.toFixed(0)} ms (teto ${BUDGET_1000_MS} ms)`,
      );
      expect(ms).toBeLessThan(BUDGET_1000_MS);
    },
  );

  describe('plan_changes por operationsFile', () => {
    const roots: string[] = [];
    let client: Client | undefined;
    afterAll(async () => {
      await client?.close();
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    });

    budgetIt(
      '1,000 creations in a project of 2,500 markings under budget',
      OPTIONS,
      async () => {
        const root = mkdtempSync(join(tmpdir(), 'mapping-batch-'));
        roots.push(root);
        mkdirSync(join(root, 'grande'), { recursive: true });
        writeFileSync(
          join(root, 'grande', 'mapping.json'),
          serialize(buildLargeProject({ images: 100 })),
        );
        const file = join(root, 'batch.json');
        writeFileSync(file, JSON.stringify(creations(1000)));
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        await createServer({ roots: [root] }).connect(serverSide);
        client = new Client({ name: 'batch', version: '0' });
        await client.connect(clientSide);
        const call = () =>
          client!.callTool({
            name: 'plan_changes',
            arguments: { project: 'grande', operationsFile: file },
          });
        await call();
        const start = performance.now();
        const result = await call();
        const ms = performance.now() - start;
        const text = (result.content as { text: string }[])[0]!.text;
        expect(result.isError, text.slice(0, 300)).toBeFalsy();
        expect(JSON.parse(text).valid).toBe(true);
        console.info(
          `budget · plan_changes of 1,000 creations (2,500 markings): ${ms.toFixed(0)} ms (teto ${BUDGET_TOOL_1000_MS} ms)`,
        );
        expect(ms).toBeLessThan(BUDGET_TOOL_1000_MS);
      },
    );
  });
});
