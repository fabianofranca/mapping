import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deserialize,
  projectIndex,
  projectIssues,
  referencedSpecFiles,
  annotationShortLabel,
  parseRefValue,
  resolveRef,
  type Project,
} from '../../src/model';
import { cadastroProject } from '../model/specFixtures';
import { encodeJpegWithExif, encodePng, quadrants, webpSize } from './images';
import { connect, createWorkspace, type Connection, type Workspace } from './workspace';

// Escrita em lote (etapa 3a.5): plan_changes + apply_changes pelo dist-mcp/mapping-mcp.js, por
// stdio, numa pasta temporária. O aceite: criar pelo MCP o projeto inteiro do roteiro 13.9.

interface Plan {
  valid: boolean;
  planId?: string;
  revision: number;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  issues: { before: number; after: number; resolved: number; new: unknown[] };
  created: { op: number; alias?: string; kind: string; ref?: string; id?: string }[];
}
interface Applied {
  applied: boolean;
  revision: number;
  created: Plan['created'];
  files: { written: string[]; removed: string[] };
  migratedFrom?: number;
}
interface Failure {
  error: { code: string; message: string };
}

let ws: Workspace;
let mcp: Connection;

beforeAll(async () => {
  ws = createWorkspace();
  const sources = join(ws.root, 'fontes');
  mkdirSync(sources, { recursive: true });
  for (const name of ['sdui', 'modelo-de-dados']) {
    copyFileSync(
      join('examples', 'specs', `${name}.json`),
      join(sources, `${name}.json`),
    );
  }
  writeFileSync(join(sources, 'cadastro.png'), encodePng(quadrants(1000, 2000)));
  mcp = await connect([ws.root]);
});

afterAll(async () => {
  await mcp?.close();
});

const hashOf = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

function readProject(dir: string): Project {
  const text = readFileSync(join(dir, 'mapping.json'), 'utf8');
  const specs = new Map(
    referencedSpecFiles(text).map((file) => [
      file,
      readFileSync(join(dir, file), 'utf8'),
    ]),
  );
  const result = deserialize(text, undefined, specs);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  expect(result.specWarnings).toEqual([]);
  return result.project;
}

/** O projeto sem ids: nomes, retângulos, hierarquia, anotações e referências por rótulo. */
function normalize(p: Project) {
  const index = projectIndex(p);
  const markingName = (id: string | null) => (id ? index.markings.get(id)?.name : null);
  const label = (id: string) => {
    const a = index.annotations.get(id)!;
    return `${markingName(a.markingId)}/${annotationShortLabel(p, a)}`;
  };
  const value = (v: unknown): unknown => {
    const ref = parseRefValue(v as never);
    if (ref) {
      const target = resolveRef(p, ref);
      if (!target) return 'quebrada';
      if (target.kind === 'entry')
        return `${label(ref.annotationId)}#${target.entry.key}`;
      if (target.kind === 'row')
        return `${label(ref.annotationId)}#${target.key}[${target.index}]`;
      return `${label(ref.annotationId)}#${target.key}`;
    }
    if (Array.isArray(v)) {
      return v.map((row) => {
        // `_id` das linhas é gerado: compara só as células.
        return Object.fromEntries(
          Object.entries(row as Record<string, unknown>).filter(([k]) => k !== '_id'),
        );
      });
    }
    return v;
  };
  return {
    layers: p.layers.map((l) => ({ name: l.name, color: l.color, spec: l.spec })),
    specializations: p.specializations.map((s) => ({
      id: s.id,
      version: s.version,
      file: s.file,
    })),
    images: p.images.map((i) => ({ width: i.width, height: i.height })),
    markings: p.markings.map((m) => ({
      name: m.name,
      rect: m.rect,
      parent: markingName(m.parentId),
      locked: m.locked,
    })),
    annotations: p.annotations.map((a) => ({
      marking: markingName(a.markingId),
      layer: index.layers.get(a.layerId)!.name,
      name: a.name,
      type: a.type,
      owner: a.parentAnnotationId ? label(a.parentAnnotationId) : null,
      inherit: a.inherit,
      entries: a.entries.map((e) => [e.key, e.value]),
      values:
        a.values &&
        Object.fromEntries(Object.entries(a.values).map(([k, v]) => [k, value(v)])),
    })),
    issues: [...projectIssues(p)].map(([id, issues]) => [
      label(id),
      issues.map((i) => i.code),
    ]),
  };
}

/** Os passos 1 a 7 do roteiro 13.9, como um agente faria: um lote só, com apelidos. */
const CADASTRO_OPERATIONS = [
  { op: 'create_layer', as: '$model', name: 'Model', color: '#757575' },
  { op: 'apply_specialization', file: 'fontes/sdui.json' },
  { op: 'apply_specialization', file: 'fontes/modelo-de-dados.json' },
  { op: 'add_image', as: '$tela', file: 'fontes/cadastro.png' },
  {
    op: 'create_marking',
    as: '$titulo',
    image: '$tela',
    name: 'Título',
    rect: { x: 100, y: 50, width: 800, height: 100 },
  },
  {
    op: 'create_marking',
    as: '$form',
    image: '$tela',
    name: 'Formulário',
    rect: { x: 50, y: 200, width: 900, height: 1200 },
  },
  {
    op: 'create_marking',
    as: '$nome',
    image: '$tela',
    name: 'Nome',
    rect: { x: 100, y: 250, width: 800, height: 100 },
  },
  {
    op: 'create_marking',
    as: '$idade',
    image: '$tela',
    name: 'Idade',
    rect: { x: 100, y: 400, width: 800, height: 100 },
  },
  {
    op: 'create_marking',
    as: '$email',
    image: '$tela',
    name: 'E-mail',
    rect: { x: 100, y: 550, width: 800, height: 100 },
  },
  {
    op: 'create_marking',
    as: '$cadastrar',
    image: '$tela',
    name: 'Cadastrar',
    rect: { x: 100, y: 700, width: 800, height: 100 },
    parent: '$form',
  },
  {
    op: 'create_annotation',
    as: '$user',
    marking: '$form',
    layer: '$model',
    name: 'User',
    entries: [
      { key: 'name', value: 'string' },
      { key: 'age', value: 'number' },
    ],
  },
  {
    op: 'create_annotation',
    as: '$contato',
    marking: '$form',
    type: 'modelo-dados/classe',
    values: {
      nome: 'Contato',
      revisadoEm: '2026-10-02',
      atributos: [
        { _as: '$attrEmail', nome: 'email', tipo: 'String', exemplo: 'ana@exemplo.com' },
      ],
    },
  },
  {
    op: 'create_annotation',
    marking: '$nome',
    type: 'input',
    values: { id: 'input_nome', dado: { annotation: '$user', entry: 'name' } },
  },
  {
    op: 'create_annotation',
    marking: '$idade',
    type: 'sdui/input',
    values: {
      id: 'input_idade',
      tipo: 'number',
      dado: { annotation: '$user', entry: 'age' },
    },
  },
  {
    op: 'create_annotation',
    as: '$inputEmail',
    marking: '$email',
    type: 'Input',
    values: {
      id: 'input_email',
      tipo: 'email',
      obrigatorio: 'sim',
      dado: { annotation: '$contato', key: 'atributos', row: '$attrEmail' },
    },
  },
  {
    op: 'create_annotation',
    as: '$botao',
    marking: '$cadastrar',
    type: 'button',
    values: { id: 'btn_cadastrar', texto: 'Cadastrar' },
  },
  {
    op: 'create_annotation',
    marking: '$titulo',
    type: 'text',
    values: { conteudo: 'Crie sua conta' },
  },
  {
    op: 'create_annotation',
    marking: '$cadastrar',
    type: 'onClick',
    owner: '$botao',
    values: {
      acao: 'submit',
      destino: '/usuarios',
      parametros: [{ nome: 'origem', valor: 'cadastro' }],
    },
  },
  {
    op: 'create_annotation',
    marking: '$cadastrar',
    type: 'onHold',
    owner: '$botao',
    values: { acao: 'track' },
  },
  {
    op: 'create_annotation',
    marking: '$email',
    type: 'onChange',
    owner: '$inputEmail',
    values: { acao: 'validate', regra: 'email' },
  },
  {
    op: 'create_annotation',
    marking: '$form',
    type: 'endpoint',
    values: { metodo: 'POST', path: '/v1/usuarios', request: 'User', response: 'User' },
  },
];

describe('roteiro 13.9 criado pelo MCP', () => {
  let plan: Plan;
  let dir: string;

  it('create_project + plan_changes valida o lote inteiro sem gravar', async () => {
    const created = await mcp.call('create_project', {
      path: 'novo/cadastro-mcp',
      name: 'Cadastro',
      firstLayerName: 'Lataria',
    });
    expect(created.isError).toBe(false);
    dir = join(ws.root, 'novo', 'cadastro-mcp');
    const before = hashOf(join(dir, 'mapping.json'));

    const result = await mcp.call<Plan>('plan_changes', {
      project: 'cadastro-mcp',
      operations: CADASTRO_OPERATIONS,
    });
    expect(result.isError).toBe(false);
    plan = result.data;
    expect(plan.errors).toBeUndefined();
    expect(plan.valid).toBe(true);
    expect(plan.planId).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.revision).toBe(0);
    expect(plan.summary).toHaveLength(CADASTRO_OPERATIONS.length);
    expect(plan.summary[3]).toMatch(
      /^3\. Adicionar a imagem images\/cadastro\.webp \(1000×2000 px, otimizada: WebP\)$/,
    );
    expect(plan.summary[9]).toContain('Formulário › Cadastrar');
    expect(plan.changes).toMatchObject({
      specializations: { created: 2 },
      layers: { created: 5 },
      images: { created: 1 },
      markings: { created: 6 },
      annotations: { created: 11 },
    });
    // A única pendência é a do roteiro: o Text do Título sem `id`.
    expect(plan.issues).toMatchObject({ before: 0, after: 1 });
    const aliases = Object.fromEntries(
      plan.created.filter((c) => c.alias).map((c) => [c.alias, c]),
    );
    expect(aliases.$form).toMatchObject({ kind: 'marking' });
    expect(aliases.$form!.ref).toMatch(
      /^mapping:\/\/cadastro-mcp\/m\/[0-9a-f]{8} \(cadastro\.webp › Formulário\)$/,
    );
    expect(aliases.$model).toMatchObject({ kind: 'layer', name: 'Model' });

    // Nada foi gravado.
    expect(hashOf(join(dir, 'mapping.json'))).toBe(before);
    expect(readdirSync(join(dir, 'images'))).toEqual([]);
    expect(existsSync(join(dir, 'specs'))).toBe(false);
  });

  it('apply_changes grava tudo, com revision 1, e o resultado é o projeto do roteiro', async () => {
    const result = await mcp.call<Applied>('apply_changes', { planId: plan.planId });
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({ applied: true, revision: 1 });
    expect(result.data.files.written).toEqual(['images/cadastro.webp']);
    // As referências do plano são as definitivas.
    expect(result.data.created.map((c) => c.ref ?? c.id)).toEqual(
      plan.created.map((c) => c.ref ?? c.id),
    );

    const saved = readProject(dir);
    expect(saved.revision).toBe(1);
    expect(saved.images[0]!.file).toBe('images/cadastro.webp');
    expect(webpSize(readFileSync(join(dir, 'images', 'cadastro.webp')))).toEqual({
      width: 1000,
      height: 2000,
    });
    expect(normalize(saved)).toEqual(normalize(cadastroProject()));
  });

  it('o resultado é lido pelo próprio servidor (get_marking com vínculos e backlinks)', async () => {
    const form = plan.created.find((c) => c.alias === '$form')!.ref!;
    const result = await mcp.call<{ children: unknown[]; layers: unknown[] }>(
      'get_marking',
      {
        ref: form,
      },
    );
    expect(result.isError).toBe(false);
    expect(result.data.children).toHaveLength(4);
  });

  it('um plano só é aplicado uma vez', async () => {
    const again = await mcp.call<Failure>('apply_changes', { planId: plan.planId });
    expect(again.isError).toBe(true);
    expect(again.data.error.code).toBe('plan-not-found');
  });
});

describe('lote inválido e revisão desatualizada', () => {
  const dir = () => ws.projectDir('unico');
  const ref = (key: string) =>
    `mapping://unico/m/${ws.uniqueIds[key]!.replaceAll('-', '').slice(0, 8)}`;

  it('uma operação inválida invalida o lote e nada é gravado', async () => {
    const before = hashOf(join(dir(), 'mapping.json'));
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'unico',
      operations: [
        { op: 'update_marking', marking: ref('MN'), name: 'Nome completo' },
        {
          op: 'create_marking',
          as: '$fora',
          image: `i/${ws.uniqueIds.I1!.slice(0, 8)}`,
          rect: { x: 900, y: 0, width: 200, height: 50 },
        },
        { op: 'create_annotation', marking: '$fora', type: 'text' },
        { op: 'create_annotation', marking: '$naoexiste', type: 'text' },
      ],
    });
    expect(result.isError).toBe(false);
    expect(result.data.valid).toBe(false);
    expect(result.data.planId).toBeUndefined();
    expect(result.data.errors).toEqual([
      expect.objectContaining({
        index: 1,
        op: 'create_marking',
        code: 'rect-out-of-image',
      }),
      expect.objectContaining({ index: 2, code: 'alias-unavailable' }),
      expect.objectContaining({ index: 3, code: 'unknown-alias' }),
    ]);
    expect(result.data.summary).toEqual([
      expect.stringMatching(/^0\. Alterar a marcação/),
    ]);
    expect(hashOf(join(dir(), 'mapping.json'))).toBe(before);
  });

  it('um lote sobre uma revision desatualizada é recusado', async () => {
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'unico',
      operations: [{ op: 'update_marking', marking: ref('MN'), name: 'Nome completo' }],
    });
    expect(result.data.valid).toBe(true);

    // Outro processo (a app) grava o projeto enquanto isso.
    const path = join(dir(), 'mapping.json');
    const doc = JSON.parse(readFileSync(path, 'utf8')) as { revision: number };
    doc.revision += 1;
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
    const changed = hashOf(path);

    const applied = await mcp.call<Failure & { error: { diskRevision: number } }>(
      'apply_changes',
      { planId: result.data.planId },
    );
    expect(applied.isError).toBe(true);
    expect(applied.data.error).toMatchObject({
      code: 'revision-conflict',
      message: 'o projeto foi alterado por outro processo; releia e gere um novo plano',
      planRevision: 0,
      diskRevision: 1,
    });
    expect(hashOf(path)).toBe(changed);
  });

  it('uma edição à mão que não muda a revision também é percebida', async () => {
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'unico',
      operations: [{ op: 'update_marking', marking: ref('MN'), name: 'Outro nome' }],
    });
    const path = join(dir(), 'mapping.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace('"Idade"', '"Idade (anos)"'));
    const applied = await mcp.call<Failure>('apply_changes', {
      planId: result.data.planId,
    });
    expect(applied.data.error.code).toBe('revision-conflict');
  });
});

describe('regras do modelo no lote', () => {
  const code = (key: string) => ws.ids[key]!.replaceAll('-', '').slice(0, 8);

  it('itens trancados não são movidos, redimensionados nem excluídos', async () => {
    // No projeto principal o Formulário está trancado (e as filhas herdam a trava de geometria).
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'apps/cadastro',
      operations: [
        { op: 'delete_marking', marking: `m/${code('MF')}` },
        { op: 'update_marking', marking: `m/${code('MN')}`, move: { dx: 10, dy: 0 } },
        {
          op: 'update_marking',
          marking: `m/${code('MN')}`,
          name: 'Nome (renomear é livre)',
        },
        {
          op: 'update_marking',
          marking: `m/${code('MF')}`,
          locked: false,
          move: { dx: 0, dy: 10 },
        },
      ],
    });
    expect(result.data.valid).toBe(false);
    expect(result.data.errors?.map((e) => [e.index, e.code])).toEqual([
      [0, 'locked'],
      [1, 'locked'],
    ]);
    expect(result.data.summary.map((s) => s.slice(0, 2))).toEqual(['2.', '3.']);
  });

  it('referência de outro projeto, tipo errado e camada de especialização são recusados', async () => {
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'apps/cadastro',
      operations: [
        { op: 'update_marking', marking: `mapping://unico/m/${code('MN')}`, name: 'x' },
        { op: 'update_marking', marking: `a/${code('AU')}`, name: 'x' },
        { op: 'update_layer', layer: 'Componentes', name: 'Outro' },
        {
          op: 'create_annotation',
          marking: `m/${code('MN')}`,
          layer: 'Componentes',
          entries: [],
        },
        { op: 'create_annotation', marking: `m/${code('MC')}`, type: 'onClick' },
      ],
    });
    expect(result.data.errors?.map((e) => e.code)).toEqual([
      'project-mismatch',
      'wrong-kind',
      'spec-layer',
      'typed-layer',
      'owner-required',
    ]);
  });

  it('caminhos fora das raízes são recusados', async () => {
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'apps/cadastro',
      operations: [
        { op: 'add_image', file: join(ws.base, 'fora', 'segredo.png') },
        { op: 'add_image', file: '../../fora/segredo.png' },
        { op: 'apply_specialization', file: 'escape/spec-sdui.json' },
      ],
    });
    expect(result.data.errors?.map((e) => e.code)).toEqual([
      'outside-roots',
      'outside-roots',
      'outside-roots',
    ]);
  });
});

describe('imagens pelo lote', () => {
  it('adiciona (arquivo e base64), troca e exclui, com a otimização da app', async () => {
    const created = await mcp.call('create_project', {
      path: 'imagens',
      name: 'Imagens',
    });
    expect(created.isError).toBe(false);
    const dir = ws.projectDir('imagens');
    writeFileSync(
      join(dir, 'foto.jpg'),
      await encodeJpegWithExif(quadrants(300, 200), 6),
    );
    const wide = encodePng(quadrants(3000, 1000)).toString('base64');

    const plan = await mcp.call<Plan>('plan_changes', {
      project: 'imagens',
      operations: [
        { op: 'add_image', as: '$foto', file: 'foto.jpg', name: 'Foto' },
        {
          op: 'add_image',
          as: '$larga',
          base64: `data:image/png;base64,${wide}`,
          fileName: 'larga.png',
        },
        {
          op: 'create_marking',
          image: '$foto',
          rect: { x: 10, y: 10, width: 100, height: 200 },
        },
        { op: 'update_image', image: '$larga', locked: true },
      ],
    });
    expect(plan.data.errors).toBeUndefined();
    expect(plan.data.summary[0]).toContain(
      'images/foto.webp (200×300 px, otimizada: WebP)',
    );
    expect(plan.data.summary[1]).toContain(
      'images/larga.webp (2560×853 px, otimizada: 3000×1000 → 2560×853, WebP)',
    );
    const applied = await mcp.call<Applied>('apply_changes', {
      planId: plan.data.planId,
    });
    expect(applied.data.files.written).toEqual(['images/foto.webp', 'images/larga.webp']);
    let saved = readProject(dir);
    expect(
      saved.images.map((i) => [i.file, i.width, i.height, i.name, i.locked]),
    ).toEqual([
      ['images/foto.webp', 200, 300, 'Foto', false],
      ['images/larga.webp', 2560, 853, null, true],
    ]);
    expect(webpSize(readFileSync(join(dir, 'images', 'larga.webp')))).toEqual({
      width: 2560,
      height: 853,
    });

    const foto = applied.data.created.find((c) => c.alias === '$foto')!.ref!;
    const larga = applied.data.created.find((c) => c.alias === '$larga')!.ref!;
    // A imagem trancada não é trocada nem excluída; a outra, sim. O nome livre não reaproveita o do disco.
    const second = await mcp.call<Plan>('plan_changes', {
      project: 'imagens',
      operations: [
        { op: 'delete_image', image: larga },
        {
          op: 'replace_image',
          image: foto,
          base64: encodePng(quadrants(200, 300)).toString('base64'),
          fileName: 'foto.png',
        },
      ],
    });
    expect(second.data.errors?.map((e) => [e.index, e.code])).toEqual([[0, 'locked']]);
    const third = await mcp.call<Plan>('plan_changes', {
      project: 'imagens',
      operations: [
        { op: 'update_image', image: larga, locked: false },
        { op: 'delete_image', image: larga },
        {
          op: 'replace_image',
          image: foto,
          base64: encodePng(quadrants(200, 300)).toString('base64'),
          fileName: 'foto.png',
        },
      ],
    });
    expect(third.data.errors).toBeUndefined();
    const done = await mcp.call<Applied>('apply_changes', { planId: third.data.planId });
    expect(done.data.files).toEqual({
      written: ['images/foto-2.webp'],
      removed: ['images/foto.webp', 'images/larga.webp'],
    });
    saved = readProject(dir);
    expect(saved.images.map((i) => i.file)).toEqual(['images/foto-2.webp']);
    expect(saved.markings).toHaveLength(1);
    expect(readdirSync(join(dir, 'images')).sort()).toEqual(['foto-2.webp']);
  });

  it('recusa formato não suportado', async () => {
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'imagens',
      operations: [{ op: 'add_image', base64: Buffer.from('GIF89a').toString('base64') }],
    });
    expect(result.data.errors?.[0]?.code).toBe('unsupported-image');
  });
});

describe('projeto de schema antigo', () => {
  it('a primeira gravação guarda o backup do original e grava v6 com revision 1', async () => {
    const dir = ws.projectDir('legado');
    const original = readFileSync(join(dir, 'mapping.json'), 'utf8');
    const plan = await mcp.call<Plan>('plan_changes', {
      project: 'legado',
      operations: [{ op: 'create_layer', name: 'Notas' }],
    });
    expect(plan.data.valid).toBe(true);
    const applied = await mcp.call<Applied>('apply_changes', {
      planId: plan.data.planId,
    });
    expect(applied.data).toMatchObject({ applied: true, revision: 1, migratedFrom: 5 });
    const backups = readdirSync(join(dir, 'backups'));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^mapping\.v5\.\d{8}-\d{6}\.json$/);
    expect(readFileSync(join(dir, 'backups', backups[0]!), 'utf8')).toBe(original);
    const saved = readProject(dir);
    expect(saved.schemaVersion).toBe(6);
    expect(saved.layers.at(-1)!.name).toBe('Notas');
  });
});
