import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Stage #2035 (CL1-F1): `validate_library` reads the non-JSON examples of a format (`.yaml`, `.csv`)
// and reports the same problem the app's Catalog does (`tests/e2e/formatPackagesBroken.spec.ts`).

interface Validated {
  valid: boolean;
  errors: { file: string; path: string; message: string }[];
}

let base: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-format-parity-'));
  mkdirSync(join(base, 'root'), { recursive: true });
  mcp = await connect([join(base, 'root')]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('validate_library: a non-JSON example of a format', () => {
  it('data-model with a changed .yaml example is an error at fileFormats[0].examples[0]', async () => {
    const dir = join(base, 'root', 'fpa-roundtrip');
    cpSync('examples/libraries/data-model', dir, { recursive: true });
    const example = join(dir, 'examples', 'shop.openapi.yaml');
    // A key the plugin does not represent: `generate` cannot write it back.
    writeFileSync(
      example,
      readFileSync(example, 'utf8').replace(
        '      x-timeout-ms: 15000\n',
        '      x-timeout-ms: 15000\n      x-owner: shop-team\n',
      ),
    );
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'fpa-roundtrip' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ path: 'fileFormats[0].examples[0]' });
    expect(result.errors[0]!.message).toMatch(/round-trip/);
    expect(result.errors[0]!.message).toMatch(/x-owner: shop-team/);
  });
});
