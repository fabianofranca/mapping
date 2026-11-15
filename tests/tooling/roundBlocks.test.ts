// @vitest-environment node
// Stage #424 (PL1, decision 2): the full round runs in parallel blocks (5, stage #841, RB4). The blocks table
// of docs/TESTING-NUVEM.md is checked against the steps of docs/TESTING.md: a new test script (R26)
// or a new step outside the table makes this test fail until it is put in a block.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Stage #841 (decision 6): the generated guide of each block has up to 200 thousand characters. TE1 (#1557)
 * raised the ceiling by 500 (to 200,500): the additions of R23.12 and R23.13 (dark theme) took
 * block 5 to 200.2 thousand, and the five blocks were already stuck to the ceiling. Stage #824 (ID8, English
 * translation plus the new steps R8.6 and R11.15) left it as it was: the largest block, 3, measures 200,463.
 */
const MAX_BLOCK_GUIDE_CHARS = 200_500;

/**
 * Stage #1533 (TE1, decisions 3 and 5): the limit above measures what the tester reads, the block's guide without the
 * on-demand sections (`mandatoryOnly`: the mandatory base plus the test scripts), and the base of each block
 * (without the test scripts, which come out through `passo`) has up to 45 thousand characters (the largest base, block 2, measures 43,773 after the translation).
 */
const MAX_BLOCK_BASE_CHARS = 45_000;

const GUIDE = readFileSync('docs/TESTING.md', 'utf8');
const CLOUD = readFileSync('docs/TESTING-NUVEM.md', 'utf8');

const STEP_RE = /^\|\s*(?:\*\*)?(R\d+\.\d+[a-z]?)(?:\*\*)?[^|]*\|/;

/** The steps of the main test scripts (R0 to R28), in the order of the guide, outside the on-demand test scripts. */
function guideSteps(): string[] {
  const lines = GUIDE.split('\n');
  const start = lines.findIndex((l) => /^## 8\. Test scripts/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^### On-demand scripts/.test(l));
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
  /** The steps of the block (R0 included). */
  steps: string[];
  /** The test scripts the block's round guide needs (R6 comes in through R6.3 and R6.8a). */
  scripts: string[];
  /** The items `round-guide.mjs` receives: the whole test script or the step range (`R6.3-R6.7`) the table gives the block. */
  guideItems: string[];
  section6: boolean;
  visual: boolean;
  declared: number;
}

const scriptOf = (step: string): string => step.split('.')[0] as string;

/** Expands a table item ("R7", "R6.3 to R6.7") into steps, in the order of the guide. */
function expand(token: string, steps: string[]): string[] {
  const range = /^(R\d+\.\d+[a-z]?) to (R\d+\.\d+[a-z]?)$/.exec(token);
  if (range) {
    const from = steps.indexOf(range[1] as string);
    const to = steps.indexOf(range[2] as string);
    if (from < 0 || to < from) throw new Error(`invalid range: ${token}`);
    return steps.slice(from, to + 1);
  }
  if (/^R\d+\.\d+[a-z]?$/.test(token)) {
    if (!steps.includes(token)) throw new Error(`nonexistent step: ${token}`);
    return [token];
  }
  if (/^R\d+$/.test(token)) {
    const all = steps.filter((s) => scriptOf(s) === token);
    if (all.length === 0) throw new Error(`nonexistent test script: ${token}`);
    return all;
  }
  return [];
}

/** Reads the table of the "Full round in blocks" section of docs/TESTING-NUVEM.md. */
function readBlocks(steps: string[]): Block[] {
  const lines = CLOUD.split('\n');
  const start = lines.findIndex((l) => /^## Full round in blocks\s*$/.test(l));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const blocks: Block[] = [];
  for (const line of lines.slice(start, end < 0 ? lines.length : end)) {
    const m = /^\|\s*(\d+)\s*\|([^|]*)\|\s*(\d+)\s*\|/.exec(line);
    if (!m) continue;
    const cell = (m[2] as string).trim();
    const items = cell
      .replace(/ and the visual pass$/, ', visual pass')
      .split(/,\s*| and /)
      .map((t) => t.trim())
      .filter(Boolean);
    const own = items.flatMap((t) => expand(t, steps));
    blocks.push({
      n: Number(m[1]),
      steps: own,
      scripts: [...new Set(own.map(scriptOf))],
      guideItems: items
        .filter((t) => /^R\d+/.test(t))
        .map((t) => t.replace(/^(R\d+\.\d+[a-z]?) to (R\d+\.\d+[a-z]?)$/, '$1-$2')),
      section6: items.includes('section 6'),
      visual: items.includes('visual pass'),
      declared: Number(m[3]),
    });
  }
  return blocks;
}

const steps = guideSteps();
const blocks = readBlocks(steps);
const blockOf = (step: string): number[] =>
  blocks.filter((b) => b.steps.includes(step)).map((b) => b.n);

describe('split of the full round into 5 blocks (stages #424 and #841)', () => {
  it('the guide has the steps from R0 to R28 and the table has 5 blocks numbered 1 to 5', () => {
    expect(steps.length).toBeGreaterThan(200);
    expect(steps.some((s) => s.startsWith('R17.'))).toBe(true);
    expect(steps.some((s) => s.startsWith('R26.'))).toBe(true);
    expect(blocks.map((b) => b.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it('every step from R0 to R28 is in exactly one block, and R0 in all of them', () => {
    for (const s of steps) {
      const where = blockOf(s);
      if (scriptOf(s) === 'R0') expect(where, s).toEqual([1, 2, 3, 4, 5]);
      else expect(where, `${s} must be in a single block`).toHaveLength(1);
    }
  });

  it('the dependencies of section 8 stay in the same block', () => {
    const together = (group: string[]): void => {
      const ids = group.flatMap((t) => expand(t, steps));
      const where = new Set(ids.map((s) => blockOf(s)[0]));
      expect(where.has(undefined), `${group.join(', ')} outside the table`).toBe(false);
      expect([...where], group.join(', ')).toHaveLength(1);
    };
    together(['R1', 'R3', 'R5', 'R6.3 to R6.7', 'R6.12 to R6.13', 'R7', 'R8']);
    together(['R4', 'R6.8a to R6.11']);
    together(['R9', 'R10']);
  });

  it('each chain of the directed round in groups (TR4, decision 16) exists in the guide and stays in a single block', async () => {
    const mod: { CHAINS: { name: string; items: string[] }[] } =
      await import('../../scripts/testing/round-guide.mjs');
    expect(mod.CHAINS.length).toBeGreaterThan(2);
    for (const chain of mod.CHAINS) {
      const ids = chain.items.flatMap((t) => expand(t.replace('-', ' to '), steps));
      expect(ids.length, chain.name).toBeGreaterThan(0);
      const where = new Set(ids.map((s) => blockOf(s)[0]));
      expect(where.has(undefined), `${chain.name} outside the table`).toBe(false);
      expect([...where], chain.name).toHaveLength(1);
    }
  });

  it('section 6 is in every block with R3, R5, R9, R12, R16 or R17', () => {
    for (const b of blocks) {
      const needs = b.scripts.some((r) =>
        ['R3', 'R5', 'R9', 'R12', 'R16', 'R17'].includes(r),
      );
      if (needs) expect(b.section6, `block ${b.n}`).toBe(true);
    }
  });

  it('the Steps column of each block is the real count (R0 included)', () => {
    for (const b of blocks) expect(b.declared, `block ${b.n}`).toBe(b.steps.length);
  });

  it('the visual pass is in exactly one block, the one the table says', () => {
    const visual = blocks.filter((b) => b.visual);
    expect(visual).toHaveLength(1);
    const owner = visual[0] as Block;
    // Stage #482 (GT3, decision 7): it leaves block 1, the `principal` chain, which is the slowest.
    expect(owner.n).not.toBe(1);
    // The block needs what the default list opens: the leave-review dialog, through R4.
    expect(owner.scripts).toContain('R4');
    // The "Why" line and the messages cite the same block, never block 1.
    expect(CLOUD).toMatch(new RegExp(`The visual pass stays in block ${owner.n}\\b`));
    expect(CLOUD).toMatch(
      new RegExp(`only \\*\\*block ${owner.n}\\*\\* does the visual pass`),
    );
    for (const [name, text] of [
      ['TESTING-NUVEM', CLOUD],
      ['FLOW', readFileSync('docs/FLOW.md', 'utf8')],
      ['PROCESS', readFileSync('docs/PROCESS.md', 'utf8')],
      ['CLAUDE', readFileSync('CLAUDE.md', 'utf8')],
    ] as const) {
      expect(text, name).not.toMatch(/visual pass[^.\n]{0,40}only[^.\n]{0,20}block 1/i);
      expect(text, name).not.toMatch(/in block 1[^.\n]{0,40}visual pass/i);
      expect(text, name).not.toMatch(/(goes|does) only in block 1/);
    }
  });

  it('the test scripts of each block are accepted by round-guide.mjs', async () => {
    const mod: {
      buildRoundGuide: (
        md: string,
        scripts: string[],
        o?: { commit?: string; mandatoryOnly?: boolean },
      ) => string;
      buildGuideBase: (md: string, scripts: string[], o?: { commit?: string }) => string;
    } = await import('../../scripts/testing/round-guide.mjs');
    expect(blocks.length).toBe(5);
    for (const b of blocks) {
      // As in item 1 of "modo completo, bloco k de 5": the test script that the table splits between blocks comes in only
      // through the block's step range (`R6.3-R6.7`), without the rest of the test script.
      const out = mod.buildRoundGuide(GUIDE, b.guideItems, {
        commit: 'abc1234',
        mandatoryOnly: true,
      });
      for (const r of b.scripts)
        expect(out, `block ${b.n}`).toMatch(new RegExp(`^### ${r} `, 'm'));
      expect(out.length, `block ${b.n}`).toBeLessThanOrEqual(MAX_BLOCK_GUIDE_CHARS);
      const base = mod.buildGuideBase(GUIDE, b.guideItems, { commit: 'abc1234' });
      expect(base.length, `base of block ${b.n}`).toBeLessThanOrEqual(
        MAX_BLOCK_BASE_CHARS,
      );
    }
  });
});
