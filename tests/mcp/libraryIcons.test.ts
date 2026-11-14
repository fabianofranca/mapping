// CF7: validate_library with the icon set (`icons`, `mapping-icons` file).
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

const ICONS = 'tests/fixtures/icons';

interface Issue {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
interface Validated {
  valid: boolean;
  spec?: Record<string, unknown>;
  errors: Issue[];
  warnings: Issue[];
}

let base: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-icons-'));
  const root = join(base, 'raiz');
  mkdirSync(root, { recursive: true });
  cpSync(ICONS, join(root, 'ok'), { recursive: true });
  // Wrong icons file: the name "check" vanishes from the set.
  cpSync(ICONS, join(root, 'errado'), { recursive: true });
  const file = join(root, 'errado', 'icons', 'set.json');
  const set = JSON.parse(readFileSync(file, 'utf8')) as {
    icons: Record<string, unknown>;
  };
  set.icons.Check = set.icons.check;
  delete set.icons.check;
  writeFileSync(file, JSON.stringify(set));
  // Literal name outside the set.
  cpSync(ICONS, join(root, 'literal'), { recursive: true });
  const comp = join(root, 'literal', 'components', 'badge.json');
  const badge = JSON.parse(readFileSync(comp, 'utf8')) as {
    template: { children: { name: unknown }[] };
  };
  badge.template.children[0]!.name = 'nuvem';
  writeFileSync(comp, JSON.stringify(badge));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('validate_library with icons', () => {
  it('approves the test package, with no errors or warnings, and summarizes the icons file', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'ok' }));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.spec).toMatchObject({
      id: 'icons',
      formatVersion: 15,
      icons: 'icons/set.json',
    });
  });

  it("with the wrong icons file it returns the file's error", async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'errado' }));
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => `${e.file} ${e.path}: ${e.message}`)).toContain(
      'icons/set.json icons.Check: invalid name; use [a-z0-9][a-z0-9-_]*',
    );
  });

  it('refuses a literal name that is not in the set', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'literal' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        file: 'components/badge.json',
        path: 'template.children[0].name',
        message: 'the icon "nuvem" does not exist in the icon set (icons/set.json)',
      }),
    ]);
  });
});
