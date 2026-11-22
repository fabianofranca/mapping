// @vitest-environment node
// Phase TS1 (stage #421, decision 7): `round-guide.mjs` generates the round guide from
// docs/TESTING.md, without the test scripts not requested, the on-demand ones, section 9 and the real-use record.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const GUIDE = readFileSync('docs/TESTING.md', 'utf8');
const SCRIPT = 'scripts/testing/round-guide.mjs';

async function build(scripts: string[]): Promise<string> {
  const mod: {
    buildRoundGuide: (
      md: string,
      scripts: string[],
      options?: { commit?: string },
    ) => string;
  } = await import('../../scripts/testing/round-guide.mjs');
  return mod.buildRoundGuide(GUIDE, scripts, { commit: 'abc1234' });
}

describe('round-guide.mjs (TS1, decision 7)', () => {
  it('R0 R2 R4 R11: has the four test scripts, the template and appendix A; no R1, no section 9', async () => {
    const out = await build(['R0', 'R2', 'R4', 'R11']);
    for (const r of ['R0', 'R2', 'R4', 'R11']) {
      expect(out, r).toMatch(new RegExp(`^### ${r} `, 'm'));
    }
    expect(out).not.toMatch(/^### R1 /m);
    expect(out).not.toMatch(/^### R12 /m);
    expect(out).not.toContain('## 9. Advanced manual testing');
    expect(out).not.toContain('### On-demand scripts (manual)');
    expect(out).not.toContain('### Real-use milestone record');
    expect(out).toContain('### Round report');
    expect(out).toContain('## Appendix A');
    expect(out).toContain('## Appendix B');
    expect(out).toContain('## Start here');
    expect(out).toContain('**Conventions.**');
  });

  it('the first line gives the commit, the test scripts and says the whole guide is docs/TESTING.md', async () => {
    const out = await build(['R0', 'R2']);
    const first = out.split('\n')[0] ?? '';
    expect(first).toContain('abc1234');
    expect(first).toContain('R0');
    expect(first).toContain('R2');
    expect(first).toContain('docs/TESTING.md');
  });

  it('the "Start here" table carries only the rows of the requested test scripts and the section 6 one', async () => {
    const out = await build(['R0', 'R2']);
    expect(out).toContain('| 1 | R0 — Setup and smoke test |');
    expect(out).toContain('| 3 | R2 — Project on this device and zip |');
    expect(out).toContain('| 4 | Section 6 — test repository and MCP |');
    expect(out).not.toContain('| 2 | R1 — Main script |');
    expect(out).not.toContain('| 27 | R25 — Faithful components |');
    expect(out).not.toMatch(/^\| on demand \|/m);
    // The whole table stays in the complete guide.
    expect(GUIDE).toContain('| 27 | R25 — Faithful components |');
    const rows = (await build(['R25'])).match(/^\| (?:\d+|on demand) \|/gm);
    expect(rows).toHaveLength(2);
  });

  it('stays below 35% of the guide for R0, R2, R4 and R11', async () => {
    const out = await build(['R0', 'R2', 'R4', 'R11']);
    expect(Buffer.byteLength(out)).toBeLessThan(Buffer.byteLength(GUIDE) * 0.35);
  });

  it('every ### R<n> of the guide is accepted, and only it gets in', async () => {
    const ids = [...GUIDE.matchAll(/^### (R\d+) /gm)].map((m) => m[1] as string);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      const out = await build([id]);
      const headings = [...out.matchAll(/^### (R\d+) /gm)].map((m) => m[1]);
      expect(headings, id).toEqual([id]);
    }
  });

  it('all keeps R0 to R25, in the order of the guide, still without section 9', async () => {
    const out = await build(['all']);
    const ids = [...GUIDE.matchAll(/^### (R\d+) /gm)].map((m) => m[1]);
    expect([...out.matchAll(/^### (R\d+) /gm)].map((m) => m[1])).toEqual(ids);
    expect(out).not.toContain('## 9. Advanced manual testing');
  });

  it('does not mistake a "#" inside a code block for a heading', async () => {
    const out = await build(['R0']);
    expect(out).toContain('# Test report — Mapping');
  });

  it('a nonexistent test script fails with the list of the existing ones', async () => {
    await expect(build(['R99'])).rejects.toThrow(/R99[\s\S]*R0[\s\S]*R17/);
  });

  it('the CLI writes to --out and a nonexistent test script exits with code 2', () => {
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

// Stage #841 (RB1, decisions 1 and 2): the round guide cuts what the block does not use.
const FIXTURE = [
  '# Guide',
  '',
  '## 8. Test scripts',
  '',
  'Base.',
  '',
  '- common to all',
  '<!-- roteiros: R2 R3 -->',
  '- only R2 and R3',
  '<!-- /roteiros -->',
  '- another common one',
  '',
  '### R1 — One',
  '',
  '| Step | Action | Expected |',
  '| --- | --- | --- |',
  '| R1.1 | a | b |',
  '',
  '### R2 — Two',
  '',
  'R2 setup.',
  '',
  '| Step | Action | Expected |',
  '| --- | --- | --- |',
  '| R2.1 | a | b |',
  '| R2.2 | c | d |',
  '| R2.2b | c | d |',
  '| R2.3 | e | f |',
  '',
  '### R3 — Three',
  '',
  '| Step | Action | Expected |',
  '| --- | --- | --- |',
  '| R3.1 | a | b |',
  '',
].join('\n');

async function buildFrom(md: string, scripts: string[]): Promise<string> {
  const mod: {
    buildRoundGuide: (
      md: string,
      scripts: string[],
      options?: { commit?: string },
    ) => string;
  } = await import('../../scripts/testing/round-guide.mjs');
  return mod.buildRoundGuide(md, scripts, { commit: 'abc1234' });
}

describe('round-guide.mjs: passages marked by test script (RB1, decisions 1 and 2)', () => {
  it('a requested test script carries the passages marked with it', async () => {
    const out = await buildFrom(FIXTURE, ['R2']);
    expect(out).toContain('only R2 and R3');
    const out3 = await buildFrom(FIXTURE, ['R3']);
    expect(out3).toContain('only R2 and R3');
  });

  it('a test script not requested does not carry the passage; the unmarked one goes in all', async () => {
    const out = await buildFrom(FIXTURE, ['R1']);
    expect(out).not.toContain('only R2 and R3');
    expect(out).toContain('common to all');
    expect(out).toContain('another common one');
  });

  it('the markers do not show in the generated guide', async () => {
    for (const requested of [['R1'], ['R2'], ['all']]) {
      const out = await buildFrom(FIXTURE, requested);
      expect(out).not.toContain('<!-- roteiros');
      expect(out).not.toContain('<!-- /roteiros');
    }
  });

  it('a marker with a nonexistent test script fails', async () => {
    const bad = FIXTURE.replace('R2 R3 -->', 'R2 R99 -->');
    await expect(buildFrom(bad, ['R1'])).rejects.toThrow(/R99/);
  });

  it('a marker without a closing fails', async () => {
    const bad = FIXTURE.replace('<!-- /roteiros -->\n', '');
    await expect(buildFrom(bad, ['R1'])).rejects.toThrow(/roteiros/);
  });

  it('in docs/TESTING.md, every marker cites only test scripts that exist and opens and closes in pairs', () => {
    const existing = new Set([...GUIDE.matchAll(/^### (R\d+) /gm)].map((m) => m[1]));
    let open = false;
    for (const line of GUIDE.split('\n')) {
      const m = /^<!-- roteiros: ([^>]*?) -->$/.exec(line);
      if (m) {
        expect(open, 'marker opened inside another').toBe(false);
        open = true;
        for (const id of (m[1] as string).trim().split(/\s+/)) {
          expect(existing.has(id), `test script ${id}`).toBe(true);
        }
      } else if (line === '<!-- /roteiros -->') {
        expect(open, 'closing without an opening').toBe(true);
        open = false;
      }
    }
    expect(open).toBe(false);
  });

  it('in docs/TESTING.md, the guide of a test script carries all the passages marked with it, and only its own', async () => {
    const lines = GUIDE.split('\n');
    const chunks: { ids: string[]; first: string }[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const m = /^<!-- roteiros: ([^>]*?) -->$/.exec(lines[i] as string);
      if (m) {
        const first = lines.slice(i + 1).find((l) => l.trim() !== '') as string;
        chunks.push({ ids: (m[1] as string).trim().split(/\s+/), first });
      }
    }
    expect(chunks.length).toBeGreaterThan(5);
    const scripts = [...GUIDE.matchAll(/^### (R\d+) /gm)].map((m) => m[1] as string);
    for (const id of ['R0', 'R12', 'R25']) {
      const out = await build([id]);
      for (const c of chunks) {
        if (c.ids.includes(id))
          expect(out, `${id}: ${c.first.slice(0, 50)}`).toContain(c.first);
        else if (!c.ids.some((x) => x === id)) {
          // a passage of other test scripts only gets in if the text also appears outside the marker
          if (GUIDE.split(c.first).length === 2) expect(out).not.toContain(c.first);
        }
      }
    }
    expect(scripts.length).toBeGreaterThan(20);
  });

  it('all generates every test script and loses no marked passage', async () => {
    const out = await build(['all']);
    const lines = GUIDE.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (/^<!-- roteiros: /.test(lines[i] as string)) {
        const first = lines.slice(i + 1).find((l) => l.trim() !== '') as string;
        expect(out).toContain(first);
      }
    }
  });
});

describe('round-guide.mjs: step range (RB1, decision 1c)', () => {
  it('R2.1-R2.2 carries only those steps, with the heading and the setup of the test script', async () => {
    const out = await buildFrom(FIXTURE, ['R2.1-R2.2']);
    expect(out).toMatch(/^### R2 /m);
    expect(out).toContain('R2 setup.');
    expect(out).toContain('| R2.1 |');
    expect(out).toContain('| R2.2 |');
    expect(out).not.toContain('| R2.2b |');
    expect(out).not.toContain('| R2.3 |');
    expect(out).not.toMatch(/^### R1 /m);
    expect(out).toContain('only R2 and R3');
  });

  it('two ranges of the same test script are added, and the whole test script wins over the range', async () => {
    const two = await buildFrom(FIXTURE, ['R2.1-R2.1', 'R2.3-R2.3']);
    expect(two).toContain('| R2.1 |');
    expect(two).toContain('| R2.3 |');
    expect(two).not.toContain('| R2.2 |');
    const whole = await buildFrom(FIXTURE, ['R2', 'R2.1-R2.1']);
    expect(whole).toContain('| R2.3 |');
  });

  // CL1 / T9: a single step (`R2.1`) counts as a one-step range.
  it('a single step (R2.1, R0.1) counts as a one-step range', async () => {
    const out = await buildFrom(FIXTURE, ['R2.1', 'R2.3']);
    expect(out).toContain('| R2.1 |');
    expect(out).toContain('| R2.3 |');
    expect(out).not.toContain('| R2.2 |');
    expect(out).toMatch(/^### R2 /m);
  });

  it('a single step with a letter (R6.8a) keeps the lowercase letter', async () => {
    const out = await build(['R6.8a']);
    expect(out).toContain('| R6.8a |');
    expect(out).not.toContain('| R6.8b |');
  });

  it('a range with a nonexistent step fails', async () => {
    await expect(buildFrom(FIXTURE, ['R2.1-R2.9'])).rejects.toThrow(/R2\.9/);
  });

  it('in the real guide, R6.3-R6.7 carries only those steps of R6', async () => {
    const out = await build(['R6.3-R6.7']);
    for (const p of ['R6.3', 'R6.3b', 'R6.4', 'R6.5', 'R6.6', 'R6.7']) {
      expect(out, p).toMatch(new RegExp(`^\\| ${p.replace('.', '\\.')} \\|`, 'm'));
    }
    for (const p of ['R6.8a', 'R6.8b', 'R6.9', 'R6.10', 'R6.11']) {
      expect(out, p).not.toMatch(new RegExp(`^\\| ${p.replace('.', '\\.')} \\|`, 'm'));
    }
  });
});

// Stage #1148 (TR4, decisions 15 to 17): `--grupos` splits a large directed round into parallel groups.
interface GroupPlan {
  items: { token: string; steps: number }[];
  total: number;
  single: boolean;
  groups: { n: number; tokens: string[]; steps: number }[];
}
interface GroupsModule {
  planGroups: (md: string, scripts: string[], o?: { limit?: number }) => GroupPlan;
  formatGroupPlan: (plan: GroupPlan) => string;
  CHAINS: { name: string; items: string[] }[];
}
const loadGroups = (): Promise<GroupsModule> =>
  import('../../scripts/testing/round-guide.mjs') as unknown as Promise<GroupsModule>;

describe('round-guide.mjs --grupos (TR4, decisions 15 to 17)', () => {
  it('R0 R12 R22 R23: R0 does not count and three groups come out, R12; R23; R22', async () => {
    const { planGroups } = await loadGroups();
    const plan = planGroups(GUIDE, ['R0', 'R12', 'R22', 'R23']);
    expect(plan.single).toBe(false);
    expect(plan.items.map((i) => i.token)).toEqual(['R12', 'R22', 'R23']);
    expect(plan.total).toBeGreaterThan(40);
    expect(plan.groups.map((g) => g.tokens)).toEqual([['R12'], ['R23'], ['R22']]);
  });

  it('R1 R3 R5 is a single chain: one group, even above the limit', async () => {
    const { planGroups } = await loadGroups();
    const plan = planGroups(GUIDE, ['R1', 'R3', 'R5']);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]?.tokens).toEqual(['R1', 'R3', 'R5']);
  });

  it('up to the limit it is one session, and R0 alone generates no group', async () => {
    const { planGroups, formatGroupPlan } = await loadGroups();
    const plan = planGroups(GUIDE, ['R0', 'R2']);
    expect(plan.single).toBe(true);
    expect(plan.groups).toEqual([]);
    expect(formatGroupPlan(plan)).toContain('uma sessão');
  });

  it('the requested ranges stay as requested and a test script is never split', async () => {
    const { planGroups } = await loadGroups();
    const plan = planGroups(GUIDE, ['R6.3-R6.7', 'R6.8a-R6.11', 'R12']);
    const all = plan.groups.flatMap((g) => g.tokens);
    expect(all).toContain('R6.3-R6.7');
    expect(all).toContain('R6.8a-R6.11');
    expect(all.filter((t) => t === 'R12')).toHaveLength(1);
  });

  it('never goes over 5 groups and each group carries the summed steps', async () => {
    const { planGroups } = await loadGroups();
    const plan = planGroups(GUIDE, ['all']);
    expect(plan.groups.length).toBeLessThanOrEqual(5);
    const sum = plan.groups.reduce((n, g) => n + g.steps, 0);
    expect(sum).toBe(plan.total);
  });

  it('--grupos on the CLI prints one line "grupo k de n: <scripts>" per group', () => {
    const out = execFileSync('node', [SCRIPT, '--grupos', 'R0', 'R12', 'R22', 'R23'], {
      encoding: 'utf8',
    });
    expect(out).toMatch(/^grupo 1 de 3: R12$/m);
    expect(out).toMatch(/^grupo 2 de 3: R23$/m);
    expect(out).toMatch(/^grupo 3 de 3: R22$/m);
  });

  it('the chains table of TESTING-NUVEM-CONSULTA.md carries each item of the chains of the script', async () => {
    const { CHAINS } = await loadGroups();
    const reference = readFileSync('docs/TESTING-NUVEM-CONSULTA.md', 'utf8');
    const start = reference.indexOf('## Directed round in groups');
    expect(start).toBeGreaterThan(0);
    const section = reference.slice(start, reference.indexOf('\n## ', start + 5));
    for (const chain of CHAINS) {
      for (const item of chain.items) {
        expect(section, item).toContain(item.replace('-', ' to '));
      }
    }
  });
});

// Stage #1232 (GL1): the round guide in base, index and on-demand excerpts (`cloud.mjs passo`).
describe('round-guide.mjs: base, index and excerpts (#1232, GL1)', () => {
  const STEP_LINE = /^\|\s*(?:\*\*)?(R\d+\.\d+[a-z]?)(?:\*\*)?[^|]*\|/;
  const HEADER = ['| Step | Action | Expected |', '| --- | --- | --- |'];

  async function load() {
    return import('../../scripts/testing/round-guide.mjs');
  }

  async function guideOf(scripts: string[]): Promise<string> {
    const { buildRoundGuide } = await load();
    return buildRoundGuide(GUIDE, scripts, { commit: 'abc1234' });
  }

  /** Codes of the steps of each test script of the generated guide, outside code blocks. */
  function stepsOf(guide: string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    let id = '';
    let fence = false;
    for (const line of guide.split('\n')) {
      if (/^\s*(`{3,}|~{3,})/.test(line)) fence = !fence;
      const heading = fence ? null : /^### (R\d+)\b/.exec(line);
      if (heading) {
        id = heading[1] as string;
        map.set(id, []);
        continue;
      }
      if (/^#{2,3} /.test(line) && !fence) id = '';
      const code = !fence && id ? STEP_LINE.exec(line)?.[1] : undefined;
      if (code) map.get(id)?.push(code);
    }
    return map;
  }

  describe('buildGuideBase', () => {
    it('R0 R22: no test script section, only one command line per test script', async () => {
      const { buildGuideBase } = await load();
      const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
      const headings = base.split('\n').filter((l) => /^### R\d+/.test(l));
      expect(headings).toHaveLength(2);
      expect(headings[0]).toMatch(
        /^### R0 — .+: `node scripts\/testing\/cloud\.mjs passo R0`$/,
      );
      expect(headings[1]).toMatch(
        /^### R22 — .+: `node scripts\/testing\/cloud\.mjs passo R22`$/,
      );
      expect(base).not.toMatch(/^\| R(?:0|22)\.\d+[a-z]? \|/m);
      expect(base).not.toContain('**What it covers:**');
      expect(base).not.toMatch(/^#### R12\./m);
    });

    it('keeps "Start here", sections 1 to 7, the template and appendices A and B', async () => {
      const { buildGuideBase } = await load();
      const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
      expect(base).toContain('## Start here');
      for (const n of [1, 2, 3, 4, 5, 6, 7]) {
        expect(base, `section ${n}`).toMatch(new RegExp(`^## ${n}\\. `, 'm'));
      }
      expect(base).toMatch(/^## 8\. /m);
      expect(base).toContain('### Round report');
      expect(base).toContain('## Appendix A');
      expect(base).toContain('## Appendix B');
      expect(base).not.toContain('## 9. Advanced manual testing');
    });

    it('the top note is the same, with the index sentence on the next line', async () => {
      const { buildGuideBase } = await load();
      const guide = await guideOf(['R0', 'R22']);
      const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
      const [note, sentence] = base.split('\n');
      expect(note).toBe(guide.split('\n')[0]);
      expect(sentence).toBe(
        '> The scripts are printed by `cloud.mjs passo`; the index is in `guia-indice.tsv`. The on-demand sections are printed by `cloud.mjs secao <key>` (without a key, it lists them).',
      );
      const named = buildGuideBase(GUIDE, ['R0'], { commit: 'abc1234', name: 'round' });
      expect(named.split('\n')[1]).toContain('`round-indice.tsv`');
    });

    it('the marked passages follow the rule of the guide: only those that cite a requested test script get in', async () => {
      const { buildGuideBase } = await load();
      const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
      // Marked passages outside any test script section (the inner ones go with the section).
      let heading = '';
      let open: { ids: string[]; first?: string; outside: boolean } | null = null;
      let checked = 0;
      for (const line of GUIDE.split('\n')) {
        const h = /^#{2,3} (.*)$/.exec(line);
        if (h && !open) heading = h[1] as string;
        const mark = /^<!-- roteiros: ([^>]*?) -->$/.exec(line);
        if (mark) {
          open = {
            ids: (mark[1] as string).trim().split(/\s+/),
            outside: !/^R\d+\b/.test(heading),
          };
        } else if (line === '<!-- /roteiros -->') {
          if (open?.outside && open.first) {
            const keep = open.ids.some((id) => ['R0', 'R22'].includes(id));
            expect(base.includes(open.first), open.first).toBe(keep);
            checked += 1;
          }
          open = null;
        } else if (open && !open.first && line.trim() && !h) {
          open.first = line;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  });

  describe('coverage (decision 9)', () => {
    async function missingLines(scripts: string[]): Promise<string[]> {
      const { buildGuideBase, guideExcerpt, guideSection, SECOES_SOB_DEMANDA } =
        await load();
      const guide = await guideOf(scripts);
      const covered = new Set(
        buildGuideBase(GUIDE, scripts, { commit: 'abc1234' }).split('\n'),
      );
      for (const s of SECOES_SOB_DEMANDA.filter((e) => e.fonte === 'guia')) {
        for (const line of guideSection(guide, [s.chave]).split('\n')) covered.add(line);
      }
      for (const [id, codes] of stepsOf(guide)) {
        for (const line of guideExcerpt(guide, [id]).split('\n')) covered.add(line);
        for (let i = 0; i < codes.length; i += 8) {
          const batch = codes.slice(i, i + 8);
          const first = batch[0] as string;
          const last = batch[batch.length - 1] as string;
          const out = guideExcerpt(guide, [first === last ? first : `${first}-${last}`]);
          expect(out, `${first}-${last}`).not.toContain('… cut at');
          for (const line of out.split('\n')) covered.add(line);
        }
      }
      return guide.split('\n').filter((line) => line.trim() && !covered.has(line));
    }

    it('R0 R12 R22: every line of the guide is in the base, in a secao or in a step of some test script', async () => {
      expect(await missingLines(['R0', 'R12', 'R22'])).toEqual([]);
    });

    it('all: nothing in the round guide is left without a way to read it (base, secao or step)', async () => {
      expect(await missingLines(['all'])).toEqual([]);
    }, 60000);
  });

  describe('buildGuideIndex', () => {
    it('header, kinds and keys: sections, test scripts and steps', async () => {
      const { buildGuideIndex } = await load();
      const guide = await guideOf(['R0', 'R12', 'R22']);
      const rows = buildGuideIndex(guide).trimEnd().split('\n');
      expect(rows[0]).toBe('tipo\tchave\tini\tfim\ttítulo');
      const cells = rows.slice(1).map((r) => r.split('\t'));
      for (const c of cells) {
        expect(c, c.join('|')).toHaveLength(5);
        expect(['secao', 'roteiro', 'passo']).toContain(c[0]);
        expect(Number(c[2])).toBeGreaterThan(0);
        expect(Number(c[3])).toBeGreaterThanOrEqual(Number(c[2]));
      }
      const scripts = cells.filter((c) => c[0] === 'roteiro');
      expect(scripts.map((c) => c[1])).toEqual(['R0', 'R12', 'R22']);
      const sections = cells.filter((c) => c[0] === 'secao').map((c) => c[1]);
      expect(sections).toContain('Start here');
      expect(sections.some((s) => /^R\d+/.test(s as string))).toBe(false);
      expect(sections.some((s) => /^Appendix A/.test(s as string))).toBe(true);
    });

    it('the ini to fim lines of guia.md are the step line, and the test scripts and sections start at the heading', async () => {
      const { buildGuideIndex } = await load();
      const guide = await guideOf(['R0', 'R12', 'R22']);
      const lines = guide.split('\n');
      const cells = buildGuideIndex(guide)
        .trimEnd()
        .split('\n')
        .slice(1)
        .map((r) => r.split('\t'));
      const stepCells = cells.filter((c) => c[0] === 'passo');
      let total = 0;
      for (const codes of stepsOf(guide).values()) total += codes.length;
      expect(stepCells).toHaveLength(total);
      for (const [, key, from, to, title] of stepCells) {
        const row = lines.slice(Number(from) - 1, Number(to)).join('\n');
        expect(from).toBe(to);
        expect(STEP_LINE.exec(row)?.[1], key).toBe(key);
        expect((title as string).length).toBeLessThanOrEqual(80);
      }
      for (const [kind, key, from, to, title] of cells.filter((c) => c[0] !== 'passo')) {
        const first = lines[Number(from) - 1] as string;
        expect(first.startsWith('#'), `${kind} ${key}`).toBe(true);
        expect(first.endsWith(title as string), `${kind} ${key}`).toBe(true);
        if (kind === 'roteiro') {
          expect(first).toMatch(new RegExp(`^### ${key} `));
          expect(lines[Number(to)] ?? '').toMatch(/^#{2,3} |^$/);
        }
      }
    });
  });

  describe('guideExcerpt', () => {
    it('R22: the "What it covers", the setup and a Steps line in place of the step lines', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['R22']);
      const out = guideExcerpt(guide, ['R22']);
      expect(out).toContain('**What it covers:**');
      expect(out).toContain('**Setup.**');
      expect(out).toContain('Steps (25): R22.1, R22.2, …, R22.24');
      expect(out).not.toMatch(/^\| R22\.\d/m);
      expect(out.split('\n').filter((l) => l.startsWith('Steps ('))).toHaveLength(1);
    });

    it('R12: the six subsections with their setups and one Steps line per table excerpt', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['R12']);
      const out = guideExcerpt(guide, ['R12']);
      expect(out).toContain('#### R12.17 to R12.22');
      expect(out).toContain('#### R12.23 to R12.28');
      expect(out).toContain('#### R12.34 to R12.40');
      expect(out).toContain('#### R12.41 to R12.43');
      expect(out).toContain('#### R12.44');
      expect(out).toContain('#### R12.45 to R12.56');
      expect(out).toContain('#### R12.57 to R12.60');
      expect(
        out.match(/\*\*(?:Setup|Preparation)\.\*\*/g)?.length,
      ).toBeGreaterThanOrEqual(7);
      const steps = out.split('\n').filter((l) => l.startsWith('Steps ('));
      expect(steps).toHaveLength(8);
      const sum = steps.reduce((n, l) => n + Number(/^Steps \((\d+)\)/.exec(l)?.[1]), 0);
      expect(sum).toBe(80);
      expect(out).not.toMatch(/^\| R12\.\d/m);
    });

    it('R22.4: the table header and the step line', async () => {
      const { guideExcerpt } = await load();
      const out = guideExcerpt(await guideOf(['R22']), ['R22.4']).split('\n');
      expect(out.slice(0, 2)).toEqual(HEADER);
      expect(out).toHaveLength(3);
      expect(out[2]).toMatch(/^\| R22\.4 \|/);
    });

    it('R22.3-R22.6: the header and the five lines, with R22.6a', async () => {
      const { guideExcerpt } = await load();
      const out = guideExcerpt(await guideOf(['R22']), ['R22.3-R22.6']).split('\n');
      expect(out.slice(0, 2)).toEqual(HEADER);
      expect(out.slice(2).map((l) => STEP_LINE.exec(l)?.[1])).toEqual([
        'R22.3',
        'R22.4',
        'R22.5',
        'R22.6',
        'R22.6a',
      ]);
    });

    it('R12.16-R12.17 keeps the subsection and the setup that sit between the two lines', async () => {
      const { guideExcerpt } = await load();
      const out = guideExcerpt(await guideOf(['R12']), ['R12.16-R12.17']);
      const at = (needle: string | RegExp) =>
        typeof needle === 'string' ? out.indexOf(needle) : out.search(needle);
      // The docs say "Preparation." in R12 and "Setup." in R22 (see the report).
      const setup = /\*\*(?:Setup|Preparation)\.\*\*/;
      expect(at('| R12.16 |')).toBeGreaterThan(0);
      expect(at('#### R12.17 to R12.22')).toBeGreaterThan(at('| R12.16 |'));
      expect(at(setup)).toBeGreaterThan(at('#### R12.17 to R12.22'));
      expect(at('| R12.17 |')).toBeGreaterThan(at(setup));
    });

    it('several items come out in the requested order, separated by ---', async () => {
      const { guideExcerpt } = await load();
      const out = guideExcerpt(await guideOf(['R12', 'R22']), ['R22.4', 'R12.12']);
      const parts = out.split('\n---\n');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^\| Step \|[^\n]*\n\| --- \|[^\n]*\n\| R22\.4 \|/);
      expect(parts[1]).toMatch(/\n\| R12\.12 \|/);
    });

    it('goes over 25,000 characters: cuts at the last whole line and says how to continue', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['all']);
      const out = guideExcerpt(guide, ['R25.1-R25.66']);
      expect(out.length).toBeLessThanOrEqual(25000);
      const lines = out.split('\n');
      const last = lines[lines.length - 1] as string;
      const match =
        /^… cut at 25,000 characters: continue with cloud\.mjs passo (R25\.\w+)-R25\.66$/.exec(
          last,
        );
      expect(match).not.toBeNull();
      const next = match?.[1] as string;
      const guideLines = new Set(guide.split('\n'));
      for (const line of lines.slice(0, -1)) expect(guideLines.has(line)).toBe(true);
      expect(out).not.toMatch(new RegExp(`^\\| ${next.replace('.', '\\.')} \\|`, 'm'));
      const before = lines.slice(0, -1).filter((l) => STEP_LINE.test(l));
      const prev = STEP_LINE.exec(before[before.length - 1] as string)?.[1] as string;
      const codes = stepsOf(guide).get('R25') as string[];
      expect(codes.indexOf(next)).toBe(codes.indexOf(prev) + 1);
    });

    it('errors: step outside the guide, test script outside the guide and a reversed range or one across two test scripts', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['R0', 'R12', 'R22']);
      expect(() => guideExcerpt(guide, ['R22.99'])).toThrow(
        'R22.99 is not in the round guide; R22 has R22.1 to R22.24 (25 steps)',
      );
      expect(() => guideExcerpt(guide, ['R22.1-R22.99'])).toThrow(/R22\.99 is not in/);
      expect(() => guideExcerpt(guide, ['R99'])).toThrow(
        /R99 is not in the round guide.*R0, R12, R22.*round-guide\.mjs.*Grep.*docs\/TESTING\.md/s,
      );
      expect(() => guideExcerpt(guide, ['R99.1'])).toThrow(/R99\.1 is not in/);
      expect(() => guideExcerpt(guide, ['R22.5-R22.3'])).toThrow(/Invalid range/);
      expect(() => guideExcerpt(guide, ['R22.1-R12.2'])).toThrow(
        /Step range across different scripts/,
      );
    });

    it('an error in an item prints no excerpt: the good item before it does not come out', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['R22']);
      expect(() => guideExcerpt(guide, ['R22.4', 'R22.99'])).toThrow();
    });
  });

  it('the CLI with --out writes the guide, the base and the index', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'round-guide-'));
    try {
      const out = path.join(dir, 'x', 'guia.md');
      const r = spawnSync('node', [SCRIPT, 'R0', 'R12', '--out', out], {
        encoding: 'utf8',
      });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('guia-base.md');
      expect(r.stderr).toContain('guia-indice.tsv');
      const stdout = execFileSync('node', [SCRIPT, 'R0', 'R12'], { encoding: 'utf8' });
      expect(`${readFileSync(out, 'utf8')}\n`).toBe(stdout);
      const base = readFileSync(path.join(dir, 'x', 'guia-base.md'), 'utf8');
      expect(base).not.toMatch(/^\| R12\.\d/m);
      expect(base).toContain('`node scripts/testing/cloud.mjs passo R12`');
      expect(base).toContain('`guia-indice.tsv`');
      const index = readFileSync(path.join(dir, 'x', 'guia-indice.tsv'), 'utf8');
      expect(index.split('\n')[0]).toBe('tipo\tchave\tini\tfim\ttítulo');
      expect(index).toMatch(/^roteiro\tR12\t/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Stage #1533 (TE1, decisions 1 and 2): the base with only the mandatory part and the on-demand sections.
describe('round-guide.mjs: mandatory base and secao (#1533, TE1)', () => {
  const CONSULTA = readFileSync('docs/TESTING-NUVEM-CONSULTA.md', 'utf8');
  const GUIDE_KEYS = ['1', '2', '3', '5', '6', '7', 'A.seletores', 'B'];
  const ALL_KEYS = [
    ...GUIDE_KEYS,
    'consulta.subagente',
    'consulta.grupos',
    'consulta.passada',
    'consulta.regras',
    'consulta.historico',
  ];

  async function load() {
    return import('../../scripts/testing/round-guide.mjs');
  }

  it('SECOES_SOB_DEMANDA has the keys of decisions 1 and 4 (plus consulta.regras), each with its "when to read"', async () => {
    const { SECOES_SOB_DEMANDA } = await load();
    expect(SECOES_SOB_DEMANDA.map((s) => s.chave)).toEqual(ALL_KEYS);
    for (const s of SECOES_SOB_DEMANDA) expect(s.quando, s.chave).toMatch(/\S/);
  });

  it('the base carries only the mandatory part and one command line per on-demand section', async () => {
    const { buildGuideBase } = await load();
    const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
    for (const keep of [
      '## Start here',
      '## 4. How the app saves',
      '**Conventions.**',
      '### Round report',
      '## Appendix A',
    ])
      expect(base, keep).toContain(keep);
    expect(base).not.toContain('## 9. Advanced manual testing');
    for (const key of GUIDE_KEYS) {
      expect(base, key).toContain(`\`node scripts/testing/cloud.mjs secao ${key}\``);
    }
    // The content of sections 1, 2, 3, 5, 6, 7, of A.seletores and of B is not in the base.
    expect(base).not.toContain('| **Main version** |');
    expect(base).not.toContain('**Home screen.**');
    expect(base).not.toContain('**Moving, copying and renaming folders**');
    expect(base).not.toContain('**Windows:** each tool window');
  });

  it('guideSection prints the requested section and several in order, separated by ---', async () => {
    const { buildRoundGuide, guideSection } = await load();
    const guide = buildRoundGuide(GUIDE, ['R0'], { commit: 'abc1234' });
    const seven = guideSection(guide, ['7']);
    expect(seven.startsWith('## 7. How to report a problem')).toBe(true);
    expect(seven).not.toContain('## 8. Test scripts');
    const two = guideSection(guide, ['B', '1']);
    expect(two.indexOf('## Appendix B')).toBeLessThan(
      two.indexOf('## 1. Where to get the app'),
    );
    expect(two).toContain('\n---\n');
    expect(guideSection(guide, ['A.seletores'])).toMatch(
      /^### Misleading selectors and names/,
    );
  });

  it('the consulta.* keys read TESTING-NUVEM-CONSULTA.md', async () => {
    const { guideSection } = await load();
    const out = guideSection('', ['consulta.grupos', 'consulta.historico'], CONSULTA);
    expect(out).toContain('## Directed round in groups');
    expect(out).toContain('Baseline');
    expect(() => guideSection('', ['consulta.grupos'])).toThrow(/consulta/);
  });

  it('an unknown key throws with the list of keys', async () => {
    const { guideSection } = await load();
    expect(() => guideSection('', ['xyz'])).toThrow(
      /xyz[\s\S]*A\.seletores[\s\S]*consulta\.grupos/,
    );
  });

  it('goes over 25,000 characters: cuts and says how to continue', async () => {
    const { guideSection } = await load();
    const big = `## 1. Where to get the app\n\n${'a long line of text\n'.repeat(2000)}\n## 2. Requirements\n\nx\n`;
    const out = guideSection(big, ['1', '2']);
    expect(out.length).toBeLessThanOrEqual(25_000);
    expect(out).toContain('… cut at 25,000 characters');
  });

  it('the CLI --out writes a base smaller than the guide, and guia.md carries everything', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'round-guide-'));
    try {
      const out = path.join(dir, 'guia.md');
      execFileSync('node', [SCRIPT, 'R0', '--out', out], { stdio: 'pipe' });
      const base = readFileSync(path.join(dir, 'guia-base.md'), 'utf8');
      expect(base).toContain('cloud.mjs secao 5');
      expect(readFileSync(out, 'utf8')).toContain('**Home screen.**');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Stage #1533 (TE3, decision 14 (4)): `passo R25` brings the whole setup, without cutting a code fence.
describe('passo R25: the whole setup (stage #1533, TE3)', () => {
  async function passoR25(scripts: string[]): Promise<string> {
    const mod: {
      buildRoundGuide: (md: string, r: string[], o?: { commit?: string }) => string;
      guideExcerpt: (guide: string, items: string[]) => string;
    } = await import('../../scripts/testing/round-guide.mjs');
    return mod.guideExcerpt(mod.buildRoundGuide(GUIDE, scripts, { commit: 'abc1234' }), [
      'R25',
    ]);
  }

  for (const [name, scripts] of [
    ['guide all', ['all']],
    ['block 2 guide (R0, R15, R25)', ['R0', 'R15', 'R25']],
  ] as const) {
    it(`${name}: tokens.mjs comes from the repository and the tinta, sonda and medir functions, from the opening fence to the closing one`, async () => {
      const out = await passoR25([...scripts]);
      const lines = out.split('\n');
      const fences = lines.flatMap((l, i) => (l.startsWith('```') ? [i] : []));
      expect(fences.length % 2).toBe(0);
      const block = (marker: string): string => {
        const at = lines.findIndex((l) => l.includes(marker));
        expect(at, marker).toBeGreaterThan(-1);
        const open = [...fences].reverse().find((f) => f < at) as number;
        const close = fences.find((f) => f > at) as number;
        expect(lines[open]).toMatch(/^```\w*$/);
        expect(lines[close]).toBe('```');
        return lines.slice(open, close + 1).join('\n');
      };
      // The setup of the library with tokens is the repository's `scripts/testing/tokens.mjs` (MC1),
      // not a block of the guide: the guide cites it and the file exists in the commit the tester builds.
      expect(out).toContain("The repository's `scripts/testing/tokens.mjs`");
      expect(existsSync('scripts/testing/tokens.mjs')).toBe(true);
      const tools = block('tinta() {');
      for (const fn of ['sonda()', 'medir()', 'unid()', 'caixa()']) {
        expect(tools).toContain(fn);
      }
      expect(out).not.toContain('… cut at 25,000 characters');
    });
  }
});

// Stage #1639 (TC1, decision 3): `--faixas` splits each test script into batches of up to 20 steps for the subagents.
interface Batch {
  token: string;
  steps: number;
}
interface FaixasModule {
  FAIXA_LIMIT: number;
  planFaixas: (md: string, scripts: string[], o?: { limit?: number }) => Batch[];
  formatFaixas: (batches: Batch[]) => string;
  guidePreparo: (guide: string, itens: string[], fallback?: string) => string;
  buildRoundGuide: (md: string, r: string[], o?: { commit?: string }) => string;
  guideExcerpt: (guide: string, itens: string[]) => string;
}
const loadFaixas = (): Promise<FaixasModule> =>
  import('../../scripts/testing/round-guide.mjs') as unknown as Promise<FaixasModule>;

describe('round-guide.mjs --faixas (#1639, TC1, decision 3)', () => {
  const perScript = (batches: Batch[]): Record<string, number[]> => {
    const out: Record<string, number[]> = {};
    for (const l of batches) (out[l.token.split('.')[0] ?? ''] ??= []).push(l.steps);
    return out;
  };

  it('FAIXA_LIMIT is 20', async () => {
    expect((await loadFaixas()).FAIXA_LIMIT).toBe(20);
  });

  it('acceptance: R25 in 7 batches, R12 in 4, R9 in 3, R3 in 2, R17 in 3, R13 whole; the sum is the number of steps of the guide', async () => {
    const { planFaixas } = await loadFaixas();
    const scripts = ['R25', 'R12', 'R3', 'R13', 'R17', 'R9'];
    const batches = planFaixas(GUIDE, scripts);
    const by = perScript(batches);
    const g =
      (await import('../../scripts/testing/round-guide.mjs')) as unknown as GroupsModule;
    const stepCounts = Object.fromEntries(
      g.planGroups(GUIDE, scripts).items.map((i) => [i.token, i.steps]),
    );
    const expected = { R25: 7, R12: 4, R17: 3, R9: 3, R3: 2, R13: 1 } as const;
    for (const [id, n] of Object.entries(expected)) {
      expect(by[id], id).toHaveLength(n);
      expect(
        by[id]?.reduce((a, b) => a + b, 0),
        id,
      ).toBe(stepCounts[id]);
    }
    // The limit is 20 base steps: the steps with a letter (R12.11a…) do not separate from the previous one
    // (docs/TESTING-NUVEM.md, "chains that are not separated"), so a batch that ends in
    // such a chain can go over 20 (R12.1-R12.11d has 21).
    for (const l of batches) {
      if (l.steps > 20) expect(l.token, l.token).toMatch(/-R\d+\.\d+[a-z]$/);
    }
  });

  it('a test script of up to 20 steps is one batch with the token of the test script; above that, ranges R<n>.<a>-R<n>.<b>', async () => {
    const { planFaixas } = await loadFaixas();
    const batches = planFaixas(GUIDE, ['R13', 'R25']);
    expect(batches[0]?.token).toBe('R13');
    expect(batches[0]?.steps).toBeLessThanOrEqual(20);
    expect(batches[1]?.token).toBe('R25.1-R25.20');
    expect(batches[2]?.token).toBe('R25.21-R25.40');
  });

  it('the ranges cover the steps of each test script, with no repeating or skipping', async () => {
    const { planFaixas } = await loadFaixas();
    for (const id of ['R25', 'R12', 'R22', 'R3', 'R9', 'R17']) {
      const guide = (await loadFaixas()).buildRoundGuide(GUIDE, [id], {
        commit: 'abc1234',
      });
      const startAt = guide.search(new RegExp(`^### ${id}\\b`, 'm'));
      const rest = guide.slice(startAt + 4);
      const end = rest.search(/^### /m);
      const section = end < 0 ? rest : rest.slice(0, end);
      const codes = [
        ...section.matchAll(new RegExp(`^\\|\\s*(?:\\*\\*)?(${id}\\.\\d+[a-z]?)`, 'gm')),
      ].map((m) => m[1] as string);
      const covered: string[] = [];
      for (const l of planFaixas(GUIDE, [id])) {
        const m = /^(R\d+)\.(\d+[a-z]?)-(R\d+)\.(\d+[a-z]?)$/.exec(l.token);
        if (!m) {
          covered.push(...codes);
          continue;
        }
        const a = codes.indexOf(`${m[1]}.${m[2]}`);
        const b = codes.indexOf(`${m[3]}.${m[4]}`);
        expect(a, l.token).toBeGreaterThan(-1);
        expect(b - a + 1, l.token).toBe(l.steps);
        covered.push(...codes.slice(a, b + 1));
      }
      expect(covered, id).toEqual(codes);
    }
  });

  it('the step that guideExcerpt joins to the previous one (R22.6a with R22.6) is not separated', async () => {
    const { planFaixas } = await loadFaixas();
    const batches = planFaixas(GUIDE, ['R22'], { limit: 6 });
    expect(batches[0]?.token).toBe('R22.1-R22.6a');
    expect(batches[1]?.token.startsWith('R22.7-')).toBe(true);
  });

  it('a requested range is respected and only split above the limit', async () => {
    const { planFaixas } = await loadFaixas();
    const single = planFaixas(GUIDE, ['R6.3-R6.7']);
    expect(single.map((l) => l.token)).toEqual(['R6.3-R6.7']);
    const split = planFaixas(GUIDE, ['R6.3-R6.7'], { limit: 2 });
    expect(split.length).toBeGreaterThan(1);
    expect(split[0]?.token.startsWith('R6.3-')).toBe(true);
    expect(split[0]?.steps).toBe(2);
    expect(split.reduce((n, l) => n + l.steps, 0)).toBe(single[0]?.steps);
  });

  it('R0 stays out and small test scripts do not merge; the order is that of the guide', async () => {
    const { planFaixas } = await loadFaixas();
    const batches = planFaixas(GUIDE, ['R12', 'R0', 'R2']);
    expect(batches.map((l) => l.token.split('.')[0])).toEqual([
      'R2',
      'R12',
      'R12',
      'R12',
      'R12',
    ]);
    expect(planFaixas(GUIDE, ['R0'])).toEqual([]);
  });

  it('a requested range that ends at R12.11 carries all the steps with a letter and counts right', async () => {
    const { planFaixas } = await loadFaixas();
    const batches = planFaixas(GUIDE, ['R12.1-R12.11']);
    const total = batches.reduce((n, l) => n + l.steps, 0);
    expect(batches.at(-1)?.token.endsWith('R12.11')).toBe(true);
    const excerpt = (await loadFaixas()).guideExcerpt(GUIDE, ['R12.1-R12.11']);
    const rows = [...excerpt.matchAll(/^\|\s*(?:\*\*)?R12\.\d+[a-z]?\b/gm)];
    expect(total).toBe(rows.length);
  });

  it('the automatic cut does not separate R12.11c from R12.11d', async () => {
    const { planFaixas } = await loadFaixas();
    for (const l of planFaixas(GUIDE, ['R12'])) {
      expect(l.token.endsWith('R12.11c')).toBe(false);
    }
  });

  it('requested ranges that overlap do not repeat steps', async () => {
    const { planFaixas } = await loadFaixas();
    const batches = planFaixas(GUIDE, ['R25.1-R25.20', 'R25.5-R25.30']);
    expect(batches.reduce((n, l) => n + l.steps, 0)).toBe(
      planFaixas(GUIDE, ['R25.1-R25.30']).reduce((n, l) => n + l.steps, 0),
    );
    expect(batches[0]?.token).toBe('R25.1-R25.20');
  });

  it('a nonexistent test script throws', async () => {
    const { planFaixas } = await loadFaixas();
    expect(() => planFaixas(GUIDE, ['R99'])).toThrow(/R99/);
  });

  it('the CLI prints one line per batch, in the order of the guide; without an item it exits with 2', () => {
    const r = spawnSync(
      'node',
      [SCRIPT, '--faixas', 'R25', 'R12', 'R3', 'R13', 'R17', 'R9'],
      {
        encoding: 'utf8',
      },
    );
    expect(r.status).toBe(0);
    const lines = r.stdout.trimEnd().split('\n');
    expect(lines).toHaveLength(20);
    expect(lines[0]).toMatch(/^batch 1 of 20: R3\.1-R3\.\d+[a-z]? \(20 steps\)$/);
    expect(lines.at(-1)).toMatch(
      /^batch 20 of 20: R25\.\d+[a-z]?-R25\.\d+[a-z]? \(\d+ steps\)$/,
    );
    const none = spawnSync('node', [SCRIPT, '--faixas'], { encoding: 'utf8' });
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('Usage: node scripts/testing/round-guide.mjs --faixas');
  });
});

describe('round-guide.mjs: the setup of a test script (#1639, TC1, decision 4)', () => {
  it('guidePreparo of R25 brings the title, the setup and the functions, without any step line', async () => {
    const { guidePreparo, buildRoundGuide } = await loadFaixas();
    const guide = buildRoundGuide(GUIDE, ['all'], { commit: 'abc1234' });
    const out = guidePreparo(guide, ['R25']);
    expect(out.split('\n')[0]).toMatch(/^### R25\b/);
    for (const fn of ['tinta() {', 'sonda()', 'medir()']) expect(out).toContain(fn);
    expect(out).toContain("The repository's `scripts/testing/tokens.mjs`");
    expect(out).not.toMatch(/^\| R25\./m);
    expect(out).not.toMatch(/^\| Step\b/m);
    expect(out).not.toContain('… cut at 25,000 characters');
  });

  it('an item that is not a whole test script throws with the usage', async () => {
    const { guidePreparo, buildRoundGuide } = await loadFaixas();
    const guide = buildRoundGuide(GUIDE, ['R25'], { commit: 'abc1234' });
    expect(() => guidePreparo(guide, ['R25.30-R25.31'])).toThrow(/--preparo/);
    expect(() => guidePreparo(guide, ['R25.3'])).toThrow(/--preparo/);
  });

  it('consulta.subagente is in SECOES_SOB_DEMANDA with the "when to read"', async () => {
    const mod: {
      SECOES_SOB_DEMANDA: { chave: string; quando: string; fonte: string }[];
    } = await import('../../scripts/testing/round-guide.mjs');
    const e = mod.SECOES_SOB_DEMANDA.find((s) => s.chave === 'consulta.subagente');
    expect(e?.fonte).toBe('consulta');
    expect(e?.quando).toBe('before the first batch (R0)');
  });
});

// Stage #2450 (TC1, decision 4): group and batch numbers no longer mix.
describe('TESTING-NUVEM-CONSULTA.md: group and batch numbers (#2450, TC1)', () => {
  const CONSULTA = readFileSync('docs/TESTING-NUVEM-CONSULTA.md', 'utf8');
  const batchData = CONSULTA.slice(
    CONSULTA.indexOf('Batch data'),
    CONSULTA.indexOf('What to read, in this order'),
  );
  const groups = CONSULTA.slice(
    CONSULTA.indexOf('## Directed round in groups'),
    CONSULTA.indexOf('## Visual pass'),
  );

  it("the briefing's `Mode:` line is copied verbatim from the message, the same in every batch", () => {
    expect(batchData).toContain('copied verbatim from the message');
    expect(batchData).toContain('the same line in every batch');
    expect(batchData).toContain('never derived from the batch number');
  });

  it('the `Batch:` line carries the token and the `batch k of n` of `--faixas`', () => {
    expect(batchData).toMatch(/- Batch: <[^>]*>.*\(batch k of n/);
  });

  it('item 3 of the group mode: the `k` of the group comes only from the message', () => {
    expect(groups).toContain('the `k` of `grupo k de n` comes only from the message');
    expect(groups).toContain(
      'the `batch k of n` of `--faixas` numbers the batches inside the session and never changes it',
    );
  });
});
