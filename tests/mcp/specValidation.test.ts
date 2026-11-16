import {
  copyFileSync,
  cpSync,
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
  for (const name of ['sdui', 'data-model']) {
    copyFileSync(
      join('examples', 'specs', `${name}.json`),
      join(root, 'fontes', `${name}.json`),
    );
  }
  cpSync(join('tests', 'fixtures', 'slots'), join(root, 'slots'), { recursive: true });
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
    for (const name of ['sdui', 'data-model']) {
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

describe('slots (formatVersion 17)', () => {
  const SLOTS_SPEC = join('tests', 'fixtures', 'slots', 'slots.spec.json');
  const slotsSpec = (): Json => JSON.parse(readFileSync(SLOTS_SPEC, 'utf8')) as Json;
  const BAR = 'layers[0].annotationTypes[0]';

  it('the test library specialization is a valid v17 with slots', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_specialization', {
        path: 'slots/slots.spec.json',
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('slots in a v16 give "only allowed with formatVersion 17" at the exact path', async () => {
    const spec = slotsSpec();
    spec.formatVersion = 16;
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      { path: `${BAR}.slots`, message: 'only allowed with formatVersion 17' },
    ]);
  });

  it('an accepts with a type that does not exist and a max below 1 come with the path', async () => {
    const spec = slotsSpec();
    spec.layers[0].annotationTypes[0].slots[0].accepts = ['nope'];
    spec.layers[0].annotationTypes[0].slots[1].max = 0;
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.issues?.map((i) => i.path).sort()).toEqual([
      `${BAR}.slots[0].accepts[0]`,
      `${BAR}.slots[1].max`,
    ]);
  });

  it('validate_library: the test library has no error or warning; a slot the component lacks is an error', async () => {
    const good = ok(
      await mcp.call<Validated>('validate_library', { path: 'slots' }),
    ) as unknown as { valid: boolean; errors: unknown[]; warnings: unknown[] };
    expect(good.valid).toBe(true);
    expect(good.warnings).toEqual([]);

    const bad = join(root, 'slots-bad');
    cpSync(join('tests', 'fixtures', 'slots'), bad, { recursive: true });
    const spec = slotsSpec();
    spec.layers[0].annotationTypes[0].slots.push({ id: 'nope' });
    writeFileSync(join(bad, 'slots.spec.json'), text(spec));
    const result = ok(
      await mcp.call<{ valid: boolean; errors: { path: string; message: string }[] }>(
        'validate_library',
        { path: 'slots-bad' },
      ),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: `${BAR}.slots[2].id`,
        message: 'slot does not exist in the component: nope',
      }),
    );
  });
});

describe('accessibility (formatVersion 18)', () => {
  const TYPE = 'layers[0].annotationTypes[0]';
  const accessible = (): Json => ({
    format: 'mapping-spec',
    formatVersion: 18,
    id: 'a11y',
    name: 'A11y',
    version: 1,
    accessibility: { touchTarget: { width: 44, height: 44 } },
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [
              { key: 'label', type: 'string' },
              { key: 'size', type: 'number' },
            ],
            accessibility: { role: 'button', label: { fields: ['label'] } },
          },
        ],
      },
    ],
  });

  it('a valid v18 with accessibility is valid', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(accessible()) }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accessibility in a v17 gives "only allowed with formatVersion 18" at the exact paths', async () => {
    const spec = accessible();
    spec.formatVersion = 17;
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      { path: 'accessibility', message: 'only allowed with formatVersion 18' },
      { path: `${TYPE}.accessibility`, message: 'only allowed with formatVersion 18' },
    ]);
  });

  it('a label field that is not string or enum and a touchTarget without a role come with the path', async () => {
    const spec = accessible();
    spec.layers[0].annotationTypes[0].accessibility = {
      label: { fields: ['size'] },
      touchTarget: { width: 10, height: 10 },
    };
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.issues).toEqual([
      {
        path: `${TYPE}.accessibility.touchTarget`,
        message: 'touchTarget: only valid with an interactive role',
      },
      {
        path: `${TYPE}.accessibility.label.fields[0]`,
        message: 'label: field size must be string or enum',
      },
    ]);
  });

  it('an unknown role and a part with its own touchTarget come with the exact path', async () => {
    const spec = accessible();
    spec.layers[0].annotationTypes[0].accessibility = {
      role: 'clicky',
      parts: [
        {
          id: 'p',
          when: 'label',
          label: { fields: ['label'] },
          touchTarget: { width: 10, height: 10 },
        },
      ],
    };
    const result = ok(
      await mcp.call<Validated>('validate_specialization', { text: text(spec) }),
    );
    expect(result.valid).toBe(false);
    const byPath = Object.fromEntries(
      (result.issues ?? []).map((i) => [i.path, i.message]),
    );
    expect(Object.keys(byPath)).toEqual(
      expect.arrayContaining([
        `${TYPE}.accessibility.role`,
        `${TYPE}.accessibility.parts[0].touchTarget`,
      ]),
    );
    expect(byPath[`${TYPE}.accessibility.role`]).toContain('clicky');
    expect(byPath[`${TYPE}.accessibility.parts[0].touchTarget`]).toBe(
      'a part has no touch target',
    );
  });
});
