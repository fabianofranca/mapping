// Slots in the library package (`formatVersion` 17; stage #1080, SL3, decisions 8 and 9):
// `validateLibrary` checks the `slots` of the type and the `code.<platform>.slots` against the
// component (the slot exists, the component has slots with an id) and against the signature sheet
// (the parameter exists with `role: slot`, else the `parameter outside the signature` warning).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import type { Json } from './signatures/fixtures';

const DIR = 'tests/fixtures/slots';
const SPEC = 'slots.spec.json';
const SIG = 'signatures/bar.compose.json';
const TYPE = 'layers[0].annotationTypes[0]';

const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

/** The fixture package (`tests/fixtures/slots`), edited by `edit` on the specialization JSON. */
function pkg(
  edit?: (spec: Json, bar: Json) => void,
  extra: LibraryFile[] = [],
): LibraryFile[] {
  const spec = JSON.parse(read(SPEC)) as Json;
  edit?.(spec, spec.layers[0].annotationTypes[0]);
  const components = readdirSync(join(DIR, 'components')).map((name) => ({
    path: `components/${name}`,
    text: read(`components/${name}`),
  }));
  return [{ path: SPEC, text: JSON.stringify(spec) }, ...components, ...extra];
}

/** A `mapping-signature` of the bar with the given parameters. */
function barSignature(params: Json[]): LibraryFile {
  return {
    path: SIG,
    text: JSON.stringify({
      format: 'mapping-signature',
      formatVersion: 1,
      source: {
        kind: 'code',
        platform: 'compose',
        language: 'kotlin',
        symbol: 'x.Bar',
        path: 'Bar.kt',
        extractor: 'mapping-signature/kotlin@1',
      },
      params,
    }),
  };
}

const slotParam = (name: string, role = 'slot'): Json => ({
  name,
  role,
  type: '@Composable () -> Unit',
});

/** The fixture bar with a Compose `code`, the signature and `code.slots`. */
function withCode(code: Json, params?: Json[]): LibraryFile[] {
  return pkg(
    (spec, bar) => {
      spec.platforms = [
        {
          id: 'compose',
          name: 'Compose',
          language: 'kotlin',
          repo: { url: 'https://github.com/acme/ui' },
        },
      ];
      bar.code = { compose: { symbol: 'x.Bar', path: 'Bar.kt', ...code } };
      if (code.variants !== undefined)
        bar.fields.push({ key: 'kind', type: 'enum', options: ['Small', 'Large'] });
    },
    params === undefined ? [] : [barSignature(params)],
  );
}

function issues(files: LibraryFile[], level: 1 | 2 | 3 = 3) {
  return validateLibrary({ files, level }).issues.map((i) => ({
    file: i.file,
    path: i.path,
    severity: i.severity,
    message: i.message,
  }));
}

describe('slots in the library package', () => {
  it('the test library (v17 with slots, accepts and max, and the rounded bar) passes with no error or warning', () => {
    expect(issues(pkg())).toEqual([]);
  });

  it('a slot of the type that the component does not have is an error at the id', () => {
    const found = issues(
      pkg((_spec, bar) => bar.slots.push({ id: 'nope', accepts: ['pin'] })),
    );
    expect(found).toEqual([
      {
        file: SPEC,
        path: `${TYPE}.slots[2].id`,
        severity: 'error',
        message: 'slot does not exist in the component: nope',
      },
    ]);
  });

  it('slots on a type whose component has a single slot without id is an error', () => {
    const noId = JSON.parse(read('components/bar.json')) as Json;
    noId.template.children = [noId.template.children[0]];
    delete noId.template.children[0].id;
    delete noId.template.children[0].fallback;
    const files = pkg(undefined, []).map((f) =>
      f.path === 'components/bar.json' ? { ...f, text: JSON.stringify(noId) } : f,
    );
    const found = issues(files).filter((i) => i.severity === 'error');
    expect(found).toContainEqual({
      file: SPEC,
      path: `${TYPE}.slots[0].id`,
      severity: 'error',
      message: 'slots: the component has no slot with an id',
    });
  });

  it('code.slots with a slot the component does not have is an error at the key; so is a variants case', () => {
    const found = issues(
      withCode({
        slots: { navigationIcon: 'navigation', nope: 'x' },
        variants: {
          field: 'kind',
          cases: { Small: { symbol: 'x.SmallBar', slots: { gone: 'y' } } },
        },
      }),
    );
    expect(found).toContainEqual({
      file: SPEC,
      path: `${TYPE}.code.compose.slots.nope`,
      severity: 'error',
      message: 'slot does not exist in the component: nope',
    });
  });

  it('two slots mapped to the same parameter by code.slots are an error at the second (CL1, P2)', () => {
    const found = issues(
      withCode({ slots: { navigationIcon: 'content', actions: 'content' } }),
    ).filter((i) => i.severity === 'error');
    expect(found).toEqual([
      {
        file: SPEC,
        path: `${TYPE}.code.compose.slots.actions`,
        severity: 'error',
        message:
          'two slots map to the same parameter "content": navigationIcon and actions',
      },
    ]);
  });

  it('a slot renamed to the id of the other (which keeps its id as the parameter) is the same error, also in a variants case', () => {
    const renamed = issues(withCode({ slots: { actions: 'navigationIcon' } })).filter(
      (i) => i.severity === 'error',
    );
    expect(renamed.map((i) => i.path)).toEqual([`${TYPE}.code.compose.slots.actions`]);
    const inCase = issues(
      withCode({
        variants: {
          field: 'kind',
          cases: {
            Small: { symbol: 'x.SmallBar', slots: { actions: 'navigationIcon' } },
          },
        },
      }),
    ).filter((i) => i.severity === 'error');
    expect(inCase.map((i) => i.path)).toEqual([
      `${TYPE}.code.compose.variants.cases.Small.slots.actions`,
    ]);
  });

  it('the slot ids of the type and of code.slots that the component has pass', () => {
    const found = issues(
      withCode({ slots: { navigationIcon: 'navigation', actions: 'trailing' } }),
    ).filter((i) => i.severity === 'error');
    expect(found).toEqual([]);
  });
});

describe('code.slots with the signature sheet (decision 9)', () => {
  const SIG_KEY = { signature: SIG };

  it('a parameter that exists in the sheet with role slot passes', () => {
    const found = issues(
      withCode(
        { ...SIG_KEY, slots: { navigationIcon: 'navigation' }, ignore: ['title'] },
        [slotParam('navigation')],
      ),
    );
    expect(found.filter((i) => i.path.includes('slots'))).toEqual([]);
  });

  it('a parameter that the sheet does not have is the "parameter outside the signature" warning, at the key', () => {
    const found = issues(
      withCode({ ...SIG_KEY, slots: { navigationIcon: 'gone' } }, [slotParam('other')]),
    );
    expect(found).toContainEqual({
      file: SPEC,
      path: `${TYPE}.code.compose.slots.navigationIcon`,
      severity: 'warning',
      message: 'parameter outside the signature: "gone"',
    });
  });

  it('a parameter that is not role slot gives the same warning', () => {
    const found = issues(
      withCode({ ...SIG_KEY, slots: { navigationIcon: 'navigation' } }, [
        slotParam('navigation', 'value'),
      ]),
    );
    expect(found).toContainEqual({
      file: SPEC,
      path: `${TYPE}.code.compose.slots.navigationIcon`,
      severity: 'warning',
      message: 'parameter outside the signature: "navigation"',
    });
  });

  it('without a signature there is no warning (the parameter is not checked)', () => {
    const found = issues(withCode({ slots: { navigationIcon: 'whatever' } }));
    expect(
      found.filter((i) => i.severity === 'warning' && i.path.includes('.slots')),
    ).toEqual([]);
  });

  it('the signature of a variants case checks the case slots', () => {
    const found = issues(
      withCode(
        {
          ...SIG_KEY,
          variants: {
            field: 'kind',
            cases: {
              Small: { symbol: 'x.Bar', slots: { actions: 'gone' } },
            },
          },
        },
        [slotParam('navigationIcon')],
      ),
    );
    expect(found).toContainEqual(
      expect.objectContaining({
        path: `${TYPE}.code.compose.variants.cases.Small.slots.actions`,
        severity: 'warning',
      }),
    );
  });
});
