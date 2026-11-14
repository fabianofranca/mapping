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
import { BUTTON_PATH, TEXT_BUTTON_PATH, variantsProject } from './variantsFixtures';

// Instantiation code of the specializations (stage 3b; schema v11): platforms with the `repo`
// of each specialization, the project's local clone, link (through the specialization that
// owns the type) and local path of a type's `path`, the "Definition" and the search for types
// by file or symbol (`findByCode`).

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

/** The `repo` of `android` of the other specialization: another library, another repository. */
const OTHER_ANDROID_REPO = {
  url: 'https://gitlab.com/org/other-android',
  urlTemplate: 'https://gitlab.com/org/other-android/-/blob/main/{path}',
} as const;

/** Another specialization that also declares `android` (with another name) and `web`. */
function otherSpec(withRepo = false): Spec {
  return {
    format: 'mapping-spec',
    formatVersion: withRepo ? 5 : 2,
    id: 'other',
    name: 'Other',
    version: 1,
    platforms: [
      {
        id: 'android',
        name: 'Android (other name)',
        language: 'java',
        ...(withRepo ? { repo: OTHER_ANDROID_REPO } : {}),
      },
      { id: 'web', name: 'Web' },
    ],
    layers: [
      {
        id: 'pages',
        name: 'Pages',
        color: '#5E35B1',
        annotationTypes: [
          {
            id: 'page',
            name: 'Page',
            fields: [{ key: 'title', type: 'string' }],
            code: {
              android: { symbol: 'PageScreen', path: 'other/module/DSButton.kt' },
              web: { symbol: 'Page', path: 'src/Page.tsx' },
            },
          },
        ],
      },
    ],
  };
}

describe('project platforms', () => {
  it('consolidates the platforms of the applied specializations, in application order', () => {
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
    // Specialization v1 (Data model) does not declare platforms.
    expect(projectPlatforms(cadastroProject()).map((p) => p.id)).toEqual([
      'android',
      'ios',
      'bff',
    ]);
  });

  it('the same id in two specializations is the same platform: the first applied wins', () => {
    const p = applySpecialization(specProject(), otherSpec(), { newId: idGen('LO') });
    expect(projectPlatforms(p)).toEqual([
      {
        id: 'android',
        name: 'Android',
        language: 'kotlin',
        specIds: ['sdui', 'other'],
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
      { id: 'web', name: 'Web', language: null, specIds: ['other'], repos: [] },
    ]);
    expect(findPlatform(p, 'web')?.name).toBe('Web');
    expect(findPlatform(p, 'desktop')).toBeNull();
    // With the first removed, the other one defines the name.
    const only = removeSpecialization(p, 'sdui', 'delete');
    expect(findPlatform(only, 'android')).toEqual({
      id: 'android',
      name: 'Android (other name)',
      language: 'java',
      specIds: ['other'],
      repos: [],
    });
  });

  it('carries the repo of each specialization that declares the platform, in application order', () => {
    let p = withSpecRepo(specProject(), 'sdui', 'android', ANDROID_REPO);
    p = applySpecialization(p, otherSpec(true), { newId: idGen('LO') });
    expect(findPlatform(p, 'android')?.repos).toEqual([
      { specId: 'sdui', repo: ANDROID_REPO },
      { specId: 'other', repo: OTHER_ANDROID_REPO },
    ]);
    expect(findPlatform(p, 'ios')?.repos).toEqual([]);
    expect(findPlatform(p, 'web')?.repos).toEqual([]);
  });
});

describe('specPlatformRepo', () => {
  it('is the specialization repo on the platform; null without repo, without the platform or without a copy', () => {
    const p = applySpecialization(codeProject(), otherSpec(true), {
      newId: idGen('LO'),
    });
    expect(specPlatformRepo(p, 'sdui', 'android')).toEqual(ANDROID_REPO);
    expect(specPlatformRepo(p, 'other', 'android')).toEqual(OTHER_ANDROID_REPO);
    expect(specPlatformRepo(p, 'sdui', 'ios')).toBeNull();
    expect(specPlatformRepo(p, 'other', 'ios')).toBeNull();
    expect(specPlatformRepo(p, 'other', 'web')).toBeNull();
    expect(specPlatformRepo(p, 'not-applied', 'android')).toBeNull();
    expect(specPlatformRepo(p, 'sdui', 'constructor')).toBeNull();
    const missing: Project = {
      ...p,
      specializations: p.specializations.map((s) =>
        s.id === 'sdui' ? { ...s, spec: null } : s,
      ),
    };
    expect(specPlatformRepo(missing, 'sdui', 'android')).toBeNull();
    expect(specPlatformRepo(missing, 'other', 'android')).toEqual(OTHER_ANDROID_REPO);
  });
});

describe('local clone per platform', () => {
  it('sets, changes and removes', () => {
    let p = setPlatformRepo(specProject(), 'android', { localPath: '..\\..\\' });
    expect(p.platformRepos).toEqual({ android: { localPath: '../..' } });
    expect(hasLocalPath(p, 'android')).toBe(true);
    expect(hasLocalPath(p, 'ios')).toBe(false);

    p = setPlatformRepo(p, 'ios', { localPath: '.' });
    expect(Object.keys(p.platformRepos)).toEqual(['android', 'ios']);
    expect(p.platformRepos.ios).toEqual({ localPath: '.' });

    // Empty text or null removes the entry: the file does not keep an empty configuration.
    p = setPlatformRepo(p, 'ios', { localPath: null });
    expect(Object.keys(p.platformRepos)).toEqual(['android']);
    p = setPlatformRepo(p, 'android', { localPath: '  ' });
    expect(p.platformRepos).toEqual({});
    p = setPlatformRepo(p, 'android', { localPath: '..' });
    p = removePlatformRepo(p, 'android');
    expect(p.platformRepos).toEqual({});
  });

  it('only stores the localPath, without an address', () => {
    const p = setPlatformRepo(specProject(), 'android', { localPath: '../..' });
    expect(Object.keys(p.platformRepos.android ?? {})).toEqual(['localPath']);
  });

  it('repeating the current value returns the same project (no undo entry)', () => {
    const p = setPlatformRepo(specProject(), 'android', { localPath: '../..' });
    expect(setPlatformRepo(p, 'android', { localPath: '../..' })).toBe(p);
    const empty = specProject();
    expect(setPlatformRepo(empty, 'ios', { localPath: null })).toBe(empty);
    expect(setPlatformRepo(empty, 'ios', { localPath: '' })).toBe(empty);
  });

  it('validates the platform and the localPath', () => {
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
    // Configuration of an undeclared platform (edited by hand) can be removed.
    const orphan = { ...p, platformRepos: { web: { localPath: '.' } } };
    expect(removePlatformRepo(orphan, 'web').platformRepos).toEqual({});
  });
});

describe('code paths', () => {
  it('path normalization and validation', () => {
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
  /** Project whose `sdui` specialization declares `android` with this `urlTemplate` (or without `repo`). */
  const withTemplate = (urlTemplate: string | undefined) =>
    withSpecRepo(codeProject(), 'sdui', 'android', {
      url: 'https://git.internal/org/app',
      ...(urlTemplate === undefined ? {} : { urlTemplate }),
    });

  it('replaces {path} and removes the part from the last # that contains {line}', () => {
    expect(codeLink(codeProject(), at(DS_BUTTON))).toBe(
      `https://github.com/org/app-android/blob/main/${DS_BUTTON}`,
    );
    const bitbucket = withTemplate(
      'https://bitbucket.org/org/app/src/main/{path}#lines-{line}',
    );
    expect(codeLink(bitbucket, at('a/B.kt'))).toBe(
      'https://bitbucket.org/org/app/src/main/a/B.kt',
    );
    // The # of the page routing (before {path}) is not removed.
    const hashRoute = withTemplate('https://git.internal/#/app/{path}#L{line}');
    expect(codeLink(hashRoute, at('B.kt'))).toBe('https://git.internal/#/app/B.kt');
    // {line} outside a fragment: becomes empty.
    const query = withTemplate('https://git.internal/view?file={path}&line={line}');
    expect(codeLink(query, at('B.kt'))).toBe(
      'https://git.internal/view?file=B.kt&line=',
    );
    const plain = withTemplate('https://git.internal/{path}');
    expect(codeLink(plain, at('B.kt'))).toBe('https://git.internal/B.kt');
  });

  it('{line} in the query and in the fragment: removes both, no {line} is left', () => {
    const both = withTemplate('https://git.internal/{path}?line={line}#L{line}');
    expect(codeLink(both, at('B.kt'))).toBe('https://git.internal/B.kt?line=');
    const link = codeLink(
      withTemplate('https://git.internal/{path}?a={line}&b={line}'),
      at('B.kt'),
    );
    expect(link).toBe('https://git.internal/B.kt?a=&b=');
  });

  it('encodes each path segment and preserves the /', () => {
    // Non-ASCII (é) on purpose: percent-encoding of UTF-8.
    expect(codeLink(codeProject(), at('src/My Screen#1/Café?.kt'))).toBe(
      'https://github.com/org/app-android/blob/main/src/My%20Screen%231/Caf%C3%A9%3F.kt',
    );
  });

  it('null without repo, without urlTemplate, with an invalid template or an invalid path', () => {
    const p = codeProject();
    expect(codeLink(p, at(DS_BUTTON_SWIFT, 'ios'))).toBeNull();
    expect(codeLink(p, at(DS_BUTTON, 'constructor'))).toBeNull();
    expect(codeLink(p, at(DS_BUTTON, 'android', 'not-applied'))).toBeNull();
    // `repo` with only `url`: without `urlTemplate`, no link.
    expect(codeLink(withTemplate(undefined), at(DS_BUTTON))).toBeNull();
    expect(codeLink(withTemplate('  '), at(DS_BUTTON))).toBeNull();
    expect(
      codeLink(withTemplate('javascript:alert(1)//{path}'), at(DS_BUTTON)),
    ).toBeNull();
    expect(codeLink(p, at(null))).toBeNull();
    expect(codeLink(p, at('/abs/a.kt'))).toBeNull();
    expect(codeLink(p, at('../x.kt'))).toBeNull();
  });

  it('the link comes from the specialization that owns the type, not from the project', () => {
    // The project overrides only the local clone: nothing from it goes into the link.
    expect(codeLink(codeProject(), at('a/B.kt'))).toBe(
      'https://github.com/org/app-android/blob/main/a/B.kt',
    );
    // Two specializations with the same platform and different repos: each has its own.
    const p = applySpecialization(codeProject(), otherSpec(true), {
      newId: idGen('LO'),
    });
    expect(codeLink(p, at('a/B.kt', 'android', 'sdui'))).toBe(
      'https://github.com/org/app-android/blob/main/a/B.kt',
    );
    expect(codeLink(p, at('a/B.kt', 'android', 'other'))).toBe(
      'https://gitlab.com/org/other-android/-/blob/main/a/B.kt',
    );
    // The other one does not declare `repo` for the `web` platform.
    expect(codeLink(p, at('src/Pagina.tsx', 'web', 'other'))).toBeNull();
    // A specialization without `repo` does not inherit the other's, even on the same platform.
    const withoutRepo = applySpecialization(codeProject(), otherSpec(false), {
      newId: idGen('LO'),
    });
    expect(codeLink(withoutRepo, at('a/B.kt', 'android', 'other'))).toBeNull();
    expect(codeLink(withoutRepo, at('a/B.kt', 'android', 'sdui'))).not.toBeNull();
  });
});

describe('codeLocalPath', () => {
  it('joins the localPath and the path, relative to the project folder', () => {
    const p = codeProject();
    const location = { specId: 'sdui', platform: 'android', path: DS_BUTTON };
    expect(codeLocalPath(p, location)).toBe(`../../../${DS_BUTTON}`);
    const at = (localPath: string) => ({
      ...p,
      platformRepos: { android: { localPath } },
    });
    expect(codeLocalPath(at('.'), location)).toBe(DS_BUTTON);
    expect(codeLocalPath(at('repo/../other'), { ...location, path: 'a.kt' })).toBe(
      'other/a.kt',
    );
    expect(codeLocalPath(at('/abs'), location)).toBeNull();
    expect(codeLocalPath(p, { ...location, platform: 'ios' })).toBeNull();
    expect(codeLocalPath(p, { ...location, path: null })).toBeNull();
  });

  it('the override belongs to the platform: it applies to any specialization', () => {
    const p = applySpecialization(codeProject(), otherSpec(true), {
      newId: idGen('LO'),
    });
    const at = (specId: string) =>
      codeLocalPath(p, { specId, platform: 'android', path: 'a/B.kt' });
    expect(at('sdui')).toBe('../../../a/B.kt');
    expect(at('other')).toBe('../../../a/B.kt');
  });
});

describe('Definition (path of a type code)', () => {
  const typeOf = (p: Project, annotationId: string) =>
    typeOfAnnotation(
      p,
      p.annotations.find((a) => a.id === annotationId)!,
    )!.type;

  it('typeCodeDefinitions: one entry per platform with a path, in code order', () => {
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

  it('a type without a path (or without code) has no definition', () => {
    const p = codeProject();
    expect(typeCodeDefinitions(p, 'sdui', typeOf(p, 'AOC'))).toEqual([]);
    expect(typeCodeDefinitions(p, 'sdui', { code: undefined })).toEqual([]);
  });

  it('projectTypeCode: the code entries of all applied types, once per version', () => {
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

describe('findByCode (types by the path and the symbol of the code)', () => {
  const found = (p: Project, query: Parameters<typeof findByCode>[1]) =>
    findByCode(p, query).map(
      (m) => `${m.specId}/${m.typeId}:${m.code.map((c) => c.platform).join('+')}`,
    );

  it('matches the whole path or a suffix of whole segments', () => {
    const p = codeProject();
    expect(found(p, { path: 'DSButton.kt' })).toEqual(['sdui/button:android']);
    expect(found(p, { path: 'ds/DSButton.kt' })).toEqual(['sdui/button:android']);
    expect(found(p, { path: DS_BUTTON })).toEqual(['sdui/button:android']);
    expect(found(p, { path: 'Button.kt' })).toEqual([]);
    expect(found(p, { path: 'SButton.kt' })).toEqual([]);
    expect(found(p, { path: 'dsbutton.kt' })).toEqual([]);
    // The search normalizes the typed path.
    expect(found(p, { path: ' ./App\\DesignSystem\\DSButton.swift ' })).toEqual([
      'sdui/button:ios',
    ]);
    expect(found(p, { path: '/DSTextField.kt' })).toEqual(['sdui/input:android']);
    expect(found(p, { path: DS_TEXT_FIELD })).toEqual(['sdui/input:android']);
  });

  it('matches the symbol by equality; with both, the same platform must match both', () => {
    const p = codeProject();
    expect(found(p, { symbol: 'DSButton' })).toEqual(['sdui/button:ios']);
    expect(found(p, { symbol: 'com.app.ds.OnClick' })).toEqual(['sdui/onClick:android']);
    expect(found(p, { symbol: 'Button' })).toEqual([]);
    expect(found(p, { path: 'DSButton.kt', symbol: 'com.app.ds.DSButton' })).toEqual([
      'sdui/button:android',
    ]);
    // Android file and iOS symbol: no platform matches both.
    expect(found(p, { path: 'DSButton.kt', symbol: 'DSButton' })).toEqual([]);
    expect(found(p, {})).toEqual([]);
    expect(found(p, { path: '  ', symbol: '' })).toEqual([]);
  });

  it('returns the code that matched and the annotations of the type, with image and marking', () => {
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
      annotations: [{ containerId: 'I1', markingId: 'MC', annotationId: 'AB' }],
    });
    // The Input has three annotations, in project order.
    const [input] = findByCode(codeProject(), { path: 'DSTextField.kt' });
    expect(input?.annotations.map((a) => a.annotationId)).toEqual(['AIN', 'AII', 'AIE']);
  });

  it('a type without annotations shows up with an empty list; types of another specialization also match', () => {
    let p = codeProject();
    expect(findByCode(p, { symbol: 'com.app.ds.DSImage' })).toEqual([
      expect.objectContaining({ typeId: 'image', annotations: [] }),
    ]);
    p = applySpecialization(p, otherSpec(), { newId: idGen('LO') });
    expect(found(p, { path: 'DSButton.kt' })).toEqual([
      'sdui/button:android',
      'other/page:android',
    ]);
    p = addTypedAnnotation(p, {
      id: 'AP',
      markingId: 'MT',
      layerId: 'LO1',
      type: { specId: 'other', typeId: 'page' },
    });
    expect(findByCode(p, { path: 'Page.tsx' })[0]?.annotations).toEqual([
      { containerId: 'I1', markingId: 'MT', annotationId: 'AP' },
    ]);
  });

  it('a specialization without a copy (spec null) is not searched', () => {
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

describe('platform without a local path', () => {
  it('is not a problem: no warning and nothing pending', () => {
    const p = codeProject();
    expect(hasLocalPath(p, 'ios')).toBe(false);
    expect(getAnnotationIssues(p, 'AB')).toEqual([]);
    const withoutAndroid = removePlatformRepo(p, 'android');
    expect(hasLocalPath(withoutAndroid, 'android')).toBe(false);
    // The link still comes from the specialization.
    expect(
      codeLink(withoutAndroid, { specId: 'sdui', platform: 'android', path: 'a/B.kt' }),
    ).toBe('https://github.com/org/app-android/blob/main/a/B.kt');
  });
});

describe('examples', () => {
  it('the SDUI v2 Screen has no code nor code field (the blueprint flags the missing mapping)', () => {
    const screen = loadExample('sdui')
      .layers.flatMap((l) => l.annotationTypes)
      .find((t) => t.id === 'screen');
    expect(screen?.code).toBeUndefined();
    expect(screen?.fields.map((f) => f.key)).toEqual(['nome', 'rota']);
  });
});

describe('findByCode with variants (formatVersion 9)', () => {
  const annotationIds = (p: Project, query: Parameters<typeof findByCode>[1]) =>
    findByCode(p, query).map((m) => m.annotations.map((a) => a.annotationId).sort());

  it('by the base symbol returns only the base buttons, without the outlined ones', () => {
    const p = variantsProject();
    // BF has no value (default filled); BO, BT and BN have another style.
    expect(annotationIds(p, { symbol: 'androidx.compose.material3.Button' })).toEqual([
      ['BF'],
    ]);
  });

  it('by the symbol of a case returns only its annotations; the result code is the raw one', () => {
    const p = variantsProject();
    expect(
      annotationIds(p, { symbol: 'androidx.compose.material3.OutlinedButton' }),
    ).toEqual([['BO']]);
    const [match] = findByCode(p, { symbol: 'androidx.compose.material3.TextButton' });
    expect(match?.annotations.map((a) => a.annotationId)).toEqual(['BT']);
    expect(match?.code).toHaveLength(1);
    expect(match?.code[0]?.platform).toBe('compose');
    expect(match?.code[0]?.code.variants?.field).toBe('style');
  });

  it('a type that matches and has no matching annotation shows up with an empty list', () => {
    let p = variantsProject();
    p = { ...p, annotations: p.annotations.filter((a) => a.id !== 'BO') };
    const found = findByCode(p, { symbol: 'androidx.compose.material3.OutlinedButton' });
    expect(found.map((m) => `${m.specId}/${m.typeId}`)).toEqual(['m3/button']);
    expect(found[0]?.annotations).toEqual([]);
  });

  it('by the path returns all when the cases do not change the path; the case that changes it, only that one', () => {
    const p = variantsProject();
    // BF, BO and BN use the base path; the text one switches to TextButton.kt.
    expect(annotationIds(p, { path: BUTTON_PATH }).flat().sort()).toEqual([
      'BF',
      'BN',
      'BO',
      'CD',
    ]);
    expect(annotationIds(p, { path: 'TextButton.kt' })).toEqual([['BT']]);
    const types = findByCode(p, { path: 'Button.kt' }).map((m) => m.typeId);
    expect(types).toEqual(['button', 'card']);
  });

  it('with symbol and path, the same resolved entry must match both', () => {
    const p = variantsProject();
    expect(
      annotationIds(p, {
        symbol: 'androidx.compose.material3.TextButton',
        path: 'TextButton.kt',
      }),
    ).toEqual([['BT']]);
    // OutlinedButton lives in the base Button.kt: with the TextButton path, no case matches.
    expect(
      findByCode(p, {
        symbol: 'androidx.compose.material3.OutlinedButton',
        path: 'TextButton.kt',
      }),
    ).toEqual([]);
  });

  it('without variants (specialization 8) the result is the usual one', () => {
    const p = codeProject();
    expect(findByCode(p, { symbol: 'com.app.ds.DSButton' }).map((m) => m.typeId)).toEqual(
      ['button'],
    );
    expect(
      findByCode(p, { symbol: 'com.app.ds.DSButton' })[0]?.annotations.map(
        (a) => a.annotationId,
      ),
    ).toEqual(['AB']);
  });
});

describe('typeCodeDefinitions with variants (formatVersion 9)', () => {
  it('uses the path and the symbol of the annotation case', () => {
    const p = variantsProject();
    const type = typeOfAnnotation(
      p,
      p.annotations.find((a) => a.id === 'BT')!,
    )!;
    const definition = (values: Record<string, string> | null) =>
      typeCodeDefinitions(p, 'm3', type.type, values)[0];
    expect(definition({ style: 'text' })).toMatchObject({
      path: TEXT_BUTTON_PATH,
      fileName: 'TextButton.kt',
      symbol: 'androidx.compose.material3.TextButton',
    });
    expect(definition({ style: 'outlined' })).toMatchObject({
      path: BUTTON_PATH,
      symbol: 'androidx.compose.material3.OutlinedButton',
    });
    // Without values: the field default (filled, no case) and the base.
    expect(definition(null)).toMatchObject({ path: BUTTON_PATH });
    expect(typeCodeDefinitions(p, 'm3', type.type)[0]?.symbol).toBe(
      'androidx.compose.material3.Button',
    );
  });
});
