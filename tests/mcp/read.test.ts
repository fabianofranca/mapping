import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deserialize } from '../../src/model';
import { loadLegacySdui } from '../model/specFixtures';
import {
  codeOf,
  connect,
  createWorkspace,
  type Call,
  type Connection,
  type Workspace,
} from './workspace';

// Integration: starts `dist-mcp/mapping-mcp.js` over stdio, with the MCP SDK client, on a
// temporary folder with the project of script 13.9 (sign-up screen) and variations of it.
// The project, marking and layer names come from the `workspace.ts` fixture (`cadastro`, `Formulário`…) and stay as they are.

interface Row {
  ref: string;
  name: string | null;
  container: string;
  parent: string | null;
  rect: { x: number; y: number; width: number; height: number };
  locked: boolean;
  needsReview: boolean;
  annotations: number;
  incomplete?: number;
}
interface RowList {
  total: number;
  returned: number;
  offset: number;
  truncated?: boolean;
  nextOffset?: number;
  warnings?: { code: string; message: string }[];
  markings: Row[];
}
interface AnnotationData {
  ref: string;
  kind: 'free' | 'typed';
  name: string | null;
  title: string;
  layer: { id: string; name: string };
  marking?: string;
  owner: string | null;
  linked?: string[];
  type?: { specId: string; typeId: string; name: string | null };
  values?: Record<string, unknown>;
  entries?: { id: string; key: string; value: string }[];
  refs?: {
    field: string;
    to?: string;
    broken?: boolean;
    target?: Record<string, unknown>;
  }[];
  backlinks?: {
    from: string;
    fromLabel: string;
    fields: { field: string; row: number | null; column: string | null; to: string }[];
  }[];
  issues?: { code: string; key?: string }[];
}
interface MarkingData {
  ref: string;
  name: string | null;
  path: { ref: string; name: string }[];
  container: {
    ref: string;
    name: string | null;
    file: string;
    width: number;
    height: number;
  };
  rect: Row['rect'];
  lock: { locked: boolean; geometryLocked: boolean; source: 'self' | 'inherited' | null };
  parent: string | null;
  children: { ref: string; name: string | null; rect: Row['rect'] }[];
  layers: {
    layer: { id: string; name: string };
    annotations: AnnotationData[];
  }[];
  linkTree?: { ref: string; title: string; layer: string; linked?: unknown[] }[];
  incompleteAnnotations: number;
}
interface ErrorData {
  error: { code: string; message: string; [key: string]: unknown };
}

let ws: Workspace;
let mcp: Connection;

beforeAll(async () => {
  ws = createWorkspace();
  mcp = await connect([ws.root]);
});

afterAll(async () => {
  await mcp.close();
});

const REF = /^mapping:\/\/cadastro\/([mia])\/[0-9a-f]{8}$/;

function ok<T>(result: Call<T>): T {
  expect(result.isError, JSON.stringify(result.data)).toBe(false);
  return result.data;
}

function errorCode(result: Call): string {
  expect(result.isError).toBe(true);
  return (result.data as unknown as ErrorData).error.code;
}

/** Full reference of a marking of the `cadastroProject` (`MF`, `MN`…), by the original id: just the URL. */
function markingRef(key: string): string {
  return `mapping://cadastro/m/${codeOf(ws.ids[key]!)}`;
}

async function listRows(args: Record<string, unknown> = {}): Promise<RowList> {
  return ok(await mcp.call<RowList>('list_markings', { project: 'cadastro', ...args }));
}

const names = (list: RowList) => list.markings.map((m) => m.name);

describe('list_projects and discovery', () => {
  it('finds the projects at any depth and ignores what is not a project', async () => {
    const data = ok(await mcp.call('list_projects'));
    const projects = data.projects as { name: string; path: string; error?: unknown }[];
    expect(projects.map((p) => p.path)).toEqual([
      'apps/cadastro',
      'colisao',
      'hostil',
      'hostil-link',
      'hostil-spec',
      'legado',
      'quebrado',
      'sem-copias',
      'unico',
    ]);
    expect(data.roots).toEqual([ws.root]);
    expect(data.missingRoots).toEqual([]);
  });

  it('summarizes each project: counts, revision and specializations', async () => {
    const data = ok(await mcp.call('list_projects'));
    const signup = (data.projects as Record<string, unknown>[])[0]!;
    expect(signup).toMatchObject({
      name: 'cadastro',
      projectName: 'Teste',
      schemaVersion: 20,
      revision: 0,
      counts: { containers: 1, markings: 6, annotations: 11, layers: 7 },
      specializations: [
        { id: 'sdui', version: loadLegacySdui().version },
        { id: 'modelo-dados', version: 1 },
      ],
    });
    expect(signup.dir).toBe(realpathSync(ws.projectDir('apps/cadastro')));
  });

  it('an unreadable project appears with the reason, without hiding the others', async () => {
    const data = ok(await mcp.call('list_projects'));
    const broken = (data.projects as { name: string; error?: { code: string } }[]).find(
      (p) => p.name === 'quebrado',
    );
    expect(broken?.error?.code).toBe('invalid-project');
  });

  it('reports the root that does not exist', async () => {
    const other = await connect([join(ws.base, 'does-not-exist')]);
    try {
      const data = ok(await other.call('list_projects'));
      expect(data).toMatchObject({
        projects: [],
        missingRoots: [join(ws.base, 'does-not-exist')],
      });
    } finally {
      await other.close();
    }
  });
});

describe('get_project', () => {
  it('summarizes containers, layers, specializations and pending items', async () => {
    const data = ok(await mcp.call('get_project', { project: 'cadastro' }));
    expect(data).toMatchObject({
      name: 'cadastro',
      containers: [
        {
          name: null,
          file: 'images/cadastro.png',
          width: 1000,
          height: 2000,
          markings: 6,
        },
      ],
      lockedMarkings: 1,
      issues: { total: 1, byCode: { 'required-empty': 1 } },
    });
    expect(data.codeHint).toEqual(expect.any(String));
    const layers = (
      data.layers as { name: string; spec: unknown; annotations: number }[]
    ).map((l) => [l.name, l.annotations]);
    expect(layers).toEqual([
      ['Lataria', 0],
      ['Model', 1],
      ['Componentes', 5],
      ['Eventos', 3],
      ['Telas', 0],
      ['Classes', 1],
      ['Endpoints', 1],
    ]);
    expect(data.specializations).toEqual([
      expect.objectContaining({
        id: 'sdui',
        name: 'SDUI',
        available: true,
        annotations: 8,
      }),
      expect.objectContaining({ id: 'modelo-dados', available: true, annotations: 2 }),
    ]);
    const [issue] = (data.issues as { annotations: Record<string, unknown>[] })
      .annotations;
    expect(issue).toMatchObject({
      annotation: expect.stringMatching(REF),
      issues: [{ code: 'required-empty', key: 'id' }],
    });
  });

  it('marks the missing copy of the specialization and the schema migration', async () => {
    const noCopies = ok(await mcp.call('get_project', { project: 'sem-copias' }));
    expect(noCopies.specializations).toEqual([
      expect.objectContaining({ id: 'sdui', available: false, problem: 'missing' }),
      expect.objectContaining({
        id: 'modelo-dados',
        available: false,
        problem: 'missing',
      }),
    ]);
    const legacy = ok(await mcp.call('get_project', { project: 'legado' }));
    expect(legacy).toMatchObject({ schemaVersion: 20, revision: 0, migratedFrom: 5 });
  });

  it('reading never rewrites mapping.json (not even the old-schema one)', () => {
    const text = readFileSync(join(ws.projectDir('legado'), 'mapping.json'), 'utf8');
    expect(JSON.parse(text)).toMatchObject({ schemaVersion: 5 });
  });

  it('accepts the folder name, the relative path and the absolute one', async () => {
    for (const project of ['cadastro', 'apps/cadastro', ws.projectDir('apps/cadastro')]) {
      const data = ok(await mcp.call('get_project', { project }));
      expect(data.name).toBe('cadastro');
    }
    expect(errorCode(await mcp.call('get_project', { project: 'does-not-exist' }))).toBe(
      'project-not-found',
    );
    expect(errorCode(await mcp.call('get_project', { project: 'so-uma-pasta' }))).toBe(
      'project-not-found',
    );
  });
});

describe('list_markings', () => {
  it('lists the markings in depth, with reference, rectangle and lock', async () => {
    const list = await listRows();
    expect(list).toMatchObject({ total: 6, returned: 6, offset: 0 });
    expect(names(list)).toEqual([
      'Título',
      'Formulário',
      'Nome',
      'Idade',
      'E-mail',
      'Cadastrar',
    ]);
    expect(list.markings[1]).toMatchObject({
      ref: markingRef('MF'),
      container: 'cadastro.png',
      parent: null,
      rect: { x: 50, y: 200, width: 900, height: 1200 },
      locked: true,
      annotations: 3,
    });
    expect(list.markings[2]).toMatchObject({
      parent: `mapping://cadastro/m/${codeOf(ws.ids.MF!)}`,
      locked: false,
      annotations: 1,
    });
    expect(list.markings.every((m) => REF.test(m.ref))).toBe(true);
  });

  it('container accepts the full reference from get_project; one from another project does not match', async () => {
    const project = ok(
      await mcp.call<{ containers: { ref: string }[] }>('get_project', {
        project: 'cadastro',
      }),
    );
    const ref = project.containers[0]!.ref;
    expect(REF.test(ref)).toBe(true);
    const viaRef = await listRows({ container: ref });
    expect(viaRef.total).toBeGreaterThan(0);
    expect(names(viaRef)).toEqual(names(await listRows({ container: 'cadastro.png' })));
    const other = ref.replace('mapping://cadastro/', 'mapping://outro/');
    expect(
      errorCode(
        await mcp.call('list_markings', { project: 'cadastro', container: other }),
      ),
    ).toBe('not-found');
  });

  it('filters by layer, annotation type and incomplete ones', async () => {
    expect(names(await listRows({ layer: 'Eventos' }))).toEqual(['E-mail', 'Cadastrar']);
    expect(names(await listRows({ layer: 'eventos' }))).toEqual(['E-mail', 'Cadastrar']);
    expect(names(await listRows({ layer: ws.ids.LM }))).toEqual(['Formulário']);
    expect(names(await listRows({ annotationType: 'button' }))).toEqual(['Cadastrar']);
    expect(names(await listRows({ annotationType: 'Input' }))).toEqual([
      'Nome',
      'Idade',
      'E-mail',
    ]);
    expect(names(await listRows({ annotationType: 'sdui/onClick' }))).toEqual([
      'Cadastrar',
    ]);
    const incomplete = await listRows({ incomplete: true });
    expect(names(incomplete)).toEqual(['Título']);
    expect(incomplete.markings[0]).toMatchObject({ incomplete: 1 });
    expect(
      names(await listRows({ layer: 'Eventos', annotationType: 'onChange' })),
    ).toEqual(['E-mail']);
    expect(
      names(await listRows({ layer: 'Componentes', annotationType: 'onChange' })),
    ).toEqual([]);
  });

  it('searches text in the name, keys and values, accent- and case-insensitive', async () => {
    expect(names(await listRows({ text: 'titulo' }))).toEqual(['Título']);
    expect(names(await listRows({ text: 'ANA@EXEMPLO' }))).toEqual(['Formulário']);
    expect(names(await listRows({ text: 'usuarios' }))).toEqual([
      'Formulário',
      'Cadastrar',
    ]);
    expect(names(await listRows({ text: 'input_idade' }))).toEqual(['Idade']);
    expect(names(await listRows({ text: 'age' }))).toEqual(['Formulário']);
    expect(names(await listRows({ text: 'xyz-nada' }))).toEqual([]);
    // The image name does not count: all the markings are in `cadastro.png`.
    expect(names(await listRows({ text: 'cadastro.png' }))).toEqual([]);
  });

  it('filters by container (and by the old image filter, with a warning) and paginates', async () => {
    for (const container of [
      'cadastro.png',
      'images/cadastro.png',
      `i/${codeOf(ws.ids.I1!)}`,
      ws.ids.I1,
    ]) {
      const rows = await listRows({ container });
      expect(rows).toMatchObject({ total: 6 });
      expect(rows.warnings).toBeUndefined();
    }
    const old = await listRows({ image: 'cadastro.png' });
    expect(old).toMatchObject({
      total: 6,
      warnings: [{ code: 'deprecated-argument' }],
    });
    const first = await listRows({ limit: 4 });
    expect(first).toMatchObject({
      returned: 4,
      truncated: true,
      nextOffset: 4,
      total: 6,
    });
    const second = await listRows({ limit: 4, offset: first.nextOffset });
    expect(names(second)).toEqual(['E-mail', 'Cadastrar']);
    expect(second.truncated).toBeUndefined();
  });

  it('errors on an unknown layer or container', async () => {
    expect(
      errorCode(await mcp.call('list_markings', { project: 'cadastro', layer: 'X' })),
    ).toBe('not-found');
    expect(
      errorCode(await mcp.call('list_markings', { project: 'cadastro', container: 'X' })),
    ).toBe('not-found');
  });
});

describe('get_marking', () => {
  it('shows the Cadastrar marking: annotations by layer, links and references', async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MC') }),
    );
    expect(data).toMatchObject({
      ref: markingRef('MC'),
      name: 'Cadastrar',
      container: {
        name: null,
        file: 'images/cadastro.png',
        background: null,
        width: 1000,
        height: 2000,
      },
      rect: { x: 100, y: 700, width: 800, height: 100 },
      lock: { locked: false, geometryLocked: true, source: 'inherited' },
      parent: markingRef('MF'),
      children: [],
      incompleteAnnotations: 0,
    });
    expect(data.path.map((s) => s.name)).toEqual([
      'cadastro.png',
      'Formulário',
      'Cadastrar',
    ]);

    const byLayer = Object.fromEntries(data.layers.map((l) => [l.layer.name, l]));
    const button = byLayer.Componentes!.annotations[0]!;
    expect(button).toMatchObject({
      kind: 'typed',
      title: 'Button btn_cadastrar',
      type: { specId: 'sdui', typeId: 'button', name: 'Button' },
      values: expect.objectContaining({ id: 'btn_cadastrar', texto: 'Cadastrar' }),
      owner: null,
    });
    expect(button.linked).toHaveLength(2);

    const [onClick, onHold] = byLayer.Eventos!.annotations;
    expect(onClick).toMatchObject({
      title: 'onClick /usuarios',
      type: { typeId: 'onClick' },
      owner: expect.stringMatching(REF),
      values: {
        acao: 'submit',
        destino: '/usuarios',
        parametros: [expect.objectContaining({ nome: 'origem', valor: 'cadastro' })],
      },
    });
    expect(onHold).toMatchObject({
      type: { typeId: 'onHold' },
      values: { duracaoMs: 500 },
    });
    expect(onClick!.owner).toBe(button.ref);

    expect(data.linkTree).toEqual([
      expect.objectContaining({
        title: 'Button btn_cadastrar',
        layer: 'Componentes',
        linked: [
          expect.objectContaining({ title: 'onClick /usuarios', layer: 'Eventos' }),
          expect.objectContaining({ title: 'onHold', layer: 'Eventos' }),
        ],
      }),
    ]);
  });

  it('resolves the outgoing references of Nome and the backlinks of User', async () => {
    const nameMarking = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MN') }),
    );
    const input = nameMarking.layers.find((l) => l.layer.name === 'Componentes')!
      .annotations[0]!;
    expect(input.refs).toEqual([
      {
        field: 'dado',
        row: null,
        column: null,
        to: 'User.name',
        target: expect.objectContaining({
          annotation: expect.stringMatching(/^mapping:\/\/cadastro\/a\/[0-9a-f]{8}$/),
          marking: `mapping://cadastro/m/${codeOf(ws.ids.MF!)}`,
          kind: 'entry',
          entryId: ws.ids.EN,
          key: 'name',
        }),
      },
    ]);

    const form = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MF') }),
    );
    const user = form.layers.find((l) => l.layer.name === 'Model')!.annotations[0]!;
    expect(user.backlinks).toEqual([
      expect.objectContaining({
        fromLabel: 'Input input_nome',
        fields: [{ field: 'dado', row: null, column: null, to: 'User.name' }],
      }),
      expect.objectContaining({
        fromLabel: 'Input input_idade',
        fields: [{ field: 'dado', row: null, column: null, to: 'User.age' }],
      }),
    ]);
    const classe = form.layers.find((l) => l.layer.name === 'Classes')!.annotations[0]!;
    expect(classe).toMatchObject({ title: 'Classe Contato', name: null });
    expect(classe.backlinks).toEqual([
      expect.objectContaining({
        fromLabel: 'Input input_email',
        fields: [expect.objectContaining({ to: 'Contato.email' })],
      }),
    ]);
    expect(form.children.map((c) => c.name)).toEqual([
      'Nome',
      'Idade',
      'E-mail',
      'Cadastrar',
    ]);
    expect(form.lock).toEqual({ locked: true, geometryLocked: true, source: 'self' });
  });

  it('shows the pending item of Título', async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MT') }),
    );
    expect(data.incompleteAnnotations).toBe(1);
    expect(data.layers[0]!.annotations[0]).toMatchObject({
      title: 'Text Crie sua conta',
      issues: [{ code: 'required-empty', key: 'id' }],
    });
  });
});

describe('get_annotation, get_container and resolve', () => {
  async function annotationRefOf(
    marking: string,
    name: string,
    title: string,
  ): Promise<string> {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef(marking) }),
    );
    const found = data.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.title === title);
    return found!.ref;
  }

  it('get_annotation returns the annotation with the marking and the references', async () => {
    const ref = await annotationRefOf('ME', 'E-mail', 'Input input_email');
    const data = ok(await mcp.call<AnnotationData>('get_annotation', { ref }));
    expect(data).toMatchObject({
      ref,
      kind: 'typed',
      marking: markingRef('ME'),
      layer: { name: 'Componentes' },
      values: expect.objectContaining({ tipo: 'email', obrigatorio: 'sim' }),
      refs: [
        {
          field: 'dado',
          to: 'Contato.email',
          target: expect.objectContaining({
            kind: 'row',
            key: 'atributos',
            rowId: ws.ids.R1,
          }),
        },
      ],
      linked: [expect.stringMatching(REF)],
    });
    expect(data.issues).toBeUndefined();
  });

  it('get_annotation of a free-form one returns the pairs', async () => {
    const ref = await annotationRefOf('MF', 'Formulário', 'User');
    const data = ok(await mcp.call<AnnotationData>('get_annotation', { ref }));
    expect(data).toMatchObject({
      kind: 'free',
      name: 'User',
      layer: { name: 'Model' },
    });
    expect(data.entries?.map((e) => e.key)).toEqual(['name', 'age']);
  });

  it('get_container brings the file, the absolute path and the top-level markings', async () => {
    const data = ok(
      await mcp.call('get_container', {
        ref: `mapping://cadastro/i/${codeOf(ws.ids.I1!)}`,
      }),
    );
    expect(data.warnings).toBeUndefined();
    expect(data).toMatchObject({
      background: null,
      file: 'images/cadastro.png',
      exists: true,
      path: join(realpathSync(ws.projectDir('apps/cadastro')), 'images', 'cadastro.png'),
      width: 1000,
      height: 2000,
      markings: 6,
      locked: false,
      topLevelMarkings: [{ name: 'Título' }, { name: 'Formulário' }],
    });
  });

  it('get_image still answers, with a warning that it is old', async () => {
    const ref = `mapping://cadastro/i/${codeOf(ws.ids.I1!)}`;
    const old = ok(await mcp.call('get_image', { ref }));
    const current = ok(await mcp.call('get_container', { ref }));
    expect(old.warnings).toEqual([
      expect.objectContaining({
        code: 'deprecated-tool',
        tool: 'get_image',
        message: expect.stringContaining('get_container'),
      }),
    ]);
    expect({ ...old, warnings: undefined }).toEqual({ ...current, warnings: undefined });
  });

  it('get_container warns when the file does not exist', async () => {
    const data = ok(
      await mcp.call('get_container', {
        project: 'sem-copias',
        ref: `i/${codeOf(ws.ids.I1!)}`,
      }),
    );
    expect(data).toMatchObject({ exists: false, path: null });
  });

  it('resolve discovers the type of the item', async () => {
    const code = codeOf(ws.ids.MN!);
    const marking = ok(await mcp.call('resolve', { ref: code, project: 'cadastro' }));
    expect(marking).toMatchObject({
      kind: 'marking',
      ref: markingRef('MN'),
      name: 'Nome',
      project: { name: 'cadastro', path: 'apps/cadastro' },
    });
    const image = ok(await mcp.call('resolve', { ref: ws.ids.I1, project: 'cadastro' }));
    expect(image).toMatchObject({
      kind: 'container',
      file: 'images/cadastro.png',
      background: null,
    });
    const annotation = ok(
      await mcp.call('resolve', { ref: ws.ids.AU, project: 'cadastro' }),
    );
    expect(annotation).toMatchObject({
      kind: 'annotation',
      layer: 'Model',
      marking: markingRef('MF'),
    });
  });
});

describe('reference formats', () => {
  const nameId = () => ws.ids.MN!;

  it('accepts the full reference, m/code with project, the full id and the id without hyphens', async () => {
    const forms: Record<string, unknown>[] = [
      { ref: markingRef('MN') },
      { ref: `m/${codeOf(nameId())}`, project: 'cadastro' },
      { ref: `m/${codeOf(nameId()).toUpperCase()}`, project: 'cadastro' },
      { ref: nameId(), project: 'cadastro' },
      { ref: nameId().replaceAll('-', ''), project: 'cadastro' },
      { ref: `mapping://cadastro/m/${codeOf(nameId())}` },
    ];
    for (const args of forms) {
      const data = ok(await mcp.call<MarkingData>('get_marking', args));
      expect(data.name, JSON.stringify(args)).toBe('Nome');
    }
  });

  it('refuses the old format (path in parentheses, uncoded project) with the hint', async () => {
    for (const ref of [
      `mapping://cadastro/m/${codeOf(nameId())} (anything › other)`,
      `mapping://My Project/m/${codeOf(nameId())}`,
    ]) {
      const result = await mcp.call('get_marking', { ref });
      expect(errorCode(result), ref).toBe('invalid-ref');
      const error = (result.data as unknown as ErrorData).error as ErrorData['error'] & {
        hint: string;
        accepted: string[];
      };
      expect(error.hint).toContain('copy again from the app');
      expect(error.accepted).toContain('mapping://project/m/3f2a9c1e');
      expect(error.accepted.join()).not.toContain('path');
    }
  });

  it('refuses an invalid reference, one of another kind or of another project', async () => {
    expect(errorCode(await mcp.call('get_marking', { ref: 'this is not a ref!' }))).toBe(
      'invalid-ref',
    );
    expect(
      errorCode(await mcp.call('get_marking', { ref: `a/${codeOf(ws.ids.AU!)}` })),
    ).toBe('wrong-kind');
    expect(
      errorCode(
        await mcp.call('get_annotation', {
          ref: `m/${codeOf(nameId())}`,
          project: 'cadastro',
        }),
      ),
    ).toBe('wrong-kind');
    expect(
      errorCode(
        await mcp.call('get_marking', { ref: `m/${codeOf(nameId())}`, project: 'unico' }),
      ),
    ).toBe('not-found');
    expect(
      errorCode(
        await mcp.call('get_marking', {
          ref: `mapping://cadastro/m/${codeOf(nameId())}`,
          project: 'legado',
        }),
      ),
    ).toBe('project-mismatch');
    expect(
      errorCode(
        await mcp.call('get_marking', { ref: 'm/00000000', project: 'cadastro' }),
      ),
    ).toBe('not-found');
  });

  it('without a project, searches all of them and finds the item that exists in only one', async () => {
    const code = codeOf(ws.uniqueIds.MN!);
    const data = ok(await mcp.call('resolve', { ref: `m/${code}` }));
    expect(data).toMatchObject({
      kind: 'marking',
      name: 'Nome',
      project: { name: 'unico' },
    });
    expect(data.ref).toBe(`mapping://unico/m/${code}`);
  });

  it('the same code in more than one project is ambiguous and lists the candidates', async () => {
    const result = await mcp.call('get_marking', { ref: `m/${codeOf(nameId())}` });
    expect(errorCode(result)).toBe('ambiguous-ref');
    const { error } = result.data as unknown as ErrorData;
    expect((error.candidates as { ref: string }[]).map((c) => c.ref)).toContain(
      markingRef('MN'),
    );
  });

  it('colliding codes grow to 12 characters and the short one returns the candidates', async () => {
    const list = ok(await mcp.call<RowList>('list_markings', { project: 'colisao' }));
    const refs = list.markings.map((m) => m.ref.split(' ')[0]!);
    expect(refs).toEqual([
      'mapping://colisao/m/aaaaaaaa1111',
      'mapping://colisao/m/aaaaaaaa2222',
      'mapping://colisao/m/bbbbbbbb',
    ]);
    const short = await mcp.call('resolve', { ref: 'm/aaaaaaaa', project: 'colisao' });
    expect(errorCode(short)).toBe('ambiguous-ref');
    const { error } = short.data as unknown as ErrorData;
    expect((error.candidates as unknown[]).length).toBe(2);
    expect(ok(await mcp.call('resolve', { ref: refs[1] }))).toMatchObject({
      name: 'second',
    });
  });
});

describe('get_specialization', () => {
  it('returns the full JSON of the applied specialization', async () => {
    const data = ok(
      await mcp.call('get_specialization', { project: 'cadastro', specId: 'sdui' }),
    );
    expect(data).toMatchObject({
      id: 'sdui',
      version: loadLegacySdui().version,
      file: 'specs/sdui.json',
    });
    expect(data.spec).toEqual(loadLegacySdui());
    expect((data.projectLayers as { name: string }[]).map((l) => l.name)).toEqual([
      'Componentes',
      'Eventos',
      'Telas',
    ]);
  });

  it('with platforms it brings the codeHint; without platforms, not', async () => {
    const withPlatforms = ok(
      await mcp.call('get_specialization', { project: 'cadastro', specId: 'sdui' }),
    );
    expect(withPlatforms.codeHint).toEqual(expect.stringContaining('instantiation'));
    expect(withPlatforms.codeHint).toEqual(expect.stringContaining('signature'));
    const without = ok(
      await mcp.call('get_specialization', {
        project: 'cadastro',
        specId: 'modelo-dados',
      }),
    );
    expect((without.spec as { platforms?: unknown[] }).platforms ?? []).toEqual([]);
    expect(without).not.toHaveProperty('codeHint');
  });

  it('errors if it is not applied or if the copy is missing', async () => {
    expect(
      errorCode(
        await mcp.call('get_specialization', { project: 'cadastro', specId: 'x' }),
      ),
    ).toBe('not-found');
    const missing = await mcp.call('get_specialization', {
      project: 'sem-copias',
      specId: 'sdui',
    });
    expect(errorCode(missing)).toBe('spec-unavailable');
  });
});

describe('path safety', () => {
  it('refuses .. and absolute paths outside the roots', async () => {
    for (const project of [
      '../fora/projeto-fora',
      'apps/../../fora/projeto-fora',
      join(ws.base, 'fora', 'projeto-fora'),
    ]) {
      expect(errorCode(await mcp.call('get_project', { project })), project).toBe(
        'outside-roots',
      );
    }
  });

  it('does not follow symbolic links outside, neither in discovery nor by path', async () => {
    const list = ok(await mcp.call('list_projects'));
    expect((list.projects as { name: string }[]).map((p) => p.name)).not.toContain(
      'projeto-fora',
    );
    expect(
      errorCode(await mcp.call('get_project', { project: 'escape/projeto-fora' })),
    ).toBe('outside-roots');
    expect(errorCode(await mcp.call('get_project', { project: 'projeto-fora' }))).toBe(
      'project-not-found',
    );
  });

  it('the specialization copy cited outside the project is not read', async () => {
    const data = ok(await mcp.call('get_project', { project: 'hostil-spec' }));
    expect((data.specializations as Record<string, unknown>[])[0]).toMatchObject({
      id: 'sdui',
      available: false,
      problem: 'missing',
    });
  });

  it('a hostile mapping.json does not make the server read outside the roots', async () => {
    const image = `i/${codeOf(ws.ids.I1!)}`;
    // `file` with `..` pointing to a file that exists, and `images/link.png` a link to outside.
    for (const project of ['hostil', 'hostil-link']) {
      const data = ok(await mcp.call('get_container', { project, ref: image }));
      expect(data, project).toMatchObject({ exists: false, path: null });
    }
  });
});

describe('create_project', () => {
  it('creates the project with mapping.json and .gitignore, without images/ (like the app), and it is already discovered', async () => {
    const created = ok(
      await mcp.call('create_project', { path: 'fresh/shop', name: ' Shop ' }),
    );
    expect(created).toMatchObject({
      created: true,
      name: 'shop',
      path: 'fresh/shop',
      projectName: 'Shop',
      schemaVersion: 20,
      revision: 0,
      // "Camada 1" and the Notas layer of the bundled library (applied by default).
      counts: { containers: 0, markings: 0, annotations: 0, layers: 2 },
    });
    const dir = ws.projectDir('fresh/shop');
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('backups/\n');
    // The app only creates `images/` when writing the first image; the server does the same (M2).
    expect(existsSync(join(dir, 'images'))).toBe(false);
    const parsed = deserialize(readFileSync(join(dir, 'mapping.json'), 'utf8'));
    expect(parsed.ok && parsed.project.layers.map((l) => l.name)).toEqual([
      'Camada 1',
      'Notas',
    ]);
    // The notes library package, written along with mapping.json.
    for (const file of [
      'notas.spec.json',
      join('components', 'nota.json'),
      join('docs', 'nota.md'),
    ]) {
      expect(existsSync(join(dir, 'specs', 'notas', file)), file).toBe(true);
    }

    const project = ok(await mcp.call('get_project', { project: 'shop' }));
    expect(project).toMatchObject({ projectName: 'Shop', containers: [] });
  });

  it('refuses an empty name, an existing project and a project inside another', async () => {
    expect(
      errorCode(await mcp.call('create_project', { path: 'empty', name: '  ' })),
    ).toBe('invalid-name');
    expect(
      errorCode(await mcp.call('create_project', { path: 'apps/cadastro', name: 'X' })),
    ).toBe('already-exists');
    expect(
      errorCode(
        await mcp.call('create_project', { path: 'apps/cadastro/nested', name: 'X' }),
      ),
    ).toBe('nested-project');
  });

  it('refuses .., an absolute path outside the roots and a symbolic link to outside', async () => {
    for (const path of [
      '../intruder',
      'a/../../intruder',
      join(ws.base, 'intruder'),
      'escape/intruder',
    ]) {
      expect(errorCode(await mcp.call('create_project', { path, name: 'X' })), path).toBe(
        'outside-roots',
      );
    }
  });
});

describe('several roots', () => {
  let second: string;
  let multi: Connection;

  beforeAll(async () => {
    const other = createWorkspace();
    second = other.root;
    multi = await connect([ws.root, second]);
  });
  afterAll(async () => {
    await multi.close();
  });

  it('projects with the same name ask for the path; with it, the server answers', async () => {
    const result = await multi.call('get_project', { project: 'cadastro' });
    expect(errorCode(result)).toBe('ambiguous-project');
    const { error } = result.data as unknown as ErrorData;
    expect(error.candidates).toHaveLength(2);
    const byDir = ok(
      await multi.call('get_project', { project: join(second, 'apps', 'cadastro') }),
    );
    expect(byDir.root).toBe(second);
  });

  it('create_project asks for the root when there is more than one and the path is relative', async () => {
    expect(
      errorCode(await multi.call('create_project', { path: 'newproj', name: 'N' })),
    ).toBe('root-required');
    const created = ok(
      await multi.call('create_project', { path: 'newproj', name: 'N', root: second }),
    );
    expect(created.root).toBe(second);
  });
});

describe('`root` of create_project (relative roots, as in .mcp.json)', () => {
  // The server starts with the working directory at `ws.base` and the roots as a `.mcp.json`
  // would write them: relative to it. Two of them have the same folder name (`mappings`).
  let rel: Connection;
  const design = () => join(ws.base, 'design', 'mappings');
  const otherDir = () => join(ws.base, 'other', 'mappings');

  beforeAll(async () => {
    mkdirSync(design(), { recursive: true });
    mkdirSync(otherDir(), { recursive: true });
    symlinkSync(design(), join(ws.base, 'shortcut'), 'dir');
    rel = await connect(['raiz', 'design/mappings', 'other/mappings'], {
      cwd: ws.base,
    });
  });
  afterAll(async () => {
    await rel.close();
  });

  const create = (path: string, root: string) =>
    rel.call('create_project', { path, name: 'N', root });

  it('accepts the path as in --root: relative, with ./, with a trailing slash and absolute (M1)', async () => {
    for (const [path, root] of [
      ['rel-a', 'design/mappings'],
      ['rel-b', './design/mappings'],
      ['rel-c', 'design/mappings/'],
      ['rel-d', design()],
    ] as const) {
      const created = ok(await create(path, root));
      expect(created.root, root).toBe(design());
      expect(existsSync(join(design(), path, 'mapping.json')), root).toBe(true);
    }
  });

  it('accepts a symbolic link to the root and the folder name, if it is unique (M1)', async () => {
    expect(ok(await create('rel-e', 'shortcut')).root).toBe(design());
    expect(ok(await create('rel-f', 'raiz')).root).toBe(ws.root);
    rmSync(join(ws.root, 'rel-f'), { recursive: true });
  });

  it('a folder name that matches more than one root asks for the path (Q1)', async () => {
    const result = await create('rel-g', 'mappings');
    expect(errorCode(result)).toBe('unknown-root');
    const { error } = result.data as unknown as ErrorData;
    expect(error.message).toContain('use the path');
    expect(error.roots).toEqual([ws.root, design(), otherDir()]);
    expect(existsSync(join(design(), 'rel-g'))).toBe(false);
    expect(existsSync(join(otherDir(), 'rel-g'))).toBe(false);
  });

  it('an unknown root is still unknown-root', async () => {
    expect(errorCode(await create('rel-h', 'no/such'))).toBe('unknown-root');
  });

  it('an absolute path in a root other than the indicated one is invalid-arguments (M12)', async () => {
    const inOther = join(otherDir(), 'abs-a');
    expect(errorCode(await create(inOther, 'design/mappings'))).toBe('invalid-arguments');
    expect(existsSync(inOther)).toBe(false);
    // Inside the indicated root: creates it.
    const inDesign = join(design(), 'abs-b');
    expect(ok(await create(inDesign, 'design/mappings')).root).toBe(design());
    // Outside all the roots: security speaks first.
    expect(errorCode(await create(join(ws.base, 'abs-c'), 'design/mappings'))).toBe(
      'outside-roots',
    );
  });
});

describe('resources and instructions', () => {
  it('serves the documentation as resources', async () => {
    const { resources } = await mcp.client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([
      'mapping-docs://AGENT-GUIDE.md',
      'mapping-docs://COMMENT-FORMAT.md',
      'mapping-docs://COMPONENT-FORMAT.md',
      'mapping-docs://FORMAT.md',
      'mapping-docs://SIGNATURE-FORMAT.md',
      'mapping-docs://SPEC-FORMAT.md',
    ]);
    for (const file of [
      'AGENT-GUIDE.md',
      'COMMENT-FORMAT.md',
      'COMPONENT-FORMAT.md',
      'FORMAT.md',
      'SIGNATURE-FORMAT.md',
      'SPEC-FORMAT.md',
    ]) {
      const read = await mcp.client.readResource({ uri: `mapping-docs://${file}` });
      expect(read.contents[0]).toMatchObject({
        mimeType: 'text/markdown',
        text: readFileSync(join('docs', file), 'utf8'),
      });
    }
  });

  it('announces the read, image and write tools and the instructions point to the guide', async () => {
    const { tools } = await mcp.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_project',
      'find_by_code',
      'find_by_source',
      'find_types_by_source',
      'get_annotation',
      'get_code_hints',
      'get_component',
      'get_container',
      'get_container_file',
      'get_image',
      'get_image_file',
      'get_marking',
      'get_marking_image',
      'get_perspective',
      'get_project',
      'get_proposal',
      'get_proposal_review',
      'get_specialization',
      'get_thread',
      'list_components',
      'list_markings',
      'list_projects',
      'list_proposals',
      'list_threads',
      'open_thread',
      'plan_changes',
      'plan_library_update',
      'plan_signature_import',
      'post_message',
      'propose_changes',
      'render_container',
      'render_marking',
      'resolve',
      'revise_proposal',
      'validate_library',
      'validate_specialization',
      'wait_for_comment',
      'withdraw_proposal',
    ]);
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly).not.toContain('create_project');
    // The only tools that write anything: the empty project, the proposals and the conversations (never mapping.json).
    const writers = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name);
    expect(writers.sort()).toEqual([
      'create_project',
      'open_thread',
      'post_message',
      'propose_changes',
      'revise_proposal',
      'withdraw_proposal',
    ]);
    // plan_changes only validates: nothing is written, not even a proposal.
    expect(readOnly).toContain('plan_changes');
    // The code and origin tools only read (the code one only checks that files exist).
    expect(readOnly).toEqual(
      expect.arrayContaining([
        'get_code_hints',
        'find_by_code',
        'find_by_source',
        'find_types_by_source',
        'validate_specialization',
        'validate_library',
        'plan_library_update',
        'plan_signature_import',
        'list_components',
        'get_component',
        'list_proposals',
        'get_proposal',
        'get_proposal_review',
      ]),
    );
    expect(mcp.client.getInstructions()).toContain('mapping-docs://AGENT-GUIDE.md');
  });
});
