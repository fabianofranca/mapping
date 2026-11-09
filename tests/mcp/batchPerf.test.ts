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

// Lote do MCP em escala (#882, fase 3): N `create_marking` num container de um projeto grande.
// Roda no `npm run test:perf`, sozinho e sem cobertura, como os demais orçamentos. A causa que os
// testes guardam: o resumo do lote reconstruía o índice do projeto e ordenava os códigos curtos de
// todas as marcações a cada criação (~2,6 µs por marcação do projeto por operação: 1.000 criações
// num projeto de 10.000 marcações levavam ~26 s); agora o custo por criação não depende do projeto.
const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');
const OPTIONS = { ...GROWTH_OPTIONS, timeout: 120_000 };
/** Orçamentos absolutos (medidos na nuvem: ver o PR; ~0,3 s e ~0,5 s), com folga para o runner. */
const BUDGET_1000_MS = 1000;
const BUDGET_TOOL_1000_MS = 2000;

/** A i-ésima marcação nova de `I0`: numa grade abaixo dos grupos do fixture. */
const newRect = (i: number) => ({
  x: (i % 190) * 21 + 5,
  y: 2750 + Math.floor(i / 190) * 22,
  width: 20,
  height: 20,
});
/** `count` criações em `I0`, citado pela referência `mapping://`, como o agente cita um container. */
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
      readSource: () => Promise.reject(new Error('sem arquivos')),
      readSpecInput: () => Promise.reject(new Error('sem arquivos')),
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

describe('lote do MCP em escala', () => {
  budgetIt(
    'criações num container de um projeto de 10.000 marcações: 250 → 1.000, razão < 6×',
    OPTIONS,
    async () => {
      const project = buildLargeProject({ images: 400 });
      const small = await medianBatchMs(project, 250);
      const large = await medianBatchMs(project, 1000);
      const ratio = large / small;
      console.info(
        `crescimento · lote de criações: 250 ${small.toFixed(0)} ms · 1000 ${large.toFixed(0)} ms · razão ${ratio.toFixed(2)}× (teto ${GROWTH_LIMIT}×)`,
      );
      expect(ratio, 'razão 1000/250').toBeLessThan(GROWTH_LIMIT);
    },
  );

  budgetIt(
    '1.000 criações num projeto de 10.000 marcações abaixo de 1 s',
    OPTIONS,
    async () => {
      const project = buildLargeProject({ images: 400 });
      const ms = await medianBatchMs(project, 1000);
      console.info(
        `orçamento · lote de 1.000 criações: ${ms.toFixed(0)} ms (teto ${BUDGET_1000_MS} ms)`,
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
      '1.000 criações num projeto de 2.500 marcações abaixo do orçamento',
      OPTIONS,
      async () => {
        const root = mkdtempSync(join(tmpdir(), 'mapping-lote-'));
        roots.push(root);
        mkdirSync(join(root, 'grande'), { recursive: true });
        writeFileSync(
          join(root, 'grande', 'mapping.json'),
          serialize(buildLargeProject({ images: 100 })),
        );
        const file = join(root, 'lote.json');
        writeFileSync(file, JSON.stringify(creations(1000)));
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        await createServer({ roots: [root] }).connect(serverSide);
        client = new Client({ name: 'lote', version: '0' });
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
          `orçamento · plan_changes de 1.000 criações (2.500 marcações): ${ms.toFixed(0)} ms (teto ${BUDGET_TOOL_1000_MS} ms)`,
        );
        expect(ms).toBeLessThan(BUDGET_TOOL_1000_MS);
      },
    );
  });
});
