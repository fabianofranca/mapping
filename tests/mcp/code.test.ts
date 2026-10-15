import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deserialize, platformRepoWarnings } from '../../src/model';
import {
  DS_BUTTON_KT,
  DS_BUTTON_SWIFT,
  createCodeWorkspace,
  type CodeWorkspace,
} from './codeWorkspace';
import { acceptAllAndApply, hashOf, propose } from './proposalSupport';
import { codeOf, connect, type Call, type Connection } from './workspace';

// Etapa 3b.4 e etapa 9 (o R3 do guia): get_code_hints, get_marking com o `code` dos tipos,
// find_by_code pelo `path` e pelo `symbol` dos tipos, um lote com repositório (enviado como
// proposta e aplicado pelo modelo) e a leitura de um projeto v8 com o campo de código removido,
// pelo dist-mcp/mapping-mcp.js por stdio. O cenário é o repositório do app com o projeto
// dentro (`repo/design/mapeamentos/<projeto>`), e o cliente (diretório de trabalho do servidor)
// na raiz do repositório.

interface Annotation {
  ref: string;
  kind: 'free' | 'typed';
  type?: { specId: string; typeId: string };
  values?: Record<string, unknown>;
  code?: Record<string, CodeEntry>;
}
interface CodeEntry {
  symbol: string;
  path?: string;
  url?: string | null;
  localFile?: string | null;
  exists?: boolean | null;
  localFileProblem?: string;
}
interface MarkingData {
  platform?: string;
  layers: { layer: { name: string }; annotations: Annotation[] }[];
}
interface HintAnnotation {
  ref: string;
  type: { specId: string; typeId: string; name: string };
  symbol: string | null;
  path?: string;
  url?: string | null;
  localFile?: string | null;
  exists?: boolean | null;
  params?: { field: string; name: string; value: unknown }[];
  notes?: string;
  values?: Record<string, unknown>;
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
interface Match {
  project: string;
  type: { specId: string; typeId: string; name: string };
  code: Record<string, CodeEntry>;
  annotationCount: number;
  annotations: {
    annotation: string;
    title: string | null;
    marking: string;
    markingName: string | null;
    image: string;
  }[];
}
interface Found {
  query: Record<string, string>;
  searched: string[];
  unreadable?: string[];
  total: number;
  annotationTotal: number;
  returned: number;
  truncated?: boolean;
  matches: Match[];
}
interface Plan {
  valid: boolean;
  planId?: string;
  revision: number;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  warnings?: { code: string; platform: string; types: number }[];
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

  it('marca os tipos sem `code` na plataforma (symbol null), e o Screen traz só os valores do tipo', async () => {
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
    expect(Object.keys(screen)).not.toContain('codeRefs');
  });

  it('usa os parâmetros e o `code` da plataforma pedida', async () => {
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
    const input = findAnnotation(form.tree, (a) => a.type.typeId === 'input')!;
    expect(input.symbol).toBe('DSTextField');
    // O Input não tem `path` no iOS (só no Android): nada de arquivo.
    expect(input).not.toHaveProperty('path');
  });

  it('traz o arquivo do símbolo (path) com o endereço, o arquivo local e se ele existe', async () => {
    const hints = (platform: string) =>
      mcp.call<Hints>('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MC'),
        platform,
      });
    const android = ok(await hints('android')).tree.annotations![0]!;
    expect(android).toMatchObject({
      symbol: 'com.app.ds.DSButton',
      path: DS_BUTTON_KT,
      url: `${REPO_URL}/${DS_BUTTON_KT}`,
      localFile: DS_BUTTON_KT,
      exists: true,
    });
    // O OnClick não tem path na especialização: nada de path, url nem exists.
    const onClick = android.linked![0]!;
    expect(onClick.symbol).toBe('com.app.ds.OnClick');
    expect(onClick).not.toHaveProperty('path');
    expect(onClick).not.toHaveProperty('exists');

    // iOS: sem repositório configurado, o caminho vem sem endereço nem arquivo local.
    const ios = ok(await hints('ios')).tree.annotations![0]!;
    expect(ios).toMatchObject({
      symbol: 'DSButton',
      path: DS_BUTTON_SWIFT,
      url: null,
      localFile: null,
      exists: null,
    });
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

  it('as anotações tipadas trazem os valores do tipo e nenhuma referência ao código gerado', async () => {
    const screen = await screenAnnotation('cadastro');
    expect(screen.values).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    expect(Object.keys(screen)).not.toContain('codeRefs');
    // O Screen não tem `code` no exemplo: a anotação também não traz `code`.
    expect(screen).not.toHaveProperty('code');
  });

  it('traz o `code` das plataformas por anotação tipada e o filtro `platform` vale para ele', async () => {
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
  });

  it('o `code` traz o path de cada plataforma com url, localFile e exists ao lado', async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: refOf('cadastro', 'm', 'MC') }),
    );
    const button = data.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(button.code!.android).toMatchObject({
      symbol: 'com.app.ds.DSButton',
      path: DS_BUTTON_KT,
      url: `${REPO_URL}/${DS_BUTTON_KT}`,
      localFile: DS_BUTTON_KT,
      exists: true,
    });
    expect(button.code!.ios).toMatchObject({
      path: DS_BUTTON_SWIFT,
      url: null,
      localFile: null,
      exists: null,
    });
    // Plataforma sem path (bff no exemplo): a entrada continua como na especialização.
    expect(button.code!.bff).not.toHaveProperty('path');
    expect(button.code!.bff).not.toHaveProperty('exists');

    const only = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf('cadastro', 'm', 'MC'),
        platform: 'android',
      }),
    );
    const androidButton = only.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(Object.keys(androidButton.code!)).toEqual(['android']);
    expect(androidButton.code!.android!.exists).toBe(true);
  });

  it('get_annotation também resolve o path do `code`', async () => {
    const data = ok(
      await mcp.call<Annotation>('get_annotation', { ref: refOf('cadastro', 'a', 'AB') }),
    );
    expect(data.code!.android).toMatchObject({ path: DS_BUTTON_KT, exists: true });
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

  it('só confere o que fica dentro do diretório de trabalho do cliente', async () => {
    // `localPath` acima do repositório: o arquivo existe em `base/`, mas não é conferido nem revelado.
    const data = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf('escapa', 'm', 'MC'),
        platform: 'android',
      }),
    );
    const button = data.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(button.code!.android).toMatchObject({
      path: DS_BUTTON_KT,
      url: `${REPO_URL}/${DS_BUTTON_KT}`,
      localFile: null,
      exists: null,
      localFileProblem: 'outside-workdir',
    });
    // Link simbólico do repositório que leva para fora (e o alvo existe): exists false.
    const link = ok(
      await mcp.call<Annotation>('get_annotation', { ref: refOf('link', 'a', 'AIN') }),
    );
    expect(link.code!.android).toMatchObject({
      path: 'saida/segredo.kt',
      localFile: 'saida/segredo.kt',
      exists: false,
    });
  });

  it('get_project traz as plataformas, os platformRepos e o aviso de repositório ausente', async () => {
    const data = ok(await mcp.call('get_project', { project: 'cadastro' }));
    expect(data.schemaVersion).toBe(9);
    expect(data.platforms).toEqual([
      { id: 'android', name: 'Android', language: 'kotlin', specs: ['sdui'] },
      { id: 'ios', name: 'iOS', language: 'swift', specs: ['sdui'] },
      { id: 'bff', name: 'Contrato SDUI', language: 'json', specs: ['sdui'] },
    ]);
    expect(data.platformRepos).toEqual({
      android: { urlTemplate: `${REPO_URL}/{path}#L{line}`, localPath: '../../..' },
    });
    // Só o Button tem `path` no iOS, que não tem repositório; o Android tem.
    expect(data.warnings).toEqual([{ code: 'missing-repo', platform: 'ios', types: 1 }]);
  });

  it('um projeto v8 com o campo de código removido abre migrado, sem os valores dele', async () => {
    const data = ok(await mcp.call('get_project', { project: 'antigo' }));
    expect(data.schemaVersion).toBe(9);
    expect(data.migratedFrom).toBe(8);
    const screen = ok(
      await mcp.call<Annotation>('get_annotation', { ref: refOf('antigo', 'a', 'AS') }),
    );
    expect(screen.values).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    // O arquivo continua como está: o servidor não grava o projeto.
    const text = readFileSync(join(ws.projectDir('antigo'), 'mapping.json'), 'utf8');
    expect(JSON.parse(text).schemaVersion).toBe(8);
    expect(text).toContain('implementacao');
  });
});

describe('find_by_code', () => {
  it('acha o tipo Button só pelo nome do arquivo, em todos os projetos, com as anotações dele', async () => {
    const found = ok(await mcp.call<Found>('find_by_code', { path: 'DSButton.kt' }));
    expect(found.query).toEqual({ path: 'DSButton.kt' });
    expect(found.searched).toEqual(['antigo', 'cadastro', 'escapa', 'escrita', 'link']);
    expect(found.matches.map((m) => m.project)).toEqual(found.searched);
    expect(found.total).toBe(5);
    expect(found.annotationTotal).toBe(5);
    expect(found.returned).toBe(5);
    expect(found).not.toHaveProperty('truncated');
    const first = found.matches.find((m) => m.project === 'cadastro')!;
    expect(first.type).toEqual({ specId: 'sdui', typeId: 'button', name: 'Button' });
    // Só a plataforma que casou, com o arquivo resolvido como em get_marking.
    expect(first.code).toEqual({
      android: expect.objectContaining({
        symbol: 'com.app.ds.DSButton',
        path: DS_BUTTON_KT,
        url: `${REPO_URL}/${DS_BUTTON_KT}`,
        localFile: DS_BUTTON_KT,
        exists: true,
      }),
    });
    expect(first.annotationCount).toBe(1);
    expect(first.annotations).toHaveLength(1);
    const [hit] = first.annotations;
    expect(hit!.markingName).toBe('Cadastrar');
    expect(hit!.title).toBe('Button btn_cadastrar');
    expect(hit!.marking).toMatch(
      /^mapping:\/\/cadastro\/m\/[0-9a-f]{8} \(cadastro\.png › Formulário › Cadastrar\)$/,
    );
    expect(hit!.annotation).toMatch(/^mapping:\/\/cadastro\/a\/[0-9a-f]{8}/);
    expect(hit!.image).toMatch(/^mapping:\/\/cadastro\/i\/[0-9a-f]{8}/);
  });

  it('a referência devolvida leva de volta à anotação e à marcação', async () => {
    const found = ok(
      await mcp.call<Found>('find_by_code', { project: 'cadastro', path: 'DSButton.kt' }),
    );
    expect(found.matches).toHaveLength(1);
    const hit = found.matches[0]!.annotations[0]!;
    const marking = ok(
      await mcp.call<{ name: string }>('get_marking', { ref: hit.marking }),
    );
    expect(marking.name).toBe('Cadastrar');
    const annotation = ok(
      await mcp.call<Annotation>('get_annotation', { ref: hit.annotation }),
    );
    expect(annotation.type).toMatchObject({ specId: 'sdui', typeId: 'button' });
  });

  it('casa o caminho por segmentos inteiros, o símbolo por igualdade e exige os dois na mesma plataforma', async () => {
    const byPath = (path: string, extra: Record<string, unknown> = {}) =>
      mcp.call<Found>('find_by_code', { project: 'cadastro', path, ...extra });
    expect(ok(await byPath(DS_BUTTON_KT)).total).toBe(1);
    expect(ok(await byPath('ds/DSButton.kt')).total).toBe(1);
    expect(ok(await byPath('Button.kt')).total).toBe(0);
    expect(ok(await byPath('SButton.kt')).total).toBe(0);
    expect(ok(await byPath('DSButton.kt', { symbol: 'com.app.ds.DSButton' })).total).toBe(
      1,
    );
    // `DSButton` é o símbolo do iOS, e `DSButton.kt` o arquivo do Android: não casam juntos.
    expect(ok(await byPath('DSButton.kt', { symbol: 'DSButton' })).total).toBe(0);

    const bySymbol = ok(
      await mcp.call<Found>('find_by_code', { project: 'cadastro', symbol: 'DSButton' }),
    );
    expect(bySymbol.matches).toHaveLength(1);
    expect(bySymbol.matches[0]!.code).toEqual({
      ios: expect.objectContaining({
        path: DS_BUTTON_SWIFT,
        url: null,
        localFile: null,
        exists: null,
      }),
    });
    expect(
      ok(await mcp.call<Found>('find_by_code', { project: 'cadastro', symbol: 'Button' }))
        .total,
    ).toBe(0);
  });

  it('acha pelo símbolo um tipo sem path, e um tipo sem anotações vem com a lista vazia', async () => {
    const onClick = ok(
      await mcp.call<Found>('find_by_code', {
        project: 'cadastro',
        symbol: 'com.app.ds.OnClick',
      }),
    );
    expect(onClick.matches).toHaveLength(1);
    expect(onClick.matches[0]!.type.typeId).toBe('onClick');
    expect(onClick.matches[0]!.code.android).not.toHaveProperty('path');
    expect(onClick.matches[0]!.annotationCount).toBe(1);

    const image = ok(
      await mcp.call<Found>('find_by_code', {
        project: 'cadastro',
        symbol: 'com.app.ds.DSImage',
      }),
    );
    expect(image.total).toBe(1);
    expect(image.annotationTotal).toBe(0);
    expect(image.matches[0]).toMatchObject({ annotationCount: 0, annotations: [] });
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

describe('plan_changes: repositórios por plataforma e campo inexistente', () => {
  // Calculado na hora do teste: o workspace só existe depois do `beforeAll`.
  const screenRef = () => refOf('escrita', 'a', 'AS');

  const plan = (operations: unknown[], project = 'escrita') =>
    mcp.call<Plan>('plan_changes', { project, operations });

  it('valida as operações e explica os erros pelo padrão do modelo', async () => {
    const result = ok(
      await plan([
        { op: 'set_platform_repo', platform: 'web', urlTemplate: 'https://x.dev/{path}' },
        { op: 'set_platform_repo', platform: 'ios' },
        { op: 'set_platform_repo', platform: 'ios', urlTemplate: 'ftp://x/{path}' },
        { op: 'set_platform_repo', platform: 'ios', localPath: '/abs/olute' },
        { op: 'remove_platform_repo', platform: 'ios' },
        // O campo de código removido na etapa 9 não existe mais no tipo.
        {
          op: 'update_annotation',
          annotation: screenRef(),
          values: { implementacao: [{ platform: 'android', path: 'a.kt' }] },
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
      [5, 'unknown-field'],
    ]);
    expect(result.errors![0]!.message).toContain('plataforma não declarada');
    expect(result.errors![5]!.message).toContain('campo inexistente no tipo');
  });

  it('remover o repositório de uma plataforma usada vira aviso, e a prévia não grava nada', async () => {
    const before = readFileSync(join(ws.projectDir('escrita'), 'mapping.json'), 'utf8');
    const result = ok(await plan([{ op: 'remove_platform_repo', platform: 'android' }]));
    expect(result.valid).toBe(true);
    expect(result.summary).toEqual(['0. Remover o repositório da plataforma "android"']);
    expect(result.changes.platformRepos).toEqual({ created: 0, updated: 0, deleted: 1 });
    // `warnings` descreve o projeto depois do lote: o ios (sem repositório desde o começo) também
    // aparece. No Android, Button e Input têm `path`; no iOS, só o Button.
    expect(result.warnings).toEqual([
      { code: 'missing-repo', platform: 'android', types: 2 },
      { code: 'missing-repo', platform: 'ios', types: 1 },
    ]);
    expect(readFileSync(join(ws.projectDir('escrita'), 'mapping.json'), 'utf8')).toBe(
      before,
    );
  });

  it('o lote do roteiro (repositório do ios) é aplicado e grava v9 com revision + 1', async () => {
    const dir = ws.projectDir('escrita');
    const operations = [
      {
        op: 'set_platform_repo',
        platform: 'ios',
        urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}',
        localPath: '../../..',
      },
    ];
    const result = ok(await plan(operations));
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.revision).toBe(0);
    expect(result.summary[0]).toContain('Configurar o repositório da plataforma "ios"');
    expect(result.changes.platformRepos).toEqual({ created: 1, updated: 0, deleted: 0 });
    expect(result.warnings).toBeUndefined();

    // O agente propõe; o mapping.json só muda quando o usuário aceita e a app aplica.
    const mappingPath = join(dir, 'mapping.json');
    const untouched = hashOf(mappingPath);
    const proposed = await propose(mcp, 'escrita', operations);
    expect(proposed.proposed).toBe(true);
    expect(hashOf(mappingPath)).toBe(untouched);
    acceptAllAndApply(dir, proposed.proposal.id);

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
    expect(saved.schemaVersion).toBe(9);
    expect(saved.revision).toBe(1);
    expect(saved.platformRepos).toEqual({
      android: { urlTemplate: `${REPO_URL}/{path}#L{line}`, localPath: '../../..' },
      ios: {
        urlTemplate: 'https://github.com/org/app-ios/blob/main/{path}',
        localPath: '../../..',
      },
    });
    expect(platformRepoWarnings(saved)).toEqual([]);

    // Quem lê depois (a app aberta recarrega pelo mecanismo de alteração externa) já vê o ios configurado.
    const marking = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf('escrita', 'm', 'MC'),
        platform: 'ios',
      }),
    );
    const button = marking.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(button.code!.ios).toMatchObject({
      path: DS_BUTTON_SWIFT,
      url: `https://github.com/org/app-ios/blob/main/${DS_BUTTON_SWIFT}`,
      localFile: DS_BUTTON_SWIFT,
      exists: false,
    });
    const project = ok(await mcp.call('get_project', { project: 'escrita' }));
    expect(project.revision).toBe(1);
    expect(project.warnings).toBeUndefined();

    // Uma proposta nova parte da revisão gravada pela app.
    const fresh = await propose(mcp, 'escrita', [
      { op: 'set_platform_repo', platform: 'ios', localPath: null },
    ]);
    expect(fresh.proposal.baseRevision).toBe(1);
  });

  it('as tools novas e as operações aparecem no servidor', async () => {
    const { tools } = await mcp.client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_code_hints', 'find_by_code']));
    const planTool = tools.find((t) => t.name === 'plan_changes')!;
    const schema = JSON.stringify(planTool.inputSchema);
    expect(schema).toContain('set_platform_repo');
    expect(schema).toContain('remove_platform_repo');
    expect(schema).not.toMatch(/codeRef/i);
  });
});
