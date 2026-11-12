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

// `plan_signature_import` (etapa #1079, S2, decisões 1c e 13): a prévia da importação da ficha
// de assinatura num pacote de biblioteca. Somente leitura: o teste grava o que a tool devolve (como
// o agente faz), valida com `validate_library` e reimporta.

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

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; data: any }> {
  // eslint-disable-line @typescript-eslint/no-explicit-any
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

/** Grava o que a tool devolveu no pacote, como o agente: o `spec` e a ficha no `signaturePath`. */
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
  it('com a ficha à mão devolve campos, code, avisos e a especialização; não grava nada', async () => {
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
      'compose: o parâmetro `shape` (Shape) ainda não é campo',
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

  it('gravada, passa no validate_library e reimportar não muda nada', async () => {
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

  it('ficha mudada: campo novo opcional, removed, padrão novo e nenhuma quebra', async () => {
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

describe('plan_signature_import: SwiftUI e Figma', () => {
  it('a view SwiftUI: tipo novo (obrigatório), posicional e rótulo externo', async () => {
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

  it('o componente do Figma casa Style com style e avisa a opção que não casa', async () => {
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
      'figma: a opção `Text` da fonte não existe no campo',
    ]);
  });

  it('signatureFile: um .json dentro das raízes', async () => {
    cpSync(join(FIXTURES, 'button.figma.json'), join(base, 'ficha.json'));
    const result = await plan({
      type: 'button',
      system: 'figma',
      signatureFile: 'ficha.json',
    });
    expect(result.links.length).toBeGreaterThan(0);
  });
});

describe('plan_signature_import: erros', () => {
  const ficha = (): unknown => fixture('button.compose.json');

  it('signature-invalid com o caminho do problema na ficha', async () => {
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

  it('signatureFile que não é .json é recusado, mesmo existindo', async () => {
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

  it('type-not-found, platform-not-declared e signature-mismatch', async () => {
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

  it('pede exatamente uma ficha e um alvo', async () => {
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
