import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  addImage,
  createMarking,
  createProject,
  serialize,
  specFiles,
  type Project,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import { cadastroProject } from '../model/specFixtures';

const bundle = resolve('dist-mcp/mapping-mcp.js');

/** PNG de 1×1 pixel: o servidor só confere a existência do arquivo. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type Doc = Record<string, unknown>;

/** `Doc` com os arrays de itens, para os testes ajustarem o `mapping.json` antes de gravar. */
function items(doc: Doc, key: 'layers' | 'images' | 'markings' | 'annotations'): Doc[] {
  return doc[key] as Doc[];
}

export function uuidFor(id: string, salt = ''): string {
  const h = createHash('sha1').update(`${salt}${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Os 8 primeiros caracteres hexadecimais do id (o código das referências, sem colisão aqui). */
export function codeOf(uuid: string): string {
  return uuid.replaceAll('-', '').slice(0, 8);
}

/** Ids do `cadastroProject` (`MF`, `AU`…) trocados por UUIDs estáveis, como os da app. */
export function withUuids(text: string, ids: Iterable<string>, salt = ''): string {
  let result = text;
  for (const id of ids) result = result.replaceAll(`"${id}"`, `"${uuidFor(id, salt)}"`);
  return result;
}

/** Ids que começam com os mesmos 8 caracteres hexadecimais: o código curto cresce para 12. */
export const COLLIDING_IDS = {
  image: '99999999-0000-4000-8000-000000000001',
  first: 'aaaaaaaa-1111-4111-8111-111111111111',
  second: 'aaaaaaaa-2222-4222-8222-222222222222',
  third: 'bbbbbbbb-3333-4333-8333-333333333333',
} as const;

function collidingProject(): Project {
  let p = createProject({
    name: 'Colisão',
    now: NOW,
    firstLayer: {
      id: 'cccccccc-0000-4000-8000-000000000001',
      name: 'Camada 1',
      color: '#D32F2F',
    },
  });
  p = addImage(p, {
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
      imageId: COLLIDING_IDS.image,
      rect: rect(x),
      name: key,
    });
  }
  return p;
}

export function allIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const l of p.layers) ids.add(l.id);
  for (const i of p.images) ids.add(i.id);
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
  /** Pasta temporária de tudo (fora da raiz): `fora/` e a raiz. */
  readonly base: string;
  readonly root: string;
  /** Ids originais do `cadastroProject` → UUIDs gravados. */
  readonly ids: Readonly<Record<string, string>>;
  /** Os mesmos ids no projeto `unico`, cujos códigos não se repetem em nenhum outro projeto. */
  readonly uniqueIds: Readonly<Record<string, string>>;
  /** Grava um projeto (com as cópias de `specs/` e a imagem) numa pasta da raiz. */
  readonly projectDir: (name: string) => string;
}

/**
 * Pasta temporária com o projeto do roteiro 13.9 (`apps/cadastro`, ids em UUID), variações
 * dele (sem cópias das especializações, ilegível, de schema antigo, hostil) e armadilhas
 * de segurança: link simbólico para fora da raiz, projeto aninhado, pastas ignoradas.
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

  // O projeto principal: a User (livre) passa a ser herdada pelas filhas do Formulário e o
  // Formulário fica trancado (as filhas herdam a trava de geometria).
  write(
    join(root, 'apps', 'cadastro'),
    mappingText((doc) => {
      for (const a of items(doc, 'annotations')) if (a.id === ids.AU) a.inherit = true;
      for (const m of items(doc, 'markings')) if (m.id === ids.MF) m.locked = true;
    }),
    {},
  );
  // Projeto dentro de um projeto, pastas ignoradas e uma pasta qualquer: nada disso é descoberto.
  write(join(root, 'apps', 'cadastro', 'aninhado'), mappingText(), {});
  write(join(root, 'apps', 'node_modules', 'lixo'), mappingText(), {});
  write(join(root, '.oculta'), mappingText(), {});
  mkdirSync(join(root, 'so-uma-pasta'));

  write(join(root, 'sem-copias'), mappingText(), { specs: false, image: false });

  // Os mesmos itens com outros ids: achar por código sem informar o projeto não é ambíguo.
  const uniqueIds = Object.fromEntries(
    Object.keys(ids).map((id) => [id, uuidFor(id, 'unico:')]),
  );
  write(
    join(root, 'unico'),
    withUuids(serialize(source), Object.keys(ids), 'unico:'),
    {},
  );

  // Códigos curtos que colidem: a referência passa a ter 12 caracteres.
  mkdirSync(join(root, 'colisao', 'images'), { recursive: true });
  writeFileSync(join(root, 'colisao', 'mapping.json'), serialize(collidingProject()));

  mkdirSync(join(root, 'quebrado'));
  writeFileSync(join(root, 'quebrado', 'mapping.json'), '{ isto não é JSON');

  // Schema v5 (sem `revision` nem `platformRepos`): lido com migração em memória, nunca regravado.
  write(
    join(root, 'legado'),
    mappingText((doc) => {
      doc.schemaVersion = 5;
      delete doc.revision;
      delete doc.platformRepos;
    }),
    {},
  );

  // `mapping.json` hostil: a imagem aponta para fora do projeto e `images/link.png` é um link simbólico.
  const outside = join(base, 'fora');
  mkdirSync(join(outside, 'projeto-fora'), { recursive: true });
  writeFileSync(join(outside, 'segredo.png'), PNG_1X1);
  write(join(outside, 'projeto-fora'), mappingText(), {});
  write(
    join(root, 'hostil'),
    mappingText((doc) => {
      items(doc, 'images')[0]!.file = '../../../fora/segredo.png';
    }),
    {},
  );
  write(
    join(root, 'hostil-link'),
    mappingText((doc) => {
      items(doc, 'images')[0]!.file = 'images/link.png';
    }),
    { image: false },
  );
  symlinkSync(
    join(outside, 'segredo.png'),
    join(root, 'hostil-link', 'images', 'link.png'),
  );
  // A cópia da especialização citada fica fora do projeto, mas é um JSON válido de especialização.
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

/** Resultado de uma tool já decodificado. */
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
  close(): Promise<void>;
}

/** Sobe o `dist-mcp/mapping-mcp.js` por stdio, como um cliente MCP faz. */
export async function connect(
  roots: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<Connection> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundle, ...roots.flatMap((root) => ['--root', root])],
    stderr: 'pipe',
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
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
    close: () => client.close(),
  };
}
