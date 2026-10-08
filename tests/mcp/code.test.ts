import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deserialize, platformRepoWarnings } from '../../src/model';
import {
  CADASTRO_SCREEN_KT,
  CADASTRO_VIEW_MODEL_KT,
  CADASTRO_VIEW_SWIFT,
  createCodeWorkspace,
  type CodeWorkspace,
} from './codeWorkspace';
import { codeOf, connect, type Call, type Connection } from './workspace';

// Etapa 3b.4, passo 6 do roteiro: get_code_hints, get_marking com os codeRef, find_by_code e
// um lote com codeRef + repositório, pelo dist-mcp/mapping-mcp.js por stdio. O cenário é o
// repositório do app com o projeto dentro (`repo/design/mapeamentos/<projeto>`), e o cliente
// (diretório de trabalho do servidor) na raiz do repositório.

interface CodeRef {
  field: string;
  id: string;
  platform: string;
  path: string | null;
  symbol: string | null;
  line: number | null;
  url: string | null;
  localFile: string | null;
  exists: boolean | null;
  localFileProblem?: string;
}
interface Annotation {
  ref: string;
  kind: 'free' | 'typed';
  type?: { specId: string; typeId: string };
  values?: Record<string, unknown>;
  codeRefs?: CodeRef[];
  code?: Record<string, { symbol: string }>;
}
interface MarkingData {
  platform?: string;
  layers: { layer: { name: string }; annotations: Annotation[] }[];
}
interface HintAnnotation {
  ref: string;
  type: { specId: string; typeId: string; name: string };
  symbol: string | null;
  params?: { field: string; name: string; value: unknown }[];
  notes?: string;
  values?: Record<string, unknown>;
  codeRefs?: CodeRef[];
  linked?: HintAnnotation[];
}
interface HintNode {
  ref: string;
  name: string | null;
  annotations?: HintAnnotation[];
  children?: HintNode[];
}
interface Hints {
  marking: string;
  platform: { id: string; name: string; language: string | null };
  repo: { urlTemplate: string | null; localPath: string | null } | null;
  unmappedTypes?: string[];
  tree: HintNode;
}
interface Match extends CodeRef {
  project: string;
  marking: string;
  markingName: string | null;
  annotation: string;
}
interface Found {
  query: Record<string, string>;
  searched: string[];
  unreadable?: string[];
  total: number;
  returned: number;
  matches: Match[];
}
interface Plan {
  valid: boolean;
  planId?: string;
  revision: number;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  warnings?: { code: string; platform: string; entries: number }[];
}
interface Applied {
  applied: boolean;
  revision: number;
}
interface Failure {
  error: { code: string; message: string; [key: string]: unknown };
}

let ws: CodeWorkspace;
let mcp: Connection;

beforeAll(async () => {
  ws = createCodeWorkspace();
  mcp = await connect([ws.root], { cwd: ws.repo });
});

afterAll(async () => {
  await mcp.close();
});

function ok<T>(result: Call<T>): T {
  expect(result.isError, JSON.stringify(result.data)).toBe(false);
  return result.data;
}

function errorOf(result: Call): Failure['error'] {
  expect(result.isError).toBe(true);
  return (result.data as unknown as Failure).error;
}

/** Referência de um item do `codeProject` no projeto indicado (`MF` = Formulário, `AS` = Screen). */
const refOf = (project: string, kind: 'm' | 'a', key: string) =>
  `mapping://${project}/${kind}/${codeOf(ws.ids[key]!)}`;

const REPO_URL = 'https://github.com/org/app-android/blob/main';

function findAnnotation(
  data: HintNode,
  predicate: (a: HintAnnotation) => boolean,
): HintAnnotation | undefined {
  const visit = (a: HintAnnotation): HintAnnotation | undefined =>
    predicate(a) ? a : a.linked?.map(visit).find(Boolean);
  const direct = data.annotations?.map(visit).find(Boolean);
  return direct ?? data.children?.map((c) => findAnnotation(c, predicate)).find(Boolean);
}

describe('get_code_hints', () => {
  it('traz a árvore do Formulário em android: símbolos, parâmetros traduzidos, eventos sob a dona e dado resolvido', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MF'),
        platform: 'android',
      }),
    );
    expect(hints.platform).toEqual({
      id: 'android',
      name: 'Android',
      language: 'kotlin',
    });
    expect(hints.repo).toEqual({
      urlTemplate: `${REPO_URL}/{path}#L{line}`,
      localPath: '../../..',
    });
    expect(hints.tree.name).toBe('Formulário');
    expect(hints.tree.children?.map((c) => c.name)).toEqual([
      'Nome',
      'Idade',
      'E-mail',
      'Cadastrar',
    ]);

    // Inputs: símbolo, parâmetros com o enum traduzido e o `dado` resolvido pelo rótulo do alvo.
    const inputs = hints.tree.children!.slice(0, 3).map((c) => c.annotations![0]!);
    expect(inputs.map((a) => a.symbol)).toEqual(Array(3).fill('com.app.ds.DSTextField'));
    expect(inputs.map((a) => a.params!.find((p) => p.field === 'tipo')!.value)).toEqual([
      'KeyboardType.Text',
      'KeyboardType.Number',
      'KeyboardType.Email',
    ]);
    expect(
      inputs.map((a) => a.params!.find((p) => p.field === 'obrigatorio')!.value),
    ).toEqual(['false', 'false', 'true']);
    expect(inputs.map((a) => a.values!.dado)).toEqual([
      'User.name',
      'User.age',
      'Contato.email',
    ]);
    expect(inputs[0]!.notes).toContain('dado');

    // Button com o estilo e o habilitado traduzidos; onClick e onHold vinculados sob ele.
    const button = hints.tree.children![3]!.annotations![0]!;
    expect(button).toMatchObject({ symbol: 'com.app.ds.DSButton' });
    expect(button.params).toEqual([
      { field: 'texto', name: 'text', value: 'Cadastrar' },
      { field: 'estilo', name: 'style', value: 'ButtonStyle.Primary' },
      { field: 'habilitado', name: 'enabled', value: 'true' },
    ]);
    expect(button.notes).toContain('testTag');
    expect(button.linked?.map((l) => [l.type.typeId, l.symbol])).toEqual([
      ['onClick', 'com.app.ds.OnClick'],
      ['onHold', 'com.app.ds.OnHold'],
    ]);
    expect(button.linked![0]!.params).toContainEqual({
      field: 'destino',
      name: 'target',
      value: '/usuarios',
    });
    // O onChange do E-mail também aparece sob o Input dele.
    expect(hints.tree.children![2]!.annotations![0]!.linked?.[0]?.symbol).toBe(
      'com.app.ds.OnChange',
    );
  });

  it('marca os tipos sem `code` na plataforma (symbol null) e traz onde o Screen já foi implementado', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MF'),
        platform: 'android',
      }),
    );
    expect(hints.unmappedTypes).toEqual(
      expect.arrayContaining(['sdui/screen', 'modelo-dados/classe']),
    );
    const screen = findAnnotation(hints.tree, (a) => a.type.typeId === 'screen')!;
    expect(screen.symbol).toBeNull();
    expect(screen.values).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    expect(screen.codeRefs?.map((c) => [c.symbol, c.exists])).toEqual([
      ['CadastroScreen', true],
      ['CadastroViewModel', false],
    ]);
  });

  it('usa os parâmetros da plataforma pedida e não vaza os codeRef das outras', async () => {
    const ios = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MC'),
        platform: 'ios',
      }),
    );
    expect(ios.platform.name).toBe('iOS');
    expect(ios.repo).toBeNull();
    const button = ios.tree.annotations![0]!;
    expect(button.symbol).toBe('DSButton');
    expect(button.params).toContainEqual({
      field: 'estilo',
      name: 'style',
      value: '.primary',
    });
    expect(ios.tree.children).toBeUndefined();

    const form = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MF'),
        platform: 'ios',
      }),
    );
    const screen = findAnnotation(form.tree, (a) => a.type.typeId === 'screen')!;
    expect(screen.codeRefs).toEqual([
      expect.objectContaining({
        platform: 'ios',
        path: CADASTRO_VIEW_SWIFT,
        url: null,
        localFile: null,
        exists: null,
      }),
    ]);
  });

  it('erros claros: plataforma não declarada, referência de outro tipo, marcação inexistente', async () => {
    const unknown = errorOf(
      await mcp.call('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MF'),
        platform: 'web',
      }),
    );
    expect(unknown.code).toBe('unknown-platform');
    expect(unknown.platforms).toEqual(['android', 'ios', 'bff']);

    const wrong = errorOf(
      await mcp.call('get_code_hints', {
        ref: refOf('cadastro', 'a', 'AS'),
        platform: 'android',
      }),
    );
    expect(wrong.code).toBe('wrong-kind');

    const missing = errorOf(
      await mcp.call('get_code_hints', {
        ref: 'mapping://cadastro/m/deadbeef',
        platform: 'android',
      }),
    );
    expect(missing.code).toBe('not-found');
  });
});

describe('get_marking, get_annotation e get_project', () => {
  async function screenAnnotation(
    project: string,
    platform?: string,
  ): Promise<Annotation> {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf(project, 'm', 'MF'),
        ...(platform ? { platform } : {}),
      }),
    );
    return data.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'screen')!;
  }

  it('traz os codeRef do Formulário com url, localFile e exists (e os tira de values)', async () => {
    const screen = await screenAnnotation('cadastro');
    expect(screen.values).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    expect(screen.codeRefs).toEqual([
      {
        field: 'implementacao',
        id: expect.any(String),
        platform: 'android',
        path: CADASTRO_SCREEN_KT,
        symbol: 'CadastroScreen',
        line: null,
        url: `${REPO_URL}/${CADASTRO_SCREEN_KT}`,
        localFile: CADASTRO_SCREEN_KT,
        exists: true,
      },
      {
        field: 'implementacao',
        id: expect.any(String),
        platform: 'android',
        path: CADASTRO_VIEW_MODEL_KT,
        symbol: 'CadastroViewModel',
        line: 42,
        url: `${REPO_URL}/${CADASTRO_VIEW_MODEL_KT}#L42`,
        localFile: CADASTRO_VIEW_MODEL_KT,
        exists: false,
      },
      {
        field: 'implementacao',
        id: expect.any(String),
        platform: 'ios',
        path: CADASTRO_VIEW_SWIFT,
        symbol: 'CadastroView',
        line: null,
        url: null,
        localFile: null,
        exists: null,
      },
    ]);
  });

  it('traz o `code` das plataformas por anotação tipada e o filtro `platform` vale para os dois', async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf('cadastro', 'm', 'MC'),
      }),
    );
    const button = data.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(Object.keys(button.code!)).toEqual(['android', 'ios', 'bff']);
    expect(button.code!.android!.symbol).toBe('com.app.ds.DSButton');

    const only = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf('cadastro', 'm', 'MC'),
        platform: 'ios',
      }),
    );
    expect(only.platform).toBe('ios');
    const iosButton = only.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(Object.keys(iosButton.code!)).toEqual(['ios']);

    const form = await screenAnnotation('cadastro', 'ios');
    expect(form.codeRefs?.map((c) => c.platform)).toEqual(['ios']);
  });

  it('recusa uma plataforma não declarada no filtro', async () => {
    const error = errorOf(
      await mcp.call('get_marking', {
        ref: refOf('cadastro', 'm', 'MF'),
        platform: 'web',
      }),
    );
    expect(error.code).toBe('unknown-platform');
  });

  it('get_annotation também traz os codeRef resolvidos', async () => {
    const data = ok(
      await mcp.call<Annotation>('get_annotation', { ref: refOf('cadastro', 'a', 'AS') }),
    );
    expect(data.codeRefs).toHaveLength(3);
    expect(data.codeRefs![0]).toMatchObject({
      localFile: CADASTRO_SCREEN_KT,
      exists: true,
    });
  });

  it('só confere o que fica dentro do diretório de trabalho do cliente', async () => {
    // `localPath` acima do repositório: o arquivo existe em `base/`, mas não é conferido nem revelado.
    const escapes = await screenAnnotation('escapa');
    expect(escapes.codeRefs![0]).toMatchObject({
      platform: 'android',
      url: `${REPO_URL}/${CADASTRO_SCREEN_KT}`,
      localFile: null,
      exists: null,
      localFileProblem: 'outside-workdir',
    });
    // Link simbólico do repositório que leva para fora (e o alvo existe): exists false.
    const link = await screenAnnotation('link');
    expect(link.codeRefs).toEqual([
      expect.objectContaining({
        path: 'saida/segredo.kt',
        localFile: 'saida/segredo.kt',
        exists: false,
      }),
    ]);
  });

  it('get_project traz as plataformas, os platformRepos e o aviso de repositório ausente', async () => {
    const data = ok(await mcp.call('get_project', { project: 'cadastro' }));
    expect(data.schemaVersion).toBe(7);
    expect(data.platforms).toEqual([
      { id: 'android', name: 'Android', language: 'kotlin', specs: ['sdui'] },
      { id: 'ios', name: 'iOS', language: 'swift', specs: ['sdui'] },
      { id: 'bff', name: 'Contrato SDUI', language: 'json', specs: ['sdui'] },
    ]);
    expect(data.platformRepos).toEqual({
      android: { urlTemplate: `${REPO_URL}/{path}#L{line}`, localPath: '../../..' },
    });
    expect(data.warnings).toEqual([
      { code: 'missing-repo', platform: 'ios', entries: 1 },
    ]);
  });
});

describe('find_by_code', () => {
  it('acha o Screen Cadastro só pelo nome do arquivo, em todos os projetos', async () => {
    const found = ok(
      await mcp.call<Found>('find_by_code', { path: 'CadastroScreen.kt' }),
    );
    expect(found.query).toEqual({ path: 'CadastroScreen.kt' });
    expect(found.searched).toEqual(['cadastro', 'escapa', 'escrita', 'link']);
    expect(found.matches.map((m) => m.project)).toEqual([
      'cadastro',
      'escapa',
      'escrita',
    ]);
    const [first] = found.matches;
    expect(first).toMatchObject({
      project: 'cadastro',
      markingName: 'Formulário',
      field: 'implementacao',
      platform: 'android',
      path: CADASTRO_SCREEN_KT,
      symbol: 'CadastroScreen',
      url: `${REPO_URL}/${CADASTRO_SCREEN_KT}`,
      localFile: CADASTRO_SCREEN_KT,
      exists: true,
    });
    expect(first!.marking).toMatch(
      /^mapping:\/\/cadastro\/m\/[0-9a-f]{8} \(cadastro\.png › Formulário\)$/,
    );
    expect(first!.annotation).toContain('Screen Cadastro');
  });

  it('a referência devolvida leva de volta ao get_marking do Formulário', async () => {
    const found = ok(
      await mcp.call<Found>('find_by_code', {
        project: 'cadastro',
        path: 'CadastroScreen.kt',
      }),
    );
    expect(found.matches).toHaveLength(1);
    const marking = ok(
      await mcp.call<{ name: string }>('get_marking', { ref: found.matches[0]!.marking }),
    );
    expect(marking.name).toBe('Formulário');
  });

  it('casa o caminho por segmentos inteiros, o símbolo por igualdade e exige os dois quando informados', async () => {
    const byPath = (path: string, extra: Record<string, unknown> = {}) =>
      mcp.call<Found>('find_by_code', { project: 'cadastro', path, ...extra });
    expect(ok(await byPath(CADASTRO_SCREEN_KT)).total).toBe(1);
    expect(ok(await byPath('cadastro/CadastroScreen.kt')).total).toBe(1);
    expect(ok(await byPath('Screen.kt')).total).toBe(0);
    expect(ok(await byPath('adastroScreen.kt')).total).toBe(0);
    expect(
      ok(await byPath('CadastroScreen.kt', { symbol: 'CadastroScreen' })).total,
    ).toBe(1);
    expect(ok(await byPath('CadastroScreen.kt', { symbol: 'CadastroView' })).total).toBe(
      0,
    );

    const bySymbol = ok(
      await mcp.call<Found>('find_by_code', {
        project: 'cadastro',
        symbol: 'CadastroView',
      }),
    );
    expect(bySymbol.matches).toHaveLength(1);
    expect(bySymbol.matches[0]).toMatchObject({
      platform: 'ios',
      path: CADASTRO_VIEW_SWIFT,
      url: null,
      localFile: null,
      exists: null,
    });
    expect(
      ok(
        await mcp.call<Found>('find_by_code', {
          project: 'cadastro',
          symbol: 'Cadastro',
        }),
      ).total,
    ).toBe(0);
  });

  it('erros: sem path nem symbol, caminho inválido e projeto inexistente', async () => {
    expect(errorOf(await mcp.call('find_by_code', {})).code).toBe('missing-query');
    expect(errorOf(await mcp.call('find_by_code', { path: '  ', symbol: '' })).code).toBe(
      'missing-query',
    );
    expect(errorOf(await mcp.call('find_by_code', { path: '/' })).code).toBe(
      'invalid-path',
    );
    expect(
      errorOf(await mcp.call('find_by_code', { project: 'nao-existe', path: 'A.kt' }))
        .code,
    ).toBe('project-not-found');
  });
});

describe('plan_changes: codeRef e repositórios por plataforma', () => {
  // Calculados na hora do teste: o workspace só existe depois do `beforeAll`.
  const screenRef = () => refOf('escrita', 'a', 'AS');
  const existingEntries = () => ['C1', 'C2', 'C3'].map((key) => ({ _id: ws.ids[key]! }));

  const plan = (operations: unknown[], project = 'escrita') =>
    mcp.call<Plan>('plan_changes', { project, operations });

  it('valida as operações novas e explica os erros pelo padrão do modelo', async () => {
    const screen = screenRef();
    const result = ok(
      await plan([
        { op: 'set_platform_repo', platform: 'web', urlTemplate: 'https://x.dev/{path}' },
        { op: 'set_platform_repo', platform: 'ios' },
        { op: 'set_platform_repo', platform: 'ios', urlTemplate: 'ftp://x/{path}' },
        { op: 'set_platform_repo', platform: 'ios', localPath: '/abs/olute' },
        { op: 'remove_platform_repo', platform: 'ios' },
        {
          op: 'update_annotation',
          annotation: screen,
          values: { implementacao: [{ platform: 'web', path: 'a.js' }] },
        },
        {
          op: 'update_annotation',
          annotation: screen,
          values: { implementacao: [{ platform: 'ios', path: '../fora.swift' }] },
        },
        {
          op: 'update_annotation',
          annotation: screen,
          values: { implementacao: [{ platform: 'ios', path: 'A.swift', line: 0 }] },
        },
      ]),
    );
    expect(result.valid).toBe(false);
    expect(result.planId).toBeUndefined();
    expect(result.errors!.map((e) => [e.index, e.code])).toEqual([
      [0, 'unknown-platform'],
      [1, 'nothing-to-change'],
      [2, 'invalid-url-template'],
      [3, 'invalid-local-path'],
      [4, 'not-found'],
      [5, 'platform-not-allowed'],
      [6, 'invalid-path'],
      [7, 'invalid-value'],
    ]);
    expect(result.errors![0]!.message).toContain('plataforma não declarada');
  });

  it('o resumo mostra as entradas de codeRef que saem quando a lista enviada é menor', async () => {
    const result = ok(
      await plan([
        {
          op: 'update_annotation',
          annotation: screenRef(),
          values: { implementacao: [{ _id: ws.ids.C1! }] },
        },
      ]),
    );
    expect(result.summary[0]).toContain('campos implementacao (-2 entrada(s))');
  });

  it('remover o repositório de uma plataforma usada vira aviso, e a prévia não grava nada', async () => {
    const before = readFileSync(join(ws.projectDir('escrita'), 'mapping.json'), 'utf8');
    const result = ok(await plan([{ op: 'remove_platform_repo', platform: 'android' }]));
    expect(result.valid).toBe(true);
    expect(result.summary).toEqual(['0. Remover o repositório da plataforma "android"']);
    expect(result.changes.platformRepos).toEqual({ created: 0, updated: 0, deleted: 1 });
    // `warnings` descreve o projeto depois do lote: o ios (sem repositório desde o começo) também aparece.
    expect(result.warnings).toEqual([
      { code: 'missing-repo', platform: 'android', entries: 2 },
      { code: 'missing-repo', platform: 'ios', entries: 1 },
    ]);
    expect(readFileSync(join(ws.projectDir('escrita'), 'mapping.json'), 'utf8')).toBe(
      before,
    );
  });

  it('o lote do roteiro (nova entrada no codeRef + repositório do ios) é aplicado e grava v7 com revision + 1', async () => {
    const dir = ws.projectDir('escrita');
    const screen = screenRef();
    const existing = existingEntries();
    const result = ok(
      await plan([
        {
          op: 'update_annotation',
          annotation: screen,
          values: {
            implementacao: [
              ...existing,
              {
                platform: 'ios',
                path: 'App/Cadastro/CadastroViewModel.swift',
                symbol: 'CadastroViewModel',
                line: 7,
              },
            ],
          },
        },
        {
          op: 'set_platform_repo',
          platform: 'ios',
          urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}#L{line}',
          localPath: '../../..',
        },
      ]),
    );
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.revision).toBe(0);
    expect(result.summary[0]).toContain('campos implementacao (+1 entrada(s))');
    expect(result.summary[1]).toContain('Configurar o repositório da plataforma "ios"');
    expect(result.changes.platformRepos).toEqual({ created: 1, updated: 0, deleted: 0 });
    expect(result.warnings).toBeUndefined();

    const applied = ok(
      await mcp.call<Applied>('apply_changes', { planId: result.planId }),
    );
    expect(applied).toMatchObject({ applied: true, revision: 1 });

    const text = readFileSync(join(dir, 'mapping.json'), 'utf8');
    const specs = new Map([
      ['specs/sdui.json', readFileSync(join(dir, 'specs', 'sdui.json'), 'utf8')],
      [
        'specs/modelo-dados.json',
        readFileSync(join(dir, 'specs', 'modelo-dados.json'), 'utf8'),
      ],
    ]);
    const parsed = deserialize(text, undefined, specs);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const saved = parsed.project;
    expect(saved.schemaVersion).toBe(7);
    expect(saved.revision).toBe(1);
    expect(saved.platformRepos).toEqual({
      android: { urlTemplate: `${REPO_URL}/{path}#L{line}`, localPath: '../../..' },
      ios: {
        urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}#L{line}',
        localPath: '../../..',
      },
    });
    const annotation = saved.annotations.find((a) => a.id === ws.ids.AS)!;
    const entries = annotation.values!.implementacao as {
      _id: string;
      platform: string;
      path: string;
      symbol: string | null;
      line: number | null;
    }[];
    // As três entradas existentes mantêm id e propriedades; a nova ganha um id próprio.
    expect(entries.map((e) => e._id).slice(0, 3)).toEqual(existing.map((e) => e._id));
    expect(entries[1]).toMatchObject({
      path: CADASTRO_VIEW_MODEL_KT,
      symbol: 'CadastroViewModel',
      line: 42,
    });
    expect(entries).toHaveLength(4);
    expect(entries[3]).toEqual({
      _id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      platform: 'ios',
      path: 'App/Cadastro/CadastroViewModel.swift',
      symbol: 'CadastroViewModel',
      line: 7,
    });
    expect(platformRepoWarnings(saved)).toEqual([]);

    // Quem lê depois (a app aberta recarrega pelo mecanismo de alteração externa) já vê o ios configurado.
    const marking = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf('escrita', 'm', 'MF'),
        platform: 'ios',
      }),
    );
    const refs = marking.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'screen')!.codeRefs!;
    expect(refs.map((r) => [r.path, r.url, r.localFile, r.exists])).toEqual([
      [
        CADASTRO_VIEW_SWIFT,
        `https://github.com/org/app-ios/blob/main/${CADASTRO_VIEW_SWIFT}`,
        CADASTRO_VIEW_SWIFT,
        false,
      ],
      [
        'App/Cadastro/CadastroViewModel.swift',
        'https://github.com/org/app-ios/blob/main/App/Cadastro/CadastroViewModel.swift#L7',
        'App/Cadastro/CadastroViewModel.swift',
        false,
      ],
    ]);
    const project = ok(await mcp.call('get_project', { project: 'escrita' }));
    expect(project.revision).toBe(1);
    expect(project.warnings).toBeUndefined();

    // Um plano feito sobre a revisão antiga é recusado (a conferência de revision continua valendo).
    const stale = ok(await plan([{ op: 'remove_platform_repo', platform: 'ios' }]));
    const fresh = ok(
      await plan([{ op: 'set_platform_repo', platform: 'ios', localPath: null }]),
    );
    expect(fresh.revision).toBe(1);
    ok(await mcp.call<Applied>('apply_changes', { planId: fresh.planId }));
    expect(errorOf(await mcp.call('apply_changes', { planId: stale.planId })).code).toBe(
      'revision-conflict',
    );
  });

  it('as tools novas e as operações aparecem no servidor', async () => {
    const { tools } = await mcp.client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_code_hints', 'find_by_code']));
    const planTool = tools.find((t) => t.name === 'plan_changes')!;
    const schema = JSON.stringify(planTool.inputSchema);
    expect(schema).toContain('set_platform_repo');
    expect(schema).toContain('remove_platform_repo');
    expect(schema).toContain('Campo `codeRef`');
  });
});
