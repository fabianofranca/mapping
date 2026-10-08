import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addCodeRefEntry,
  addTypedAnnotation,
  applySpecialization,
  codeLink,
  codeLocalPath,
  codeRefEntries,
  convertAnnotationToFree,
  findByCode,
  findPlatform,
  getAnnotationIssues,
  hasPlatformRepo,
  isValidCodePath,
  moveCodeRefEntry,
  normalizeCodePath,
  parseCodeRefEntry,
  platformRepoWarnings,
  projectPlatforms,
  removeCodeRefEntry,
  removePlatformRepo,
  removeSpecialization,
  setFieldValue,
  setPlatformRepo,
  updateCodeRefEntry,
  type Annotation,
  type CodeRefEntry,
  type JsonValue,
  type Project,
  type Spec,
} from '../../src/model';
import {
  CADASTRO_SCREEN_KT,
  CADASTRO_VIEW_MODEL_KT,
  CADASTRO_VIEW_SWIFT,
  cadastroProject,
  codeProject,
  idGen,
  loadExample,
  specProject,
} from './specFixtures';

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

function annotation(p: Project, id: string): Annotation {
  const a = p.annotations.find((x) => x.id === id);
  if (!a) throw new Error(`anotação ${id} não encontrada`);
  return a;
}

const entriesOf = (p: Project, id = 'AS'): JsonValue =>
  annotation(p, id).values?.implementacao ?? null;

/** Troca o valor de um campo como uma edição à mão do `mapping.json`. */
function patchValue(p: Project, id: string, key: string, value: JsonValue): Project {
  return {
    ...p,
    annotations: p.annotations.map((a) =>
      a.id === id ? { ...a, values: { ...(a.values ?? {}), [key]: value } } : a,
    ),
  };
}

/** O projeto com o `platforms` do campo `implementacao` restrito (especialização em memória). */
function withScreenPlatforms(p: Project, platforms: string[]): Project {
  return {
    ...p,
    specializations: p.specializations.map((s) => {
      if (s.id !== 'sdui' || !s.spec) return s;
      const spec = structuredClone(s.spec);
      for (const layer of spec.layers) {
        for (const type of layer.annotationTypes) {
          for (const field of type.fields) {
            if (field.type === 'codeRef') field.platforms = platforms;
          }
        }
      }
      return { ...s, spec };
    }),
  };
}

/** Outra especialização v2 que também declara `android` (com outro nome) e `web`. */
function otherSpec(): Spec {
  return {
    format: 'mapping-spec',
    formatVersion: 2,
    id: 'outra',
    name: 'Outra',
    version: 1,
    platforms: [
      { id: 'android', name: 'Android (outro nome)', language: 'java' },
      { id: 'web', name: 'Web' },
    ],
    layers: [
      {
        id: 'paginas',
        name: 'Páginas',
        color: '#5E35B1',
        annotationTypes: [
          {
            id: 'pagina',
            name: 'Página',
            fields: [{ key: 'arquivo', type: 'codeRef' }],
          },
        ],
      },
    ],
  };
}

describe('plataformas do projeto', () => {
  it('consolida as plataformas das especializações aplicadas, na ordem de aplicação', () => {
    expect(projectPlatforms(specProject())).toEqual([
      { id: 'android', name: 'Android', language: 'kotlin', specIds: ['sdui'] },
      { id: 'ios', name: 'iOS', language: 'swift', specIds: ['sdui'] },
      { id: 'bff', name: 'Contrato SDUI', language: 'json', specIds: ['sdui'] },
    ]);
    // Especialização v1 (Modelo de dados) não declara plataformas.
    expect(projectPlatforms(cadastroProject()).map((p) => p.id)).toEqual([
      'android',
      'ios',
      'bff',
    ]);
  });

  it('mesmo id em duas especializações é a mesma plataforma: vale a da primeira aplicada', () => {
    const p = applySpecialization(specProject(), otherSpec(), { newId: idGen('LO') });
    expect(projectPlatforms(p)).toEqual([
      { id: 'android', name: 'Android', language: 'kotlin', specIds: ['sdui', 'outra'] },
      { id: 'ios', name: 'iOS', language: 'swift', specIds: ['sdui'] },
      { id: 'bff', name: 'Contrato SDUI', language: 'json', specIds: ['sdui'] },
      { id: 'web', name: 'Web', language: null, specIds: ['outra'] },
    ]);
    expect(findPlatform(p, 'web')?.name).toBe('Web');
    expect(findPlatform(p, 'desktop')).toBeNull();
    // Removida a primeira, a outra passa a definir o nome.
    const only = removeSpecialization(p, 'sdui', 'delete');
    expect(findPlatform(only, 'android')).toEqual({
      id: 'android',
      name: 'Android (outro nome)',
      language: 'java',
      specIds: ['outra'],
    });
  });
});

describe('repositórios por plataforma', () => {
  const template = 'https://github.com/org/app-android/blob/main/{path}#L{line}';

  it('configura, altera em parte e remove', () => {
    let p = setPlatformRepo(specProject(), 'android', {
      urlTemplate: `  ${template} `,
      localPath: '..\\..\\',
    });
    expect(p.platformRepos).toEqual({
      android: { urlTemplate: template, localPath: '../..' },
    });
    expect(hasPlatformRepo(p, 'android')).toBe(true);
    expect(hasPlatformRepo(p, 'ios')).toBe(false);

    // Propriedade ausente fica como está; texto vazio vira null.
    p = setPlatformRepo(p, 'android', { localPath: '' });
    expect(p.platformRepos.android).toEqual({ urlTemplate: template, localPath: null });
    p = setPlatformRepo(p, 'ios', { localPath: '.' });
    expect(Object.keys(p.platformRepos)).toEqual(['android', 'ios']);
    expect(p.platformRepos.ios).toEqual({ urlTemplate: null, localPath: '.' });

    // Sem urlTemplate nem localPath, a configuração sai do arquivo.
    p = setPlatformRepo(p, 'ios', { localPath: null });
    expect(Object.keys(p.platformRepos)).toEqual(['android']);
    p = removePlatformRepo(p, 'android');
    expect(p.platformRepos).toEqual({});
  });

  it('repetir o valor atual devolve o mesmo projeto (sem entrada no desfazer)', () => {
    const p = setPlatformRepo(specProject(), 'android', { urlTemplate: template });
    expect(setPlatformRepo(p, 'android', { urlTemplate: template })).toBe(p);
    expect(setPlatformRepo(p, 'android', {})).toBe(p);
    const empty = specProject();
    expect(setPlatformRepo(empty, 'ios', { urlTemplate: '', localPath: null })).toBe(
      empty,
    );
  });

  it('valida a plataforma, o urlTemplate e o localPath', () => {
    const p = specProject();
    expect(codeOf(() => setPlatformRepo(p, 'web', { localPath: '.' }))).toBe(
      'unknown-platform',
    );
    for (const bad of [
      'https://github.com/org/repo/blob/main/',
      'javascript:alert(1)//{path}',
      'ftp://servidor/{path}',
      'https://servidor/com espaço/{path}',
      'github.com/org/repo/{path}',
    ]) {
      expect(
        codeOf(() => setPlatformRepo(p, 'android', { urlTemplate: bad })),
        bad,
      ).toBe('invalid-url-template');
    }
    for (const bad of ['/home/dev/app', 'C:/dev/app', 'C:\\dev\\app']) {
      expect(
        codeOf(() => setPlatformRepo(p, 'android', { localPath: bad })),
        bad,
      ).toBe('invalid-local-path');
    }
    expect(codeOf(() => removePlatformRepo(p, 'android'))).toBe('not-found');
    // Um valor antigo inválido (editado à mão) não impede de alterar o outro.
    const handEdited: Project = {
      ...p,
      platformRepos: {
        android: { urlTemplate: 'javascript:x//{path}', localPath: null },
      },
    };
    expect(
      setPlatformRepo(handEdited, 'android', { localPath: '..' }).platformRepos,
    ).toEqual({ android: { urlTemplate: 'javascript:x//{path}', localPath: '..' } });
    // Configuração de plataforma não declarada (editada à mão) pode ser removida.
    const orphan = {
      ...p,
      platformRepos: { web: { urlTemplate: null, localPath: '.' } },
    };
    expect(removePlatformRepo(orphan, 'web').platformRepos).toEqual({});
  });
});

describe('entradas de codeRef', () => {
  const screen = (p: Project) =>
    addTypedAnnotation(p, {
      id: 'AS',
      markingId: 'MF',
      layerId: 'LS3',
      type: { specId: 'sdui', typeId: 'screen' },
    });

  it('o Screen novo começa com a lista vazia', () => {
    const p = screen(cadastroProject());
    expect(annotation(p, 'AS').values).toEqual({
      nome: null,
      rota: null,
      implementacao: [],
    });
  });

  it('adicionar, alterar, reordenar e remover, com _id estável', () => {
    let p = screen(cadastroProject());
    p = addCodeRefEntry(p, 'AS', 'implementacao', 'E1', {
      platform: 'android',
      path: ' ./app/src/Main.kt ',
      symbol: '  Main ',
    });
    p = addCodeRefEntry(p, 'AS', 'implementacao', 'E2', { platform: 'ios' });
    expect(entriesOf(p)).toEqual([
      {
        _id: 'E1',
        platform: 'android',
        path: 'app/src/Main.kt',
        symbol: 'Main',
        line: null,
      },
      { _id: 'E2', platform: 'ios', path: null, symbol: null, line: null },
    ]);
    // Entrada sem caminho é permitida, mas fica pendente.
    expect(getAnnotationIssues(p, 'AS')).toEqual([
      { code: 'required-empty', key: 'nome' },
      { code: 'missing-path', key: 'implementacao', rowId: 'E2', column: 'path' },
    ]);

    p = updateCodeRefEntry(p, 'AS', 'implementacao', 'E2', {
      path: 'App\\Main.swift',
      line: 12,
    });
    p = updateCodeRefEntry(p, 'AS', 'implementacao', 'E1', { symbol: '', line: null });
    expect(entriesOf(p)).toEqual([
      {
        _id: 'E1',
        platform: 'android',
        path: 'app/src/Main.kt',
        symbol: null,
        line: null,
      },
      { _id: 'E2', platform: 'ios', path: 'App/Main.swift', symbol: null, line: 12 },
    ]);
    p = moveCodeRefEntry(p, 'AS', 'implementacao', 'E2', 0);
    expect(codeRefEntries(entriesOf(p)).map((e) => e._id)).toEqual(['E2', 'E1']);
    p = removeCodeRefEntry(p, 'AS', 'implementacao', 'E2');
    expect(codeRefEntries(entriesOf(p)).map((e) => e._id)).toEqual(['E1']);
  });

  it('alterar com os mesmos valores devolve o mesmo projeto', () => {
    const p = codeProject();
    expect(updateCodeRefEntry(p, 'AS', 'implementacao', 'C2', { line: 42 })).toBe(p);
    expect(updateCodeRefEntry(p, 'AS', 'implementacao', 'C2', {})).toBe(p);
  });

  it('valida plataforma, caminho e linha', () => {
    const p = codeProject();
    const add = (input: Parameters<typeof addCodeRefEntry>[4], id = 'N') =>
      codeOf(() => addCodeRefEntry(p, 'AS', 'implementacao', id, input));
    expect(add({ platform: 'web', path: 'a.kt' })).toBe('platform-not-allowed');
    for (const path of ['/abs/a.kt', 'C:/a.kt', 'a/../b.kt', 'a/./b.kt', 'a//b.kt']) {
      expect(add({ platform: 'android', path }), path).toBe('invalid-path');
    }
    for (const line of [0, -1, 1.5, Number.NaN]) {
      expect(add({ platform: 'android', path: 'a.kt', line }), String(line)).toBe(
        'invalid-value',
      );
    }
    expect(add({ platform: 'android' }, 'C1')).toBe('duplicate-id');
    expect(
      codeOf(() => addCodeRefEntry(p, 'AS', 'rota', 'N', { platform: 'android' })),
    ).toBe('invalid-value');
    expect(
      codeOf(() => addCodeRefEntry(p, 'AS', 'sumiu', 'N', { platform: 'android' })),
    ).toBe('unknown-field');
    expect(
      codeOf(() =>
        addCodeRefEntry(p, 'AU', 'implementacao', 'N', { platform: 'android' }),
      ),
    ).toBe('not-typed');
    expect(
      codeOf(() => updateCodeRefEntry(p, 'AS', 'implementacao', 'X', { line: 1 })),
    ).toBe('not-found');
    expect(
      codeOf(() =>
        updateCodeRefEntry(p, 'AS', 'implementacao', 'C1', { platform: 'web' }),
      ),
    ).toBe('platform-not-allowed');
    expect(codeOf(() => moveCodeRefEntry(p, 'AS', 'implementacao', 'C1', 5))).toBe(
      'invalid-index',
    );
    expect(codeOf(() => removeCodeRefEntry(p, 'AS', 'implementacao', 'X'))).toBe(
      'not-found',
    );
  });

  it('o platforms do campo restringe as plataformas', () => {
    const p = withScreenPlatforms(codeProject(), ['android']);
    expect(
      codeOf(() => addCodeRefEntry(p, 'AS', 'implementacao', 'N', { platform: 'ios' })),
    ).toBe('platform-not-allowed');
    expect(
      addCodeRefEntry(p, 'AS', 'implementacao', 'N', { platform: 'android' }),
    ).not.toBe(p);
    // Alterar outra propriedade não exige corrigir a plataforma antes.
    expect(
      codeRefEntries(
        entriesOf(updateCodeRefEntry(p, 'AS', 'implementacao', 'C3', { line: 3 })),
      ).find((e) => e._id === 'C3')?.line,
    ).toBe(3);
  });

  describe('setFieldValue com a lista inteira (caminho das anotações tipadas e do MCP)', () => {
    it('entradas sem _id ganham um id novo; com _id, mantêm a identidade', () => {
      const p = codeProject();
      const next = setFieldValue(
        p,
        'AS',
        'implementacao',
        [
          { _id: 'C2', line: 50 },
          { platform: 'ios', path: 'App/Novo.swift' },
          {
            _id: 'manual',
            platform: 'bff',
            path: 'contratos/cadastro.json',
            symbol: ' x ',
          },
        ],
        { newId: idGen('novo') },
      );
      expect(entriesOf(next)).toEqual([
        {
          _id: 'C2',
          platform: 'android',
          path: CADASTRO_VIEW_MODEL_KT,
          symbol: 'CadastroViewModel',
          line: 50,
        },
        {
          _id: 'novo1',
          platform: 'ios',
          path: 'App/Novo.swift',
          symbol: null,
          line: null,
        },
        {
          _id: 'manual',
          platform: 'bff',
          path: 'contratos/cadastro.json',
          symbol: 'x',
          line: null,
        },
      ]);
    });

    it('sem newId, os ids novos são UUIDs', () => {
      const next = setFieldValue(codeProject(), 'AS', 'implementacao', [
        { platform: 'android', path: 'a.kt' },
      ]);
      const [entry] = codeRefEntries(entriesOf(next));
      expect(entry?._id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('null ou lista vazia limpam', () => {
      expect(
        entriesOf(setFieldValue(codeProject(), 'AS', 'implementacao', null)),
      ).toEqual([]);
      expect(entriesOf(setFieldValue(codeProject(), 'AS', 'implementacao', []))).toEqual(
        [],
      );
    });

    it('valida cada entrada', () => {
      const p = codeProject();
      const set = (value: JsonValue) =>
        codeOf(() => setFieldValue(p, 'AS', 'implementacao', value));
      expect(set('app/Main.kt')).toBe('invalid-value');
      expect(set(['app/Main.kt'])).toBe('invalid-value');
      expect(set([{ path: 'a.kt' }])).toBe('invalid-value'); // entrada nova sem plataforma
      expect(set([{ platform: 'android', path: 'a.kt', url: 'https://x' }])).toBe(
        'invalid-value',
      );
      expect(set([{ platform: 'android', path: 7 }])).toBe('invalid-value');
      expect(set([{ platform: 'android', line: '12' }])).toBe('invalid-value');
      expect(set([{ platform: 'android', symbol: 1 }])).toBe('invalid-value');
      expect(set([{ _id: '', platform: 'android' }])).toBe('invalid-value');
      expect(set([{ _id: 3, platform: 'android' }])).toBe('invalid-value');
      expect(set([{ platform: 'web' }])).toBe('platform-not-allowed');
      expect(set([{ platform: 'android', path: '../fora.kt' }])).toBe('invalid-path');
      expect(set([{ _id: 'C1' }, { _id: 'C1' }])).toBe('duplicate-id');
    });
  });

  it('a conversão em anotação livre achata as entradas', () => {
    const p = convertAnnotationToFree(codeProject(), 'AS', { newId: idGen('E') });
    expect(annotation(p, 'AS').entries.map((e) => `${e.key}=${e.value}`)).toEqual([
      'nome=Cadastro',
      'rota=/cadastro',
      'implementacao[1].platform=android',
      `implementacao[1].path=${CADASTRO_SCREEN_KT}`,
      'implementacao[1].symbol=CadastroScreen',
      'implementacao[2].platform=android',
      `implementacao[2].path=${CADASTRO_VIEW_MODEL_KT}`,
      'implementacao[2].symbol=CadastroViewModel',
      'implementacao[2].line=42',
      'implementacao[3].platform=ios',
      `implementacao[3].path=${CADASTRO_VIEW_SWIFT}`,
      'implementacao[3].symbol=CadastroView',
    ]);
  });

  it('leitura tolerante: opcionais ausentes valem null; formato errado fica de fora', () => {
    expect(parseCodeRefEntry({ _id: 'a', platform: 'android' })).toEqual({
      _id: 'a',
      platform: 'android',
      path: null,
      symbol: null,
      line: null,
    });
    expect(
      parseCodeRefEntry({ _id: 'a', platform: 'android', path: '', symbol: '' }),
    ).toEqual({ _id: 'a', platform: 'android', path: null, symbol: null, line: null });
    for (const bad of [
      null,
      'x',
      { platform: 'android' },
      { _id: 'a' },
      { _id: 'a', platform: 'android', line: 0 },
      { _id: 'a', platform: 'android', path: 1 },
    ] as JsonValue[]) {
      expect(parseCodeRefEntry(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(codeRefEntries(null)).toEqual([]);
  });

  it('normalização e validação do caminho', () => {
    expect(normalizeCodePath(' .\\app\\src\\Main.kt/ ')).toBe('app/src/Main.kt');
    expect(normalizeCodePath(' ./ ')).toBeNull();
    expect(isValidCodePath('app/src/Main.kt')).toBe(true);
    expect(isValidCodePath('Main.kt')).toBe(true);
    for (const bad of [
      '',
      ' a.kt',
      'a\\b.kt',
      './a.kt',
      'a/',
      '/a',
      'a//b',
      '..',
      'a/\nb',
    ]) {
      expect(isValidCodePath(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('codeLink', () => {
  const entry = (patch: Partial<CodeRefEntry> = {}): CodeRefEntry => ({
    _id: 'x',
    platform: 'android',
    path: CADASTRO_SCREEN_KT,
    symbol: null,
    line: null,
    ...patch,
  });
  const withTemplate = (urlTemplate: string | null, localPath: string | null = null) => ({
    ...codeProject(),
    platformRepos: { android: { urlTemplate, localPath } },
  });

  it('com linha, substitui {path} e {line}', () => {
    expect(codeLink(codeProject(), entry({ line: 42 }))).toBe(
      `https://github.com/org/app-android/blob/main/${CADASTRO_SCREEN_KT}#L42`,
    );
  });

  it('sem linha, remove o trecho a partir do último # que contém {line}', () => {
    expect(codeLink(codeProject(), entry())).toBe(
      `https://github.com/org/app-android/blob/main/${CADASTRO_SCREEN_KT}`,
    );
    const bitbucket = withTemplate(
      'https://bitbucket.org/org/app/src/main/{path}#lines-{line}',
    );
    expect(codeLink(bitbucket, entry({ path: 'a/B.kt' }))).toBe(
      'https://bitbucket.org/org/app/src/main/a/B.kt',
    );
    expect(codeLink(bitbucket, entry({ path: 'a/B.kt', line: 7 }))).toBe(
      'https://bitbucket.org/org/app/src/main/a/B.kt#lines-7',
    );
    // O # do roteamento da página (antes do {path}) não é removido.
    const hashRoute = withTemplate('https://git.interno/#/app/{path}#L{line}');
    expect(codeLink(hashRoute, entry({ path: 'B.kt' }))).toBe(
      'https://git.interno/#/app/B.kt',
    );
    // {line} fora de um fragmento: vira vazio.
    const query = withTemplate('https://git.interno/ver?arquivo={path}&linha={line}');
    expect(codeLink(query, entry({ path: 'B.kt' }))).toBe(
      'https://git.interno/ver?arquivo=B.kt&linha=',
    );
    // Template sem {line}: a linha não entra.
    const plain = withTemplate('https://git.interno/{path}');
    expect(codeLink(plain, entry({ path: 'B.kt', line: 3 }))).toBe(
      'https://git.interno/B.kt',
    );
  });

  it('codifica cada segmento do caminho e preserva as /', () => {
    expect(
      codeLink(codeProject(), entry({ path: 'src/Minha Tela#1/Ação?.kt', line: 1 })),
    ).toBe(
      'https://github.com/org/app-android/blob/main/src/Minha%20Tela%231/A%C3%A7%C3%A3o%3F.kt#L1',
    );
  });

  it('null sem repositório, sem urlTemplate, com template inválido ou caminho inválido', () => {
    const p = codeProject();
    expect(codeLink(p, entry({ platform: 'ios' }))).toBeNull();
    expect(codeLink(p, entry({ platform: 'constructor' }))).toBeNull();
    expect(codeLink(withTemplate(null, '..'), entry())).toBeNull();
    expect(codeLink(withTemplate('  '), entry())).toBeNull();
    expect(codeLink(withTemplate('javascript:alert(1)//{path}'), entry())).toBeNull();
    expect(codeLink(p, entry({ path: null }))).toBeNull();
    expect(codeLink(p, entry({ path: '/abs/a.kt' }))).toBeNull();
  });
});

describe('codeLocalPath', () => {
  it('junta o localPath e o caminho da entrada, relativo à pasta do projeto', () => {
    const p = codeProject();
    const entry = { platform: 'android', path: CADASTRO_SCREEN_KT };
    expect(codeLocalPath(p, entry)).toBe(`../../../${CADASTRO_SCREEN_KT}`);
    const at = (localPath: string) => ({
      ...p,
      platformRepos: { android: { urlTemplate: null, localPath } },
    });
    expect(codeLocalPath(at('.'), entry)).toBe(CADASTRO_SCREEN_KT);
    expect(codeLocalPath(at('repo/../outro'), { ...entry, path: 'a.kt' })).toBe(
      'outro/a.kt',
    );
    expect(codeLocalPath(at('/abs'), entry)).toBeNull();
    expect(codeLocalPath(p, { ...entry, platform: 'ios' })).toBeNull();
    expect(codeLocalPath(p, { ...entry, path: null })).toBeNull();
  });
});

describe('findByCode', () => {
  const ids = (p: Project, query: Parameters<typeof findByCode>[1]) =>
    findByCode(p, query).map((l) => `${l.annotationId}/${l.key}/${l.entry._id}`);

  it('casa o caminho inteiro ou um sufixo de segmentos inteiros', () => {
    const p = codeProject();
    expect(ids(p, { path: 'CadastroScreen.kt' })).toEqual(['AS/implementacao/C1']);
    expect(ids(p, { path: 'cadastro/CadastroScreen.kt' })).toEqual([
      'AS/implementacao/C1',
    ]);
    expect(ids(p, { path: CADASTRO_SCREEN_KT })).toEqual(['AS/implementacao/C1']);
    expect(ids(p, { path: 'Screen.kt' })).toEqual([]);
    expect(ids(p, { path: 'adastro/CadastroScreen.kt' })).toEqual([]);
    expect(ids(p, { path: 'cadastroscreen.kt' })).toEqual([]);
    // A busca normaliza o caminho digitado.
    expect(ids(p, { path: ' ./App\\Cadastro\\CadastroView.swift ' })).toEqual([
      'AS/implementacao/C3',
    ]);
    expect(ids(p, { path: '/CadastroView.swift' })).toEqual(['AS/implementacao/C3']);
  });

  it('casa o símbolo por igualdade; com os dois, precisa casar ambos', () => {
    const p = codeProject();
    expect(ids(p, { symbol: 'CadastroViewModel' })).toEqual(['AS/implementacao/C2']);
    expect(ids(p, { symbol: 'Cadastro' })).toEqual([]);
    expect(ids(p, { path: 'CadastroScreen.kt', symbol: 'CadastroScreen' })).toEqual([
      'AS/implementacao/C1',
    ]);
    expect(ids(p, { path: 'CadastroScreen.kt', symbol: 'CadastroView' })).toEqual([]);
    expect(ids(p, {})).toEqual([]);
    expect(ids(p, { path: '  ', symbol: '' })).toEqual([]);
  });

  it('devolve imagem, marcação, anotação, campo e entrada (para a referência mapping://)', () => {
    const [found] = findByCode(codeProject(), { path: 'CadastroViewModel.kt' });
    expect(found).toEqual({
      imageId: 'I1',
      markingId: 'MF',
      annotationId: 'AS',
      key: 'implementacao',
      entry: {
        _id: 'C2',
        platform: 'android',
        path: CADASTRO_VIEW_MODEL_KT,
        symbol: 'CadastroViewModel',
        line: 42,
      },
    });
  });

  it('a mesma entrada em várias anotações: todas, na ordem do projeto', () => {
    let p = codeProject();
    p = addTypedAnnotation(p, {
      id: 'AS2',
      markingId: 'MT',
      layerId: 'LS3',
      type: { specId: 'sdui', typeId: 'screen' },
    });
    p = addCodeRefEntry(p, 'AS2', 'implementacao', 'D1', {
      platform: 'android',
      path: 'outro/modulo/CadastroScreen.kt',
    });
    expect(ids(p, { path: 'CadastroScreen.kt' })).toEqual([
      'AS/implementacao/C1',
      'AS2/implementacao/D1',
    ]);
  });
});

describe('pendências do codeRef', () => {
  const issues = (p: Project, id = 'AS') => getAnnotationIssues(p, id);
  const entry = (patch: Record<string, JsonValue>): JsonValue => ({
    _id: 'X',
    platform: 'android',
    path: 'a.kt',
    symbol: null,
    line: null,
    ...patch,
  });

  it('o projeto do roteiro está completo', () => {
    expect(issues(codeProject())).toEqual([]);
  });

  it('plataforma não declarada ou fora do platforms do campo: incompleta', () => {
    const p = patchValue(codeProject(), 'AS', 'implementacao', [
      entry({ platform: 'web' }),
    ]);
    expect(issues(p)).toEqual([
      { code: 'unknown-platform', key: 'implementacao', rowId: 'X', column: 'platform' },
    ]);
    const restricted = withScreenPlatforms(codeProject(), ['android']);
    expect(issues(restricted)).toEqual([
      {
        code: 'platform-not-allowed',
        key: 'implementacao',
        rowId: 'C3',
        column: 'platform',
      },
    ]);
  });

  it('entrada sem caminho: incompleta', () => {
    for (const path of [null, '', '  ']) {
      const p = patchValue(codeProject(), 'AS', 'implementacao', [entry({ path })]);
      expect(issues(p), JSON.stringify(path)).toEqual([
        { code: 'missing-path', key: 'implementacao', rowId: 'X', column: 'path' },
      ]);
    }
    const absent = patchValue(codeProject(), 'AS', 'implementacao', [
      { _id: 'X', platform: 'android' },
    ]);
    expect(issues(absent)).toEqual([
      { code: 'missing-path', key: 'implementacao', rowId: 'X', column: 'path' },
    ]);
  });

  it('valores inválidos, chave desconhecida e entrada malformada', () => {
    const p = patchValue(codeProject(), 'AS', 'implementacao', [
      entry({ path: '/abs/a.kt', line: 0, symbol: 3, extra: true }),
      entry({ _id: 'Y', platform: 7, line: 1.5 }),
      'texto solto',
    ]);
    expect(issues(p)).toEqual([
      { code: 'invalid-value', key: 'implementacao' },
      { code: 'unknown-field', key: 'implementacao', rowId: 'X', column: 'extra' },
      { code: 'invalid-value', key: 'implementacao', rowId: 'X', column: 'path' },
      { code: 'invalid-value', key: 'implementacao', rowId: 'X', column: 'symbol' },
      { code: 'invalid-value', key: 'implementacao', rowId: 'X', column: 'line' },
      { code: 'invalid-value', key: 'implementacao', rowId: 'Y', column: 'platform' },
      { code: 'invalid-value', key: 'implementacao', rowId: 'Y', column: 'line' },
    ]);
    expect(issues(patchValue(codeProject(), 'AS', 'implementacao', 'a.kt'))).toEqual([
      { code: 'invalid-value', key: 'implementacao' },
    ]);
  });

  it('codeRef obrigatório vazio', () => {
    const p = codeProject();
    const required: Project = {
      ...p,
      specializations: p.specializations.map((s) => {
        if (!s.spec) return s;
        const spec = structuredClone(s.spec);
        for (const layer of spec.layers) {
          for (const type of layer.annotationTypes) {
            for (const field of type.fields) {
              if (field.type === 'codeRef') field.required = true;
            }
          }
        }
        return { ...s, spec };
      }),
    };
    for (const value of [[], null] as JsonValue[]) {
      expect(issues(patchValue(required, 'AS', 'implementacao', value))).toEqual([
        { code: 'required-empty', key: 'implementacao' },
      ]);
    }
  });
});

describe('aviso de plataforma sem repositório', () => {
  it('plataforma usada sem repositório configurado é aviso, não pendência', () => {
    const p = codeProject();
    expect(platformRepoWarnings(p)).toEqual([
      { code: 'missing-repo', platform: 'ios', entries: 1 },
    ]);
    expect(issues(p)).toEqual([]);
    const configured = setPlatformRepo(p, 'ios', { localPath: '../ios' });
    expect(platformRepoWarnings(configured)).toEqual([]);
    const withoutAndroid = removePlatformRepo(configured, 'android');
    expect(platformRepoWarnings(withoutAndroid)).toEqual([
      { code: 'missing-repo', platform: 'android', entries: 2 },
    ]);
  });

  it('plataforma não declarada (já pendente) e plataforma sem uso não geram aviso', () => {
    const p = patchValue(codeProject(), 'AS', 'implementacao', [
      { _id: 'X', platform: 'web', path: 'a.ts', symbol: null, line: null },
    ]);
    expect(platformRepoWarnings(p)).toEqual([]);
    expect(platformRepoWarnings(specProject())).toEqual([]);
  });

  it('calculado uma vez por versão do projeto', () => {
    const p = codeProject();
    expect(platformRepoWarnings(p)).toBe(platformRepoWarnings(p));
  });

  function issues(p: Project) {
    return getAnnotationIssues(p, 'AS');
  }
});

describe('exemplos', () => {
  it('o Screen do SDUI v2 não tem code (o blueprint marca a falta de mapeamento)', () => {
    const screen = loadExample('sdui')
      .layers.flatMap((l) => l.annotationTypes)
      .find((t) => t.id === 'screen');
    expect(screen?.code).toBeUndefined();
  });
});
