import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
  type Spec,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// validate_library, list_components, get_component and get_specialization serving v4 (phase
// B2). The test package is the Material 3 from `tests/fixtures/material3/`.

const MATERIAL3 = 'tests/fixtures/material3';
// The fixture folder, spec and field names stay in Portuguese: they are the real ids of `tests/fixtures/pessoas`.
const PESSOAS = 'tests/fixtures/pessoas';

interface Issue {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
interface Validated {
  valid: boolean;
  path: string;
  spec?: Record<string, unknown>;
  summary: { level: number; types: number; components: number; docs: number };
  errors: Issue[];
  warnings: Issue[];
  moreErrors?: number;
  hint: string;
}
interface Listed {
  count: number;
  typesWithoutComponent: number;
  components: {
    type: string;
    name: string;
    layer: string;
    size: { width: number; height: number };
    minSize: { width: number; height: number } | null;
    hasDoc: boolean;
    examples: number;
    problem?: string;
  }[];
  hint?: string;
}
interface Component {
  type: string;
  hasComponent: boolean;
  doc: string | null;
  docPath: string | null;
  fields: { key: string; type: string; required: boolean; options?: string[] }[];
  examples: { name: string; values?: Record<string, unknown> }[];
  component: { format: string; id: string } | null;
  sources: unknown[];
  hint?: string;
}

let base: string;
let root: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-lib-'));
  root = join(base, 'root');
  mkdirSync(root, { recursive: true });
  cpSync(MATERIAL3, join(root, 'lib', 'material3'), { recursive: true });

  // Broken copy: the button component is missing.
  cpSync(MATERIAL3, join(root, 'broken', 'material3'), { recursive: true });
  rmSync(join(root, 'broken', 'material3', 'components', 'm3-button.json'));

  // External-system example without the screen size, which the declaration requires.
  cpSync(MATERIAL3, join(root, 'external', 'material3'), { recursive: true });
  const example = join(root, 'external', 'material3', 'examples', 'settings.sdui.json');
  const screen = JSON.parse(readFileSync(example, 'utf8')) as {
    screen: { device?: unknown };
  };
  delete screen.screen.device;
  writeFileSync(example, JSON.stringify(screen));

  // People (image node) and the copy with the photo field switched to number.
  cpSync(PESSOAS, join(root, 'lib', 'pessoas'), { recursive: true });
  cpSync(PESSOAS, join(root, 'wrong-image', 'pessoas'), { recursive: true });
  const peopleSpec = join(root, 'wrong-image', 'pessoas', 'pessoas.spec.json');
  writeFileSync(
    peopleSpec,
    readFileSync(peopleSpec, 'utf8').replace(
      /("key": "foto",\s*"label": "Foto",\s*"type": )"string"/,
      '$1"number"',
    ),
  );

  // The real library, for the examples with the rows of a `table` field.
  cpSync('libraries/material3-compose', join(root, 'compose', 'material3-compose'), {
    recursive: true,
  });

  // The tabs example with text in the `items` (table) field: the validator refuses it.
  cpSync(
    'libraries/material3-compose',
    join(root, 'text-in-table', 'material3-compose'),
    {
      recursive: true,
    },
  );
  const tableSpec = join(
    root,
    'text-in-table',
    'material3-compose',
    'material3-compose.spec.json',
  );
  const tableJson = JSON.parse(readFileSync(tableSpec, 'utf8')) as {
    layers: { annotationTypes: { id: string; examples: { values: unknown }[] }[] }[];
  };
  for (const layer of tableJson.layers) {
    const tabs = layer.annotationTypes.find((t) => t.id === 'tabs');
    if (tabs) tabs.examples[0]!.values = { items: 'text' };
  }
  writeFileSync(tableSpec, JSON.stringify(tableJson));

  mkdirSync(join(root, 'empty'));
  writeFileSync(join(root, 'empty', 'LEIA-ME.md'), 'nothing here');

  // Project with the library applied in the `specs/material3/` folder.
  const dir = join(root, 'projetos', 'screens');
  const specFile = 'specs/material3/material3.spec.json';
  cpSync(MATERIAL3, join(dir, 'specs', 'material3'), { recursive: true });
  const parsed = parseSpecText(
    readFileSync(join(MATERIAL3, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: {
      id: 'cccccccc-0000-4000-8000-000000000001',
      name: 'Free',
      color: '#D32F2F',
    },
  });
  let n = 0;
  p = applySpecialization(p, parsed.spec, {
    newId: () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  p = {
    ...p,
    specializations: p.specializations.map((s) => ({ ...s, file: specFile })),
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));

  // Outside the roots.
  mkdirSync(join(base, 'outside'), { recursive: true });
  cpSync(MATERIAL3, join(base, 'outside', 'material3'), { recursive: true });
  symlinkSync(join(base, 'outside', 'material3'), join(root, 'link-outside'));

  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('validate_specialization with containers (v6)', () => {
  const spec = (containers: unknown) =>
    JSON.stringify({
      format: 'mapping-spec',
      formatVersion: 6,
      id: 'ds',
      name: 'DS',
      version: 1,
      containers,
      layers: [],
    });

  it('summarizes the number of containers', async () => {
    const result = ok(
      await mcp.call<{ valid: boolean; spec: Record<string, unknown> }>(
        'validate_specialization',
        { text: spec([{ id: 'phone', name: 'Phone', width: 360, height: 800 }]) },
      ),
    );
    expect(result.valid).toBe(true);
    expect(result.spec).toMatchObject({ formatVersion: 6, containers: 1 });
  });

  it('refuses a repeated id and a size beyond the limit, with the path', async () => {
    const result = ok(
      await mcp.call<{ valid: boolean; errors: string[] }>('validate_specialization', {
        text: spec([
          { id: 'a', name: 'A', width: 10, height: 10 },
          { id: 'a', name: 'B', width: 20001, height: 10 },
        ]),
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('containers[1].id:'))).toBe(true);
    expect(result.errors.some((e) => e.startsWith('containers[1].width:'))).toBe(true);
  });
});

describe('validate_library with the image node', () => {
  it('approves the people library, without error or warning', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'lib/pessoas' }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('refuses the src bound to a field that is not a string', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'wrong-image/pessoas' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.message).join('\n')).toMatch(
      /the image src reads "foto"/,
    );
  });
});

describe('validate_specialization with suggestions (v8)', () => {
  const spec = (formatVersion: number, field: Record<string, unknown>) =>
    JSON.stringify({
      format: 'mapping-spec',
      formatVersion,
      id: 'lang',
      name: 'Lang',
      version: 1,
      layers: [
        {
          id: 'l',
          name: 'L',
          color: '#112233',
          annotationTypes: [{ id: 't', name: 'T', fields: [field] }],
        },
      ],
    });

  it('accepts v8 with suggestions on a string field', async () => {
    const result = ok(
      await mcp.call<{ valid: boolean; errors: string[] }>('validate_specialization', {
        text: spec(8, { key: 'type', type: 'string', suggestions: ['String', 'Int'] }),
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('refuses suggestions in an earlier version, on another type and repeated, with the path', async () => {
    const call = async (formatVersion: number, field: Record<string, unknown>) =>
      ok(
        await mcp.call<{ valid: boolean; errors: string[] }>('validate_specialization', {
          text: spec(formatVersion, field),
        }),
      );
    const old = await call(7, { key: 'type', type: 'string', suggestions: ['A'] });
    expect(old.valid).toBe(false);
    expect(old.errors).toContain(
      'layers[0].annotationTypes[0].fields[0].suggestions: only allowed with formatVersion 8',
    );
    const wrong = await call(8, { key: 'n', type: 'number', suggestions: ['A'] });
    expect(wrong.errors).toContain(
      'layers[0].annotationTypes[0].fields[0].suggestions: only allowed in a string field or column',
    );
    const dup = await call(8, { key: 'type', type: 'string', suggestions: ['A', 'A'] });
    expect(dup.errors.some((e) => e.includes('suggestions: repeated suggestions'))).toBe(
      true,
    );
  });
});

describe('validate_specialization with linkedRef (v8)', () => {
  const spec = (formatVersion: number, field: Record<string, unknown>) =>
    JSON.stringify({
      format: 'mapping-spec',
      formatVersion,
      id: 'lang',
      name: 'Lang',
      version: 1,
      layers: [
        {
          id: 'l',
          name: 'L',
          color: '#112233',
          annotationTypes: [
            {
              id: 't',
              name: 'T',
              fields: [{ key: 'typeRef', type: 'ref', accepts: { free: true } }, field],
            },
          ],
        },
      ],
    });
  const call = async (formatVersion: number, field: Record<string, unknown>) =>
    ok(
      await mcp.call<{ valid: boolean; errors: string[] }>('validate_specialization', {
        text: spec(formatVersion, field),
      }),
    );

  it('accepts v8 with linkedRef pointing to a ref field', async () => {
    const result = await call(8, { key: 'type', type: 'string', linkedRef: 'typeRef' });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('refuses linkedRef in an earlier version, on another type and with a wrong key, with the path', async () => {
    const old = await call(7, { key: 'type', type: 'string', linkedRef: 'typeRef' });
    expect(old.errors).toContain(
      'layers[0].annotationTypes[0].fields[1].linkedRef: only allowed with formatVersion 8',
    );
    const wrong = await call(8, { key: 'n', type: 'number', linkedRef: 'typeRef' });
    expect(wrong.errors).toContain(
      'layers[0].annotationTypes[0].fields[1].linkedRef: only allowed in a string field or column',
    );
    const missing = await call(8, { key: 'type', type: 'string', linkedRef: 'nothing' });
    expect(missing.errors).toContain(
      'layers[0].annotationTypes[0].fields[1].linkedRef: "nothing" is not a field of the type',
    );
    const notRef = await call(8, { key: 'type', type: 'string', linkedRef: 'type' });
    expect(notRef.errors).toContain(
      'layers[0].annotationTypes[0].fields[1].linkedRef: "type" must be a ref field',
    );
  });
});

describe('validate_library', () => {
  it('text in an example table field: only the message, without code (EX5)', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', {
        path: 'text-in-table/material3-compose',
      }),
    );
    expect(result.valid).toBe(false);
    const issue = result.errors.find((e) => e.message.includes('takes only the list'));
    expect(issue?.message).toBe('a "table" field takes only the list of rows');
    expect(issue?.path).toMatch(/examples\[0\]\.values\.items$/);
    expect(Object.keys(issue ?? {}).sort()).toEqual([
      'file',
      'message',
      'path',
      'severity',
    ]);
  });

  it('approves Material 3 (folder or file): no errors, with the expected warnings', async () => {
    for (const path of ['lib/material3', 'lib/material3/material3.spec.json']) {
      const result = ok(await mcp.call<Validated>('validate_library', { path }));
      expect(result.valid, path).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.summary).toMatchObject({ level: 3, components: 15, docs: 15 });
      expect(result.spec).toMatchObject({
        id: 'material3',
        formatVersion: 6,
        components: 15,
        fonts: 2,
        origins: 1,
        migrations: 0,
      });
      expect(result.warnings.length).toBeGreaterThan(0);
      for (const w of result.warnings) {
        expect(w.severity).toBe('warning');
        expect(typeof w.file).toBe('string');
      }
    }
  });

  it('the external-system example goes through the declaration (level 3) and breaks if it does not understand it', async () => {
    const good = ok(
      await mcp.call<Validated>('validate_library', { path: 'lib/material3' }),
    );
    expect(good.errors).toEqual([]);
    const bad = ok(
      await mcp.call<Validated>('validate_library', { path: 'external/material3' }),
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors).toHaveLength(1);
    expect(bad.errors[0]).toMatchObject({
      file: 'material3.spec.json',
      path: 'origins[0].examples[0].file',
    });
    expect(bad.errors[0]?.message).toMatch(/screen width missing or invalid/);
    // With level 2 the drawing proof does not run.
    const level2 = ok(
      await mcp.call<Validated>('validate_library', {
        path: 'external/material3',
        level: 2,
      }),
    );
    expect(level2.valid).toBe(true);
    expect(level2.summary.level).toBe(2);
  });

  it('package without a component: error with the right file and path', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'broken/material3' }),
    );
    expect(result.valid).toBe(false);
    const missing = result.errors.find((e) => e.message.includes('m3-button.json'));
    expect(missing).toMatchObject({ file: 'material3.spec.json', severity: 'error' });
    expect(missing?.path).toMatch(/^layers\[\d+\]\.annotationTypes\[\d+\]\.component$/);
    expect(result.hint).toMatch(/fix the errors/);
  });

  it('version contract: previous turns on the check (the same version is not new)', async () => {
    const same = ok(
      await mcp.call<Validated>('validate_library', {
        path: 'lib/material3',
        previous: 'lib/material3/material3.spec.json',
      }),
    );
    expect(same.errors.length + same.warnings.length).toBeGreaterThan(0);
    const withoutPrevious = ok(
      await mcp.call<Validated>('validate_library', { path: 'lib/material3' }),
    );
    expect(same.errors.length).toBeGreaterThanOrEqual(withoutPrevious.errors.length);
  });

  it('refuses a path outside the roots (including a symbolic link) and a nonexistent one', async () => {
    expect(
      errorOf(
        await mcp.call('validate_library', { path: join(base, 'outside', 'material3') }),
      ).code,
    ).toBe('outside-roots');
    expect(
      errorOf(await mcp.call('validate_library', { path: 'link-outside' })).code,
    ).toBe('outside-roots');
    expect(errorOf(await mcp.call('validate_library', { path: '../outside' })).code).toBe(
      'outside-roots',
    );
    expect(
      errorOf(await mcp.call('validate_library', { path: 'does-not-exist' })).code,
    ).toBe('path-not-found');
  });

  it('folder without a specialization: valid false with the validator message', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'empty' }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/no specialization found/);
    expect(result.spec).toBeUndefined();
  });
});

describe('validate_specialization with v4', () => {
  it('summarizes components, fonts, origins and migrations and points to validate_library', async () => {
    const result = ok(
      await mcp.call<{
        valid: boolean;
        spec: Record<string, unknown>;
        hint: string;
      }>('validate_specialization', { path: 'lib/material3/material3.spec.json' }),
    );
    expect(result.valid).toBe(true);
    expect(result.spec).toMatchObject({
      formatVersion: 6,
      components: 15,
      fonts: 2,
      origins: 1,
      migrations: 0,
    });
    expect(result.hint).toMatch(/validate_library/);
    expect(result.hint).toMatch(/FILE/);
  });
});

describe('list_components and get_component', () => {
  it('by package path', async () => {
    const list = ok(await mcp.call<Listed>('list_components', { path: 'lib/material3' }));
    expect(list.count).toBe(15);
    const button = list.components.find((c) => c.type === 'm3-button');
    expect(button).toMatchObject({ hasDoc: true });
    expect(button?.size.width).toBeGreaterThan(0);
    expect(button?.examples).toBeGreaterThan(0);

    const got = ok(
      await mcp.call<Component>('get_component', {
        path: 'lib/material3',
        type: 'm3-button',
      }),
    );
    expect(got).toMatchObject({ type: 'm3-button', hasComponent: true });
    expect(got.doc).toBe(readFileSync(`${MATERIAL3}/docs/m3-button.md`, 'utf8'));
    expect(got.component?.format).toBe('mapping-component');
    expect(got.fields.map((f) => f.key)).toContain('label');
    expect(got.examples.length).toBeGreaterThan(0);
    expect(got.examples[0]?.values).toBeDefined();
  });

  it('get_component of tabs: each example brings the items rows as they are in the file (EX5)', async () => {
    const got = ok(
      await mcp.call<Component>('get_component', {
        path: 'compose/material3-compose',
        type: 'tabs',
      }),
    );
    expect(got.examples).toHaveLength(6);
    for (const example of got.examples) {
      const items = example.values?.items;
      expect(Array.isArray(items), example.name).toBe(true);
      expect((items as { label: string; _id?: string }[]).map((r) => r.label)).toEqual([
        'Início',
        'Buscar',
        'Perfil',
      ]);
      expect(JSON.stringify(items), example.name).not.toContain('_id');
    }
  });

  it('by project and specId (the copy applied in specs/<folder>/)', async () => {
    const list = ok(
      await mcp.call<Listed>('list_components', {
        project: 'screens',
        specId: 'material3',
      }),
    );
    expect(list.count).toBe(15);
    const got = ok(
      await mcp.call<Component>('get_component', {
        project: 'screens',
        specId: 'material3',
        type: 'm3-card',
      }),
    );
    expect(got.hasComponent).toBe(true);
    expect(got.doc).toBe(readFileSync(`${MATERIAL3}/docs/m3-card.md`, 'utf8'));
  });

  it('unknown type, wrong arguments and a specialization not applied', async () => {
    expect(
      errorOf(
        await mcp.call('get_component', {
          path: 'lib/material3',
          type: 'does-not-exist',
        }),
      ).code,
    ).toBe('unknown-type');
    expect(errorOf(await mcp.call('list_components', {})).code).toBe('invalid-arguments');
    expect(
      errorOf(
        await mcp.call('list_components', { path: 'lib/material3', project: 'screens' }),
      ).code,
    ).toBe('invalid-arguments');
    expect(errorOf(await mcp.call('list_components', { project: 'screens' })).code).toBe(
      'invalid-arguments',
    );
    expect(
      errorOf(await mcp.call('list_components', { project: 'screens', specId: 'other' }))
        .code,
    ).toBe('not-found');
  });

  it('type without a component or a document: clear answer, not an error', async () => {
    const dir = join(root, 'no-component');
    cpSync(MATERIAL3, dir, { recursive: true });
    const file = join(dir, 'material3.spec.json');
    const spec = JSON.parse(readFileSync(file, 'utf8')) as Spec;
    const type = spec.layers[0]!.annotationTypes[0]!;
    delete type.component;
    delete type.doc;
    writeFileSync(file, JSON.stringify(spec));
    const got = ok(
      await mcp.call<Component>('get_component', {
        path: 'no-component',
        type: type.id,
      }),
    );
    expect(got.hasComponent).toBe(false);
    expect(got.doc).toBeNull();
    expect(got.component).toBeNull();
    expect(got.hint).toMatch(/has no component/);
    const list = ok(await mcp.call<Listed>('list_components', { path: 'no-component' }));
    expect(list.count).toBe(14);
    expect(list.typesWithoutComponent).toBe(1);
  });
});

describe('get_specialization with v4', () => {
  it('keeps component, doc, examples, fonts and origins and lists the package files', async () => {
    const view = ok(
      await mcp.call<{
        spec: Spec;
        package?: { dir: string; files: string[] };
      }>('get_specialization', { project: 'screens', specId: 'material3' }),
    );
    expect(view.spec.fonts).toHaveLength(2);
    expect(view.spec.origins).toHaveLength(1);
    const type = view.spec.layers[0]!.annotationTypes[0]!;
    expect(type.component).toMatch(/^components\//);
    expect(type.doc).toMatch(/^docs\//);
    expect(type.examples?.length).toBeGreaterThan(0);
    expect(view.package?.dir).toBe('specs/material3');
    expect(view.package?.files).toContain('components/m3-button.json');
    expect(view.package?.files).toContain('fonts/LEIA-ME.txt');
    expect(existsSync(join(root, 'projetos', 'screens', view.package!.dir))).toBe(true);
  });
});

describe('apply_specialization with a v4 package', () => {
  it('is accepted: the folder goes through the proposal (details in libraryUpdate.test.ts)', async () => {
    const result = ok(
      await mcp.call<{
        valid: boolean;
        errors?: { op: string; code: string; message: string }[];
        summary: string[];
      }>('plan_changes', {
        project: 'screens',
        operations: [
          { op: 'apply_specialization', file: 'lib/material3/material3.spec.json' },
        ],
      }),
    );
    // The library is already applied in this project: the error is the usual one, not a package refusal.
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]?.code).toBe('spec-already-applied');
  });
});
