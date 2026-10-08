import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from '../../mcp/server';
import { createCodeWorkspace, type CodeWorkspace } from './codeWorkspace';
import { codeOf } from './workspace';

// Etapa 3b.4, decisão 7: o servidor confere se o arquivo de código existe, mas NUNCA o lê nem
// o grava. Duas garantias:
// 1. dinâmica: durante as tools que resolvem `codeRef`, toda chamada ao `node:fs/promises` e
//    ao `node:fs` com caminho fora das raízes (onde está o código do app) é só `stat`/`realpath`;
// 2. estática: só os módulos conhecidos importam `node:fs`, e o da conferência importa apenas
//    `realpath` e `stat`.

interface FsCall {
  readonly fn: string;
  readonly target: string;
}

const fsCalls = vi.hoisted(() => [] as { fn: string; target: string }[]);

/** Embrulha cada função do módulo para registrar o nome e o primeiro argumento (o caminho). */
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

/** Chamadas que tocam fora das raízes, onde fica o código do app. */
const outsideRoots = (calls: readonly FsCall[]) =>
  calls.filter(
    (c) => c.target !== '' && c.target !== ws.root && !c.target.startsWith(`${ws.root}/`),
  );

describe('o servidor não abre arquivos de código (dinâmico)', () => {
  it('get_marking, get_annotation, get_code_hints, find_by_code e get_project só conferem a existência', async () => {
    const form = (project: string) => `mapping://${project}/m/${codeOf(ws.ids.MF!)}`;
    fsCalls.length = 0;

    await call('get_marking', { ref: form('cadastro') });
    await call('get_marking', { ref: form('link') });
    await call('get_marking', { ref: form('escapa'), platform: 'android' });
    await call('get_annotation', { ref: `mapping://cadastro/a/${codeOf(ws.ids.AS!)}` });
    await call('get_code_hints', { ref: form('cadastro'), platform: 'android' });
    await call('get_code_hints', { ref: form('cadastro'), platform: 'ios' });
    await call('find_by_code', { path: 'CadastroScreen.kt' });
    await call('find_by_code', { symbol: 'Segredo' });
    await call('get_project', { project: 'cadastro' });
    await call('plan_changes', {
      project: 'escrita',
      operations: [
        {
          op: 'update_annotation',
          annotation: `mapping://escrita/a/${codeOf(ws.ids.AS!)}`,
          values: {
            implementacao: [{ platform: 'android', path: 'app/Nova.kt', symbol: 'Nova' }],
          },
        },
        { op: 'set_platform_repo', platform: 'ios', localPath: '../../..' },
      ],
    });

    const outside = outsideRoots(fsCalls);
    // O espião funciona: a existência dos arquivos de código foi mesmo conferida...
    const checked = outside.filter((c) => c.target.endsWith('CadastroScreen.kt'));
    expect(checked.map((c) => c.fn)).toEqual(
      expect.arrayContaining(['realpath', 'stat']),
    );
    // ...e nada além de `stat` e `realpath` tocou o que está fora das raízes.
    const used = [...new Set(outside.map((c) => c.fn))].sort();
    expect(used).toEqual(['realpath', 'stat']);

    // Também nenhum arquivo foi criado ou alterado fora das raízes.
    const writes = fsCalls.filter((c) =>
      /write|append|rename|rm|unlink|mkdir|copy|truncate|link|symlink|chmod|open/i.test(
        c.fn,
      ),
    );
    expect(writes).toEqual([]);
  });

  it('o arquivo que escapa do diretório de trabalho nem é tocado', async () => {
    fsCalls.length = 0;
    await call('get_marking', { ref: `mapping://escapa/m/${codeOf(ws.ids.MF!)}` });
    expect(fsCalls.filter((c) => c.target.endsWith('CadastroOculto.kt'))).toEqual([]);
    expect(fsCalls.filter((c) => c.target.endsWith('CadastroScreen.kt'))).toEqual([]);
  });
});

describe('o servidor não abre arquivos de código (estático)', () => {
  const dir = join(process.cwd(), 'mcp');
  const sources = readdirSync(dir).filter((file) => file.endsWith('.ts'));
  const FS_IMPORT = /from\s+['"]node:fs(?:\/promises)?['"]/;

  it('só os módulos conhecidos importam node:fs', () => {
    const importers = sources.filter((file) =>
      FS_IMPORT.test(readFileSync(join(dir, file), 'utf8')),
    );
    // Quem entra aqui lê/grava `mapping.json`, `specs/`, imagens ou `backups/`, nunca código. Um módulo novo
    // que precise do disco entra nesta lista de propósito, depois de conferir que não toca em código.
    expect(importers).toEqual([
      'changes.ts',
      'codeFiles.ts',
      'createProject.ts',
      'imageTools.ts',
      'paths.ts',
      'projects.ts',
    ]);
  });

  it('o módulo da conferência usa só stat e realpath', () => {
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
    // Nenhuma função de leitura, abertura ou escrita é citada no módulo.
    expect(text).not.toMatch(
      /\b(readFile|readdir|readlink|open|createReadStream|createWriteStream|writeFile|appendFile|opendir|copyFile)\b/,
    );
  });

  it('os módulos que montam as visões de código não importam o disco', () => {
    for (const file of ['codeViews.ts', 'findByCode.ts', 'views.ts', 'tools.ts']) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(
        /node:fs|from\s+['"]fs['"]/,
      );
    }
  });
});
