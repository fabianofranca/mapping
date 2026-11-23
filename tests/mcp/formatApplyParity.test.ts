import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Parity of the two paths to the same operations (stage #2035, AF2): a plugin result applied by
// `import_format` (through `applyFormatResult`) and the same operations sent as plain batch operations
// give the same `mapping.json`, ids aside. Two libraries: the fixture library of #1923 (`format-lib`,
// typed annotations with a table) and a component library with a slot (`tests/fixtures/slots`).

const NOTES_LIBRARY = 'tests/fixtures/format-library';
const SLOTS_LIBRARY = 'tests/fixtures/slots';

interface Case {
  readonly name: string;
  readonly library: string;
  /** Edits the copy of the library: adds the format and its plugin. */
  readonly prepare: (dir: string) => void;
  readonly format: string;
  readonly operations: readonly Record<string, unknown>[];
  /** Text the applied project must hold (the case is not an empty comparison). */
  readonly holds: string;
}

/** The `parse` of a plugin that always answers the same operations. */
function pluginOf(
  operations: readonly unknown[],
  warnings: readonly string[] = [],
): string {
  return `function parse() { return ${JSON.stringify({ operations, warnings })}; }
function generate() { return ''; }`;
}

const notesOperations = [
  {
    op: 'add_container',
    as: '$home',
    name: 'Home',
    width: 600,
    height: 400,
    background: '#FFFFFF',
  },
  {
    op: 'create_marking',
    as: '$first',
    annotationAs: '$firstItem',
    container: '$home',
    rect: { x: 10, y: 10, width: 200, height: 80 },
    name: 'First',
    annotation: {
      type: 'format-lib/item',
      values: {
        title: 'First',
        tags: [
          { _as: '$red', key: 'color', value: 'red' },
          { key: 'size', value: '2' },
        ],
      },
    },
  },
  {
    op: 'create_marking',
    as: '$second',
    container: '$home',
    rect: { x: 250, y: 10, width: 200, height: 80 },
    annotation: { type: 'format-lib/item', values: { title: 'Second' } },
  },
  {
    op: 'create_annotation',
    as: '$extra',
    marking: '$second',
    type: 'format-lib/item',
    values: { title: 'Extra' },
  },
  {
    op: 'update_annotation',
    annotation: '$firstItem',
    values: { title: 'Renamed first' },
  },
  { op: 'update_marking', marking: '$second', name: 'Second box' },
  { op: 'create_arrow', as: '$flow', from: '$first', to: '$second', name: 'then' },
];

const slotsOperations = [
  {
    op: 'add_container',
    as: '$screen',
    name: 'Screen',
    width: 800,
    height: 600,
    background: '#FFFFFF',
  },
  {
    op: 'create_marking',
    as: '$bar',
    container: '$screen',
    rect: { x: 100, y: 100, width: 360, height: 56 },
    annotation: { type: 'slots/bar' },
  },
  {
    op: 'create_marking',
    as: '$pin',
    inside: '$bar',
    slot: 'actions',
    annotation: { type: 'slots/pin' },
  },
  {
    op: 'create_marking',
    as: '$next',
    container: '$screen',
    anchor: { to: '$bar', side: 'end' },
    annotation: { type: 'slots/pin' },
  },
  { op: 'create_arrow', from: '$bar', to: '$next' },
];

const CASES: readonly Case[] = [
  {
    name: 'the fixture library with a table',
    library: NOTES_LIBRARY,
    format: 'format-lib/notes',
    operations: notesOperations,
    holds: 'Renamed first',
    prepare: (dir) =>
      writeFileSync(join(dir, 'plugins/notes.js'), pluginOf(notesOperations)),
  },
  {
    name: 'a component library with a slot',
    library: SLOTS_LIBRARY,
    format: 'slots/screen',
    operations: slotsOperations,
    holds: 'actions',
    prepare: (dir) => {
      const file = join(dir, 'slots.spec.json');
      const spec = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      spec.formatVersion = 20;
      spec.fileFormats = [
        {
          id: 'screen',
          name: 'Screen',
          extension: 'txt',
          plugin: 'plugins/screen.js',
          contract: 1,
        },
      ];
      writeFileSync(file, JSON.stringify(spec));
      mkdirSync(join(dir, 'plugins'), { recursive: true });
      writeFileSync(join(dir, 'plugins/screen.js'), pluginOf(slotsOperations));
    },
  },
];

let base: string;
let root: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-format-parity-'));
  root = join(base, 'root');
  mkdirSync(root, { recursive: true });
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

/** A project with the case's library applied (through a proposal accepted on disk). */
async function makeProject(name: string, c: Case): Promise<string> {
  ok(await mcp.call('create_project', { path: name, name: 'Parity', notes: false }));
  const dir = join(root, name);
  const library = join(root, 'lib', name);
  cpSync(c.library, library, { recursive: true });
  c.prepare(library);
  const proposed = await propose(mcp, name, [
    { op: 'apply_specialization', file: `lib/${name}` },
  ]);
  expect(proposed.proposed, JSON.stringify(proposed.errors)).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
  // The app's session copies the package folder next to the specialization; the helper does not.
  cpSync(join(dir, 'proposals', proposed.proposal.id, 'specs'), join(dir, 'specs'), {
    recursive: true,
    force: false,
  });
  return dir;
}

/** The project's JSON with every uuid replaced by a token numbered by first appearance, and the dates by `T`. */
function withoutIds(value: unknown): string {
  const seen = new Map<string, string>();
  return JSON.stringify(value, null, 1)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => {
      if (!seen.has(id)) seen.set(id, `<id${seen.size + 1}>`);
      return seen.get(id)!;
    })
    .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T');
}

describe('import_format and plain batch operations', () => {
  for (const c of CASES) {
    it(`give the same project, ids aside: ${c.name}`, async () => {
      const viaPlugin = await makeProject(`plugin-${c.format.replace('/', '-')}`, c);
      const viaPlain = await makeProject(`plain-${c.format.replace('/', '-')}`, c);
      const before = withoutIds(readProject(viaPlugin));
      expect(withoutIds(readProject(viaPlain))).toBe(before);

      const imported = await propose(mcp, viaPlugin.split('/').pop()!, [
        { op: 'import_format', format: c.format, text: 'anything' },
      ]);
      expect(imported.proposed).toBe(true);
      acceptAllAndApply(viaPlugin, imported.proposal.id);

      const plain = await propose(mcp, viaPlain.split('/').pop()!, [...c.operations]);
      expect(plain.proposed).toBe(true);
      acceptAllAndApply(viaPlain, plain.proposal.id);

      const a = withoutIds(readProject(viaPlugin));
      const b = withoutIds(readProject(viaPlain));
      expect(a).not.toBe(before);
      expect(a).toContain(c.holds);
      expect(a).toBe(b);
    });
  }
});
