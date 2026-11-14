import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from '../../mcp/server';
import { DS_BUTTON_KT, createCodeWorkspace, type CodeWorkspace } from './codeWorkspace';
import { mcpSources } from './sources';
import { codeOf } from './workspace';

// Stage 3b.4, decision 7: the server checks whether the code file exists, but NEVER reads or
// writes it. Two guarantees:
// 1. dynamic: during the tools that resolve the `path` of the types' `code`, every call to `node:fs/promises` and
//    `node:fs` with a path outside the roots (where the app code lives) is only `stat`/`realpath`;
// 2. static: only the known modules import `node:fs`, and the checking one imports only
//    `realpath` and `stat`.

interface FsCall {
  readonly fn: string;
  readonly target: string;
}

const fsCalls = vi.hoisted(() => [] as { fn: string; target: string }[]);

/** Wraps each function of the module to record the name and the first argument (the path). */
function spy(actual: Record<string, unknown>): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value !== 'function') {
      wrapped[name] = value;
      continue;
    }
    wrapped[name] = (...args: unknown[]) => {
      const first = args[0];
      fsCalls.push({
        fn: name,
        target:
          typeof first === 'string' ? first : first instanceof URL ? first.pathname : '',
      });
      return (value as (...a: unknown[]) => unknown)(...args);
    };
  }
  return wrapped;
}

vi.mock('node:fs/promises', async (importOriginal) => {
  const wrapped = spy(await importOriginal<Record<string, unknown>>());
  return { ...wrapped, default: wrapped };
});
vi.mock('node:fs', async (importOriginal) => {
  const wrapped = spy(await importOriginal<Record<string, unknown>>());
  return { ...wrapped, default: wrapped };
});

let ws: CodeWorkspace;
let client: Client;

beforeAll(async () => {
  ws = createCodeWorkspace();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [ws.root], workDir: ws.repo }).connect(serverSide);
  client = new Client({ name: 'teste', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
});

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  expect(result.isError, text).not.toBe(true);
  return JSON.parse(text);
}

/** Calls that touch outside the roots, where the app code lives. */
const outsideRoots = (calls: readonly FsCall[]) =>
  calls.filter(
    (c) => c.target !== '' && c.target !== ws.root && !c.target.startsWith(`${ws.root}/`),
  );

describe('the server does not open code files (dynamic)', () => {
  it('get_marking, get_annotation, get_code_hints, find_by_code and get_project only check existence', async () => {
    const form = (project: string) => `mapping://${project}/m/${codeOf(ws.ids.MF!)}`;
    fsCalls.length = 0;

    await call('get_marking', { ref: form('cadastro') });
    await call('get_marking', { ref: form('link') });
    await call('get_marking', { ref: form('escapa'), platform: 'android' });
    await call('get_annotation', { ref: `mapping://cadastro/a/${codeOf(ws.ids.AB!)}` });
    await call('get_code_hints', { ref: form('cadastro'), platform: 'android' });
    await call('get_code_hints', { ref: form('cadastro'), platform: 'ios' });
    await call('find_by_code', { path: 'DSButton.kt' });
    await call('find_by_code', { path: 'segredo.kt' });
    await call('get_project', { project: 'cadastro' });
    await call('plan_changes', {
      project: 'escrita',
      operations: [{ op: 'set_platform_repo', platform: 'ios', localPath: '../../..' }],
    });

    const outside = outsideRoots(fsCalls);
    // The spy works: the existence of the code files was indeed checked...
    const checked = outside.filter((c) => c.target.endsWith('DSButton.kt'));
    expect(checked.map((c) => c.fn)).toEqual(
      expect.arrayContaining(['realpath', 'stat']),
    );
    // ...and nothing besides `stat` and `realpath` touched what is outside the roots.
    const used = [...new Set(outside.map((c) => c.fn))].sort();
    expect(used).toEqual(['realpath', 'stat']);

    // Also, no file was created or changed outside the roots.
    const writes = fsCalls.filter((c) =>
      /write|append|rename|rm|unlink|mkdir|copy|truncate|link|symlink|chmod|open/i.test(
        c.fn,
      ),
    );
    expect(writes).toEqual([]);
  });

  it('plan_signature_import refuses a signatureFile that is not .json without opening it (nor checking)', async () => {
    const kt = join(ws.repo, DS_BUTTON_KT);
    for (const signatureFile of [kt, 'DSButton.kt', 'ficha.json.kt']) {
      fsCalls.length = 0;
      const result = await client.callTool({
        name: 'plan_signature_import',
        arguments: {
          path: 'cadastro',
          type: 'button',
          platform: 'android',
          signatureFile,
        },
      });
      const text = (result.content as { text: string }[])[0]!.text;
      expect(result.isError).toBe(true);
      expect(JSON.parse(text).error.code).toBe('signature-invalid');
      // Refused by the extension, before any call to the disk.
      expect(fsCalls).toEqual([]);
    }
  });

  it('plan_signature_import refuses a .json signatureFile that is a symbolic link to code, without reading it', async () => {
    const link = join(ws.root, 'ficha-link.json');
    const real = join(ws.root, 'Real.kt');
    writeFileSync(real, 'fun Button() {}');
    symlinkSync(real, link);
    fsCalls.length = 0;
    const result = await client.callTool({
      name: 'plan_signature_import',
      arguments: {
        path: 'cadastro',
        type: 'button',
        platform: 'android',
        signatureFile: 'ficha-link.json',
      },
    });
    const text = (result.content as { text: string }[])[0]!.text;
    expect(result.isError).toBe(true);
    expect(JSON.parse(text).error.code).toBe('signature-invalid');
    expect(JSON.parse(text).error.message).toContain('.json');
    expect(
      fsCalls.filter((c) => c.fn.startsWith('readFile') && c.target.endsWith('.kt')),
    ).toEqual([]);
  });

  it('the file that escapes the working directory is not even touched', async () => {
    fsCalls.length = 0;
    await call('get_marking', { ref: `mapping://escapa/m/${codeOf(ws.ids.MC!)}` });
    // The `localPath` of `escapa` takes the Button file to `base/`, outside the repository.
    const escaped = `${ws.base}/${DS_BUTTON_KT}`;
    expect(fsCalls.filter((c) => c.target === escaped)).toEqual([]);
    expect(fsCalls.filter((c) => c.target.endsWith('DSButton.kt'))).toEqual([]);
  });
});

describe('the server does not open code files (static)', () => {
  const dir = join(process.cwd(), 'mcp');
  // Recursive: a new module in `mcp/image/` or another subfolder is also included in the check.
  const sources = mcpSources();
  const FS_IMPORT = /from\s+['"](?:node:)?fs(?:\/promises)?['"]/;

  it('only the known modules import node:fs', () => {
    const importers = sources
      .filter(({ text }) => FS_IMPORT.test(text))
      .map(({ file }) => file);
    // Whoever is listed here reads/writes `mapping.json`, `specs/`, images, `proposals/` or
    // specialization files (`validate_specialization`) and library packages (`library.ts`: only `.json`
    // and `.md` are read; the rest is listed) or the `.md` of a type's external document
    // (`docFiles.ts`, confined to the working directory by the same checker) or the `.json` of a batch
    // (`operationsFile.ts`, inside the roots), never code. A new module
    // that needs the disk joins this list on purpose, after checking that it does not touch code.
    expect(importers).toEqual([
      'changes.ts',
      'codeFiles.ts',
      'createProject.ts',
      'docFiles.ts',
      'imageTools.ts',
      'library.ts',
      'operationsFile.ts',
      'paths.ts',
      'projects.ts',
      'proposalStore.ts',
      'specValidation.ts',
      'threadStore.ts',
    ]);
  });

  it('the checking module uses only stat and realpath', () => {
    const text = readFileSync(join(dir, 'codeFiles.ts'), 'utf8');
    const imports = [
      ...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]node:fs[^'"]*['"]/g),
    ];
    expect(imports).toHaveLength(1);
    const names = imports[0]![1]!
      .split(',')
      .map((n) => n.trim())
      .sort();
    expect(names).toEqual(['realpath', 'stat']);
    // No read, open or write function is mentioned in the module.
    expect(text).not.toMatch(
      /\b(readFile|readdir|readlink|open|createReadStream|createWriteStream|writeFile|appendFile|opendir|copyFile)\b/,
    );
  });

  it('the modules that build the code views do not import the disk', () => {
    for (const file of ['codeViews.ts', 'findByCode.ts', 'views.ts', 'tools.ts']) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(
        /node:fs|from\s+['"]fs['"]/,
      );
    }
  });
});
