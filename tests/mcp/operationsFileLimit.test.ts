import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../mcp/server';
import { createProject, serialize } from '../../src/model';
import { NOW } from '../model/fixtures';

// Phase AR3 (stage #2927, decisions 11 and 15): an `operationsFile` batch takes up to 5,000 operations in
// the read-only tools (`plan_changes`, `render_container`, `render_marking`); `propose_changes` and
// `revise_proposal` keep 1,000; the inline batch is always at most 1,000.

let root: string;
let client: Client;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-ops-limit-'));
  mkdirSync(join(root, 'limite'), { recursive: true });
  const project = createProject({
    name: 'limite',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Layer 1', color: '#6750A4' },
  });
  writeFileSync(join(root, 'limite', 'mapping.json'), serialize(project));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [root] }).connect(serverSide);
  client = new Client({ name: 'limit', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client?.close();
  rmSync(root, { recursive: true, force: true });
});

const container = {
  op: 'add_container',
  as: '$c',
  width: 2000,
  height: 2000,
  background: '#ffffff',
};
const creation = (i: number) => ({
  op: 'create_marking',
  container: '$c',
  as: `$m${i}`,
  rect: { x: (i % 90) * 20 + 5, y: Math.floor(i / 90) * 20 + 5, width: 16, height: 16 },
});
/** The add_container plus `count - 1` creations: `count` operations. */
const batch = (count: number) => [
  container,
  ...Array.from({ length: count - 1 }, (_, i) => creation(i)),
];

let n = 0;
function file(operations: unknown[]): string {
  const path = join(root, `batch-${++n}.json`);
  writeFileSync(path, JSON.stringify(operations));
  return path;
}

interface Reply {
  isError: boolean;
  text: string;
  data: Record<string, unknown>;
  image: boolean;
}
async function call(name: string, args: Record<string, unknown>): Promise<Reply> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text?: string }[];
  const text = content.find((c) => c.type === 'text')?.text ?? '';
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // a non-JSON reply: the tests read `text`
  }
  return {
    isError: result.isError === true,
    text,
    data,
    image: content.some((c) => c.type === 'image'),
  };
}
const error = (r: Reply) => (r.data.error ?? {}) as { code?: string; message?: string };

describe('operationsFile limits', () => {
  it('plan_changes plans 1,500 operations from a file, with the hint about propose_changes', async () => {
    const r = await call('plan_changes', {
      project: 'limite',
      operationsFile: file(batch(1500)),
    });
    expect(r.isError, r.text.slice(0, 300)).toBe(false);
    expect(r.data.valid).toBe(true);
    expect(r.data.operations).toBe(1500);
    expect(String(r.data.hint)).toContain('1,000');
    expect(String(r.data.hint)).toContain('propose_changes');
  });

  it('plan_changes refuses 5,001 operations naming the count and the limit', async () => {
    const r = await call('plan_changes', {
      project: 'limite',
      operationsFile: file(batch(5001)),
    });
    expect(r.isError).toBe(true);
    expect(error(r).code).toBe('invalid-arguments');
    expect(error(r).message).toContain('5,001');
    expect(error(r).message).toContain('5,000');
  });

  it.each(['propose_changes', 'revise_proposal'])(
    '%s refuses a file of 1,001 operations naming both limits, and writes nothing',
    async (tool) => {
      const args =
        tool === 'propose_changes'
          ? { project: 'limite', title: 'Too many', operationsFile: file(batch(1001)) }
          : { ref: 'mapping://limite/p/00000000', operationsFile: file(batch(1001)) };
      const r = await call(tool, args);
      expect(r.isError).toBe(true);
      expect(error(r).code).toBe('invalid-arguments');
      expect(error(r).message).toContain('1,001');
      expect(error(r).message).toContain('1,000');
      expect(error(r).message).toContain('5,000');
      const listed = await call('list_proposals', { project: 'limite' });
      expect(JSON.stringify(listed.data)).not.toContain('"status"');
    },
  );

  it('plan_changes of 1,000 operations has the plain hint', async () => {
    const r = await call('plan_changes', {
      project: 'limite',
      operationsFile: file(batch(1000)),
    });
    expect(r.data.valid).toBe(true);
    expect(String(r.data.hint)).not.toContain('split the batch');
  });

  it('render_container draws a file batch of 1,500 operations', async () => {
    const r = await call('render_container', {
      project: 'limite',
      ref: '$c',
      operationsFile: file(batch(1500)),
    });
    expect(r.isError, r.text.slice(0, 300)).toBe(false);
    expect(r.image).toBe(true);
  });

  it('the inline batch of 1,001 operations is still refused by the schema', async () => {
    const r = await call('plan_changes', { project: 'limite', operations: batch(1001) });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/1000|1,000/);
  });

  it('two files joined in order plan as one batch; the second alone fails on the alias', async () => {
    const first = [container, { ...creation(0), as: '$a' }, { ...creation(1), as: '$b' }];
    const second = [
      {
        op: 'update_marking',
        marking: '$a',
        rect: { x: 300, y: 300, width: 20, height: 20 },
      },
      {
        op: 'update_marking',
        marking: '$b',
        rect: { x: 340, y: 300, width: 20, height: 20 },
      },
    ];
    const joined = await call('plan_changes', {
      project: 'limite',
      operationsFile: file([...first, ...second]),
    });
    expect(joined.data.valid, joined.text.slice(0, 300)).toBe(true);
    expect(joined.data.operations).toBe(5);
    const alone = await call('plan_changes', {
      project: 'limite',
      operationsFile: file(second),
    });
    expect(alone.data.valid).toBe(false);
    expect(JSON.stringify(alone.data.errors)).toContain('$a');
  });
});
