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
  projectIndex,
  projectIssues,
  annotationShortLabel,
  parseRefValue,
  resolveRef,
  type Project,
} from '../../src/model';
import { cadastroProject } from '../model/specFixtures';
import { encodeJpegWithExif, encodePng, quadrants, webpSize } from './images';
import {
  errorOf,
  hashOf,
  propose,
  readProject,
  readProposal,
  acceptAllAndApply,
  type Proposed,
} from './proposalSupport';
import { connect, createWorkspace, type Connection, type Workspace } from './workspace';

// Batch writing: plan_changes (preview) and propose_changes (proposal the user reviews)
// through dist-mcp/mapping-mcp.js, over stdio, in a temporary folder. The 3a.5 acceptance: create
// the whole project of script 13.9 through the MCP; in stage 4, the proposal is accepted and applied by the
// model functions the app uses (`applyAccepted`), without the agent touching mapping.json.

interface Plan {
  valid: boolean;
  planId?: string;
  reviewChanges?: number;
  hint?: string;
  revision: number;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  issues: { before: number; after: number; resolved: number; new: unknown[] };
  created: { op: number; alias?: string; kind: string; ref?: string; id?: string }[];
}
let ws: Workspace;
let mcp: Connection;

beforeAll(async () => {
  ws = createWorkspace();
  const sources = join(ws.root, 'fontes');
  mkdirSync(sources, { recursive: true });
  // Script 13.9 uses the SDUI from before `repo` (`tests/fixtures/sdui-v2.json`, same as
  // `cadastroProject`); the data model is the example.
  copyFileSync(join('tests', 'fixtures', 'sdui-v2.json'), join(sources, 'sdui.json'));
  copyFileSync(
    join('examples', 'specs', 'modelo-de-dados.json'),
    join(sources, 'modelo-de-dados.json'),
  );
  writeFileSync(join(sources, 'cadastro.png'), await encodePng(quadrants(1000, 2000)));
  mcp = await connect([ws.root]);
});

afterAll(async () => {
  await mcp?.close();
});

/** The project without ids: names, rectangles, hierarchy, annotations and references by label. */
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
      if (!target) return 'broken';
      if (target.kind === 'annotation') return label(ref.annotationId);
      if (target.kind === 'entry')
        return `${label(ref.annotationId)}#${target.entry.key}`;
      if (target.kind === 'row')
        return `${label(ref.annotationId)}#${target.key}[${target.index}]`;
      return `${label(ref.annotationId)}#${target.key}`;
    }
    if (Array.isArray(v)) {
      return v.map((row) => {
        // The rows' `_id` is generated: compare only the cells.
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
    images: p.containers.map((i) => ({ width: i.width, height: i.height })),
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

/** Steps 1 to 7 of script 13.9, as an agent would do it: a single batch, with aliases. */
const CADASTRO_OPERATIONS = [
  { op: 'create_layer', as: '$model', name: 'Model', color: '#757575' },
  { op: 'apply_specialization', file: 'fontes/sdui.json' },
  { op: 'apply_specialization', file: 'fontes/modelo-de-dados.json' },
  { op: 'add_container', as: '$tela', file: 'fontes/cadastro.png' },
  {
    op: 'create_marking',
    as: '$titulo',
    container: '$tela',
    name: 'Título',
    rect: { x: 100, y: 50, width: 800, height: 100 },
  },
  {
    op: 'create_marking',
    as: '$form',
    container: '$tela',
    name: 'Formulário',
    rect: { x: 50, y: 200, width: 900, height: 1200 },
  },
  {
    op: 'create_marking',
    as: '$nome',
    container: '$tela',
    name: 'Nome',
    rect: { x: 100, y: 250, width: 800, height: 100 },
  },
  {
    op: 'create_marking',
    as: '$idade',
    container: '$tela',
    name: 'Idade',
    rect: { x: 100, y: 400, width: 800, height: 100 },
  },
  {
    op: 'create_marking',
    as: '$email',
    container: '$tela',
    name: 'E-mail',
    rect: { x: 100, y: 550, width: 800, height: 100 },
  },
  {
    op: 'create_marking',
    as: '$cadastrar',
    container: '$tela',
    name: 'Cadastrar',
    rect: { x: 100, y: 700, width: 800, height: 100 },
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

describe('script 13.9 created through the MCP', () => {
  let plan: Plan;
  let proposed: Proposed;
  let dir: string;

  it('create_project + plan_changes validates the whole batch without writing', async () => {
    const created = await mcp.call('create_project', {
      path: 'new/cadastro-mcp',
      name: 'Cadastro',
      firstLayerName: 'Lataria',
      // The script is not about notes: the starting project is just the "Lataria" layer.
      notes: false,
    });
    expect(created.isError).toBe(false);
    dir = join(ws.root, 'new', 'cadastro-mcp');
    const before = hashOf(join(dir, 'mapping.json'));

    const result = await mcp.call<Plan>('plan_changes', {
      project: 'cadastro-mcp',
      operations: CADASTRO_OPERATIONS,
    });
    expect(result.isError).toBe(false);
    plan = result.data;
    expect(plan.errors).toBeUndefined();
    expect(plan.valid).toBe(true);
    // Only new names (add_container, `container`): no warning about an old operation.
    expect((plan as { warnings?: unknown }).warnings).toBeUndefined();
    // The preview has no plan to write: the way is propose_changes.
    expect(plan.planId).toBeUndefined();
    // One change per creation: 2 specializations, 6 layers, 1 image, 6 markings and 11 annotations.
    expect(plan.reviewChanges).toBe(26);
    expect(plan.hint).toContain('propose_changes');
    expect(plan.revision).toBe(0);
    expect(plan.summary).toHaveLength(CADASTRO_OPERATIONS.length);
    expect(plan.summary[3]).toMatch(
      /^3\. Add the container with the image images\/cadastro\.webp \(1000×2000 px, optimized: WebP\)$/,
    );
    expect(plan.summary[9]).toContain('Formulário › Cadastrar');
    expect(plan.changes).toMatchObject({
      specializations: { created: 2 },
      layers: { created: 6 },
      containers: { created: 1 },
      markings: { created: 6 },
      annotations: { created: 11 },
    });
    // The only pending item is the script's: the Title's Text without `id`.
    expect(plan.issues).toMatchObject({ before: 0, after: 1 });
    const aliases = Object.fromEntries(
      plan.created.filter((c) => c.alias).map((c) => [c.alias, c]),
    );
    expect(aliases.$form).toMatchObject({ kind: 'marking' });
    expect(aliases.$form!.ref).toMatch(/^mapping:\/\/cadastro-mcp\/m\/[0-9a-f]{8}$/);
    expect(aliases.$model).toMatchObject({ kind: 'layer', name: 'Model' });

    // Nothing was written.
    expect(hashOf(join(dir, 'mapping.json'))).toBe(before);
    expect(existsSync(join(dir, 'images'))).toBe(false);
    expect(existsSync(join(dir, 'specs'))).toBe(false);
  });

  it('propose_changes writes the proposal and does not touch mapping.json', async () => {
    const before = hashOf(join(dir, 'mapping.json'));
    proposed = await propose(mcp, 'cadastro-mcp', CADASTRO_OPERATIONS, {
      title: 'Sign-up from the script',
      origin: 'script 13.9',
    });
    expect(proposed.proposed).toBe(true);
    expect(proposed.proposal).toMatchObject({
      status: 'open',
      title: 'Sign-up from the script',
      baseRevision: 0,
      supersedes: null,
    });
    expect(proposed.proposal.ref).toMatch(/^mapping:\/\/cadastro-mcp\/p\/[0-9a-f]{8}$/);
    // The created items bring the final references (the ids change at every computation, the rest does not).
    const shape = (list: Plan['created']) => list.map((c) => [c.op, c.alias, c.kind]);
    expect(shape(proposed.created)).toEqual(shape(plan.created));
    expect(proposed.reviewChanges.total).toBe(plan.reviewChanges);

    // The mapping.json did not change; the proposal and the new image are in proposals/<id>/.
    expect(hashOf(join(dir, 'mapping.json'))).toBe(before);
    expect(existsSync(join(dir, 'images'))).toBe(false);
    expect(existsSync(join(dir, 'specs'))).toBe(false);
    const stored = readProposal(dir, proposed.proposal.id);
    expect(stored).toMatchObject({ status: 'open', revision: 0, author: 'teste' });
    expect(stored.changes).toHaveLength(plan.reviewChanges!);
    expect(proposed.files.images).toEqual([
      `proposals/${stored.id}/images/cadastro.webp`,
    ]);
    expect(
      webpSize(
        readFileSync(join(dir, 'proposals', stored.id, 'images', 'cadastro.webp')),
      ),
    ).toEqual({ width: 1000, height: 2000 });
  });

  it('accepting everything and applying (like the app) gives the project of the script, with revision 1', () => {
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    expect(saved.revision).toBe(1);
    const onDisk = readProject(dir);
    expect(onDisk.containers[0]!.file).toBe('images/cadastro.webp');
    expect(webpSize(readFileSync(join(dir, 'images', 'cadastro.webp')))).toEqual({
      width: 1000,
      height: 2000,
    });
    expect(normalize(onDisk)).toEqual(normalize(cadastroProject()));
    expect(readProposal(dir, proposed.proposal.id).status).toBe('applied');
  });

  it('the result is read by the server itself (get_marking with links and backlinks)', async () => {
    const form = proposed.created.find((c) => c.alias === '$form')!.ref!;
    const result = await mcp.call<{ children: unknown[]; layers: unknown[] }>(
      'get_marking',
      {
        ref: form,
      },
    );
    expect(result.isError).toBe(false);
    expect(result.data.children).toHaveLength(4);
  });

  it('apply_changes no longer exists', async () => {
    const { tools } = await mcp.client.listTools();
    expect(tools.map((t) => t.name)).not.toContain('apply_changes');
  });
});

describe('invalid batch and stale revision', () => {
  const dir = () => ws.projectDir('unico');
  const ref = (key: string) =>
    `mapping://unico/m/${ws.uniqueIds[key]!.replaceAll('-', '').slice(0, 8)}`;

  it('an invalid operation invalidates the batch and nothing is written', async () => {
    const before = hashOf(join(dir(), 'mapping.json'));
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'unico',
      operations: [
        { op: 'update_marking', marking: ref('MN'), name: 'Full name' },
        {
          op: 'create_marking',
          as: '$fora',
          container: `i/${ws.uniqueIds.I1!.slice(0, 8)}`,
          rect: { x: 900, y: 0, width: 200, height: 50 },
        },
        { op: 'create_annotation', marking: '$fora', type: 'text' },
        { op: 'create_annotation', marking: '$missing', type: 'text' },
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
      expect.stringMatching(/^0\. Change the marking/),
    ]);
    expect(hashOf(join(dir(), 'mapping.json'))).toBe(before);
  });

  it('propose_changes with an invalid batch writes no proposal', async () => {
    const before = hashOf(join(dir(), 'mapping.json'));
    const result = await mcp.call<Proposed>('propose_changes', {
      project: 'unico',
      title: 'Invalid',
      operations: [
        { op: 'update_marking', marking: ref('MN'), name: 'Full name' },
        { op: 'create_annotation', marking: '$missing', type: 'text' },
      ],
    });
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({ valid: false, proposed: false });
    expect(result.data.errors?.map((e) => e.code)).toEqual(['unknown-alias']);
    expect(existsSync(join(dir(), 'proposals'))).toBe(false);
    expect(hashOf(join(dir(), 'mapping.json'))).toBe(before);
  });
});

describe('model rules in the batch', () => {
  const code = (key: string) => ws.ids[key]!.replaceAll('-', '').slice(0, 8);

  it('locked items are not moved, resized or deleted', async () => {
    // In the main project the Formulário is locked (and the children inherit the geometry lock).
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'apps/cadastro',
      operations: [
        { op: 'delete_marking', marking: `m/${code('MF')}` },
        { op: 'update_marking', marking: `m/${code('MN')}`, move: { dx: 10, dy: 0 } },
        {
          op: 'update_marking',
          marking: `m/${code('MN')}`,
          name: 'Name (renaming is free)',
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

  it('the current rect of a locked item is not a change: the batch passes and, alone, is no-changes (finding 14)', async () => {
    // Formulário locked (50, 200, 900×1200) and Nome with the inherited lock (100, 250, 800×100):
    // the full re-export repeats the current `rect` of each one.
    const dir = ws.projectDir('apps/cadastro');
    const before = hashOf(join(dir, 'mapping.json'));
    const proposals = () =>
      existsSync(join(dir, 'proposals')) ? readdirSync(join(dir, 'proposals')).length : 0;
    const proposalsBefore = proposals();
    const same = [
      {
        op: 'update_marking',
        marking: `m/${code('MF')}`,
        name: 'Formulário',
        rect: { x: 50, y: 200, width: 900, height: 1200 },
      },
      {
        op: 'update_marking',
        marking: `m/${code('MN')}`,
        rect: { x: 100, y: 250, width: 800, height: 100 },
        move: { dx: 0, dy: 0 },
      },
    ];
    const plan = await mcp.call<Plan>('plan_changes', {
      project: 'apps/cadastro',
      operations: [
        ...same,
        { op: 'update_marking', marking: `m/${code('MN')}`, name: 'Full name' },
      ],
    });
    expect(plan.data.errors).toBeUndefined();
    expect(plan.data).toMatchObject({ valid: true, reviewChanges: 1 });

    const result = await mcp.call('propose_changes', {
      project: 'apps/cadastro',
      title: 'Identical re-export',
      operations: same,
    });
    expect(errorOf(result).code).toBe('no-changes');
    expect(proposals()).toBe(proposalsBefore);
    expect(hashOf(join(dir, 'mapping.json'))).toBe(before);
  });

  it('a reference to another project, a wrong type and a specialization layer are refused', async () => {
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

  it('`inherit` in create_annotation is accepted, ignored and warned about (v13)', async () => {
    const operations = [
      {
        op: 'create_annotation',
        marking: `m/${code('MN')}`,
        layer: 'Model',
        name: 'No inheritance',
        inherit: true,
        entries: [{ key: 'k', value: 'v' }],
      },
    ];
    const plan = await mcp.call<Plan & { warnings?: unknown }>('plan_changes', {
      project: 'apps/cadastro',
      operations,
    });
    expect(plan.data.errors).toBeUndefined();
    expect(plan.data.valid).toBe(true);
    expect(plan.data.warnings).toEqual([
      {
        code: 'deprecated-op',
        op: 0,
        message: expect.stringContaining(
          'the `inherit` argument left the format (v13) and was ignored',
        ),
      },
    ]);

    const proposed = await mcp.call<{ proposal: { id: string }; warnings?: unknown }>(
      'propose_changes',
      { project: 'apps/cadastro', title: 'No inheritance', operations },
    );
    expect(proposed.isError).toBe(false);
    expect(proposed.data.warnings).toEqual([
      expect.objectContaining({ code: 'deprecated-op', op: 0 }),
    ]);
    const dir = ws.projectDir('apps/cadastro');
    const text = readFileSync(
      join(dir, 'proposals', proposed.data.proposal.id, 'proposal.json'),
      'utf8',
    );
    const saved = JSON.parse(text) as {
      formatVersion: number;
      changes: { entity: string; field: string | null; to: unknown }[];
    };
    expect(saved.formatVersion).toBe(4);
    // The annotation to create and the changes do not carry `inherit` (the raw operation stays as the agent sent it).
    expect(saved.changes.some((c) => c.field === 'inherit')).toBe(false);
    const created = saved.changes.find((c) => c.entity === 'annotation');
    expect(created?.to).not.toHaveProperty('inherit');
  });

  it('paths outside the roots are refused', async () => {
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'apps/cadastro',
      operations: [
        { op: 'add_container', file: join(ws.base, 'fora', 'segredo.png') },
        { op: 'add_container', file: '../../fora/segredo.png' },
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

describe('images through the batch', () => {
  it('adds (file and base64), swaps and deletes, with the app optimization', async () => {
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
    const wide = (await encodePng(quadrants(3000, 1000))).toString('base64');

    const firstOps = [
      { op: 'add_container', as: '$foto', file: 'foto.jpg', name: 'Photo' },
      {
        op: 'add_container',
        as: '$larga',
        base64: `data:image/png;base64,${wide}`,
        fileName: 'larga.png',
      },
      {
        op: 'create_marking',
        container: '$foto',
        rect: { x: 10, y: 10, width: 100, height: 200 },
      },
      { op: 'update_container', container: '$larga', locked: true },
    ];
    const replacement = (await encodePng(quadrants(200, 300))).toString('base64');
    const plan = await mcp.call<Plan>('plan_changes', {
      project: 'imagens',
      operations: firstOps,
    });
    expect(plan.data.errors).toBeUndefined();
    expect(plan.data.summary[0]).toContain(
      'images/foto.webp (200×300 px, optimized: WebP)',
    );
    expect(plan.data.summary[1]).toContain(
      'images/larga.webp (2560×853 px, optimized: 3000×1000 → 2560×853, WebP)',
    );
    // Sent as a proposal, the images wait in proposals/<id>/images/ until acceptance.
    const first = await propose(mcp, 'imagens', firstOps);
    expect(first.files.images.map((f) => f.split('/').slice(2).join('/'))).toEqual([
      'images/foto.webp',
      'images/larga.webp',
    ]);
    expect(existsSync(join(dir, 'images'))).toBe(false);
    // The base64 content is not copied to proposal.json (the image is already in images/).
    const stored = readProposal(dir, first.proposal.id);
    expect(JSON.stringify(stored.operations)).not.toContain(wide.slice(0, 200));
    acceptAllAndApply(dir, first.proposal.id);
    let saved = readProject(dir);
    expect(
      saved.containers.map((i) => [i.file, i.width, i.height, i.name, i.locked]),
    ).toEqual([
      ['images/foto.webp', 200, 300, 'Photo', false],
      ['images/larga.webp', 2560, 853, null, true],
    ]);
    expect(webpSize(readFileSync(join(dir, 'images', 'larga.webp')))).toEqual({
      width: 2560,
      height: 853,
    });

    const foto = first.created.find((c) => c.alias === '$foto')!.ref!;
    const larga = first.created.find((c) => c.alias === '$larga')!.ref!;
    // The locked image is not swapped or deleted; the other one is. The free name does not reuse the disk's.
    const second = await mcp.call<Plan>('plan_changes', {
      project: 'imagens',
      operations: [
        { op: 'delete_container', container: larga },
        {
          op: 'replace_container',
          container: foto,
          base64: replacement,
          fileName: 'foto.png',
        },
      ],
    });
    expect(second.data.errors?.map((e) => [e.index, e.code])).toEqual([[0, 'locked']]);
    const thirdOps = [
      { op: 'update_container', container: larga, locked: false },
      { op: 'delete_container', container: larga },
      {
        op: 'replace_container',
        container: foto,
        base64: replacement,
        fileName: 'foto.png',
      },
    ];
    const third = await mcp.call<Plan>('plan_changes', {
      project: 'imagens',
      operations: thirdOps,
    });
    expect(third.data.errors).toBeUndefined();
    // The free name does not reuse the disk's: the swapped image becomes foto-2.webp.
    const done = await propose(mcp, 'imagens', thirdOps);
    expect(done.files.images.map((f) => f.split('/').slice(2).join('/'))).toEqual([
      'images/foto-2.webp',
    ]);
    acceptAllAndApply(dir, done.proposal.id);
    saved = readProject(dir);
    expect(saved.containers.map((i) => i.file)).toEqual(['images/foto-2.webp']);
    expect(saved.markings).toHaveLength(1);
    expect(readdirSync(join(dir, 'images')).sort()).toEqual(['foto-2.webp']);
  });

  it('refuses an unsupported format', async () => {
    const result = await mcp.call<Plan>('plan_changes', {
      project: 'imagens',
      operations: [
        { op: 'add_container', base64: Buffer.from('GIF89a').toString('base64') },
      ],
    });
    expect(result.data.errors?.[0]?.code).toBe('unsupported-image');
  });
});

describe('project with an old schema', () => {
  it('the proposal is computed on the project migrated in memory and the file stays intact', async () => {
    const dir = ws.projectDir('legado');
    const path = join(dir, 'mapping.json');
    const before = hashOf(path);
    const proposed = await propose(mcp, 'legado', [
      { op: 'create_layer', name: 'Notas' },
    ]);
    expect(proposed.proposed).toBe(true);
    // Neither the migration nor the backup is the agent's: they are left for the app's first write.
    expect(hashOf(path)).toBe(before);
    expect(existsSync(join(dir, 'backups'))).toBe(false);
    expect(readProposal(dir, proposed.proposal.id).baseRevision).toBe(0);

    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    expect(saved.schemaVersion).toBe(20);
    expect(saved.platformRepos).toEqual({});
    expect(saved.layers.at(-1)!.name).toBe('Notas');
  });
});
