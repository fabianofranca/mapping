import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSpecText } from '../../src/model';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// validate_specialization (stage 4.2): the errors are those of the app's import (`parseSpecText`,
// the same function as in `src/ui/SpecsDialog.tsx`), with the exact path; the warnings are the server's.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Validated {
  valid: boolean;
  path?: string;
  errorCount?: number;
  errors: string[];
  issues?: { path: string; message: string }[];
  warnings?: { code: string; path: string; message: string }[];
  spec?: Record<string, unknown>;
  moreErrors?: number;
}

let root: string;
let mcp: Connection;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-spec-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  for (const name of ['sdui', 'modelo-de-dados']) {
    copyFileSync(
      join('examples', 'specs', `${name}.json`),
      join(root, 'fontes', `${name}.json`),
    );
  }
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
});

const sdui = (): Json =>
  JSON.parse(readFileSync('examples/specs/sdui.json', 'utf8')) as Json;

/** The SDUI in v3 with an origin on each level (type, text field and enum field). */
function v3(): Json {
  const spec = sdui();
  spec.formatVersion = 3;
  // The v3 has no `repo` (only the v5).
  for (const platform of spec.platforms) delete platform.repo;
  // And the v11 (groups, roles, clauses and external document) goes back to what the v3 knows.
  delete spec.docRepos;
  delete spec.migrations;
  for (const layer of spec.layers) {
    delete layer.groups;
    for (const type of layer.annotationTypes) {
      delete type.groups;
      delete type.childRoles;
      delete type.childRolesLabel;
      delete type.doc;
      if (type.allowedChildren)
        type.allowedChildren =
          type.id === 'input' ? ['validation'] : ['action', 'feedback'];
    }
  }
  const button = spec.layers[0].annotationTypes[0];
  button.sources = [{ system: 'figma', id: '3f2a9c', name: 'DS/Button' }];
  button.fields[1].sources = [{ system: 'figma', name: 'Label' }];
  button.fields[2].sources = [
    {
      system: 'figma',
      name: 'Style',
      values: { Primary: 'primary', Secondary: 'secondary' },
    },
  ];
  return spec;
}

const text = (spec: Json) => JSON.stringify(spec);

describe('valid files', () => {
  it('the repository examples are valid, with the summary and without errors', async () => {
    for (const name of ['sdui', 'modelo-de-dados']) {
      const result = ok(
        await mcp.call<Validated>('validate_specialization', {
          path: `fontes/${name}.json`,
        }),
      );
      expect(result.valid, name).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.path).toBe(`fontes/${name}.json`);
    }
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(v3()) }),
    );
    expect(result.spec).toMatchObject({
      id: 'sdui',
      formatVersion: 3,
      typesWithSources: 1,
      fieldsWithSources: 2,
      platforms: ['android', 'ios', 'bff'],
    });
  });

  it('warns about a declared but unused platform and a type without code, without invalidating', async () => {
    const spec = sdui();
    // The SDUI `screen` no longer has `code`; the `desktop` platform is used by nobody.
    spec.platforms.push({ id: 'desktop', name: 'Desktop' });
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'type-without-code',
        path: 'layers[2].annotationTypes[0]',
      }),
      expect.objectContaining({ code: 'unused-platform', path: 'platforms[3]' }),
    ]);
    expect(result.warnings![1]!.message).toContain('desktop');
  });

  it('field of the removed type (codeRef): valid, ignored and with a warning at the exact path', async () => {
    const spec = sdui();
    spec.layers[2].annotationTypes[0].fields.push({
      key: 'implementacao',
      type: 'codeRef',
      platforms: ['android'],
    });
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual({
      code: 'ignored-field',
      path: 'layers[2].annotationTypes[0].fields[2]',
      message: expect.stringContaining(
        'the field "implementacao" of the type "screen" is "codeRef"',
      ),
    });
  });

  it('the old format (mapeador-spec) is accepted, with a warning', async () => {
    const spec = sdui();
    spec.format = 'mapeador-spec';
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'legacy-format' }),
    );
  });
});

describe('errors: the same as the app import, with the exact path', () => {
  const BUTTON = 'layers[0].annotationTypes[0]';
  const broken: [string, () => Json][] = [
    [
      'values target outside the options',
      () => {
        const spec = v3();
        spec.layers[0].annotationTypes[0].fields[2].sources[0].values.Primary =
          'does-not-exist';
        return spec;
      },
    ],
    [
      'values on a field that is not an enum',
      () => {
        const spec = v3();
        spec.layers[0].annotationTypes[0].fields[1].sources[0].values = { A: 'b' };
        return spec;
      },
    ],
    [
      'origin without id or name',
      () => {
        const spec = v3();
        spec.layers[0].annotationTypes[0].sources = [{ system: 'figma' }];
        return spec;
      },
    ],
    [
      'sources in a v2 specialization',
      () => {
        const spec = v3();
        spec.formatVersion = 2;
        return spec;
      },
    ],
    [
      'unknown field type and repeated id',
      () => {
        const spec = sdui();
        spec.layers[0].annotationTypes[0].fields[0].type = 'nonexistent';
        spec.layers[0].annotationTypes[1].id = 'button';
        return spec;
      },
    ],
  ];

  // The MCP does not expose the model's code (decision 2 of #1263): only `path` and `message`.
  const pathAndMessage = (issues: readonly { path: string; message: string }[]) =>
    issues.map(({ path, message }) => ({ path, message }));

  for (const [name, make] of broken) {
    it(`${name}`, async () => {
      const content = text(make());
      const expected = parseSpecText(content);
      if (expected.ok) throw new Error('the case should be invalid');
      expect(expected.errors.length).toBeGreaterThan(0);

      // By text.
      const byText = ok(
        await mcp.call<Validated>('validate_specialization', { text: content }),
      );
      expect(byText.valid).toBe(false);
      expect(byText.errors).toEqual(expected.errors);
      expect(byText.issues).toEqual(pathAndMessage(expected.issues));
      expect(byText.errorCount).toBe(expected.errors.length);
      expect(byText.warnings).toBeUndefined();

      // By file inside the roots: the same errors.
      const file = join(root, 'fontes', 'broken.json');
      writeFileSync(file, content);
      const byPath = ok(
        await mcp.call<Validated>('validate_specialization', {
          path: 'fontes/broken.json',
        }),
      );
      expect(byPath.errors).toEqual(expected.errors);
      // And by absolute path.
      const absolute = ok(
        await mcp.call<Validated>('validate_specialization', { path: file }),
      );
      expect(absolute.errors).toEqual(expected.errors);
    });
  }

  it('the path points to the exact spot (e.g. sources[0].values.Primary)', async () => {
    const spec = v3();
    spec.layers[0].annotationTypes[0].fields[2].sources[0].values.Primary =
      'does-not-exist';
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.issues).toEqual([
      expect.objectContaining({
        path: `${BUTTON}.fields[2].sources[0].values.Primary`,
      }),
    ]);
    expect(result.errors[0]).toContain(`${BUTTON}.fields[2].sources[0].values.Primary: `);
  });

  it('`issues` carries only `path` and `message`: the model code does not leave through the MCP', async () => {
    const spec = v3();
    spec.layers[0].annotationTypes[0].fields[0].key = 'a b';
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.issues?.length).toBeGreaterThan(0);
    for (const issue of result.issues ?? []) {
      expect(Object.keys(issue).sort()).toEqual(['message', 'path']);
    }
  });

  it('invalid JSON comes back as an error, not as a tool failure', async () => {
    const content = '{ "format": ';
    const expected = parseSpecText(content);
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: content }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expected.ok ? [] : expected.errors);
    expect(result.errors[0]).toMatch(/^invalid JSON/);
  });

  it('limits the number of returned errors and says how many were left out', async () => {
    const spec = sdui();
    spec.layers[0].annotationTypes[0].fields = Array.from({ length: 150 }, () => ({
      key: 'x y',
      type: 'string',
    }));
    const expected = parseSpecText(text(spec));
    if (expected.ok) throw new Error('was expected to fail');
    expect(expected.errors.length).toBeGreaterThan(100);
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.errors).toEqual(expected.errors.slice(0, 100));
    expect(result.errorCount).toBe(expected.errors.length);
    expect(result.moreErrors).toBe(expected.errors.length - 100);
  });
});

describe('arguments and security', () => {
  it('requires exactly one of path or text', async () => {
    expect(errorOf(await mcp.call('validate_specialization', {})).code).toBe(
      'invalid-arguments',
    );
    expect(
      errorOf(
        await mcp.call('validate_specialization', {
          path: 'fontes/sdui.json',
          text: '{}',
        }),
      ).code,
    ).toBe('invalid-arguments');
  });

  it('refuses paths outside the roots and nonexistent files', async () => {
    expect(
      errorOf(await mcp.call('validate_specialization', { path: '../outside.json' }))
        .code,
    ).toBe('outside-roots');
    expect(
      errorOf(
        await mcp.call('validate_specialization', { path: join(tmpdir(), 'x.json') }),
      ).code,
    ).toBe('outside-roots');
    expect(
      errorOf(await mcp.call('validate_specialization', { path: 'fontes/nada.json' }))
        .code,
    ).toBe('path-not-found');
    expect(
      errorOf(await mcp.call('validate_specialization', { path: 'fontes' })).code,
    ).toBe('not-a-file');
  });
});
