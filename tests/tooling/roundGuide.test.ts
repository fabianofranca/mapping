// @vitest-environment node
// Fase TS1 (etapa #421, decisão 7): `round-guide.mjs` gera o guia da rodada a partir do
// docs/TESTING.md, sem os roteiros não pedidos, os sob demanda, a seção 9 e o registro do Uso real.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const GUIDE = readFileSync('docs/TESTING.md', 'utf8');
const SCRIPT = 'scripts/testing/round-guide.mjs';

async function build(roteiros: string[]): Promise<string> {
  const mod: {
    buildRoundGuide: (
      md: string,
      roteiros: string[],
      options?: { commit?: string },
    ) => string;
  } = await import('../../scripts/testing/round-guide.mjs');
  return mod.buildRoundGuide(GUIDE, roteiros, { commit: 'abc1234' });
}

describe('round-guide.mjs (TS1, decisão 7)', () => {
  it('R0 R2 R4 R11: tem os quatro roteiros, o template e o apêndice A; sem R1, sem a seção 9', async () => {
    const out = await build(['R0', 'R2', 'R4', 'R11']);
    for (const r of ['R0', 'R2', 'R4', 'R11']) {
      expect(out, r).toMatch(new RegExp(`^### ${r} `, 'm'));
    }
    expect(out).not.toMatch(/^### R1 /m);
    expect(out).not.toMatch(/^### R12 /m);
    expect(out).not.toContain('## 9. Teste manual avançado');
    expect(out).not.toContain('### Roteiros sob demanda (manuais)');
    expect(out).not.toContain('### Registro do marco');
    expect(out).toContain('### Relato de uma rodada de teste');
    expect(out).toContain('## Apêndice A');
    expect(out).toContain('## Apêndice B');
    expect(out).toContain('## Comece aqui');
    expect(out).toContain('**Convenções.**');
  });

  it('a primeira linha diz o commit, os roteiros e que o guia inteiro é o docs/TESTING.md', async () => {
    const out = await build(['R0', 'R2']);
    const first = out.split('\n')[0] ?? '';
    expect(first).toContain('abc1234');
    expect(first).toContain('R0');
    expect(first).toContain('R2');
    expect(first).toContain('docs/TESTING.md');
  });

  it('fica abaixo de 35% do guia para R0, R2, R4 e R11', async () => {
    const out = await build(['R0', 'R2', 'R4', 'R11']);
    expect(Buffer.byteLength(out)).toBeLessThan(Buffer.byteLength(GUIDE) * 0.35);
  });

  it('todo ### R<n> do guia é aceito, e só ele entra', async () => {
    const ids = [...GUIDE.matchAll(/^### (R\d+) /gm)].map((m) => m[1] as string);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      const out = await build([id]);
      const headings = [...out.matchAll(/^### (R\d+) /gm)].map((m) => m[1]);
      expect(headings, id).toEqual([id]);
    }
  });

  it('all mantém R0 a R17, na ordem do guia, ainda sem a seção 9', async () => {
    const out = await build(['all']);
    const ids = [...GUIDE.matchAll(/^### (R\d+) /gm)].map((m) => m[1]);
    expect([...out.matchAll(/^### (R\d+) /gm)].map((m) => m[1])).toEqual(ids);
    expect(out).not.toContain('## 9. Teste manual avançado');
  });

  it('não confunde "#" dentro de bloco de código com cabeçalho', async () => {
    const out = await build(['R0']);
    expect(out).toContain('# Relato de teste — Mapping');
  });

  it('roteiro inexistente falha com a lista dos que existem', async () => {
    await expect(build(['R99'])).rejects.toThrow(/R99[\s\S]*R0[\s\S]*R17/);
  });

  it('a CLI grava em --out e roteiro inexistente sai com código 2', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'round-guide-'));
    try {
      const out = path.join(dir, 'guia.md');
      execFileSync('node', [SCRIPT, 'R0', 'R2', '--out', out], { stdio: 'pipe' });
      expect(readFileSync(out, 'utf8')).toMatch(/^### R2 /m);
      let status = 0;
      try {
        execFileSync('node', [SCRIPT, 'R99'], { stdio: 'pipe' });
      } catch (error) {
        status = (error as { status: number }).status;
      }
      expect(status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
