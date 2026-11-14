import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deserialize } from '../../src/model';
import {
  DS_BUTTON_KT,
  DS_BUTTON_SWIFT,
  createCodeWorkspace,
  type CodeWorkspace,
} from './codeWorkspace';
import { acceptAllAndApply, hashOf, propose } from './proposalSupport';
import { codeOf, connect, type Call, type Connection } from './workspace';

// Stage 3b.4 and stage 9 (R3 of the guide): get_code_hints, get_marking with the types' `code`,
// find_by_code by the types' `path` and `symbol`, a batch with a repository (sent as a
// proposal and applied by the model) and reading a v8 project with the code field removed,
// through dist-mcp/mapping-mcp.js over stdio. The scenario is the app's repository with the
// project inside it (`repo/design/mapeamentos/<project>`), and the client (the server's working
// directory) at the repository root.

interface Annotation {
  ref: string;
  kind: 'free' | 'typed';
  type?: { specId: string; typeId: string };
  values?: Record<string, unknown>;
  code?: Record<string, CodeEntry>;
}
interface Definition {
  path: string;
  url: string | null;
  ref: string | null;
  localFile: string | null;
  exists: boolean | null;
  localFileProblem?: string;
}
interface CodeEntry {
  symbol: string;
  definition: Definition | null;
  params?: Record<string, string>;
  notes?: string;
}
interface MarkingData {
  platform?: string;
  layers: { layer: { name: string }; annotations: Annotation[] }[];
}
interface HintAnnotation {
  ref: string;
  type: string;
  label: string | null;
  layer: string | null;
  args?: { field: string; name: string; value: unknown }[];
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
  repos: Record<
    string,
    { url: string | null; ref: string | null; localPath: string | null }
  >;
  types: Record<string, CodeEntry & { name: string }>;
  unmappedTypes?: string[];
  tree: HintNode;
}
interface Match {
  project: string;
  path: string;
  type: { specId: string; typeId: string; name: string };
  code: Record<string, CodeEntry>;
  annotationCount: number;
  annotations: {
    annotation: string;
    title: string | null;
    marking: string;
    markingName: string | null;
    container: string;
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

/** Reference to an item of the `codeProject` in the given project (`MF` = Formulário, `AS` = Screen). */
const refOf = (project: string, kind: 'm' | 'a', key: string) =>
  `mapping://${project}/${kind}/${codeOf(ws.ids[key]!)}`;

const REPO_URL = 'https://github.com/org/app-android/blob/main';

/** Annotations of the `get_code_hints` tree, in order, with the linked ones right after their owner. */
function flatten(node: HintNode): HintAnnotation[] {
  const visit = (a: HintAnnotation): HintAnnotation[] => [
    a,
    ...(a.linked ?? []).flatMap(visit),
  ];
  return [
    ...(node.annotations ?? []).flatMap(visit),
    ...(node.children ?? []).flatMap(flatten),
  ];
}

describe('get_code_hints', () => {
  it('separates the type from the instance: `types` with the instantiation code and the tree with only `args`', async () => {
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
    expect(hints).not.toHaveProperty('repo');
    expect(hints.repos.android).toMatchObject({
      url: 'https://github.com/org/app-android',
      localPath: '../../..',
    });
    expect(hints.tree.name).toBe('Formulário');
    expect(hints.tree.children?.map((c) => c.name)).toEqual([
      'Nome',
      'Idade',
      'E-mail',
      'Cadastrar',
    ]);

    // Types: the symbol (what is called), the definition (the signature's file) and the guidance, once only.
    expect(hints.types['sdui/input']).toMatchObject({
      name: 'Input',
      symbol: 'com.app.ds.DSTextField',
    });
    expect(hints.types['sdui/input']!.notes).toContain('dado');
    expect(hints.types['sdui/button']).toMatchObject({
      symbol: 'com.app.ds.DSButton',
      definition: {
        path: DS_BUTTON_KT,
        url: `${REPO_URL}/${DS_BUTTON_KT}`,
        localFile: DS_BUTTON_KT,
        exists: true,
      },
    });
    expect(hints.types['sdui/button']!.notes).toContain('testTag');
    expect(hints.types['sdui/onClick']).toMatchObject({ symbol: 'com.app.ds.OnClick' });

    // Instances: no file, symbol or guidance per annotation.
    for (const a of flatten(hints.tree)) {
      for (const key of ['symbol', 'path', 'url', 'localFile', 'exists', 'notes']) {
        expect(a).not.toHaveProperty(key);
      }
    }

    // Inputs: the arguments with the translated enum and the `dado` resolved by the target's label.
    const inputs = hints.tree.children!.slice(0, 3).map((c) => c.annotations![0]!);
    expect(inputs.map((a) => a.type)).toEqual(Array(3).fill('sdui/input'));
    expect(inputs.map((a) => a.args!.find((p) => p.field === 'tipo')!.value)).toEqual([
      'KeyboardType.Text',
      'KeyboardType.Number',
      'KeyboardType.Email',
    ]);
    expect(
      inputs.map((a) => a.args!.find((p) => p.field === 'obrigatorio')!.value),
    ).toEqual(['false', 'false', 'true']);
    expect(inputs.map((a) => a.values!.dado)).toEqual([
      'User.name',
      'User.age',
      'Contato.email',
    ]);

    // Button with the style and the enabled flag translated; onClick and onHold linked under it.
    const button = hints.tree.children![3]!.annotations![0]!;
    expect(button.type).toBe('sdui/button');
    expect(button.args).toEqual([
      { field: 'texto', name: 'text', value: 'Cadastrar' },
      { field: 'estilo', name: 'style', value: 'ButtonStyle.Primary' },
      { field: 'habilitado', name: 'enabled', value: 'true' },
    ]);
    expect(button.linked?.map((l) => l.type)).toEqual(['sdui/onClick', 'sdui/onHold']);
    expect(button.linked![0]!.args).toContainEqual({
      field: 'destino',
      name: 'target',
      value: '/usuarios',
    });
    // The E-mail's onChange also appears under its Input.
    expect(hints.tree.children![2]!.annotations![0]!.linked?.[0]?.type).toBe(
      'sdui/onChange',
    );
  });

  it('flags the types without `code` on the platform (outside `types`), and the Screen carries only the type values', async () => {
    const hints = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MF'),
        platform: 'android',
      }),
    );
    expect(hints.unmappedTypes).toEqual(
      expect.arrayContaining(['sdui/screen', 'modelo-dados/classe']),
    );
    expect(hints.types).not.toHaveProperty('sdui/screen');
    const screen = flatten(hints.tree).find((a) => a.type === 'sdui/screen')!;
    expect(screen.values).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    expect(screen).not.toHaveProperty('args');
    expect(Object.keys(screen)).not.toContain('codeRefs');
  });

  it('uses the arguments and the `code` of the requested platform; without `repo` in the specialization, no entry in `repos`', async () => {
    const ios = ok(
      await mcp.call<Hints>('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MC'),
        platform: 'ios',
      }),
    );
    expect(ios.platform.name).toBe('iOS');
    expect(ios.repos).toEqual({});
    const button = ios.tree.annotations![0]!;
    expect(ios.types[button.type]!.symbol).toBe('DSButton');
    expect(button.args).toContainEqual({
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
    // The Input has no `path` on iOS (only on Android): symbol without a definition.
    expect(form.types['sdui/input']).toMatchObject({
      symbol: 'DSTextField',
      definition: null,
    });
  });

  it('the definition carries the specialization address, the local file and whether it exists', async () => {
    const hints = (platform: string) =>
      mcp.call<Hints>('get_code_hints', {
        ref: refOf('cadastro', 'm', 'MC'),
        platform,
      });
    const android = ok(await hints('android')).types;
    expect(android['sdui/button']).toMatchObject({
      symbol: 'com.app.ds.DSButton',
      definition: {
        path: DS_BUTTON_KT,
        url: `${REPO_URL}/${DS_BUTTON_KT}`,
        localFile: DS_BUTTON_KT,
        exists: true,
      },
    });
    // The OnClick has no path in the specialization: symbol without a definition.
    expect(android['sdui/onClick']).toMatchObject({
      symbol: 'com.app.ds.OnClick',
      definition: null,
    });

    // iOS: the specialization declares no `repo` and the project has no clone: only the path.
    const ios = ok(await hints('ios')).types;
    expect(ios['sdui/button']).toMatchObject({
      symbol: 'DSButton',
      definition: {
        path: DS_BUTTON_SWIFT,
        url: null,
        ref: null,
        localFile: null,
        exists: null,
      },
    });
  });

  it('clear errors: undeclared platform, reference of another kind, nonexistent marking', async () => {
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

describe('get_marking, get_annotation and get_project', () => {
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

  it('typed annotations carry the type values and no reference to the generated code', async () => {
    const screen = await screenAnnotation('cadastro');
    expect(screen.values).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    expect(Object.keys(screen)).not.toContain('codeRefs');
    // The Screen has no `code` in the example: the annotation carries no `code` either.
    expect(screen).not.toHaveProperty('code');
  });

  it("carries the platforms' `code` per typed annotation and the `platform` filter applies to it", async () => {
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

  it("the `code` carries each platform's path with url, localFile and exists beside it", async () => {
    const data = ok(
      await mcp.call<MarkingData>('get_marking', { ref: refOf('cadastro', 'm', 'MC') }),
    );
    const button = data.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(button.code!.android).toMatchObject({
      symbol: 'com.app.ds.DSButton',
      definition: {
        path: DS_BUTTON_KT,
        url: `${REPO_URL}/${DS_BUTTON_KT}`,
        localFile: DS_BUTTON_KT,
        exists: true,
      },
    });
    expect(button.code!.ios).toMatchObject({
      definition: { path: DS_BUTTON_SWIFT, url: null, localFile: null, exists: null },
    });
    // Platform without a path (bff in the example): the shape is the same, with `definition: null`.
    expect(button.code!.bff!.definition).toBeNull();

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
    expect(androidButton.code!.android!.definition!.exists).toBe(true);
  });

  it('get_annotation also resolves the `code` path', async () => {
    const data = ok(
      await mcp.call<Annotation>('get_annotation', { ref: refOf('cadastro', 'a', 'AB') }),
    );
    expect(data.code!.android!.definition).toMatchObject({
      path: DS_BUTTON_KT,
      exists: true,
    });
  });

  it('refuses an undeclared platform in the filter', async () => {
    const error = errorOf(
      await mcp.call('get_marking', {
        ref: refOf('cadastro', 'm', 'MF'),
        platform: 'web',
      }),
    );
    expect(error.code).toBe('unknown-platform');
  });

  it("only checks what is inside the client's working directory", async () => {
    // `localPath` above the repository: the file exists in `base/`, but it is neither checked nor revealed.
    const data = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf('escapa', 'm', 'MC'),
        platform: 'android',
      }),
    );
    const button = data.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(button.code!.android!.definition).toMatchObject({
      path: DS_BUTTON_KT,
      url: `${REPO_URL}/${DS_BUTTON_KT}`,
      localFile: null,
      exists: null,
      localFileProblem: 'outside-workdir',
    });
    // Symbolic link in the repository that leads outside (and the target exists): exists false.
    const link = ok(
      await mcp.call<Annotation>('get_annotation', { ref: refOf('link', 'a', 'AIN') }),
    );
    expect(link.code!.android!.definition).toMatchObject({
      path: 'saida/segredo.kt',
      localFile: 'saida/segredo.kt',
      exists: false,
    });
  });

  it('get_project carries the platforms and the local clone; a platform without a local path raises no warning', async () => {
    const data = ok(await mcp.call('get_project', { project: 'cadastro' }));
    expect(data.schemaVersion).toBe(20);
    expect(data.platforms).toEqual([
      expect.objectContaining({
        id: 'android',
        name: 'Android',
        language: 'kotlin',
        specs: ['sdui'],
        localPath: '../../..',
      }),
      expect.objectContaining({ id: 'ios', specs: ['sdui'], repos: [], localPath: null }),
      expect.objectContaining({ id: 'bff', language: 'json', specs: ['sdui'] }),
    ]);
    // Each platform's `repo` comes from the specialization.
    expect(
      (data.platforms as { id: string; repos: { specId: string; url: string }[] }[])[0]!
        .repos,
    ).toEqual([
      expect.objectContaining({
        specId: 'sdui',
        url: 'https://github.com/org/app-android',
      }),
    ]);
    // The project only keeps the local clone; iOS has none and that is not a problem.
    expect(data.platformRepos).toEqual({ android: { localPath: '../../..' } });
    expect(data.warnings).toBeUndefined();
  });

  it('a v8 project with the code field removed opens migrated, without its values', async () => {
    const data = ok(await mcp.call('get_project', { project: 'antigo' }));
    expect(data.schemaVersion).toBe(20);
    expect(data.migratedFrom).toBe(8);
    const screen = ok(
      await mcp.call<Annotation>('get_annotation', { ref: refOf('antigo', 'a', 'AS') }),
    );
    expect(screen.values).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    // The file stays as it is: the server does not write the project.
    const text = readFileSync(join(ws.projectDir('antigo'), 'mapping.json'), 'utf8');
    expect(JSON.parse(text).schemaVersion).toBe(8);
    expect(text).toContain('implementacao');
  });
});

describe('get_component', () => {
  it('carries the `code` in the single shape: with the project, the definition gains the local clone; by path, only the address', async () => {
    const withProject = ok(
      await mcp.call<{ code: Record<string, CodeEntry> }>('get_component', {
        project: 'cadastro',
        specId: 'sdui',
        type: 'button',
      }),
    );
    expect(withProject.code.android).toMatchObject({
      symbol: 'com.app.ds.DSButton',
      definition: {
        path: DS_BUTTON_KT,
        url: `${REPO_URL}/${DS_BUTTON_KT}`,
        localFile: DS_BUTTON_KT,
        exists: true,
      },
    });
    expect(withProject.code.bff!.definition).toBeNull();

    const byPath = ok(
      await mcp.call<{ code: Record<string, CodeEntry> }>('get_component', {
        path: join(ws.projectDir('cadastro'), 'specs', 'sdui.json'),
        type: 'button',
      }),
    );
    expect(byPath.code.android!.definition).toMatchObject({
      url: `${REPO_URL}/${DS_BUTTON_KT}`,
      localFile: null,
      exists: null,
    });
  });
});

describe('find_by_code', () => {
  it('finds the Button type by the file name alone, in every project, with its annotations', async () => {
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
    // Only the platform that matched, with the file resolved as in get_marking.
    expect(first.code).toEqual({
      android: expect.objectContaining({
        symbol: 'com.app.ds.DSButton',
        definition: expect.objectContaining({
          path: DS_BUTTON_KT,
          url: `${REPO_URL}/${DS_BUTTON_KT}`,
          localFile: DS_BUTTON_KT,
          exists: true,
        }),
      }),
    });
    expect(first.annotationCount).toBe(1);
    expect(first.annotations).toHaveLength(1);
    const [hit] = first.annotations;
    expect(hit!.markingName).toBe('Cadastrar');
    expect(hit!.title).toBe('Button btn_cadastrar');
    expect(hit!.marking).toMatch(/^mapping:\/\/cadastro\/m\/[0-9a-f]{8}$/);
    expect(hit!.annotation).toMatch(/^mapping:\/\/cadastro\/a\/[0-9a-f]{8}/);
    expect(hit!.container).toMatch(/^mapping:\/\/cadastro\/i\/[0-9a-f]{8}/);
  });

  it('each match carries the project path, like list_projects, to tell same-named folders apart', async () => {
    const listed = ok(
      await mcp.call<{ projects: { name: string; path: string }[] }>('list_projects', {}),
    );
    const found = ok(await mcp.call<Found>('find_by_code', { path: 'DSButton.kt' }));
    expect(found.matches.length).toBeGreaterThan(0);
    for (const match of found.matches) {
      const project = listed.projects.find((p) => p.name === match.project)!;
      expect(match.path).toBe(project.path);
    }
  });

  it('the get_project description says `repos`, as the code returns it', async () => {
    const { tools } = await mcp.client.listTools();
    const description = tools.find((t) => t.name === 'get_project')!.description!;
    expect(description).toContain('`repos` the specializations declare');
    expect(description).not.toContain('each with the `repo`');
  });

  it('the returned reference leads back to the annotation and the marking', async () => {
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

  it('matches the path by whole segments, the symbol by equality, and requires both on the same platform', async () => {
    const byPath = (path: string, extra: Record<string, unknown> = {}) =>
      mcp.call<Found>('find_by_code', { project: 'cadastro', path, ...extra });
    expect(ok(await byPath(DS_BUTTON_KT)).total).toBe(1);
    expect(ok(await byPath('ds/DSButton.kt')).total).toBe(1);
    expect(ok(await byPath('Button.kt')).total).toBe(0);
    expect(ok(await byPath('SButton.kt')).total).toBe(0);
    expect(ok(await byPath('DSButton.kt', { symbol: 'com.app.ds.DSButton' })).total).toBe(
      1,
    );
    // `DSButton` is the iOS symbol, and `DSButton.kt` the Android file: they do not match together.
    expect(ok(await byPath('DSButton.kt', { symbol: 'DSButton' })).total).toBe(0);

    const bySymbol = ok(
      await mcp.call<Found>('find_by_code', { project: 'cadastro', symbol: 'DSButton' }),
    );
    expect(bySymbol.matches).toHaveLength(1);
    expect(bySymbol.matches[0]!.code).toEqual({
      ios: expect.objectContaining({
        definition: expect.objectContaining({
          path: DS_BUTTON_SWIFT,
          url: null,
          localFile: null,
          exists: null,
        }),
      }),
    });
    expect(
      ok(await mcp.call<Found>('find_by_code', { project: 'cadastro', symbol: 'Button' }))
        .total,
    ).toBe(0);
  });

  it('finds a type without a path by its symbol, and a type without annotations comes with an empty list', async () => {
    const onClick = ok(
      await mcp.call<Found>('find_by_code', {
        project: 'cadastro',
        symbol: 'com.app.ds.OnClick',
      }),
    );
    expect(onClick.matches).toHaveLength(1);
    expect(onClick.matches[0]!.type.typeId).toBe('onClick');
    expect(onClick.matches[0]!.code.android!.definition).toBeNull();
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

  it('errors: neither path nor symbol, invalid path and nonexistent project', async () => {
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

describe('plan_changes: repositories per platform and nonexistent field', () => {
  // Computed at test time: the workspace only exists after `beforeAll`.
  const screenRef = () => refOf('escrita', 'a', 'AS');

  const plan = (operations: unknown[], project = 'escrita') =>
    mcp.call<Plan>('plan_changes', { project, operations });

  it("validates the operations and explains the errors in the model's standard way", async () => {
    const result = ok(
      await plan([
        { op: 'set_platform_repo', platform: 'web', localPath: '..' },
        { op: 'set_platform_repo', platform: 'ios' },
        // The repository address comes from the specialization: the project's `urlTemplate` does not exist.
        { op: 'set_platform_repo', platform: 'ios', urlTemplate: 'https://x.dev/{path}' },
        { op: 'set_platform_repo', platform: 'ios', localPath: '/abs/olute' },
        { op: 'remove_platform_repo', platform: 'ios' },
        // The code field removed in stage 9 no longer exists on the type.
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
      [2, 'unknown-field'],
      [3, 'invalid-local-path'],
      [4, 'not-found'],
      [5, 'unknown-field'],
    ]);
    expect(result.errors![0]!.message).toContain(
      'platform not declared by the applied specializations',
    );
    expect(result.errors![5]!.message).toContain('field does not exist in the type');
  });

  it("removing a platform's local clone raises no warning, and the preview writes nothing", async () => {
    const before = readFileSync(join(ws.projectDir('escrita'), 'mapping.json'), 'utf8');
    const result = ok(await plan([{ op: 'remove_platform_repo', platform: 'android' }]));
    expect(result.valid).toBe(true);
    expect(result.summary).toEqual(['0. Remove the local clone of platform "android"']);
    expect(result.changes.platformRepos).toEqual({ created: 0, updated: 0, deleted: 1 });
    // A platform without a local path is not a problem: the agent uses the specialization's URL.
    expect(result.warnings).toBeUndefined();
    expect(readFileSync(join(ws.projectDir('escrita'), 'mapping.json'), 'utf8')).toBe(
      before,
    );
  });

  it("the script's batch (ios local clone) is applied and writes v16 with revision + 1", async () => {
    const dir = ws.projectDir('escrita');
    const operations = [
      {
        op: 'set_platform_repo',
        platform: 'ios',
        localPath: '../../..',
      },
    ];
    const result = ok(await plan(operations));
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.revision).toBe(0);
    expect(result.summary[0]).toContain('Set the local clone of platform "ios"');
    expect(result.changes.platformRepos).toEqual({ created: 1, updated: 0, deleted: 0 });
    expect(result.warnings).toBeUndefined();

    // The agent proposes; mapping.json only changes when the user accepts and the app applies.
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
    expect(saved.schemaVersion).toBe(20);
    expect(saved.revision).toBe(1);
    expect(saved.platformRepos).toEqual({
      android: { localPath: '../../..' },
      ios: { localPath: '../../..' },
    });

    // Whoever reads afterwards (the open app reloads through the external-change mechanism) already sees the ios clone.
    // The address still comes from the specialization, which declares no `repo` for iOS.
    const marking = ok(
      await mcp.call<MarkingData>('get_marking', {
        ref: refOf('escrita', 'm', 'MC'),
        platform: 'ios',
      }),
    );
    const button = marking.layers
      .flatMap((l) => l.annotations)
      .find((a) => a.type?.typeId === 'button')!;
    expect(button.code!.ios!.definition).toMatchObject({
      path: DS_BUTTON_SWIFT,
      url: null,
      localFile: DS_BUTTON_SWIFT,
      exists: false,
    });
    const project = ok(await mcp.call('get_project', { project: 'escrita' }));
    expect(project.revision).toBe(1);
    expect(project.warnings).toBeUndefined();

    // A new proposal starts from the revision written by the app.
    const fresh = await propose(mcp, 'escrita', [
      { op: 'set_platform_repo', platform: 'ios', localPath: null },
    ]);
    expect(fresh.proposal.baseRevision).toBe(1);
  });

  it('the new tools and operations appear on the server', async () => {
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
