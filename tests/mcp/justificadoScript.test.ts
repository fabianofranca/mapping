// R25.87 to R25.90 (MF5): the library that `scripts/testing/justificado.mjs` builds passes
// `validate_library` (stdio) without errors and only with the known warnings, the component is formatVersion 4 (and a lower
// version refuses `justify` and `over`), and the scene has the justified paragraph and the opaque
// composed color (the `primary` at 50% over white) next to the translucent one (without `over`).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../src/model/components/parseComponent';
import { resolveTokens } from '../../src/model/components/tokens';
import type { SceneNode } from '../../src/model/components/scene';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

interface Validated {
  valid: boolean;
  errors: unknown[];
  warnings: unknown[];
}

let base: string;
let mcp: Connection;
let card: unknown;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-justificado-'));
  const lib = join(base, 'm3-just');
  cpSync('libraries/material3-compose', lib, { recursive: true });
  execFileSync('node', [resolve('scripts/testing/justificado.mjs'), lib]);
  card = JSON.parse(readFileSync(join(lib, 'components/card.json'), 'utf8'));
  mcp = await connect([base], { cwd: base });
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('justificado.mjs (R25.87 a R25.90)', () => {
  it('the built library is valid, without errors or warnings', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'm3-just' }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    // Provisional (owner decision pending in bug #1774; curation in #1134): only the
    // `parameter outside the signature` warnings of the known Material 3 set; any other warning fails.
    expect(
      result.warnings.filter(
        (w) => !JSON.stringify(w).includes('parameter outside the signature'),
      ),
    ).toEqual([]);
  });

  it('writes a format 4 component, 300 × 120, and version 3 refuses justify and over', () => {
    expect(validateComponent(card)).toEqual([]);
    expect((card as { size: unknown }).size).toEqual({ width: 300, height: 120 });
    const errors = validateComponent({ ...(card as object), formatVersion: 3 });
    expect(errors.some((e) => e.includes('template.children[0].font.align'))).toBe(true);
    expect(errors.some((e) => e.includes('template.children[2].fill'))).toBe(true);
    expect(errors.every((e) => e.includes('only allowed with formatVersion 4'))).toBe(
      true,
    );
  });

  it('the scene has the justified paragraph and the opaque veil next to the translucent one', () => {
    const parsed = parseComponent(card);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const spec = JSON.parse(
      readFileSync('libraries/material3-compose/material3-compose.spec.json', 'utf8'),
    ) as { tokens: Parameters<typeof resolveTokens>[0] };
    const { root } = instantiate(
      parsed.component,
      {},
      { x: 0, y: 0, width: 300, height: 120 },
      { measure: approximateMeasurer, tokens: resolveTokens(spec.tokens, {}, 'light') },
    );
    const children: readonly SceneNode[] = 'children' in root ? root.children : [];
    const named = (name: string) => children.find((c) => c.name === name);
    const par = named('par');
    expect(par?.type === 'text' && par.style.align).toBe('justify');
    const fill = (node: SceneNode | undefined) => {
      const paint = node?.fills[0];
      return paint?.type === 'solid' ? paint.color.toLowerCase() : undefined;
    };
    // `#6750A4` at 50% over `#FFFFFF`: `#B3A7D1` (full alpha); without `over`, the `#6750A4` at 50%.
    expect(fill(named('véu'))).toMatch(/^#b3a7d1(ff)?$/);
    expect(fill(named('translúcido'))).toBe('#6750a480');
  });
});
