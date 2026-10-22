import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodePng, quadrants } from './images';
import {
  acceptAllAndApply,
  errorOf,
  ok,
  propose,
  readProject,
  readProposal,
  type Proposed,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Superfície de containers do MCP 0.8.0, por stdio: `add_container` com arquivo e com fundo,
// `update_container`, `replace_container` e `delete_container`, e as operações antigas
// (`add_image`, `add_blank_image`, `update_image`, `replace_image`, `delete_image`, o
// argumento `image` de `create_marking`) aceitas com aviso `deprecated-op`, inclusive numa
// proposta gravada com o formato 1 ou 2.

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  created: { op: number; alias?: string; kind: string; ref?: string }[];
  warnings?: { code: string; op: number; message: string }[];
}

interface ContainerData {
  ref: string;
  name: string | null;
  file: string | null;
  background: string | null;
  width: number;
  height: number;
  exists: boolean;
  bgContainer?: boolean;
  warnings?: { code: string; tool: string; message: string }[];
}

let root: string;
let mcp: Connection;
let replacement: string;
let counter = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-container-ops-'));
  const sources = join(root, 'fontes');
  mkdirSync(sources, { recursive: true });
  writeFileSync(join(sources, 'foto.png'), await encodePng(quadrants(300, 200)));
  replacement = (await encodePng(quadrants(150, 100))).toString('base64');
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

/** Um projeto vazio novo (cada teste usa o seu, para a revisão não depender dos outros). */
async function newProject(): Promise<{ name: string; dir: string }> {
  const name = `caixas-${++counter}`;
  ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
  return { name, dir: join(root, 'projetos', name) };
}

const plan = async (project: string, operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const warningOps = (data: { warnings?: Record<string, unknown>[] }) =>
  (data.warnings ?? []).map((w) => [w.op, w.code]);

describe('add_container: com arquivo e com fundo', () => {
  it('o arquivo dá a largura e a altura; o fundo traz as dele; nenhum aviso', async () => {
    const { name, dir } = await newProject();
    const operations = [
      { op: 'add_container', as: '$foto', file: 'fontes/foto.png', name: 'Foto' },
      {
        op: 'add_container',
        as: '$cartao',
        name: 'Cartão',
        width: 320,
        height: 200,
        background: '#ffffff',
      },
      {
        op: 'create_marking',
        as: '$m1',
        container: '$foto',
        rect: { x: 10, y: 10, width: 100, height: 50 },
      },
      {
        op: 'create_marking',
        as: '$m2',
        container: '$cartao',
        rect: { x: 0, y: 0, width: 50, height: 50 },
      },
    ];
    const result = await plan(name, operations);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeUndefined();
    expect(result.summary[0]).toMatch(
      /^0\. Adicionar o container com a imagem images\/foto\.webp \(300×200 px, /,
    );
    expect(result.summary[1]).toBe(
      '1. Adicionar o container "Cartão" (320×200 px, fundo #FFFFFF)',
    );
    expect(result.changes).toMatchObject({
      containers: { created: 2 },
      markings: { created: 2 },
    });
    expect(result.created.filter((c) => c.kind === 'container')).toHaveLength(2);

    const proposed = await propose(mcp, name, operations);
    // Sem aviso, e o `mapping.json` só muda quando o usuário aplica.
    expect(proposed.warnings).toBeUndefined();
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    expect(
      saved.containers.map((c) => [c.name, c.file, c.width, c.height, c.background]),
    ).toEqual([
      ['Foto', 'images/foto.webp', 300, 200, null],
      ['Cartão', null, 320, 200, '#FFFFFF'],
    ]);
    // A marcação grava `containerId` (nunca `imageId`) nos valores da proposta.
    const markingChanges = readProposal(dir, proposed.proposal.id).changes.filter(
      (c) => c.entity === 'marking' && c.kind === 'create',
    );
    expect(markingChanges).toHaveLength(2);
    for (const change of markingChanges) {
      expect(change.to).toHaveProperty('containerId');
      expect(change.to).not.toHaveProperty('imageId');
    }
    expect(saved.markings.map((m) => m.containerId).sort()).toEqual(
      saved.containers.map((c) => c.id).sort(),
    );

    // As tools novas leem os dois.
    const [photoRef, boxRef] = proposed.created
      .filter((c) => c.kind === 'container')
      .map((c) => c.ref!);
    const photo = ok(await mcp.call<ContainerData>('get_container', { ref: photoRef }));
    expect(photo).toMatchObject({
      file: 'images/foto.webp',
      background: null,
      width: 300,
      height: 200,
      exists: true,
    });
    const box = ok(await mcp.call<ContainerData>('get_container', { ref: boxRef }));
    expect(box).toMatchObject({
      file: null,
      background: '#FFFFFF',
      width: 320,
      height: 200,
    });
    expect(box.bgContainer).toBeUndefined();
    const file = await mcp.call('get_container_file', { ref: photoRef });
    expect(file.isError).toBe(false);
    expect(errorOf(await mcp.call('get_container_file', { ref: boxRef })).code).toBe(
      'container-without-file',
    );
  });

  it('recusa a combinação ambígua e a que falta, com mensagem clara', async () => {
    const { name } = await newProject();
    const result = await plan(name, [
      { op: 'add_container', file: 'fontes/foto.png', width: 100, height: 100 },
      { op: 'add_container', file: 'fontes/foto.png', background: '#000000' },
      { op: 'add_container', name: 'Sem nada' },
      { op: 'add_container', width: 100, background: '#000000' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors?.map((e) => [e.index, e.code])).toEqual([
      [0, 'invalid-arguments'],
      [1, 'invalid-arguments'],
      [2, 'invalid-arguments'],
      [3, 'invalid-arguments'],
    ]);
    expect(result.errors![0]!.message).toMatch(/ambígua.*`file`.*`width`/);
    expect(result.errors![2]!.message).toMatch(/faltam: `width`, `height`, `background`/);
    expect(result.errors![3]!.message).toMatch(/faltam: `height`/);
  });
});

describe('update_container, replace_container e delete_container', () => {
  it('os nomes novos (argumento `container`) não geram aviso', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png', name: 'Foto' },
      {
        op: 'add_container',
        name: 'Cartão',
        width: 320,
        height: 200,
        background: '#FFFFFF',
      },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const [photo, box] = created.created.map((c) => c.ref!);

    const result = await plan(name, [
      { op: 'update_container', container: box, name: 'Cartão 2', background: '#000000' },
      { op: 'replace_container', container: photo, base64: replacement },
      { op: 'delete_container', container: box },
    ]);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeUndefined();
    expect(result.summary[0]).toMatch(/^0\. Alterar o container ".*": nome "Cartão 2"/);
    expect(result.summary[1]).toMatch(/^1\. Trocar a imagem do container /);
    expect(result.summary[2]).toMatch(/^2\. Excluir o container /);
    expect(result.changes).toMatchObject({ containers: { updated: 1, deleted: 1 } });
  });

  it('as antigas update_image, replace_image e delete_image seguem valendo, com aviso', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png', name: 'Foto' },
      {
        op: 'add_container',
        name: 'Cartão',
        width: 320,
        height: 200,
        background: '#FFFFFF',
      },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const [photo, box] = created.created.map((c) => c.ref!);

    const result = await plan(name, [
      { op: 'update_image', image: box, name: 'Cartão 2' },
      { op: 'replace_image', image: photo, base64: replacement },
      { op: 'delete_image', image: box },
    ]);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(warningOps(result)).toEqual([
      [0, 'deprecated-op'],
      [1, 'deprecated-op'],
      [2, 'deprecated-op'],
    ]);
    expect(result.warnings!.map((w) => w.message)).toEqual([
      expect.stringContaining('update_container'),
      expect.stringContaining('replace_container'),
      expect.stringContaining('delete_container'),
    ]);
    // O resultado é o mesmo das operações novas.
    expect(result.summary[0]).toMatch(/^0\. Alterar o container ".*": nome "Cartão 2"/);
    expect(result.changes).toMatchObject({ containers: { updated: 1, deleted: 1 } });

    const proposed = await propose(mcp, name, [{ op: 'delete_image', image: box }]);
    expect(warningOps(proposed)).toEqual([[0, 'deprecated-op']]);
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    expect(saved.containers.map((c) => c.name)).toEqual(['Foto']);
  });

  it('update_container tem os mesmos erros: fundo e tamanho só em container sem arquivo', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png' },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const result = await plan(name, [
      {
        op: 'update_container',
        container: created.created[0]!.ref!,
        background: '#000000',
      },
    ]);
    expect(result.errors?.map((e) => e.code)).toEqual(['container-has-file']);
    expect(result.errors![0]!.message).toMatch(/tem arquivo de imagem/);
  });
});

describe('as antigas add_image e add_blank_image, e o argumento image', () => {
  const OLD_OPS = [
    { op: 'add_image', as: '$foto', file: 'fontes/foto.png', name: 'Foto' },
    {
      op: 'add_blank_image',
      as: '$cartao',
      name: 'Cartão',
      width: 320,
      height: 200,
      background: '#FFFFFF',
    },
    {
      op: 'create_marking',
      image: '$foto',
      rect: { x: 10, y: 10, width: 100, height: 50 },
    },
  ];

  it('seguem aceitas, cada uma com o aviso que diz o que usar no lugar', async () => {
    const { name } = await newProject();
    const result = await plan(name, OLD_OPS);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(warningOps(result)).toEqual([
      [0, 'deprecated-op'],
      [1, 'deprecated-op'],
      [2, 'deprecated-op'],
    ]);
    expect(result.warnings!.map((w) => w.message)).toEqual([
      expect.stringContaining('use add_container'),
      expect.stringContaining('use add_container'),
      expect.stringContaining('`container`'),
    ]);
    expect(result.changes).toMatchObject({
      containers: { created: 2 },
      markings: { created: 1 },
    });
  });

  it('informar `container` e `image` na mesma marcação é erro', async () => {
    const { name } = await newProject();
    const result = await plan(name, [
      {
        op: 'add_container',
        as: '$c',
        name: 'C',
        width: 100,
        height: 100,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: '$c',
        image: '$c',
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
      { op: 'create_marking', rect: { x: 0, y: 0, width: 10, height: 10 } },
    ]);
    expect(result.errors?.map((e) => [e.index, e.code])).toEqual([
      [1, 'invalid-arguments'],
      [2, 'invalid-arguments'],
    ]);
  });

  it.each([1, 2])(
    'uma proposta gravada com o formato %i e essas operações abre e aplica',
    async (formatVersion) => {
      const { name, dir } = await newProject();
      const proposed = await propose(mcp, name, OLD_OPS);
      expect(warningOps(proposed)).toEqual([
        [0, 'deprecated-op'],
        [1, 'deprecated-op'],
        [2, 'deprecated-op'],
      ]);
      // Reescreve o arquivo com o formato antigo; as `operations` guardadas são as antigas.
      const file = join(dir, 'proposals', proposed.proposal.id, 'proposal.json');
      const json = JSON.parse(readFileSync(file, 'utf8')) as {
        formatVersion: number;
        operations: { op: string }[];
      };
      json.formatVersion = formatVersion;
      expect(json.operations.map((o) => o.op)).toEqual([
        'add_image',
        'add_blank_image',
        'create_marking',
      ]);
      writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);

      const got = ok(
        await mcp.call<{ proposal: { status: string }; levels: Proposed['levels'] }>(
          'get_proposal',
          { ref: proposed.proposal.ref },
        ),
      );
      expect(got.proposal.status).toBe('open');
      expect(got.levels.containers).toHaveLength(2);
      const saved = acceptAllAndApply(dir, proposed.proposal.id);
      expect(saved.containers.map((c) => [c.name, c.file === null])).toEqual([
        ['Foto', false],
        ['Cartão', true],
      ]);
      expect(saved.markings).toHaveLength(1);
    },
  );
});

describe('as tools antigas get_image e get_image_file', () => {
  it('seguem respondendo, com warnings deprecated-tool, e as novas não têm aviso', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      { op: 'add_container', file: 'fontes/foto.png' },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const ref = created.created[0]!.ref!;

    const current = ok(await mcp.call<ContainerData>('get_container', { ref }));
    expect(current.warnings).toBeUndefined();
    const old = ok(await mcp.call<ContainerData>('get_image', { ref }));
    expect(old.warnings).toEqual([
      expect.objectContaining({ code: 'deprecated-tool', tool: 'get_image' }),
    ]);
    expect(old).toMatchObject({ file: 'images/foto.webp', width: 300, height: 200 });

    const oldFile = await mcp.call<{ warnings?: { tool: string }[] }>('get_image_file', {
      ref,
    });
    expect(oldFile.isError).toBe(false);
    expect(oldFile.data.warnings).toEqual([
      expect.objectContaining({ tool: 'get_image_file' }),
    ]);
    const newFile = await mcp.call<{ warnings?: unknown[] }>('get_container_file', {
      ref,
    });
    expect(newFile.isError).toBe(false);
    expect(newFile.data.warnings).toBeUndefined();
  });
});

describe('leitura sempre em português, sem JSON bruto de erro', () => {
  it('container-without-file e container-has-file têm mensagem clara', async () => {
    const { name, dir } = await newProject();
    const created = await propose(mcp, name, [
      {
        op: 'add_container',
        name: 'Cartão',
        width: 100,
        height: 100,
        background: '#FFFFFF',
      },
    ]);
    acceptAllAndApply(dir, created.proposal.id);
    const error = errorOf(
      await mcp.call('get_container_file', { ref: created.created[0]!.ref! }),
    );
    expect(error.code).toBe('container-without-file');
    expect(error.message).toMatch(/não tem arquivo de imagem/);
    expect(error.message).not.toMatch(/[{}]/);
    expect(readProject(dir).containers).toHaveLength(1);
  });
});
