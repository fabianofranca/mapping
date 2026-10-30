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

// Especialização formatVersion 5 (etapa Código de instanciação): `repo` em `platforms[]`.
// v1 a v4 seguem como estavam e recusam `repo`.

const read = (path: string): string => readFileSync(path, 'utf8');
const sdui = read('tests/fixtures/sdui-v2.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const VERSION_5 = 'só é permitido com formatVersion 5';
const HTTP = 'deve começar com http:// ou https://, sem espaços';

const REPO = {
  url: 'https://github.com/acme/android',
  urlTemplate: 'https://github.com/acme/android/blob/main/{path}#L{line}',
  ref: 'v2.3.0',
};

/** O SDUI (v2) levado para a versão pedida, com `repo` na primeira plataforma. */
function withRepo(repo: unknown, formatVersion = 5): Json {
  const spec = JSON.parse(sdui) as Json;
  spec.formatVersion = formatVersion;
  spec.platforms[0].repo = repo;
  return spec;
}

function issuesOf(spec: Json): SpecIssue[] {
  const result = parseSpec(spec);
  if (result.ok) throw new Error('era para falhar');
  return result.issues;
}

function parsed(spec: Json): Spec {
  const result = parseSpec(spec);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

describe('formatVersion 5: repo nas plataformas', () => {
  it('a versão atual do formato é a 8', () => {
    expect(SPEC_FORMAT_VERSION).toBe(8);
  });

  it('um repo completo é válido no zod e no JSON Schema e sobrevive à leitura', () => {
    const spec = withRepo(REPO);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    expect(parsed(spec).platforms?.[0]?.repo).toEqual(REPO);
  });

  it('só a url basta; urlTemplate sem {line} também vale', () => {
    expect(parseSpec(withRepo({ url: REPO.url })).ok).toBe(true);
    expect(
      parseSpec(withRepo({ url: REPO.url, urlTemplate: 'https://x.dev/r/{path}' })).ok,
    ).toBe(true);
  });

  it('uma v5 sem repo continua válida', () => {
    const spec = JSON.parse(sdui) as Json;
    spec.formatVersion = 5;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it.each([
    ['sem http', 'github.com/acme/android', HTTP],
    ['com espaço', 'https://github.com/acme android', HTTP],
    ['vazia', '', HTTP],
  ])('url %s é erro em platforms[0].repo.url', (_name, url, message) => {
    expect(issuesOf(withRepo({ url }))).toContainEqual({
      path: 'platforms[0].repo.url',
      message,
    });
    expect(jsonValidator.safeParse(withRepo({ url })).success).toBe(false);
  });

  it('url é obrigatória', () => {
    expect(issuesOf(withRepo({ ref: 'main' }))).toContainEqual({
      path: 'platforms[0].repo.url',
      message: 'obrigatório',
    });
    expect(jsonValidator.safeParse(withRepo({ ref: 'main' })).success).toBe(false);
  });

  it('urlTemplate sem {path} é erro', () => {
    const spec = withRepo({ url: REPO.url, urlTemplate: 'https://github.com/acme/x' });
    expect(issuesOf(spec)).toContainEqual({
      path: 'platforms[0].repo.urlTemplate',
      message: 'deve conter {path}',
    });
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('urlTemplate sem http ou com espaço é erro', () => {
    for (const urlTemplate of ['github.com/{path}', 'https://github.com/a b/{path}']) {
      expect(issuesOf(withRepo({ url: REPO.url, urlTemplate }))).toContainEqual({
        path: 'platforms[0].repo.urlTemplate',
        message: HTTP,
      });
    }
  });

  it('ref vazio é erro', () => {
    const spec = withRepo({ url: REPO.url, ref: '' });
    expect(issuesOf(spec)).toContainEqual({
      path: 'platforms[0].repo.ref',
      message: 'não pode ser vazio',
    });
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('propriedade desconhecida em repo é erro', () => {
    const spec = withRepo({ url: REPO.url, branch: 'main' });
    expect(issuesOf(spec).some((i) => i.path === 'platforms[0].repo')).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it.each([2, 3, 4])('repo numa v%i é erro em platforms[0].repo', (version) => {
    expect(issuesOf(withRepo(REPO, version))).toContainEqual({
      path: 'platforms[0].repo',
      message: VERSION_5,
    });
  });

  it('as v1 a v4 de antes (sem repo) continuam válidas', () => {
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

  it('diffSpecs: repo acrescentado, trocado ou removido não é quebra nem muda a lista', () => {
    const before = parsed(withRepo(undefined, 5));
    const added = parsed(withRepo(REPO));
    const changed = parsed(withRepo({ url: 'https://github.com/acme/outro' }));
    expect(diffSpecs(before, added)).toEqual([]);
    expect(diffSpecs(added, changed)).toEqual([]);
    expect(diffSpecs(changed, before)).toEqual([]);
  });
});
