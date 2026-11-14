import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../mcp/server';

// `plan_signature_import` (stage #1079, S2, decisions 1c and 13): the preview of importing the
// signature sheet into a library package. Read-only: the test writes what the tool returns (as
// the agent does), validates with `validate_library` and reimports.

const FIXTURES = 'tests/fixtures/signature';
let base: string;
let pkg: string;
let client: Client;

interface Plan {
  type: string;
  signaturePath: string;
  previous: boolean;
  fields: { key: string; required?: boolean; default?: unknown }[];
  links: { param: string; field: string; via: string }[];
  code?: {
    signature?: string;
    params?: Record<string, string>;
    calls?: Record<string, string>;
  };
  sources?: { system: string; signature?: string }[];
  notices: { at: unknown; kind: string; message: string; ref: string }[];
  unmapped: { name: string }[];
  changes: { kind: string; param: string }[];
  suggestedMigrations: { op: string }[];
  versionBump: boolean;
  spec: { layers: { annotationTypes: { id: string; fields: { key: string }[] }[] }[] };
  hint: string;
}

interface Reply {
  isError: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

async function call(name: string, args: Record<string, unknown>): Promise<Reply> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { text: string }[])[0]!.text;
  return { isError: result.isError === true, data: JSON.parse(text) };
}

async function plan(args: Record<string, unknown>): Promise<Plan> {
  const r = await call('plan_signature_import', { path: 'lib', ...args });
  expect(r.isError, JSON.stringify(r.data)).toBe(false);
  return r.data as Plan;
}

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const specFile = (): string => join(pkg, 'lib.spec.json');
const tree = (): string[] =>
  readdirSync(base, { recursive: true, encoding: 'utf8' }).sort();

/** Writes what the tool returned into the package, as the agent does: the `spec` and the sheet at the `signaturePath`. */
function save(result: Plan, signature: unknown): void {
  writeFileSync(specFile(), `${JSON.stringify(result.spec, null, 2)}\n`);
  const target = join(pkg, result.signaturePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(signature, null, 2)}\n`);
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-sigimport-'));
  pkg = join(base, 'lib');
  cpSync(join(FIXTURES, 'library'), pkg, { recursive: true });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  client = new Client({ name: 'teste', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  rmSync(base, { recursive: true, force: true });
});

describe('plan_signature_import: Compose', () => {
  it('with the sheet inline it returns fields, code, notices and the specialization; writes nothing', async () => {
    const before = tree();
    const raw = readFileSync(specFile(), 'utf8');
    const result = await plan({
      type: 'button',
      platform: 'compose',
      signature: fixture('button.compose.json'),
    });
    expect(tree()).toEqual(before);
    expect(readFileSync(specFile(), 'utf8')).toBe(raw);
    expect(result.signaturePath).toBe('signatures/button.compose.json');
    expect(result.previous).toBe(false);
    expect(result.links.map((l) => `${l.param}>${l.field}:${l.via}`)).toEqual([
      'enabled>enabled:new',
      'colors.containerColor>containerColor:new',
      'colors.contentColor>contentColor:new',
      'contentPadding.horizontal>horizontal:new',
      'contentPadding.vertical>vertical:new',
    ]);
    expect(result.code?.signature).toBe('signatures/button.compose.json');
    expect(result.code?.calls).toEqual({
      colors: 'androidx.compose.material3.ButtonDefaults.buttonColors',
      contentPadding: 'PaddingValues',
    });
    expect(result.notices.map((n) => n.message)).toEqual([
      'compose: the parameter `shape` (Shape) is not a field yet',
    ]);
    expect(result.notices.every((n) => n.ref === result.signaturePath)).toBe(true);
    expect(result.unmapped.map((u) => u.name)).toEqual([
      'onClick',
      'modifier',
      'shape',
      'content',
    ]);
    expect(result.versionBump).toBe(true);
    const keys = Object.keys(JSON.parse(raw) as object);
    expect(Object.keys(result.spec)).toEqual(keys);
  });

  it('once written, it passes validate_library and reimporting changes nothing', async () => {
    const signature = fixture('button.compose.json');
    const first = await plan({ type: 'button', platform: 'compose', signature });
    save(first, signature);
    const valid = await call('validate_library', { path: 'lib' });
    expect(valid.data.errors).toEqual([]);
    expect(valid.data.valid).toBe(true);

    const again = await plan({ type: 'button', platform: 'compose', signature });
    expect(again.previous).toBe(true);
    expect(again.fields).toEqual([]);
    expect(again.changes).toEqual([]);
    expect(again.versionBump).toBe(false);
    expect(JSON.stringify(again.spec)).toBe(JSON.stringify(first.spec));
  });

  it('changed sheet: a new optional field, removed, a new default and no break', async () => {
    const changed = fixture('button.compose.changed.json');
    const result = await plan({
      type: 'button',
      platform: 'compose',
      signature: changed,
    });
    expect(result.previous).toBe(true);
    expect(result.fields.map((f) => f.key)).toEqual(['elevation']);
    expect(result.fields[0]).not.toHaveProperty('required');
    expect(result.changes.map((c) => `${c.kind}:${c.param}`)).toEqual(
      expect.arrayContaining([
        'removed:contentPadding.horizontal',
        'removed:contentPadding.vertical',
        'added:elevation',
        'changed:enabled',
      ]),
    );
    const removed = result.notices.filter((n) => n.kind === 'removed');
    expect(removed.map((n) => n.at)).toEqual([
      { field: 'horizontal' },
      { field: 'vertical' },
    ]);
    expect(result.suggestedMigrations.map((m) => m.op)).toEqual([
      'remove-field',
      'remove-field',
    ]);
    const fields = result.spec.layers[0]!.annotationTypes.find(
      (t) => t.id === 'button',
    )!.fields;
    expect(fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(['horizontal', 'vertical', 'elevation']),
    );
    expect(result.versionBump).toBe(true);
    save(result, changed);
    const valid = await call('validate_library', { path: 'lib' });
    expect(valid.data.errors).toEqual([]);
  });
});

describe('plan_signature_import: SwiftUI and Figma', () => {
  it('the SwiftUI view: a new type (required), positional and external label', async () => {
    const result = await plan({
      type: 'profile-card',
      platform: 'swiftui',
      signature: fixture('profile-card.swiftui.json'),
    });
    expect(result.code?.params).toEqual({
      title: '#0',
      badgeCount: 'badge',
      style: 'style',
    });
    expect(result.fields.find((f) => f.key === 'title')).toHaveProperty('required', true);
    expect(result.unmapped.map((u) => u.name)).toEqual(['onTap', 'content']);
  });

  it('the Figma component matches Style with style and warns about the option that does not match', async () => {
    const result = await plan({
      type: 'button',
      system: 'figma',
      signature: fixture('button.figma.json'),
    });
    expect(result.signaturePath).toBe('signatures/button.figma.json');
    expect(result.links.find((l) => l.param === 'Style')).toMatchObject({
      field: 'style',
      via: 'name',
    });
    expect(result.sources?.[0]).toMatchObject({
      system: 'figma',
      signature: 'signatures/button.figma.json',
    });
    expect(result.notices.map((n) => n.message)).toEqual([
      'figma: the option `Text` of the source does not exist in the field',
    ]);
  });

  it('signatureFile: a .json inside the roots', async () => {
    cpSync(join(FIXTURES, 'button.figma.json'), join(base, 'ficha.json'));
    const result = await plan({
      type: 'button',
      system: 'figma',
      signatureFile: 'ficha.json',
    });
    expect(result.links.length).toBeGreaterThan(0);
  });
});

describe('plan_signature_import: errors', () => {
  const ficha = (): unknown => fixture('button.compose.json');

  it('signature-invalid with the path of the problem in the sheet', async () => {
    const bad = JSON.parse(JSON.stringify(ficha()));
    bad.params[0].role = 'nada';
    const r = await call('plan_signature_import', {
      path: 'lib',
      type: 'button',
      platform: 'compose',
      signature: bad,
    });
    expect(r.isError).toBe(true);
    expect(r.data.error.code).toBe('signature-invalid');
    expect(r.data.error.issues[0].path).toBe('params[0].role');
    expect(r.data.error.hint).toContain('SIGNATURE-FORMAT');
  });

  it('a signatureFile that is not .json is refused, even if it exists', async () => {
    writeFileSync(join(base, 'Button.kt'), 'fun Button() {}');
    const r = await call('plan_signature_import', {
      path: 'lib',
      type: 'button',
      platform: 'compose',
      signatureFile: 'Button.kt',
    });
    expect(r.data.error.code).toBe('signature-invalid');
    expect(r.data.error.message).toContain('.json');
  });

  it('type-not-found, platform-not-declared and signature-mismatch', async () => {
    const args = { path: 'lib', platform: 'compose', signature: ficha() };
    const notFound = await call('plan_signature_import', { ...args, type: 'nada' });
    expect(notFound.data.error.code).toBe('type-not-found');
    const platform = await call('plan_signature_import', {
      ...args,
      type: 'button',
      platform: 'web',
    });
    expect(platform.data.error.code).toBe('platform-not-declared');
    const wrong = JSON.parse(JSON.stringify(ficha()));
    wrong.source.symbol = 'outra.Button';
    const mismatch = await call('plan_signature_import', {
      ...args,
      type: 'button',
      signature: wrong,
    });
    expect(mismatch.data.error.code).toBe('signature-mismatch');
    expect(mismatch.data.error.hint).toBeTruthy();
  });

  it('CL2 R-1: a package with a pre-16 specialization is refused (invalid-spec), with no plan', async () => {
    const old = join(base, 'old');
    cpSync(join(FIXTURES, 'library'), old, { recursive: true });
    const file = join(old, 'lib.spec.json');
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    raw.formatVersion = 15;
    delete raw.fieldModels;
    for (const layer of raw.layers)
      for (const t of layer.annotationTypes)
        for (const code of Object.values<Record<string, unknown>>(t.code ?? {})) {
          for (const key of ['signature', 'ignore', 'calls', 'formats']) delete code[key];
        }
    writeFileSync(file, JSON.stringify(raw));
    const r = await call('plan_signature_import', {
      path: 'old',
      type: 'button',
      platform: 'compose',
      signature: ficha(),
    });
    expect(r.isError).toBe(true);
    expect(r.data.error.code).toBe('invalid-spec');
    expect(r.data.error.message).toContain('15');
    expect(r.data.error.hint).toBeTruthy();
  });

  it('requires exactly one sheet and one target', async () => {
    const none = await call('plan_signature_import', {
      path: 'lib',
      type: 'button',
      platform: 'compose',
    });
    expect(none.data.error.code).toBe('invalid-arguments');
    const both = await call('plan_signature_import', {
      path: 'lib',
      type: 'button',
      signature: ficha(),
    });
    expect(both.data.error.code).toBe('invalid-arguments');
  });
});

describe('plan_signature_import: a written sheet that could not be used', () => {
  /** A copy of the library where the button's `code` cites the sheet `ref`. */
  function libraryCiting(name: string, ref: string): void {
    const dir = join(base, name);
    cpSync(join(FIXTURES, 'library'), dir, { recursive: true });
    const file = join(dir, 'lib.spec.json');
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const button = raw.layers[0].annotationTypes.find(
      (t: { id: string }) => t.id === 'button',
    );
    button.code = {
      compose: {
        symbol: 'androidx.compose.material3.Button',
        path: 'compose/material3/Button.kt',
        signature: ref,
      },
    };
    writeFileSync(file, JSON.stringify(raw, null, 2));
  }
  const args = (path: string) => ({
    path,
    type: 'button',
    platform: 'compose',
    signature: fixture('button.compose.json'),
  });

  it('a cited sheet that is not in the package becomes previousProblem', async () => {
    libraryCiting('lib-ausente', 'signatures/gone.json');
    const r = await call('plan_signature_import', args('lib-ausente'));
    expect(r.isError, JSON.stringify(r.data)).toBe(false);
    expect(r.data.previous).toBe(false);
    expect(r.data.previousProblem).toContain('signatures/gone.json');
    expect(r.data.previousProblem).toContain('missing');
  });

  it('an invalid cited sheet becomes previousProblem', async () => {
    libraryCiting('lib-invalida', 'signatures/bad.json');
    mkdirSync(join(base, 'lib-invalida', 'signatures'));
    writeFileSync(join(base, 'lib-invalida', 'signatures', 'bad.json'), '{"x":1}');
    const r = await call('plan_signature_import', args('lib-invalida'));
    expect(r.data.previous).toBe(false);
    expect(r.data.previousProblem).toContain('signatures/bad.json');
    expect(r.data.previousProblem).toContain('invalid');
  });

  it('without a cited sheet or with a good sheet, the key does not exist', async () => {
    const none = await call('plan_signature_import', args('lib'));
    expect(none.data).not.toHaveProperty('previousProblem');
    libraryCiting('lib-boa', 'signatures/ok.json');
    mkdirSync(join(base, 'lib-boa', 'signatures'));
    writeFileSync(
      join(base, 'lib-boa', 'signatures', 'ok.json'),
      JSON.stringify(fixture('button.compose.json')),
    );
    const ok = await call('plan_signature_import', args('lib-boa'));
    expect(ok.data.previous).toBe(true);
    expect(ok.data).not.toHaveProperty('previousProblem');
  });
});
