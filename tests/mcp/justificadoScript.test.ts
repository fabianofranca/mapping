// R25.87 a R25.90 (MF5): a biblioteca que o `scripts/testing/justificado.mjs` monta passa no
// `validate_library` (stdio) sem erro nem aviso, o componente é da formatVersion 4 (e uma versão
// menor recusa o `justify` e o `over`), e a cena traz o parágrafo justificado e a cor composta
// opaca (o `primary` a 50% sobre branco) ao lado da translúcida (sem `over`).
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
  it('a biblioteca montada é válida, sem erro nem aviso', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'm3-just' }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('grava um componente de formato 4, de 300 × 120, e a versão 3 recusa o justify e o over', () => {
    expect(validateComponent(card)).toEqual([]);
    expect((card as { size: unknown }).size).toEqual({ width: 300, height: 120 });
    const errors = validateComponent({ ...(card as object), formatVersion: 3 });
    expect(errors.some((e) => e.includes('template.children[0].font.align'))).toBe(true);
    expect(errors.some((e) => e.includes('template.children[2].fill'))).toBe(true);
    expect(errors.every((e) => e.includes('só é permitido com formatVersion 4'))).toBe(
      true,
    );
  });

  it('a cena tem o parágrafo justificado e o véu opaco ao lado do translúcido', () => {
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
    // `#6750A4` a 50% sobre `#FFFFFF`: `#B3A7D1` (alfa total); sem `over`, o `#6750A4` a 50%.
    expect(fill(named('véu'))).toMatch(/^#b3a7d1(ff)?$/);
    expect(fill(named('translúcido'))).toBe('#6750a480');
  });
});
