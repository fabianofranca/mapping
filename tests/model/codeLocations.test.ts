import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addTypedAnnotation,
  applySpecialization,
  codeLink,
  codeLocalPath,
  findByCode,
  findPlatform,
  getAnnotationIssues,
  hasLocalPath,
  isValidCodePath,
  normalizeCodePath,
  projectPlatforms,
  projectTypeCode,
  removePlatformRepo,
  removeSpecialization,
  setPlatformRepo,
  specPlatformRepo,
  typeCodeDefinitions,
  typeOfAnnotation,
  type Project,
  type Spec,
} from '../../src/model';
import {
  ANDROID_REPO,
  cadastroProject,
  codeProject,
  idGen,
  loadExample,
  specProject,
  withSpecRepo,
} from './specFixtures';

// Código de instanciação das especializações (etapa 3b; schema v11): plataformas com o `repo`
// de cada especialização, o clone local do projeto, link (pela especialização dona do tipo) e
// caminho local do `path` de um tipo, a "Definição" e a busca de tipos por arquivo ou símbolo
// (`findByCode`).

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const DS_BUTTON = 'app/src/main/java/com/app/ds/DSButton.kt';
const DS_TEXT_FIELD = 'app/src/main/java/com/app/ds/DSTextField.kt';
const DS_BUTTON_SWIFT = 'App/DesignSystem/DSButton.swift';

/** O `repo` de `android` da outra especialização: outra biblioteca, outro repositório. */
const OTHER_ANDROID_REPO = {
  url: 'https://gitlab.com/org/outra-android',
  urlTemplate: 'https://gitlab.com/org/outra-android/-/blob/main/{path}',
} as const;

/** Outra especialização que também declara `android` (com outro nome) e `web`. */
function otherSpec(withRepo = false): Spec {
  return {
    format: 'mapping-spec',
    formatVersion: withRepo ? 5 : 2,
    id: 'outra',
    name: 'Outra',
    version: 1,
    platforms: [
      {
        id: 'android',
        name: 'Android (outro nome)',
        language: 'java',
        ...(withRepo ? { repo: OTHER_ANDROID_REPO } : {}),
      },
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
            fields: [{ key: 'titulo', type: 'string' }],
            code: {
              android: { symbol: 'PaginaScreen', path: 'outro/modulo/DSButton.kt' },
              web: { symbol: 'Pagina', path: 'src/Pagina.tsx' },
            },
          },
        ],
      },
    ],
  };
}

describe('plataformas do projeto', () => {
  it('consolida as plataformas das especializações aplicadas, na ordem de aplicação', () => {
    expect(projectPlatforms(specProject())).toEqual([
      {
        id: 'android',
        name: 'Android',
        language: 'kotlin',
        specIds: ['sdui'],
        repos: [],
      },
      { id: 'ios', name: 'iOS', language: 'swift', specIds: ['sdui'], repos: [] },
      {
        id: 'bff',
        name: 'Contrato SDUI',
        language: 'json',
        specIds: ['sdui'],
        repos: [],
      },
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
      {
        id: 'android',
        name: 'Android',
        language: 'kotlin',
        specIds: ['sdui', 'outra'],
        repos: [],
      },
      { id: 'ios', name: 'iOS', language: 'swift', specIds: ['sdui'], repos: [] },
      {
        id: 'bff',
        name: 'Contrato SDUI',
        language: 'json',
        specIds: ['sdui'],
        repos: [],
      },
      { id: 'web', name: 'Web', language: null, specIds: ['outra'], repos: [] },
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
      repos: [],
    });
  });

  it('leva o repo de cada especialização que declara a plataforma, na ordem de aplicação', () => {
    let p = withSpecRepo(specProject(), 'sdui', 'android', ANDROID_REPO);
    p = applySpecialization(p, otherSpec(true), { newId: idGen('LO') });
    expect(findPlatform(p, 'android')?.repos).toEqual([
      { specId: 'sdui', repo: ANDROID_REPO },
      { specId: 'outra', repo: OTHER_ANDROID_REPO },
    ]);
    expect(findPlatform(p, 'ios')?.repos).toEqual([]);
    expect(findPlatform(p, 'web')?.repos).toEqual([]);
  });
});

describe('specPlatformRepo', () => {
  it('é o repo da especialização na plataforma; null sem repo, sem a plataforma ou sem cópia', () => {
    const p = applySpecialization(codeProject(), otherSpec(true), {
      newId: idGen('LO'),
    });
    expect(specPlatformRepo(p, 'sdui', 'android')).toEqual(ANDROID_REPO);
    expect(specPlatformRepo(p, 'outra', 'android')).toEqual(OTHER_ANDROID_REPO);
    expect(specPlatformRepo(p, 'sdui', 'ios')).toBeNull();
    expect(specPlatformRepo(p, 'outra', 'ios')).toBeNull();
    expect(specPlatformRepo(p, 'outra', 'web')).toBeNull();
    expect(specPlatformRepo(p, 'nao-aplicada', 'android')).toBeNull();
    expect(specPlatformRepo(p, 'sdui', 'constructor')).toBeNull();
    const missing: Project = {
      ...p,
      specializations: p.specializations.map((s) =>
        s.id === 'sdui' ? { ...s, spec: null } : s,
      ),
    };
    expect(specPlatformRepo(missing, 'sdui', 'android')).toBeNull();
    expect(specPlatformRepo(missing, 'outra', 'android')).toEqual(OTHER_ANDROID_REPO);
  });
});

describe('clone local por plataforma', () => {
  it('informa, altera e remove', () => {
    let p = setPlatformRepo(specProject(), 'android', { localPath: '..\\..\\' });
    expect(p.platformRepos).toEqual({ android: { localPath: '../..' } });
    expect(hasLocalPath(p, 'android')).toBe(true);
    expect(hasLocalPath(p, 'ios')).toBe(false);

    p = setPlatformRepo(p, 'ios', { localPath: '.' });
    expect(Object.keys(p.platformRepos)).toEqual(['android', 'ios']);
    expect(p.platformRepos.ios).toEqual({ localPath: '.' });

    // Texto vazio ou null remove a entrada: o arquivo não guarda configuração vazia.
    p = setPlatformRepo(p, 'ios', { localPath: null });
    expect(Object.keys(p.platformRepos)).toEqual(['android']);
    p = setPlatformRepo(p, 'android', { localPath: '  ' });
    expect(p.platformRepos).toEqual({});
    p = setPlatformRepo(p, 'android', { localPath: '..' });
    p = removePlatformRepo(p, 'android');
    expect(p.platformRepos).toEqual({});
  });

  it('só guarda o localPath, sem endereço', () => {
    const p = setPlatformRepo(specProject(), 'android', { localPath: '../..' });
    expect(Object.keys(p.platformRepos.android ?? {})).toEqual(['localPath']);
  });

  it('repetir o valor atual devolve o mesmo projeto (sem entrada no desfazer)', () => {
    const p = setPlatformRepo(specProject(), 'android', { localPath: '../..' });
    expect(setPlatformRepo(p, 'android', { localPath: '../..' })).toBe(p);
    const empty = specProject();
    expect(setPlatformRepo(empty, 'ios', { localPath: null })).toBe(empty);
    expect(setPlatformRepo(empty, 'ios', { localPath: '' })).toBe(empty);
  });

  it('valida a plataforma e o localPath', () => {
    const p = specProject();
    expect(codeOf(() => setPlatformRepo(p, 'web', { localPath: '.' }))).toBe(
      'unknown-platform',
    );
    for (const bad of ['/home/dev/app', 'C:/dev/app', 'C:\\dev\\app']) {
      expect(
        codeOf(() => setPlatformRepo(p, 'android', { localPath: bad })),
        bad,
      ).toBe('invalid-local-path');
    }
    expect(codeOf(() => removePlatformRepo(p, 'android'))).toBe('not-found');
    // Configuração de plataforma não declarada (editada à mão) pode ser removida.
    const orphan = { ...p, platformRepos: { web: { localPath: '.' } } };
    expect(removePlatformRepo(orphan, 'web').platformRepos).toEqual({});
  });
});

describe('caminhos de código', () => {
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
  const at = (path: string | null, platform = 'android', specId = 'sdui') => ({
    specId,
    platform,
    path,
  });
  /** Projeto cuja especialização `sdui` declara `android` com esse `urlTemplate` (ou sem `repo`). */
  const withTemplate = (urlTemplate: string | undefined) =>
    withSpecRepo(codeProject(), 'sdui', 'android', {
      url: 'https://git.interno/org/app',
      ...(urlTemplate === undefined ? {} : { urlTemplate }),
    });

  it('substitui {path} e remove o trecho a partir do último # que contém {line}', () => {
    expect(codeLink(codeProject(), at(DS_BUTTON))).toBe(
      `https://github.com/org/app-android/blob/main/${DS_BUTTON}`,
    );
    const bitbucket = withTemplate(
      'https://bitbucket.org/org/app/src/main/{path}#lines-{line}',
    );
    expect(codeLink(bitbucket, at('a/B.kt'))).toBe(
      'https://bitbucket.org/org/app/src/main/a/B.kt',
    );
    // O # do roteamento da página (antes do {path}) não é removido.
    const hashRoute = withTemplate('https://git.interno/#/app/{path}#L{line}');
    expect(codeLink(hashRoute, at('B.kt'))).toBe('https://git.interno/#/app/B.kt');
    // {line} fora de um fragmento: vira vazio.
    const query = withTemplate('https://git.interno/ver?arquivo={path}&linha={line}');
    expect(codeLink(query, at('B.kt'))).toBe(
      'https://git.interno/ver?arquivo=B.kt&linha=',
    );
    const plain = withTemplate('https://git.interno/{path}');
    expect(codeLink(plain, at('B.kt'))).toBe('https://git.interno/B.kt');
  });

  it('codifica cada segmento do caminho e preserva as /', () => {
    expect(codeLink(codeProject(), at('src/Minha Tela#1/Ação?.kt'))).toBe(
      'https://github.com/org/app-android/blob/main/src/Minha%20Tela%231/A%C3%A7%C3%A3o%3F.kt',
    );
  });

  it('null sem repo, sem urlTemplate, com template inválido ou caminho inválido', () => {
    const p = codeProject();
    expect(codeLink(p, at(DS_BUTTON_SWIFT, 'ios'))).toBeNull();
    expect(codeLink(p, at(DS_BUTTON, 'constructor'))).toBeNull();
    expect(codeLink(p, at(DS_BUTTON, 'android', 'nao-aplicada'))).toBeNull();
    // `repo` só com `url`: sem `urlTemplate`, sem link.
    expect(codeLink(withTemplate(undefined), at(DS_BUTTON))).toBeNull();
    expect(codeLink(withTemplate('  '), at(DS_BUTTON))).toBeNull();
    expect(
      codeLink(withTemplate('javascript:alert(1)//{path}'), at(DS_BUTTON)),
    ).toBeNull();
    expect(codeLink(p, at(null))).toBeNull();
    expect(codeLink(p, at('/abs/a.kt'))).toBeNull();
    expect(codeLink(p, at('../x.kt'))).toBeNull();
  });

  it('o link vem da especialização dona do tipo, não do projeto', () => {
    // O projeto sobrepõe só o clone local: nada dele entra no link.
    expect(codeLink(codeProject(), at('a/B.kt'))).toBe(
      'https://github.com/org/app-android/blob/main/a/B.kt',
    );
    // Duas especializações com a mesma plataforma e repo diferentes: cada uma tem o seu.
    const p = applySpecialization(codeProject(), otherSpec(true), {
      newId: idGen('LO'),
    });
    expect(codeLink(p, at('a/B.kt', 'android', 'sdui'))).toBe(
      'https://github.com/org/app-android/blob/main/a/B.kt',
    );
    expect(codeLink(p, at('a/B.kt', 'android', 'outra'))).toBe(
      'https://gitlab.com/org/outra-android/-/blob/main/a/B.kt',
    );
    // A outra não declara `repo` para a plataforma `web`.
    expect(codeLink(p, at('src/Pagina.tsx', 'web', 'outra'))).toBeNull();
    // Uma especialização sem `repo` não herda o da outra, mesmo na mesma plataforma.
    const semRepo = applySpecialization(codeProject(), otherSpec(false), {
      newId: idGen('LO'),
    });
    expect(codeLink(semRepo, at('a/B.kt', 'android', 'outra'))).toBeNull();
    expect(codeLink(semRepo, at('a/B.kt', 'android', 'sdui'))).not.toBeNull();
  });
});

describe('codeLocalPath', () => {
  it('junta o localPath e o caminho, relativo à pasta do projeto', () => {
    const p = codeProject();
    const location = { specId: 'sdui', platform: 'android', path: DS_BUTTON };
    expect(codeLocalPath(p, location)).toBe(`../../../${DS_BUTTON}`);
    const at = (localPath: string) => ({
      ...p,
      platformRepos: { android: { localPath } },
    });
    expect(codeLocalPath(at('.'), location)).toBe(DS_BUTTON);
    expect(codeLocalPath(at('repo/../outro'), { ...location, path: 'a.kt' })).toBe(
      'outro/a.kt',
    );
    expect(codeLocalPath(at('/abs'), location)).toBeNull();
    expect(codeLocalPath(p, { ...location, platform: 'ios' })).toBeNull();
    expect(codeLocalPath(p, { ...location, path: null })).toBeNull();
  });

  it('a sobreposição é da plataforma: vale para qualquer especialização', () => {
    const p = applySpecialization(codeProject(), otherSpec(true), {
      newId: idGen('LO'),
    });
    const at = (specId: string) =>
      codeLocalPath(p, { specId, platform: 'android', path: 'a/B.kt' });
    expect(at('sdui')).toBe('../../../a/B.kt');
    expect(at('outra')).toBe('../../../a/B.kt');
  });
});

describe('Definição (path do code de um tipo)', () => {
  const typeOf = (p: Project, annotationId: string) =>
    typeOfAnnotation(
      p,
      p.annotations.find((a) => a.id === annotationId)!,
    )!.type;

  it('typeCodeDefinitions: uma entrada por plataforma com path, na ordem do code', () => {
    const p = codeProject();
    expect(typeCodeDefinitions(p, 'sdui', typeOf(p, 'AB'))).toEqual([
      {
        specId: 'sdui',
        platform: 'android',
        platformName: 'Android',
        path: DS_BUTTON,
        fileName: 'DSButton.kt',
        symbol: 'com.app.ds.DSButton',
      },
      {
        specId: 'sdui',
        platform: 'ios',
        platformName: 'iOS',
        path: DS_BUTTON_SWIFT,
        fileName: 'DSButton.swift',
        symbol: 'DSButton',
      },
    ]);
  });

  it('tipo sem path (ou sem code) não tem definição', () => {
    const p = codeProject();
    expect(typeCodeDefinitions(p, 'sdui', typeOf(p, 'AOC'))).toEqual([]);
    expect(typeCodeDefinitions(p, 'sdui', { code: undefined })).toEqual([]);
  });

  it('projectTypeCode: as entradas do code de todos os tipos aplicados, uma vez por versão', () => {
    const p = codeProject();
    const all = projectTypeCode(p);
    expect(all).toBe(projectTypeCode(p));
    expect(
      all
        .filter((e) => e.code.path !== undefined)
        .map((e) => `${e.typeId}/${e.platform}`),
    ).toEqual(['button/android', 'button/ios', 'input/android']);
  });
});

describe('findByCode (tipos pelo path e pelo symbol do code)', () => {
  const found = (p: Project, query: Parameters<typeof findByCode>[1]) =>
    findByCode(p, query).map(
      (m) => `${m.specId}/${m.typeId}:${m.code.map((c) => c.platform).join('+')}`,
    );

  it('casa o caminho inteiro ou um sufixo de segmentos inteiros', () => {
    const p = codeProject();
    expect(found(p, { path: 'DSButton.kt' })).toEqual(['sdui/button:android']);
    expect(found(p, { path: 'ds/DSButton.kt' })).toEqual(['sdui/button:android']);
    expect(found(p, { path: DS_BUTTON })).toEqual(['sdui/button:android']);
    expect(found(p, { path: 'Button.kt' })).toEqual([]);
    expect(found(p, { path: 'SButton.kt' })).toEqual([]);
    expect(found(p, { path: 'dsbutton.kt' })).toEqual([]);
    // A busca normaliza o caminho digitado.
    expect(found(p, { path: ' ./App\\DesignSystem\\DSButton.swift ' })).toEqual([
      'sdui/button:ios',
    ]);
    expect(found(p, { path: '/DSTextField.kt' })).toEqual(['sdui/input:android']);
    expect(found(p, { path: DS_TEXT_FIELD })).toEqual(['sdui/input:android']);
  });

  it('casa o símbolo por igualdade; com os dois, a mesma plataforma precisa casar ambos', () => {
    const p = codeProject();
    expect(found(p, { symbol: 'DSButton' })).toEqual(['sdui/button:ios']);
    expect(found(p, { symbol: 'com.app.ds.OnClick' })).toEqual(['sdui/onClick:android']);
    expect(found(p, { symbol: 'Button' })).toEqual([]);
    expect(found(p, { path: 'DSButton.kt', symbol: 'com.app.ds.DSButton' })).toEqual([
      'sdui/button:android',
    ]);
    // Arquivo do Android e símbolo do iOS: nenhuma plataforma casa com os dois.
    expect(found(p, { path: 'DSButton.kt', symbol: 'DSButton' })).toEqual([]);
    expect(found(p, {})).toEqual([]);
    expect(found(p, { path: '  ', symbol: '' })).toEqual([]);
  });

  it('devolve o code que casou e as anotações do tipo, com imagem e marcação', () => {
    const [match] = findByCode(codeProject(), { path: 'DSButton.kt' });
    expect(match).toEqual({
      specId: 'sdui',
      typeId: 'button',
      code: [
        {
          platform: 'android',
          code: expect.objectContaining({
            symbol: 'com.app.ds.DSButton',
            path: DS_BUTTON,
          }),
        },
      ],
      annotations: [{ imageId: 'I1', markingId: 'MC', annotationId: 'AB' }],
    });
    // O Input tem três anotações, na ordem do projeto.
    const [input] = findByCode(codeProject(), { path: 'DSTextField.kt' });
    expect(input?.annotations.map((a) => a.annotationId)).toEqual(['AIN', 'AII', 'AIE']);
  });

  it('tipo sem anotações aparece com a lista vazia; tipos de outra especialização também entram', () => {
    let p = codeProject();
    expect(findByCode(p, { symbol: 'com.app.ds.DSImage' })).toEqual([
      expect.objectContaining({ typeId: 'image', annotations: [] }),
    ]);
    p = applySpecialization(p, otherSpec(), { newId: idGen('LO') });
    expect(found(p, { path: 'DSButton.kt' })).toEqual([
      'sdui/button:android',
      'outra/pagina:android',
    ]);
    p = addTypedAnnotation(p, {
      id: 'AP',
      markingId: 'MT',
      layerId: 'LO1',
      type: { specId: 'outra', typeId: 'pagina' },
    });
    expect(findByCode(p, { path: 'Pagina.tsx' })[0]?.annotations).toEqual([
      { imageId: 'I1', markingId: 'MT', annotationId: 'AP' },
    ]);
  });

  it('especialização sem cópia (spec null) não entra na busca', () => {
    const p = codeProject();
    const missing: Project = {
      ...p,
      specializations: p.specializations.map((s) =>
        s.id === 'sdui' ? { ...s, spec: null } : s,
      ),
    };
    expect(findByCode(missing, { path: 'DSButton.kt' })).toEqual([]);
  });
});

describe('plataforma sem caminho local', () => {
  it('não é problema: sem aviso e sem pendência', () => {
    const p = codeProject();
    expect(hasLocalPath(p, 'ios')).toBe(false);
    expect(getAnnotationIssues(p, 'AB')).toEqual([]);
    const withoutAndroid = removePlatformRepo(p, 'android');
    expect(hasLocalPath(withoutAndroid, 'android')).toBe(false);
    // O link continua vindo da especialização.
    expect(
      codeLink(withoutAndroid, { specId: 'sdui', platform: 'android', path: 'a/B.kt' }),
    ).toBe('https://github.com/org/app-android/blob/main/a/B.kt');
  });
});

describe('exemplos', () => {
  it('o Screen do SDUI v2 não tem code nem campo de código (o blueprint marca a falta de mapeamento)', () => {
    const screen = loadExample('sdui')
      .layers.flatMap((l) => l.annotationTypes)
      .find((t) => t.id === 'screen');
    expect(screen?.code).toBeUndefined();
    expect(screen?.fields.map((f) => f.key)).toEqual(['nome', 'rota']);
  });
});
