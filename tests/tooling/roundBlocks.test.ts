// @vitest-environment node
// Etapa #424 (PL1, decisão 2): a rodada completa roda em 3 blocos paralelos. A tabela de blocos
// do docs/TESTING-NUVEM.md é conferida contra os passos do docs/TESTING.md: um roteiro novo (R18)
// ou um passo novo fora da tabela faz este teste falhar até ser posto num bloco.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GUIDE = readFileSync('docs/TESTING.md', 'utf8');
const NUVEM = readFileSync('docs/TESTING-NUVEM.md', 'utf8');

const STEP_RE = /^\|\s*(?:\*\*)?(R\d+\.\d+[a-z]?)(?:\*\*)?[^|]*\|/;

/** Os passos dos roteiros principais (R0 a R17), na ordem do guia, fora dos roteiros sob demanda. */
function guideSteps(): string[] {
  const lines = GUIDE.split('\n');
  const start = lines.findIndex((l) => /^## 8\. Roteiros/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^### Roteiros sob demanda/.test(l));
  const steps: string[] = [];
  let inFence = false;
  for (const line of lines.slice(start, end)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    const m = inFence ? null : STEP_RE.exec(line);
    if (m) steps.push(m[1] as string);
  }
  return steps;
}

interface Block {
  n: number;
  /** Os passos do bloco (R0 incluído). */
  steps: string[];
  /** Os roteiros inteiros que o guia da rodada do bloco precisa (R6 entra por R6.3 e R6.8a). */
  roteiros: string[];
  section6: boolean;
  visual: boolean;
  declared: number;
}

const roteiroOf = (step: string): string => step.split('.')[0] as string;

/** Expande um item da tabela ("R7", "R6.3 a R6.7") em passos, pela ordem do guia. */
function expand(token: string, steps: string[]): string[] {
  const range = /^(R\d+\.\d+[a-z]?) a (R\d+\.\d+[a-z]?)$/.exec(token);
  if (range) {
    const from = steps.indexOf(range[1] as string);
    const to = steps.indexOf(range[2] as string);
    if (from < 0 || to < from) throw new Error(`faixa inválida: ${token}`);
    return steps.slice(from, to + 1);
  }
  if (/^R\d+\.\d+[a-z]?$/.test(token)) {
    if (!steps.includes(token)) throw new Error(`passo inexistente: ${token}`);
    return [token];
  }
  if (/^R\d+$/.test(token)) {
    const all = steps.filter((s) => roteiroOf(s) === token);
    if (all.length === 0) throw new Error(`roteiro inexistente: ${token}`);
    return all;
  }
  return [];
}

/** Lê a tabela da seção "Rodada completa em blocos" do docs/TESTING-NUVEM.md. */
function readBlocks(steps: string[]): Block[] {
  const lines = NUVEM.split('\n');
  const start = lines.findIndex((l) => /^## Rodada completa em blocos\s*$/.test(l));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const blocks: Block[] = [];
  for (const line of lines.slice(start, end < 0 ? lines.length : end)) {
    const m = /^\|\s*(\d+)\s*\|([^|]*)\|\s*(\d+)\s*\|/.exec(line);
    if (!m) continue;
    const cell = (m[2] as string).trim();
    const items = cell
      .replace(/ e a passada visual$/, ', passada visual')
      .split(/,\s*| e /)
      .map((t) => t.trim())
      .filter(Boolean);
    const own = items.flatMap((t) => expand(t, steps));
    blocks.push({
      n: Number(m[1]),
      steps: own,
      roteiros: [...new Set(own.map(roteiroOf))],
      section6: items.includes('seção 6'),
      visual: items.includes('passada visual'),
      declared: Number(m[3]),
    });
  }
  return blocks;
}

const steps = guideSteps();
const blocks = readBlocks(steps);
const blockOf = (step: string): number[] =>
  blocks.filter((b) => b.steps.includes(step)).map((b) => b.n);

describe('divisão da rodada completa em 3 blocos (etapa #424, decisão 2)', () => {
  it('o guia tem os passos de R0 a R17 e a tabela tem 3 blocos numerados de 1 a 3', () => {
    expect(steps.length).toBeGreaterThan(200);
    expect(steps.some((s) => s.startsWith('R17.'))).toBe(true);
    expect(blocks.map((b) => b.n)).toEqual([1, 2, 3]);
  });

  it('todo passo de R0 a R17 está em exatamente um bloco, e o R0 nos três', () => {
    for (const s of steps) {
      const where = blockOf(s);
      if (roteiroOf(s) === 'R0') expect(where, s).toEqual([1, 2, 3]);
      else expect(where, `${s} deve estar em um só bloco`).toHaveLength(1);
    }
  });

  it('as dependências da seção 8 ficam no mesmo bloco', () => {
    const together = (group: string[]): void => {
      const ids = group.flatMap((t) => expand(t, steps));
      const where = new Set(ids.map((s) => blockOf(s)[0]));
      expect(where.has(undefined), `${group.join(', ')} fora da tabela`).toBe(false);
      expect([...where], group.join(', ')).toHaveLength(1);
    };
    together(['R1', 'R3', 'R5', 'R6.3 a R6.7', 'R7', 'R8']);
    together(['R4', 'R6.8a a R6.11']);
    together(['R9', 'R10']);
  });

  it('a seção 6 está em todo bloco com R3, R5, R9, R12, R16 ou R17', () => {
    for (const b of blocks) {
      const needs = b.roteiros.some((r) =>
        ['R3', 'R5', 'R9', 'R12', 'R16', 'R17'].includes(r),
      );
      if (needs) expect(b.section6, `bloco ${b.n}`).toBe(true);
    }
  });

  it('nenhum bloco passa de 40% dos passos', () => {
    const total = new Set(steps).size;
    for (const b of blocks) {
      expect(b.steps.length / total, `bloco ${b.n}`).toBeLessThanOrEqual(0.4);
    }
  });

  it('a coluna Passos de cada bloco é a contagem real (R0 incluído)', () => {
    for (const b of blocks) expect(b.declared, `bloco ${b.n}`).toBe(b.steps.length);
  });

  it('a passada visual está só no bloco 1', () => {
    expect(blocks.filter((b) => b.visual).map((b) => b.n)).toEqual([1]);
  });

  it('os roteiros de cada bloco são aceitos pelo round-guide.mjs', async () => {
    const mod: {
      buildRoundGuide: (
        md: string,
        roteiros: string[],
        o?: { commit?: string },
      ) => string;
    } = await import('../../scripts/testing/round-guide.mjs');
    expect(blocks.length).toBe(3);
    for (const b of blocks) {
      const out = mod.buildRoundGuide(GUIDE, b.roteiros, { commit: 'abc1234' });
      for (const r of b.roteiros)
        expect(out, `bloco ${b.n}`).toMatch(new RegExp(`^### ${r} `, 'm'));
    }
  });
});
