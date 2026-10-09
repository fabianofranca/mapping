import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deserialize } from '../../src/model';
import { loadExample } from '../model/specFixtures';
import {
  codeOf,
  connect,
  createWorkspace,
  type Call,
  type Connection,
  type Workspace,
} from './workspace';

// Integração: sobe o `dist-mcp/mapping-mcp.js` por stdio, com o cliente do SDK MCP, sobre uma
// pasta temporária com o projeto do roteiro 13.9 (tela de cadastro) e variações dele.

interface Row {
  ref: string;
  name: string | null;
  image: string;
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
  markings: Row[];
}
interface AnnotationData {
  ref: string;
  kind: 'free' | 'typed';
  name: string | null;
  title: string;
  layer: { id: string; name: string };
  marking?: string;
  inherit: boolean;
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
  backlinks?: { from: string; fromLabel: string; field: string; to: string }[];
  issues?: { code: string; key?: string }[];
}
interface MarkingData {
  ref: string;
  name: string | null;
  path: { ref: string; name: string }[];
  image: {
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
    inherited?: { from: string; annotation: AnnotationData }[];
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

const REF = /^mapping:\/\/cadastro\/([mia])\/[0-9a-f]{8}( \(.+\))?$/;

function ok<T>(result: Call<T>): T {
  expect(result.isError, JSON.stringify(result.data)).toBe(false);
  return result.data;
}

function errorCode(result: Call): string {
  expect(result.isError).toBe(true);
  return (result.data as unknown as ErrorData).error.code;
}

/** Referência completa de uma marcação do `cadastroProject` (`MF`, `MN`…), pelo id original. */
function markingRef(key: string, name: string): string {
  const path = [
    'cadastro.png',
    ...(CHILDREN_OF_FORM.has(key) ? ['Formulário'] : []),
    name,
  ];
  return `mapping://cadastro/m/${codeOf(ws.ids[key]!)} (${path.join(' › ')})`;
}

const CHILDREN_OF_FORM: ReadonlySet<string> = new Set(['MN', 'MI', 'ME', 'MC']);

async function listRows(args: Record<string, unknown> = {}): Promise<RowList> {
  return ok(await mcp.call<RowList>('list_markings', { project: 'cadastro', ...args }));
}

const names = (list: RowList) => list.markings.map((m) => m.name);

describe('list_projects e descoberta', () => {
  it('acha os projetos em qualquer profundidade e ignora o que não é projeto', async () => {
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

  it('resume cada projeto: contagens, revisão e especializações', async () => {
    const data = ok(await mcp.call('list_projects'));
    const cadastro = (data.projects as Record<string, unknown>[])[0]!;
    expect(cadastro).toMatchObject({
      name: 'cadastro',
      projectName: 'Teste',
      schemaVersion: 8,
      revision: 0,
      counts: { images: 1, markings: 6, annotations: 11, layers: 7 },
      specializations: [
        { id: 'sdui', version: loadExample('sdui').version },
        { id: 'modelo-dados', version: 1 },
      ],
    });
    expect(cadastro.dir).toBe(realpathSync(ws.projectDir('apps/cadastro')));
  });

  it('um projeto ilegível aparece com o motivo, sem esconder os outros', async () => {
    const data = ok(await mcp.call('list_projects'));
    const quebrado = (data.projects as { name: string; error?: { code: string } }[]).find(
      (p) => p.name === 'quebrado',
    );
    expect(quebrado?.error?.code).toBe('invalid-project');
  });

  it('informa a raiz que não existe', async () => {
    const other = await connect([join(ws.base, 'nao-existe')]);
    try {
      const data = ok(await other.call('list_projects'));
      expect(data).toMatchObject({
        projects: [],
        missingRoots: [join(ws.base, 'nao-existe')],
      });
    } finally {
      await other.close();
    }
  });
});

describe('get_project', () => {
  it('resume imagens, camadas, especializações e pendências', async () => {
    const data = ok(await mcp.call('get_project', { project: 'cadastro' }));
    expect(data).toMatchObject({
      name: 'cadastro',
      images: [
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

  it('marca a cópia ausente da especialização e a migração do schema', async () => {
    const semCopias = ok(await mcp.call('get_project', { project: 'sem-copias' }));
    expect(semCopias.specializations).toEqual([
      expect.objectContaining({ id: 'sdui', available: false, problem: 'missing' }),
      expect.objectContaining({
        id: 'modelo-dados',
        available: false,
        problem: 'missing',
      }),
    ]);
    const legado = ok(await mcp.call('get_project', { project: 'legado' }));
    expect(legado).toMatchObject({ schemaVersion: 8, revision: 0, migratedFrom: 5 });
  });

  it('ler nunca regrava o mapping.json (nem o de schema antigo)', () => {
    const text = readFileSync(join(ws.projectDir('legado'), 'mapping.json'), 'utf8');
    expect(JSON.parse(text)).toMatchObject({ schemaVersion: 5 });
  });

  it('aceita o nome da pasta, o caminho relativo e o absoluto', async () => {
    for (const project of ['cadastro', 'apps/cadastro', ws.projectDir('apps/cadastro')]) {
      const data = ok(await mcp.call('get_project', { project }));
      expect(data.name).toBe('cadastro');
    }
    expect(errorCode(await mcp.call('get_project', { project: 'nao-existe' }))).toBe(
      'project-not-found',
    );
    expect(errorCode(await mcp.call('get_project', { project: 'so-uma-pasta' }))).toBe(
      'project-not-found',
    );
  });
});

describe('list_markings', () => {
  it('lista as marcações em profundidade, com referência, retângulo e trava', async () => {
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
      ref: markingRef('MF', 'Formulário'),
      image: 'cadastro.png',
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

  it('filtra por camada, tipo de anotação e incompletas', async () => {
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
    const incompletas = await listRows({ incomplete: true });
    expect(names(incompletas)).toEqual(['Título']);
    expect(incompletas.markings[0]).toMatchObject({ incomplete: 1 });
    expect(
      names(await listRows({ layer: 'Eventos', annotationType: 'onChange' })),
    ).toEqual(['E-mail']);
    expect(
      names(await listRows({ layer: 'Componentes', annotationType: 'onChange' })),
    ).toEqual([]);
  });

  it('busca texto no nome, nas chaves e nos valores, sem acento nem maiúsculas', async () => {
    expect(names(await listRows({ text: 'titulo' }))).toEqual(['Título']);
    expect(names(await listRows({ text: 'ANA@EXEMPLO' }))).toEqual(['Formulário']);
    expect(names(await listRows({ text: 'usuarios' }))).toEqual([
      'Formulário',
      'Cadastrar',
    ]);
    expect(names(await listRows({ text: 'input_idade' }))).toEqual(['Idade']);
    expect(names(await listRows({ text: 'age' }))).toEqual(['Formulário']);
    expect(names(await listRows({ text: 'xyz-nada' }))).toEqual([]);
    // O nome da imagem não conta: todas as marcações estão em `cadastro.png`.
    expect(names(await listRows({ text: 'cadastro.png' }))).toEqual([]);
  });

  it('filtra por imagem e pagina', async () => {
    for (const image of [
      'cadastro.png',
      'images/cadastro.png',
      `i/${codeOf(ws.ids.I1!)}`,
      ws.ids.I1,
    ]) {
      expect(await listRows({ image })).toMatchObject({ total: 6 });
    }
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

  it('erra com camada ou imagem desconhecida', async () => {
    expect(
      errorCode(await mcp.call('list_markings', { project: 'cadastro', layer: 'X' })),
    ).toBe('not-found');
    expect(
      errorCode(await mcp.call('list_markings', { project: 'cadastro', image: 'X' })),
    ).toBe('not-found');
  });
});

describe('get_marking', () => {
  it('mostra o Cadastrar: anotações por camada, vínculos e referências', async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MC', 'Cadastrar') }),
    );
    expect(data).toMatchObject({
      ref: markingRef('MC', 'Cadastrar'),
      name: 'Cadastrar',
      image: { name: null, file: 'images/cadastro.png', width: 1000, height: 2000 },
      rect: { x: 100, y: 700, width: 800, height: 100 },
      lock: { locked: false, geometryLocked: true, source: 'inherited' },
      parent: expect.stringContaining('Formulário'),
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
    expect(onClick!.owner).toBe(button.ref.replace(/ \(.*\)$/, ''));

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

  it('mostra as anotações herdadas, com a marcação de origem', async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MN', 'Nome') }),
    );
    const model = data.layers.find((l) => l.layer.name === 'Model')!;
    expect(model.annotations).toEqual([]);
    expect(model.inherited).toEqual([
      {
        from: markingRef('MF', 'Formulário'),
        annotation: expect.objectContaining({
          kind: 'free',
          name: 'User',
          entries: [
            { id: ws.ids.EN, key: 'name', value: 'string' },
            { id: ws.ids.EA, key: 'age', value: 'number' },
          ],
        }),
      },
    ]);
    // Só a camada com anotação própria ou herdada aparece.
    expect(data.layers.map((l) => l.layer.name)).toEqual(['Model', 'Componentes']);
  });

  it('resolve as referências de saída do Nome e os backlinks da User', async () => {
    const nome = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MN', 'Nome') }),
    );
    const input = nome.layers.find((l) => l.layer.name === 'Componentes')!
      .annotations[0]!;
    expect(input.refs).toEqual([
      {
        field: 'dado',
        to: 'User.name',
        target: expect.objectContaining({
          annotation: expect.stringContaining('Formulário › User'),
          marking: `mapping://cadastro/m/${codeOf(ws.ids.MF!)}`,
          kind: 'entry',
          entryId: ws.ids.EN,
          key: 'name',
        }),
      },
    ]);

    const form = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MF', 'Formulário') }),
    );
    const user = form.layers.find((l) => l.layer.name === 'Model')!.annotations[0]!;
    expect(user.backlinks).toEqual([
      expect.objectContaining({
        fromLabel: 'Input input_nome',
        field: 'dado',
        to: 'User.name',
      }),
      expect.objectContaining({
        fromLabel: 'Input input_idade',
        field: 'dado',
        to: 'User.age',
      }),
    ]);
    const classe = form.layers.find((l) => l.layer.name === 'Classes')!.annotations[0]!;
    expect(classe).toMatchObject({ title: 'Classe Contato', name: null });
    expect(classe.backlinks).toEqual([
      expect.objectContaining({ fromLabel: 'Input input_email', to: 'Contato.email' }),
    ]);
    expect(form.children.map((c) => c.name)).toEqual([
      'Nome',
      'Idade',
      'E-mail',
      'Cadastrar',
    ]);
    expect(form.lock).toEqual({ locked: true, geometryLocked: true, source: 'self' });
  });

  it('mostra a pendência do Título', async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef('MT', 'Título') }),
    );
    expect(data.incompleteAnnotations).toBe(1);
    expect(data.layers[0]!.annotations[0]).toMatchObject({
      title: 'Text Crie sua conta',
      issues: [{ code: 'required-empty', key: 'id' }],
    });
  });
});

describe('get_annotation, get_image e resolve', () => {
  async function annotationRefOf(
    marking: string,
    name: string,
    title: string,
  ): Promise<string> {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: markingRef(marking, name) }),
    );
    const found = data.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.title === title);
    return found!.ref;
  }

  it('get_annotation devolve a anotação com a marcação e as referências', async () => {
    const ref = await annotationRefOf('ME', 'E-mail', 'Input input_email');
    const data = ok(await mcp.call<AnnotationData>('get_annotation', { ref }));
    expect(data).toMatchObject({
      ref,
      kind: 'typed',
      marking: markingRef('ME', 'E-mail'),
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

  it('get_annotation de uma livre devolve os pares', async () => {
    const ref = await annotationRefOf('MF', 'Formulário', 'User');
    const data = ok(await mcp.call<AnnotationData>('get_annotation', { ref }));
    expect(data).toMatchObject({
      kind: 'free',
      name: 'User',
      inherit: true,
      layer: { name: 'Model' },
    });
    expect(data.entries?.map((e) => e.key)).toEqual(['name', 'age']);
  });

  it('get_image traz o arquivo, o caminho absoluto e as marcações de primeiro nível', async () => {
    const data = ok(
      await mcp.call('get_image', { ref: `mapping://cadastro/i/${codeOf(ws.ids.I1!)}` }),
    );
    expect(data).toMatchObject({
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

  it('get_image avisa quando o arquivo não existe', async () => {
    const data = ok(
      await mcp.call('get_image', {
        project: 'sem-copias',
        ref: `i/${codeOf(ws.ids.I1!)}`,
      }),
    );
    expect(data).toMatchObject({ exists: false, path: null });
  });

  it('resolve descobre o tipo do item', async () => {
    const code = codeOf(ws.ids.MN!);
    const marking = ok(await mcp.call('resolve', { ref: code, project: 'cadastro' }));
    expect(marking).toMatchObject({
      kind: 'marking',
      ref: markingRef('MN', 'Nome'),
      name: 'Nome',
      project: { name: 'cadastro', path: 'apps/cadastro' },
    });
    const image = ok(await mcp.call('resolve', { ref: ws.ids.I1, project: 'cadastro' }));
    expect(image).toMatchObject({ kind: 'image', file: 'images/cadastro.png' });
    const annotation = ok(
      await mcp.call('resolve', { ref: ws.ids.AU, project: 'cadastro' }),
    );
    expect(annotation).toMatchObject({
      kind: 'annotation',
      layer: 'Model',
      marking: markingRef('MF', 'Formulário'),
    });
  });
});

describe('formatos de referência', () => {
  const nome = () => ws.ids.MN!;

  it('aceita a referência completa, m/código com project, o id completo e o id sem hífens', async () => {
    const forms: Record<string, unknown>[] = [
      { ref: markingRef('MN', 'Nome') },
      { ref: `m/${codeOf(nome())}`, project: 'cadastro' },
      { ref: `m/${codeOf(nome()).toUpperCase()}`, project: 'cadastro' },
      { ref: nome(), project: 'cadastro' },
      { ref: nome().replaceAll('-', ''), project: 'cadastro' },
      { ref: `mapping://cadastro/m/${codeOf(nome())}` },
    ];
    for (const args of forms) {
      const data = ok(await mcp.call<MarkingData>('get_marking', args));
      expect(data.name, JSON.stringify(args)).toBe('Nome');
    }
  });

  it('ignora o caminho legível da referência colada', async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: `mapping://cadastro/m/${codeOf(nome())} (qualquer coisa › outra)`,
      }),
    );
    expect(data.name).toBe('Nome');
  });

  it('recusa referência inválida, de outro tipo ou de outro projeto', async () => {
    expect(errorCode(await mcp.call('get_marking', { ref: 'isto não é ref!' }))).toBe(
      'invalid-ref',
    );
    expect(
      errorCode(await mcp.call('get_marking', { ref: `a/${codeOf(ws.ids.AU!)}` })),
    ).toBe('wrong-kind');
    expect(
      errorCode(
        await mcp.call('get_annotation', {
          ref: `m/${codeOf(nome())}`,
          project: 'cadastro',
        }),
      ),
    ).toBe('wrong-kind');
    expect(
      errorCode(
        await mcp.call('get_marking', { ref: `m/${codeOf(nome())}`, project: 'unico' }),
      ),
    ).toBe('not-found');
    expect(
      errorCode(
        await mcp.call('get_marking', {
          ref: `mapping://cadastro/m/${codeOf(nome())}`,
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

  it('sem projeto, procura em todos e acha o item que só existe num deles', async () => {
    const code = codeOf(ws.uniqueIds.MN!);
    const data = ok(await mcp.call('resolve', { ref: `m/${code}` }));
    expect(data).toMatchObject({
      kind: 'marking',
      name: 'Nome',
      project: { name: 'unico' },
    });
    expect(data.ref).toBe(`mapping://unico/m/${code} (cadastro.png › Formulário › Nome)`);
  });

  it('o mesmo código em mais de um projeto é ambíguo e lista as candidatas', async () => {
    const result = await mcp.call('get_marking', { ref: `m/${codeOf(nome())}` });
    expect(errorCode(result)).toBe('ambiguous-ref');
    const { error } = result.data as unknown as ErrorData;
    expect((error.candidates as { ref: string }[]).map((c) => c.ref)).toContain(
      markingRef('MN', 'Nome'),
    );
  });

  it('códigos que colidem crescem para 12 caracteres e o curto devolve as candidatas', async () => {
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
  it('devolve o JSON completo da especialização aplicada', async () => {
    const data = ok(
      await mcp.call('get_specialization', { project: 'cadastro', specId: 'sdui' }),
    );
    expect(data).toMatchObject({
      id: 'sdui',
      version: loadExample('sdui').version,
      file: 'specs/sdui.json',
    });
    expect(data.spec).toEqual(loadExample('sdui'));
    expect((data.projectLayers as { name: string }[]).map((l) => l.name)).toEqual([
      'Componentes',
      'Eventos',
      'Telas',
    ]);
  });

  it('erra se não está aplicada ou se a cópia está ausente', async () => {
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

describe('segurança de caminhos', () => {
  it('recusa .. e caminhos absolutos fora das raízes', async () => {
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

  it('não segue links simbólicos para fora, nem na descoberta nem por caminho', async () => {
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

  it('a cópia da especialização citada fora do projeto não é lida', async () => {
    const data = ok(await mcp.call('get_project', { project: 'hostil-spec' }));
    expect((data.specializations as Record<string, unknown>[])[0]).toMatchObject({
      id: 'sdui',
      available: false,
      problem: 'missing',
    });
  });

  it('um mapping.json hostil não faz o servidor ler fora das raízes', async () => {
    const image = `i/${codeOf(ws.ids.I1!)}`;
    // `file` com `..` apontando para um arquivo que existe, e `images/link.png` link para fora.
    for (const project of ['hostil', 'hostil-link']) {
      const data = ok(await mcp.call('get_image', { project, ref: image }));
      expect(data, project).toMatchObject({ exists: false, path: null });
    }
  });
});

describe('create_project', () => {
  it('cria o projeto com mapping.json, images/ e .gitignore, e ele já é descoberto', async () => {
    const created = ok(
      await mcp.call('create_project', { path: 'novos/loja', name: ' Loja ' }),
    );
    expect(created).toMatchObject({
      created: true,
      name: 'loja',
      path: 'novos/loja',
      projectName: 'Loja',
      schemaVersion: 8,
      revision: 0,
      counts: { images: 0, markings: 0, annotations: 0, layers: 1 },
    });
    const dir = ws.projectDir('novos/loja');
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('backups/\n');
    const parsed = deserialize(readFileSync(join(dir, 'mapping.json'), 'utf8'));
    expect(parsed.ok && parsed.project.layers[0]!.name).toBe('Camada 1');

    const project = ok(await mcp.call('get_project', { project: 'loja' }));
    expect(project).toMatchObject({ projectName: 'Loja', images: [] });
  });

  it('recusa nome vazio, projeto existente e projeto dentro de outro', async () => {
    expect(
      errorCode(await mcp.call('create_project', { path: 'vazio', name: '  ' })),
    ).toBe('invalid-name');
    expect(
      errorCode(await mcp.call('create_project', { path: 'apps/cadastro', name: 'X' })),
    ).toBe('already-exists');
    expect(
      errorCode(
        await mcp.call('create_project', { path: 'apps/cadastro/novo', name: 'X' }),
      ),
    ).toBe('nested-project');
  });

  it('recusa .., absoluto fora das raízes e link simbólico para fora', async () => {
    for (const path of [
      '../invasor',
      'a/../../invasor',
      join(ws.base, 'invasor'),
      'escape/invasor',
    ]) {
      expect(errorCode(await mcp.call('create_project', { path, name: 'X' })), path).toBe(
        'outside-roots',
      );
    }
  });
});

describe('várias raízes', () => {
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

  it('projetos homônimos pedem o caminho; com ele, o servidor responde', async () => {
    const result = await multi.call('get_project', { project: 'cadastro' });
    expect(errorCode(result)).toBe('ambiguous-project');
    const { error } = result.data as unknown as ErrorData;
    expect(error.candidates).toHaveLength(2);
    const byDir = ok(
      await multi.call('get_project', { project: join(second, 'apps', 'cadastro') }),
    );
    expect(byDir.root).toBe(second);
  });

  it('create_project pede a raiz quando há mais de uma e o caminho é relativo', async () => {
    expect(
      errorCode(await multi.call('create_project', { path: 'novo', name: 'N' })),
    ).toBe('root-required');
    const created = ok(
      await multi.call('create_project', { path: 'novo', name: 'N', root: second }),
    );
    expect(created.root).toBe(second);
  });
});

describe('recursos e instruções', () => {
  it('serve a documentação como recursos', async () => {
    const { resources } = await mcp.client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([
      'mapping-docs://AGENT-GUIDE.md',
      'mapping-docs://FORMAT.md',
      'mapping-docs://SPEC-FORMAT.md',
    ]);
    for (const file of ['AGENT-GUIDE.md', 'FORMAT.md', 'SPEC-FORMAT.md']) {
      const read = await mcp.client.readResource({ uri: `mapping-docs://${file}` });
      expect(read.contents[0]).toMatchObject({
        mimeType: 'text/markdown',
        text: readFileSync(join('docs', file), 'utf8'),
      });
    }
  });

  it('anuncia as tools de leitura, de imagem e de escrita e as instruções apontam o guia', async () => {
    const { tools } = await mcp.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_project',
      'find_by_code',
      'find_by_source',
      'find_types_by_source',
      'get_annotation',
      'get_code_hints',
      'get_image',
      'get_image_file',
      'get_marking',
      'get_marking_image',
      'get_project',
      'get_proposal',
      'get_proposal_review',
      'get_specialization',
      'list_markings',
      'list_projects',
      'list_proposals',
      'plan_changes',
      'propose_changes',
      'resolve',
      'validate_specialization',
      'withdraw_proposal',
    ]);
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly).not.toContain('create_project');
    // As únicas tools que gravam algo: o projeto vazio e as propostas (nunca o mapping.json).
    const writers = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name);
    expect(writers.sort()).toEqual([
      'create_project',
      'propose_changes',
      'withdraw_proposal',
    ]);
    // plan_changes só valida: nada é gravado, nem proposta.
    expect(readOnly).toContain('plan_changes');
    // As tools de código e de origem só leem (a de código só confere a existência de arquivos).
    expect(readOnly).toEqual(
      expect.arrayContaining([
        'get_code_hints',
        'find_by_code',
        'find_by_source',
        'find_types_by_source',
        'validate_specialization',
        'list_proposals',
        'get_proposal',
        'get_proposal_review',
      ]),
    );
    expect(mcp.client.getInstructions()).toContain('mapping-docs://AGENT-GUIDE.md');
  });
});
