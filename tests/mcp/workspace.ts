import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  addContainer,
  createMarking,
  createProject,
  serialize,
  specFiles,
  type Project,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import { cadastroProject } from '../model/specFixtures';

const bundle = resolve('dist-mcp/mapping-mcp.js');

/** 1×1 pixel PNG: the server only checks that the file exists. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type Doc = Record<string, unknown>;

/** `Doc` with the item arrays, so the tests can adjust `mapping.json` before writing. */
function items(
  doc: Doc,
  key: 'layers' | 'containers' | 'markings' | 'annotations',
): Doc[] {
  return doc[key] as Doc[];
}

export function uuidFor(id: string, salt = ''): string {
  const h = createHash('sha1').update(`${salt}${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The first 8 hexadecimal characters of the id (the references' code, collision-free here). */
export function codeOf(uuid: string): string {
  return uuid.replaceAll('-', '').slice(0, 8);
}

/** Ids of the `cadastroProject` (`MF`, `AU`…) replaced by stable UUIDs, like the app's. */
export function withUuids(text: string, ids: Iterable<string>, salt = ''): string {
  let result = text;
  for (const id of ids) result = result.replaceAll(`"${id}"`, `"${uuidFor(id, salt)}"`);
  return result;
}

/** Ids that start with the same 8 hexadecimal characters: the short code grows to 12. */
export const COLLIDING_IDS = {
  image: '99999999-0000-4000-8000-000000000001',
  first: 'aaaaaaaa-1111-4111-8111-111111111111',
  second: 'aaaaaaaa-2222-4222-8222-222222222222',
  third: 'bbbbbbbb-3333-4333-8333-333333333333',
} as const;

function collidingProject(): Project {
  let p = createProject({
    name: 'Collision',
    now: NOW,
    firstLayer: {
      id: 'cccccccc-0000-4000-8000-000000000001',
      name: 'Camada 1',
      color: '#D32F2F',
    },
  });
  p = addContainer(p, {
    id: COLLIDING_IDS.image,
    file: 'images/a.png',
    width: 100,
    height: 100,
  });
  const rect = (x: number) => ({ x, y: 0, width: 10, height: 10 });
  for (const [key, x] of [
    ['first', 0],
    ['second', 20],
    ['third', 40],
  ] as const) {
    p = createMarking(p, {
      id: COLLIDING_IDS[key],
      containerId: COLLIDING_IDS.image,
      rect: rect(x),
      name: key,
    });
  }
  return p;
}

export function allIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const l of p.layers) ids.add(l.id);
  for (const i of p.containers) ids.add(i.id);
  for (const m of p.markings) ids.add(m.id);
  for (const a of p.annotations) {
    ids.add(a.id);
    for (const e of a.entries) ids.add(e.id);
    for (const value of Object.values(a.values ?? {})) {
      if (Array.isArray(value)) {
        for (const row of value) {
          const rowId = (row as { _id?: unknown } | null)?._id;
          if (typeof rowId === 'string') ids.add(rowId);
        }
      }
    }
  }
  return ids;
}

export interface Workspace {
  /** Temporary folder holding everything (outside the root): `fora/` and the root. */
  readonly base: string;
  readonly root: string;
  /** Original ids of the `cadastroProject` → written UUIDs. */
  readonly ids: Readonly<Record<string, string>>;
  /** The same ids in the `unico` project, whose codes repeat in no other project. */
  readonly uniqueIds: Readonly<Record<string, string>>;
  /** Writes a project (with the `specs/` copies and the image) into a folder of the root. */
  readonly projectDir: (name: string) => string;
}

/**
 * Temporary folder with the project of script 13.9 (`apps/cadastro`, UUID ids), variations
 * of it (without specialization copies, unreadable, old schema, hostile) and security
 * traps: symbolic link outside the root, nested project, ignored folders.
 */
export function createWorkspace(): Workspace {
  const base = mkdtempSync(join(tmpdir(), 'mapping-mcp-'));
  const root = join(base, 'raiz');
  mkdirSync(root, { recursive: true });

  const source = cadastroProject();
  const ids = Object.fromEntries([...allIds(source)].map((id) => [id, uuidFor(id)]));
  const mappingText = (edit?: (doc: Doc) => void): string => {
    const text = withUuids(serialize(source), Object.keys(ids));
    if (!edit) return text;
    const doc = JSON.parse(text) as Doc;
    edit(doc);
    return `${JSON.stringify(doc, null, 2)}\n`;
  };

  const write = (
    dir: string,
    text: string,
    options: { specs?: boolean; image?: boolean },
  ) => {
    mkdirSync(join(dir, 'images'), { recursive: true });
    writeFileSync(join(dir, 'mapping.json'), text);
    if (options.image !== false)
      writeFileSync(join(dir, 'images', 'cadastro.png'), PNG_1X1);
    if (options.specs !== false) {
      mkdirSync(join(dir, 'specs'), { recursive: true });
      for (const [file, content] of specFiles(source))
        writeFileSync(join(dir, file), content);
    }
  };

  // The main project: the Formulário is locked (the children inherit the geometry lock).
  write(
    join(root, 'apps', 'cadastro'),
    mappingText((doc) => {
      for (const m of items(doc, 'markings')) if (m.id === ids.MF) m.locked = true;
    }),
    {},
  );
  // A project inside a project, ignored folders and an arbitrary folder: none of it is discovered.
  write(join(root, 'apps', 'cadastro', 'aninhado'), mappingText(), {});
  write(join(root, 'apps', 'node_modules', 'lixo'), mappingText(), {});
  write(join(root, '.oculta'), mappingText(), {});
  mkdirSync(join(root, 'so-uma-pasta'));

  write(join(root, 'sem-copias'), mappingText(), { specs: false, image: false });

  // The same items with other ids: finding by code without giving the project is not ambiguous.
  const uniqueIds = Object.fromEntries(
    Object.keys(ids).map((id) => [id, uuidFor(id, 'unico:')]),
  );
  write(
    join(root, 'unico'),
    withUuids(serialize(source), Object.keys(ids), 'unico:'),
    {},
  );

  // Short codes that collide: the reference grows to 12 characters.
  mkdirSync(join(root, 'colisao', 'images'), { recursive: true });
  writeFileSync(join(root, 'colisao', 'mapping.json'), serialize(collidingProject()));

  mkdirSync(join(root, 'quebrado'));
  writeFileSync(join(root, 'quebrado', 'mapping.json'), '{ this is not JSON');

  // Schema v5 (without `revision` or `platformRepos`): read with in-memory migration, never rewritten.
  write(
    join(root, 'legado'),
    mappingText((doc) => {
      doc.schemaVersion = 5;
      delete doc.revision;
      delete doc.platformRepos;
    }),
    {},
  );

  // Hostile `mapping.json`: the image points outside the project and `images/link.png` is a symbolic link.
  const outside = join(base, 'fora');
  mkdirSync(join(outside, 'projeto-fora'), { recursive: true });
  writeFileSync(join(outside, 'segredo.png'), PNG_1X1);
  write(join(outside, 'projeto-fora'), mappingText(), {});
  write(
    join(root, 'hostil'),
    mappingText((doc) => {
      items(doc, 'containers')[0]!.file = '../../../fora/segredo.png';
    }),
    {},
  );
  write(
    join(root, 'hostil-link'),
    mappingText((doc) => {
      items(doc, 'containers')[0]!.file = 'images/link.png';
    }),
    { image: false },
  );
  symlinkSync(
    join(outside, 'segredo.png'),
    join(root, 'hostil-link', 'images', 'link.png'),
  );
  // The copy of the cited specialization sits outside the project, but it is a valid specialization JSON.
  writeFileSync(
    join(outside, 'spec-sdui.json'),
    specFiles(source).get('specs/sdui.json')!,
  );
  write(
    join(root, 'hostil-spec'),
    mappingText((doc) => {
      (doc.specializations as Doc[])[0]!.file = '../../fora/spec-sdui.json';
    }),
    { specs: false },
  );
  symlinkSync(outside, join(root, 'escape'), 'dir');

  return {
    base,
    root,
    ids,
    uniqueIds,
    projectDir: (name) => join(root, name),
  };
}

/** Result of a tool, already decoded. */
export interface Call<T = Record<string, unknown>> {
  readonly isError: boolean;
  readonly data: T;
}

export interface Connection {
  readonly client: Client;
  call<T = Record<string, unknown>>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<Call<T>>;
  /** Everything the server has written to stderr so far (warnings and diagnostics). */
  stderr(): string;
  close(): Promise<void>;
}

export interface ConnectOptions {
  /** The server's working directory (what relative `--root` values resolve against). */
  readonly cwd?: string;
  /**
   * Configuration file of the disk hooks (`tests/mcp/fsHooks.mjs`): with it, the
   * server starts with `node --import` of the hook. Only for the concurrency tests.
   */
  readonly fsHooks?: string;
  /** Extra arguments, after the roots (e.g. `--no-http`). */
  readonly args?: readonly string[];
}

const FS_HOOKS = resolve('tests/mcp/fsHooks.mjs');

/** Starts `dist-mcp/mapping-mcp.js` over stdio, as an MCP client does. */
export async function connect(
  roots: readonly string[],
  options: ConnectOptions = {},
): Promise<Connection> {
  const hooks =
    options.fsHooks === undefined ? [] : ['--import', pathToFileURL(FS_HOOKS).href];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      ...hooks,
      bundle,
      ...roots.flatMap((root) => ['--root', root]),
      ...(options.args ?? []),
    ],
    stderr: 'pipe',
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.fsHooks !== undefined
      ? {
          env: { ...getDefaultEnvironment(), MAPPING_MCP_FS_HOOKS: options.fsHooks },
        }
      : {}),
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(transport);
  return {
    client,
    async call(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as { type: string; text: string }[];
      return { isError: result.isError === true, data: JSON.parse(content[0]!.text) };
    },
    stderr: () => stderr,
    close: () => client.close(),
  };
}
