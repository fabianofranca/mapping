// R26 (Importing the signature): the helper `scripts/testing/assinatura.mjs` writes the `spec` and the sheet of the
// nth reply of `plan_signature_import` in the stdio client's output, and checks that reimporting
// changes nothing. The test builds the output in the format of `mcp-stdio-client.mjs`.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve('scripts/testing/assinatura.mjs');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mapping-assinatura-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const run = (...args: string[]) =>
  spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

/** The stdio client's output: one `=== tool` block per call, the reply as a list of one JSON text. */
function output(blocks: { name: string; result: unknown }[]): string {
  return blocks
    .map((b) => `=== ${b.name}\n[\n ${JSON.stringify(JSON.stringify(b.result))}\n]\n`)
    .join('');
}

const SPEC = { format: 'mapping-spec', version: 2, layers: [] };

describe('assinatura.mjs (R26)', () => {
  it('gravar: the spec of reply n and the sheet at signaturePath', () => {
    const saida = path.join(dir, 'saida.txt');
    writeFileSync(
      saida,
      output([
        { name: 'validate_library', result: { valid: true } },
        {
          name: 'plan_signature_import',
          result: { spec: { v: 1 }, signaturePath: 'signatures/a.json' },
        },
        {
          name: 'plan_signature_import',
          result: { spec: SPEC, signaturePath: 'signatures/b.json' },
        },
      ]),
    );
    const ficha = path.join(dir, 'ficha.json');
    writeFileSync(ficha, '{"format":"mapping-signature"}');
    const pacote = path.join(dir, 'lib');
    mkdirSync(pacote);
    const r = run('gravar', saida, pacote, ficha, 'lib.spec.json', '2');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('gravado: lib.spec.json e signatures/b.json');
    expect(JSON.parse(readFileSync(path.join(pacote, 'lib.spec.json'), 'utf8'))).toEqual(
      SPEC,
    );
    expect(readFileSync(path.join(pacote, 'signatures/b.json'), 'utf8')).toBe(
      '{"format":"mapping-signature"}',
    );
  });

  it('gravar: a signaturePath that leaves the package is refused and nothing is written outside', () => {
    const saida = path.join(dir, 'saida.txt');
    writeFileSync(
      saida,
      output([
        {
          name: 'plan_signature_import',
          result: { spec: SPEC, signaturePath: '../fora/a.json' },
        },
      ]),
    );
    const ficha = path.join(dir, 'ficha.json');
    writeFileSync(ficha, '{}');
    const pacote = path.join(dir, 'lib');
    mkdirSync(pacote);
    const r = run('gravar', saida, pacote, ficha, 'lib.spec.json');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('fora do pacote');
    expect(existsSync(path.join(dir, 'fora'))).toBe(false);
  });

  it('igual: says igual and exits with 0; diferente exits with 1', () => {
    const saida = path.join(dir, 'saida.txt');
    writeFileSync(
      saida,
      output([{ name: 'plan_signature_import', result: { spec: SPEC } }]),
    );
    const arquivo = path.join(dir, 'lib.spec.json');
    writeFileSync(arquivo, JSON.stringify(SPEC, null, 2));
    expect(run('igual', saida, arquivo).stdout.trim()).toBe('igual');
    writeFileSync(arquivo, JSON.stringify({ ...SPEC, version: 3 }));
    const r = run('igual', saida, arquivo);
    expect(r.stdout.trim()).toBe('diferente');
    expect(r.status).toBe(1);
  });

  it('an error reply, a missing one and wrong usage exit with 2 and say why', () => {
    const saida = path.join(dir, 'saida.txt');
    writeFileSync(
      saida,
      output([
        {
          name: 'plan_signature_import',
          result: { error: { code: 'signature-invalid', message: 'x' } },
        },
      ]),
    );
    const erro = run('igual', saida, path.join(dir, 'x.json'));
    expect(erro.status).toBe(2);
    expect(erro.stderr).toContain('signature-invalid');
    const falta = run('igual', saida, path.join(dir, 'x.json'), '3');
    expect(falta.status).toBe(2);
    expect(falta.stderr).toContain('não tem a resposta 3');
    expect(run().status).toBe(2);
  });
});
