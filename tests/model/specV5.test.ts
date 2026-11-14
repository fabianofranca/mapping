import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SPEC_FORMAT_VERSION,
  diffSpecs,
  parseSpec,
  type Spec,
  type SpecIssue,
} from '../../src/model';

// Specialization formatVersion 5 (Instantiation code stage): `repo` in `platforms[]`.
// v1 to v4 stay as they were and reject `repo`.

const read = (path: string): string => readFileSync(path, 'utf8');
const sdui = read('tests/fixtures/sdui-v2.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const VERSION_5 = 'only allowed with formatVersion 5';
const HTTP = 'must start with http:// or https://, without spaces';

const REPO = {
  url: 'https://github.com/acme/android',
  urlTemplate: 'https://github.com/acme/android/blob/main/{path}#L{line}',
  ref: 'v2.3.0',
};

/** The SDUI (v2) taken to the requested version, with `repo` on the first platform. */
function withRepo(repo: unknown, formatVersion = 5): Json {
  const spec = JSON.parse(sdui) as Json;
  spec.formatVersion = formatVersion;
  spec.platforms[0].repo = repo;
  return spec;
}

function issuesOf(spec: Json): SpecIssue[] {
  const result = parseSpec(spec);
  if (result.ok) throw new Error('was supposed to fail');
  return result.issues.map(({ path, message }) => ({ path, message }));
}

function parsed(spec: Json): Spec {
  const result = parseSpec(spec);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

describe('formatVersion 5: repo nas plataformas', () => {
  it('the current format version is 16', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
  });

  it('a complete repo is valid in zod and in the JSON Schema and survives parsing', () => {
    const spec = withRepo(REPO);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    expect(parsed(spec).platforms?.[0]?.repo).toEqual(REPO);
  });

  it('only the url is enough; urlTemplate without {line} is also valid', () => {
    expect(parseSpec(withRepo({ url: REPO.url })).ok).toBe(true);
    expect(
      parseSpec(withRepo({ url: REPO.url, urlTemplate: 'https://x.dev/r/{path}' })).ok,
    ).toBe(true);
  });

  it('a v5 without repo is still valid', () => {
    const spec = JSON.parse(sdui) as Json;
    spec.formatVersion = 5;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it.each([
    ['without http', 'github.com/acme/android', HTTP],
    ['with space', 'https://github.com/acme android', HTTP],
    ['empty', '', HTTP],
  ])('url %s is an error in platforms[0].repo.url', (_name, url, message) => {
    expect(issuesOf(withRepo({ url }))).toContainEqual({
      path: 'platforms[0].repo.url',
      message,
    });
    expect(jsonValidator.safeParse(withRepo({ url })).success).toBe(false);
  });

  it('url is required', () => {
    expect(issuesOf(withRepo({ ref: 'main' }))).toContainEqual({
      path: 'platforms[0].repo.url',
      message: 'required',
    });
    expect(jsonValidator.safeParse(withRepo({ ref: 'main' })).success).toBe(false);
  });

  it('urlTemplate without {path} is an error', () => {
    const spec = withRepo({ url: REPO.url, urlTemplate: 'https://github.com/acme/x' });
    expect(issuesOf(spec)).toContainEqual({
      path: 'platforms[0].repo.urlTemplate',
      message: 'must contain {path}',
    });
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('urlTemplate without http or with a space is an error', () => {
    for (const urlTemplate of ['github.com/{path}', 'https://github.com/a b/{path}']) {
      expect(issuesOf(withRepo({ url: REPO.url, urlTemplate }))).toContainEqual({
        path: 'platforms[0].repo.urlTemplate',
        message: HTTP,
      });
    }
  });

  it('empty ref is an error', () => {
    const spec = withRepo({ url: REPO.url, ref: '' });
    expect(issuesOf(spec)).toContainEqual({
      path: 'platforms[0].repo.ref',
      message: 'cannot be empty',
    });
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('unknown property in repo is an error', () => {
    const spec = withRepo({ url: REPO.url, branch: 'main' });
    expect(issuesOf(spec).some((i) => i.path === 'platforms[0].repo')).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it.each([2, 3, 4])('repo in a v%i is an error in platforms[0].repo', (version) => {
    expect(issuesOf(withRepo(REPO, version))).toContainEqual({
      path: 'platforms[0].repo',
      message: VERSION_5,
    });
  });

  it('the earlier v1 to v4 (without repo) are still valid', () => {
    for (const version of [2, 3, 4]) {
      const spec = JSON.parse(sdui) as Json;
      spec.formatVersion = version;
      expect(parseSpec(spec).ok, `v${version}`).toBe(true);
    }
    const v1 = JSON.parse(sdui) as Json;
    v1.formatVersion = 1;
    delete v1.platforms;
    for (const layer of v1.layers) {
      for (const type of layer.annotationTypes) delete type.code;
    }
    expect(parseSpec(v1).ok).toBe(true);
  });

  it('diffSpecs: repo added, changed or removed is not a break and does not change the list', () => {
    const before = parsed(withRepo(undefined, 5));
    const added = parsed(withRepo(REPO));
    const changed = parsed(withRepo({ url: 'https://github.com/acme/other' }));
    expect(diffSpecs(before, added)).toEqual([]);
    expect(diffSpecs(added, changed)).toEqual([]);
    expect(diffSpecs(changed, before)).toEqual([]);
  });
});
