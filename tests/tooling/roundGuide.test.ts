// @vitest-environment node
// Fase TS1 (etapa #421, decisão 7): `round-guide.mjs` gera o guia da rodada a partir do
// docs/TESTING.md, sem os roteiros não pedidos, os sob demanda, a seção 9 e o registro do Uso real.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  it('o quadro do "Comece aqui" leva só as linhas dos roteiros pedidos e a da seção 6', async () => {
    const out = await build(['R0', 'R2']);
    expect(out).toContain('| 1 | R0 — Preparação e fumaça |');
    expect(out).toContain('| 3 | R2 — Projeto neste dispositivo e zip |');
    expect(out).toContain('| 4 | Seção 6 — repositório de teste e MCP |');
    expect(out).not.toContain('| 2 | R1 — Roteiro principal |');
    expect(out).not.toContain('| 27 | R25 — Componentes fiéis |');
    expect(out).not.toMatch(/^\| sob demanda \|/m);
    // O quadro inteiro continua no guia completo.
    expect(GUIDE).toContain('| 27 | R25 — Componentes fiéis |');
    const rows = (await build(['R25'])).match(/^\| (?:\d+|sob demanda) \|/gm);
    expect(rows).toHaveLength(2);
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

  it('all mantém R0 a R25, na ordem do guia, ainda sem a seção 9', async () => {
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

// Etapa #841 (RB1, decisões 1 e 2): o guia da rodada corta o que o bloco não usa.
const FIXTURE = [
  '# Guia',
  '',
  '## 8. Roteiros',
  '',
  'Base.',
  '',
  '- comum a todos',
  '<!-- roteiros: R2 R3 -->',
  '- só do R2 e do R3',
  '<!-- /roteiros -->',
  '- outra comum',
  '',
  '### R1 — Um',
  '',
  '| Passo | Ação | Esperado |',
  '| --- | --- | --- |',
  '| R1.1 | a | b |',
  '',
  '### R2 — Dois',
  '',
  'Preparo do R2.',
  '',
  '| Passo | Ação | Esperado |',
  '| --- | --- | --- |',
  '| R2.1 | a | b |',
  '| R2.2 | c | d |',
  '| R2.2b | c | d |',
  '| R2.3 | e | f |',
  '',
  '### R3 — Três',
  '',
  '| Passo | Ação | Esperado |',
  '| --- | --- | --- |',
  '| R3.1 | a | b |',
  '',
].join('\n');

async function buildFrom(md: string, roteiros: string[]): Promise<string> {
  const mod: {
    buildRoundGuide: (
      md: string,
      roteiros: string[],
      options?: { commit?: string },
    ) => string;
  } = await import('../../scripts/testing/round-guide.mjs');
  return mod.buildRoundGuide(md, roteiros, { commit: 'abc1234' });
}

describe('round-guide.mjs: trechos marcados por roteiro (RB1, decisões 1 e 2)', () => {
  it('um roteiro pedido leva os trechos marcados com ele', async () => {
    const out = await buildFrom(FIXTURE, ['R2']);
    expect(out).toContain('só do R2 e do R3');
    const out3 = await buildFrom(FIXTURE, ['R3']);
    expect(out3).toContain('só do R2 e do R3');
  });

  it('um roteiro não pedido não leva o trecho; o sem marcação vai em todos', async () => {
    const out = await buildFrom(FIXTURE, ['R1']);
    expect(out).not.toContain('só do R2 e do R3');
    expect(out).toContain('comum a todos');
    expect(out).toContain('outra comum');
  });

  it('as marcas não aparecem no guia gerado', async () => {
    for (const roteiros of [['R1'], ['R2'], ['all']]) {
      const out = await buildFrom(FIXTURE, roteiros);
      expect(out).not.toContain('<!-- roteiros');
      expect(out).not.toContain('<!-- /roteiros');
    }
  });

  it('marcação com roteiro inexistente falha', async () => {
    const bad = FIXTURE.replace('R2 R3 -->', 'R2 R99 -->');
    await expect(buildFrom(bad, ['R1'])).rejects.toThrow(/R99/);
  });

  it('marcação sem fechamento falha', async () => {
    const bad = FIXTURE.replace('<!-- /roteiros -->\n', '');
    await expect(buildFrom(bad, ['R1'])).rejects.toThrow(/roteiros/);
  });

  it('no docs/TESTING.md, toda marca cita só roteiros que existem e abre e fecha em par', () => {
    const existing = new Set([...GUIDE.matchAll(/^### (R\d+) /gm)].map((m) => m[1]));
    let open = false;
    for (const line of GUIDE.split('\n')) {
      const m = /^<!-- roteiros: ([^>]*?) -->$/.exec(line);
      if (m) {
        expect(open, 'marca aberta dentro de outra').toBe(false);
        open = true;
        for (const id of (m[1] as string).trim().split(/\s+/)) {
          expect(existing.has(id), `roteiro ${id}`).toBe(true);
        }
      } else if (line === '<!-- /roteiros -->') {
        expect(open, 'fechamento sem abertura').toBe(true);
        open = false;
      }
    }
    expect(open).toBe(false);
  });

  it('no docs/TESTING.md, o guia de um roteiro leva todos os trechos marcados com ele, e só os dele', async () => {
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
    const roteiros = [...GUIDE.matchAll(/^### (R\d+) /gm)].map((m) => m[1] as string);
    for (const id of ['R0', 'R12', 'R25']) {
      const out = await build([id]);
      for (const c of chunks) {
        if (c.ids.includes(id))
          expect(out, `${id}: ${c.first.slice(0, 50)}`).toContain(c.first);
        else if (!c.ids.some((x) => x === id)) {
          // um trecho de outros roteiros só entra se o texto também aparecer fora da marca
          if (GUIDE.split(c.first).length === 2) expect(out).not.toContain(c.first);
        }
      }
    }
    expect(roteiros.length).toBeGreaterThan(20);
  });

  it('all gera todos os roteiros e não perde nenhum trecho marcado', async () => {
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

describe('round-guide.mjs: faixa de passos (RB1, decisão 1c)', () => {
  it('R2.1-R2.2 leva só esses passos, com o cabeçalho e o preparo do roteiro', async () => {
    const out = await buildFrom(FIXTURE, ['R2.1-R2.2']);
    expect(out).toMatch(/^### R2 /m);
    expect(out).toContain('Preparo do R2.');
    expect(out).toContain('| R2.1 |');
    expect(out).toContain('| R2.2 |');
    expect(out).not.toContain('| R2.2b |');
    expect(out).not.toContain('| R2.3 |');
    expect(out).not.toMatch(/^### R1 /m);
    expect(out).toContain('só do R2 e do R3');
  });

  it('duas faixas do mesmo roteiro se somam, e o roteiro inteiro vence a faixa', async () => {
    const two = await buildFrom(FIXTURE, ['R2.1-R2.1', 'R2.3-R2.3']);
    expect(two).toContain('| R2.1 |');
    expect(two).toContain('| R2.3 |');
    expect(two).not.toContain('| R2.2 |');
    const whole = await buildFrom(FIXTURE, ['R2', 'R2.1-R2.1']);
    expect(whole).toContain('| R2.3 |');
  });

  // CL1 / T9: um passo avulso (`R2.1`) vale como a faixa de um passo só.
  it('um passo avulso (R2.1, R0.1) vale como faixa de um passo', async () => {
    const out = await buildFrom(FIXTURE, ['R2.1', 'R2.3']);
    expect(out).toContain('| R2.1 |');
    expect(out).toContain('| R2.3 |');
    expect(out).not.toContain('| R2.2 |');
    expect(out).toMatch(/^### R2 /m);
  });

  it('passo avulso com letra (R6.8a) mantém a letra minúscula', async () => {
    const out = await build(['R6.8a']);
    expect(out).toContain('| R6.8a |');
    expect(out).not.toContain('| R6.8b |');
  });

  it('faixa com passo inexistente falha', async () => {
    await expect(buildFrom(FIXTURE, ['R2.1-R2.9'])).rejects.toThrow(/R2\.9/);
  });

  it('no guia real, R6.3-R6.7 leva só esses passos do R6', async () => {
    const out = await build(['R6.3-R6.7']);
    for (const p of ['R6.3', 'R6.3b', 'R6.4', 'R6.5', 'R6.6', 'R6.7']) {
      expect(out, p).toMatch(new RegExp(`^\\| ${p.replace('.', '\\.')} \\|`, 'm'));
    }
    for (const p of ['R6.8a', 'R6.8b', 'R6.9', 'R6.10', 'R6.11']) {
      expect(out, p).not.toMatch(new RegExp(`^\\| ${p.replace('.', '\\.')} \\|`, 'm'));
    }
  });
});

// Etapa #1148 (TR4, decisões 15 a 17): `--grupos` divide a dirigida grande em grupos paralelos.
interface GroupPlan {
  items: { token: string; steps: number }[];
  total: number;
  single: boolean;
  groups: { n: number; tokens: string[]; steps: number }[];
}
interface GroupsModule {
  planGroups: (md: string, roteiros: string[], o?: { limit?: number }) => GroupPlan;
  formatGroupPlan: (plan: GroupPlan) => string;
  CHAINS: { name: string; items: string[] }[];
}
const loadGroups = (): Promise<GroupsModule> =>
  import('../../scripts/testing/round-guide.mjs') as unknown as Promise<GroupsModule>;

describe('round-guide.mjs --grupos (TR4, decisões 15 a 17)', () => {
  it('R0 R12 R22 R23: o R0 não conta e saem três grupos, R12; R23; R22', async () => {
    const { planGroups } = await loadGroups();
    const plan = planGroups(GUIDE, ['R0', 'R12', 'R22', 'R23']);
    expect(plan.single).toBe(false);
    expect(plan.items.map((i) => i.token)).toEqual(['R12', 'R22', 'R23']);
    expect(plan.total).toBeGreaterThan(40);
    expect(plan.groups.map((g) => g.tokens)).toEqual([['R12'], ['R23'], ['R22']]);
  });

  it('R1 R3 R5 é uma cadeia só: um grupo, mesmo acima do limite', async () => {
    const { planGroups } = await loadGroups();
    const plan = planGroups(GUIDE, ['R1', 'R3', 'R5']);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]?.tokens).toEqual(['R1', 'R3', 'R5']);
  });

  it('até o limite é uma sessão, e o R0 sozinho não gera grupo', async () => {
    const { planGroups, formatGroupPlan } = await loadGroups();
    const plan = planGroups(GUIDE, ['R0', 'R2']);
    expect(plan.single).toBe(true);
    expect(plan.groups).toEqual([]);
    expect(formatGroupPlan(plan)).toContain('uma sessão');
  });

  it('as faixas pedidas ficam como pedidas e o roteiro nunca é separado', async () => {
    const { planGroups } = await loadGroups();
    const plan = planGroups(GUIDE, ['R6.3-R6.7', 'R6.8a-R6.11', 'R12']);
    const all = plan.groups.flatMap((g) => g.tokens);
    expect(all).toContain('R6.3-R6.7');
    expect(all).toContain('R6.8a-R6.11');
    expect(all.filter((t) => t === 'R12')).toHaveLength(1);
  });

  it('nunca passa de 5 grupos e cada grupo traz os passos somados', async () => {
    const { planGroups } = await loadGroups();
    const plan = planGroups(GUIDE, ['all']);
    expect(plan.groups.length).toBeLessThanOrEqual(5);
    const sum = plan.groups.reduce((n, g) => n + g.steps, 0);
    expect(sum).toBe(plan.total);
  });

  it('o --grupos do CLI imprime uma linha "grupo k de n: <roteiros>" por grupo', () => {
    const out = execFileSync('node', [SCRIPT, '--grupos', 'R0', 'R12', 'R22', 'R23'], {
      encoding: 'utf8',
    });
    expect(out).toMatch(/^grupo 1 de 3: R12$/m);
    expect(out).toMatch(/^grupo 2 de 3: R23$/m);
    expect(out).toMatch(/^grupo 3 de 3: R22$/m);
  });

  it('a tabela de cadeias do TESTING-NUVEM.md traz cada item das cadeias do script', async () => {
    const { CHAINS } = await loadGroups();
    const nuvem = readFileSync('docs/TESTING-NUVEM-CONSULTA.md', 'utf8');
    const start = nuvem.indexOf('## Rodada dirigida em grupos');
    expect(start).toBeGreaterThan(0);
    const section = nuvem.slice(start, nuvem.indexOf('\n## ', start + 5));
    for (const chain of CHAINS) {
      for (const item of chain.items) {
        expect(section, item).toContain(item.replace('-', ' a '));
      }
    }
  });
});

// Etapa #1232 (GL1): o guia da rodada em base, índice e trechos sob demanda (`cloud.mjs passo`).
describe('round-guide.mjs: base, índice e trechos (#1232, GL1)', () => {
  const STEP_LINE = /^\|\s*(?:\*\*)?(R\d+\.\d+[a-z]?)(?:\*\*)?[^|]*\|/;
  const HEADER = ['| Passo | Ação | Esperado |', '| --- | --- | --- |'];

  async function load() {
    return import('../../scripts/testing/round-guide.mjs');
  }

  async function guideOf(roteiros: string[]): Promise<string> {
    const { buildRoundGuide } = await load();
    return buildRoundGuide(GUIDE, roteiros, { commit: 'abc1234' });
  }

  /** Linhas (1-based) e códigos dos passos de cada roteiro do guia gerado, fora de bloco de código. */
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
    it('R0 R22: sem nenhuma seção de roteiro, só uma linha de comando por roteiro', async () => {
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
      expect(base).not.toContain('**O que cobre:**');
      expect(base).not.toMatch(/^#### R12\./m);
    });

    it('mantém o "Comece aqui", as seções 1 a 7, o template e os apêndices A e B', async () => {
      const { buildGuideBase } = await load();
      const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
      expect(base).toContain('## Comece aqui');
      for (const n of [1, 2, 3, 4, 5, 6, 7]) {
        expect(base, `seção ${n}`).toMatch(new RegExp(`^## ${n}\\. `, 'm'));
      }
      expect(base).toMatch(/^## 8\. /m);
      expect(base).toContain('### Relato de uma rodada de teste');
      expect(base).toContain('## Apêndice A');
      expect(base).toContain('## Apêndice B');
      expect(base).not.toContain('## 9. Teste manual avançado');
    });

    it('a nota de topo é a mesma, com a frase do índice na linha seguinte', async () => {
      const { buildGuideBase } = await load();
      const guide = await guideOf(['R0', 'R22']);
      const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
      const [note, sentence] = base.split('\n');
      expect(note).toBe(guide.split('\n')[0]);
      expect(sentence).toBe(
        '> Os roteiros saem por `cloud.mjs passo`; o índice está em `guia-indice.tsv`. As seções sob demanda saem por `cloud.mjs secao <chave>` (sem chave, lista).',
      );
      const named = buildGuideBase(GUIDE, ['R0'], { commit: 'abc1234', name: 'rodada' });
      expect(named.split('\n')[1]).toContain('`rodada-indice.tsv`');
    });

    it('os trechos marcados seguem a regra do guia: só entram os que citam um roteiro pedido', async () => {
      const { buildGuideBase } = await load();
      const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
      // Trechos marcados fora de qualquer seção de roteiro (os de dentro saem junto com a seção).
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

  describe('cobertura (decisão 9)', () => {
    async function missingLines(roteiros: string[]): Promise<string[]> {
      const { buildGuideBase, guideExcerpt, guideSection, SECOES_SOB_DEMANDA } =
        await load();
      const guide = await guideOf(roteiros);
      const covered = new Set(
        buildGuideBase(GUIDE, roteiros, { commit: 'abc1234' }).split('\n'),
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
          expect(out, `${first}-${last}`).not.toContain('… corte em');
          for (const line of out.split('\n')) covered.add(line);
        }
      }
      return guide.split('\n').filter((line) => line.trim() && !covered.has(line));
    }

    it('R0 R12 R22: toda linha do guia está na base, num secao ou no passo de algum roteiro', async () => {
      expect(await missingLines(['R0', 'R12', 'R22'])).toEqual([]);
    });

    it('all: nada do guia da rodada fica sem caminho de leitura (base, secao ou passo)', async () => {
      expect(await missingLines(['all'])).toEqual([]);
    }, 60000);
  });

  describe('buildGuideIndex', () => {
    it('cabeçalho, tipos e chaves: seções, roteiros e passos', async () => {
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
      const roteiros = cells.filter((c) => c[0] === 'roteiro');
      expect(roteiros.map((c) => c[1])).toEqual(['R0', 'R12', 'R22']);
      const secoes = cells.filter((c) => c[0] === 'secao').map((c) => c[1]);
      expect(secoes).toContain('Comece aqui');
      expect(secoes.some((s) => /^R\d+/.test(s as string))).toBe(false);
      expect(secoes.some((s) => /^Apêndice A/.test(s as string))).toBe(true);
    });

    it('as linhas ini a fim do guia.md são a linha do passo, e os roteiros e seções começam no cabeçalho', async () => {
      const { buildGuideIndex } = await load();
      const guide = await guideOf(['R0', 'R12', 'R22']);
      const lines = guide.split('\n');
      const cells = buildGuideIndex(guide)
        .trimEnd()
        .split('\n')
        .slice(1)
        .map((r) => r.split('\t'));
      const passos = cells.filter((c) => c[0] === 'passo');
      let total = 0;
      for (const codes of stepsOf(guide).values()) total += codes.length;
      expect(passos).toHaveLength(total);
      for (const [, key, ini, fim, title] of passos) {
        const row = lines.slice(Number(ini) - 1, Number(fim)).join('\n');
        expect(ini).toBe(fim);
        expect(STEP_LINE.exec(row)?.[1], key).toBe(key);
        expect((title as string).length).toBeLessThanOrEqual(80);
      }
      for (const [tipo, key, ini, fim, title] of cells.filter((c) => c[0] !== 'passo')) {
        const first = lines[Number(ini) - 1] as string;
        expect(first.startsWith('#'), `${tipo} ${key}`).toBe(true);
        expect(first.endsWith(title as string), `${tipo} ${key}`).toBe(true);
        if (tipo === 'roteiro') {
          expect(first).toMatch(new RegExp(`^### ${key} `));
          expect(lines[Number(fim)] ?? '').toMatch(/^#{2,3} |^$/);
        }
      }
    });
  });

  describe('guideExcerpt', () => {
    it('R22: o "O que cobre", o preparo e uma linha Passos no lugar das linhas de passo', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['R22']);
      const out = guideExcerpt(guide, ['R22']);
      expect(out).toContain('**O que cobre:**');
      expect(out).toContain('**Preparo.**');
      expect(out).toContain('Passos (23): R22.1, R22.2, …, R22.22');
      expect(out).not.toMatch(/^\| R22\.\d/m);
      expect(out.split('\n').filter((l) => l.startsWith('Passos ('))).toHaveLength(1);
    });

    it('R12: as duas subseções com os preparos e uma linha Passos por trecho de tabela', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['R12']);
      const out = guideExcerpt(guide, ['R12']);
      expect(out).toContain('#### R12.17 a R12.22');
      expect(out).toContain('#### R12.23 a R12.28');
      expect(out.match(/\*\*Preparo\.\*\*/g)?.length).toBeGreaterThanOrEqual(3);
      const passos = out.split('\n').filter((l) => l.startsWith('Passos ('));
      expect(passos).toHaveLength(3);
      const sum = passos.reduce(
        (n, l) => n + Number(/^Passos \((\d+)\)/.exec(l)?.[1]),
        0,
      );
      expect(sum).toBe(53);
      expect(out).not.toMatch(/^\| R12\.\d/m);
    });

    it('R22.4: o cabeçalho da tabela e a linha do passo', async () => {
      const { guideExcerpt } = await load();
      const out = guideExcerpt(await guideOf(['R22']), ['R22.4']).split('\n');
      expect(out.slice(0, 2)).toEqual(HEADER);
      expect(out).toHaveLength(3);
      expect(out[2]).toMatch(/^\| R22\.4 \|/);
    });

    it('R22.3-R22.6: o cabeçalho e as cinco linhas, com o R22.6a', async () => {
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

    it('R12.16-R12.17 mantém a subseção e o preparo que ficam entre as duas linhas', async () => {
      const { guideExcerpt } = await load();
      const out = guideExcerpt(await guideOf(['R12']), ['R12.16-R12.17']);
      const at = (needle: string) => out.indexOf(needle);
      expect(at('| R12.16 |')).toBeGreaterThan(0);
      expect(at('#### R12.17 a R12.22')).toBeGreaterThan(at('| R12.16 |'));
      expect(at('**Preparo.**')).toBeGreaterThan(at('#### R12.17 a R12.22'));
      expect(at('| R12.17 |')).toBeGreaterThan(at('**Preparo.**'));
    });

    it('vários itens saem na ordem pedida, separados por ---', async () => {
      const { guideExcerpt } = await load();
      const out = guideExcerpt(await guideOf(['R12', 'R22']), ['R22.4', 'R12.12']);
      const parts = out.split('\n---\n');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^\| Passo \|[^\n]*\n\| --- \|[^\n]*\n\| R22\.4 \|/);
      expect(parts[1]).toMatch(/\n\| R12\.12 \|/);
    });

    it('passa de 25.000 caracteres: corta na última linha inteira e diz como continuar', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['all']);
      const out = guideExcerpt(guide, ['R25.1-R25.66']);
      expect(out.length).toBeLessThanOrEqual(25000);
      const lines = out.split('\n');
      const last = lines[lines.length - 1] as string;
      const match =
        /^… corte em 25\.000 caracteres: continue com cloud\.mjs passo (R25\.\w+)-R25\.66$/.exec(
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

    it('erros: passo fora do guia, roteiro fora do guia e faixa invertida ou de dois roteiros', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['R0', 'R12', 'R22']);
      expect(() => guideExcerpt(guide, ['R22.99'])).toThrow(
        'R22.99 não está no guia da rodada; o R22 tem R22.1 a R22.22 (23 passos)',
      );
      expect(() => guideExcerpt(guide, ['R22.1-R22.99'])).toThrow(/R22\.99 não está/);
      expect(() => guideExcerpt(guide, ['R99'])).toThrow(
        /R99 não está no guia da rodada.*R0, R12, R22.*round-guide\.mjs.*Grep.*docs\/TESTING\.md/s,
      );
      expect(() => guideExcerpt(guide, ['R99.1'])).toThrow(/R99\.1 não está/);
      expect(() => guideExcerpt(guide, ['R22.5-R22.3'])).toThrow(/Faixa inválida/);
      expect(() => guideExcerpt(guide, ['R22.1-R12.2'])).toThrow(
        /Faixa de passos de roteiros diferentes/,
      );
    });

    it('um erro num item não imprime trecho: o item bom antes dele não sai', async () => {
      const { guideExcerpt } = await load();
      const guide = await guideOf(['R22']);
      expect(() => guideExcerpt(guide, ['R22.4', 'R22.99'])).toThrow();
    });
  });

  it('a CLI com --out grava o guia, a base e o índice', () => {
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

// Etapa #1533 (TE1, decisões 1 e 2): a base só com o obrigatório e as seções sob demanda.
describe('round-guide.mjs: base obrigatória e secao (#1533, TE1)', () => {
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

  it('SECOES_SOB_DEMANDA tem as chaves da decisão 1 e da 4 (mais a consulta.regras), cada uma com o "quando ler"', async () => {
    const { SECOES_SOB_DEMANDA } = await load();
    expect(SECOES_SOB_DEMANDA.map((s) => s.chave)).toEqual(ALL_KEYS);
    for (const s of SECOES_SOB_DEMANDA) expect(s.quando, s.chave).toMatch(/\S/);
  });

  it('a base leva só o obrigatório e uma linha de comando por seção sob demanda', async () => {
    const { buildGuideBase } = await load();
    const base = buildGuideBase(GUIDE, ['R0', 'R22'], { commit: 'abc1234' });
    for (const keep of [
      '## Comece aqui',
      '## 4. Como a app grava',
      '**Convenções.**',
      '### Relato de uma rodada de teste',
      '## Apêndice A',
    ])
      expect(base, keep).toContain(keep);
    expect(base).not.toContain('## 9. Teste manual avançado');
    for (const key of GUIDE_KEYS) {
      expect(base, key).toContain(`\`node scripts/testing/cloud.mjs secao ${key}\``);
    }
    // O conteúdo das seções 1, 2, 3, 5, 6, 7, do A.seletores e do B não está na base.
    expect(base).not.toContain('| **Versão principal** |');
    expect(base).not.toContain('**Tela inicial.**');
    expect(base).not.toContain('**Mover, copiar e renomear pastas**');
    expect(base).not.toContain('**Janelas:** cada janela de ferramenta');
  });

  it('guideSection imprime a seção pedida e várias na ordem, separadas por ---', async () => {
    const { buildRoundGuide, guideSection } = await load();
    const guide = buildRoundGuide(GUIDE, ['R0'], { commit: 'abc1234' });
    const seven = guideSection(guide, ['7']);
    expect(seven.startsWith('## 7. Como relatar um problema')).toBe(true);
    expect(seven).not.toContain('## 8. Roteiros');
    const two = guideSection(guide, ['B', '1']);
    expect(two.indexOf('## Apêndice B')).toBeLessThan(
      two.indexOf('## 1. Onde pegar a app'),
    );
    expect(two).toContain('\n---\n');
    expect(guideSection(guide, ['A.seletores'])).toMatch(
      /^### Seletores e nomes que enganam/,
    );
  });

  it('as chaves consulta.* leem o TESTING-NUVEM-CONSULTA.md', async () => {
    const { guideSection } = await load();
    const out = guideSection('', ['consulta.grupos', 'consulta.historico'], CONSULTA);
    expect(out).toContain('## Rodada dirigida em grupos');
    expect(out).toContain('Linha de base');
    expect(() => guideSection('', ['consulta.grupos'])).toThrow(/consulta/);
  });

  it('chave desconhecida lança com a lista das chaves', async () => {
    const { guideSection } = await load();
    expect(() => guideSection('', ['xyz'])).toThrow(
      /xyz[\s\S]*A\.seletores[\s\S]*consulta\.grupos/,
    );
  });

  it('passa de 25.000 caracteres: corta e diz como continuar', async () => {
    const { guideSection } = await load();
    const big = `## 1. Onde pegar a app\n\n${'linha comprida\n'.repeat(2000)}\n## 2. Requisitos\n\nx\n`;
    const out = guideSection(big, ['1', '2']);
    expect(out.length).toBeLessThanOrEqual(25_000);
    expect(out).toContain('… corte em 25.000 caracteres');
  });

  it('a CLI --out grava uma base menor que o guia, e o guia.md leva tudo', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'round-guide-'));
    try {
      const out = path.join(dir, 'guia.md');
      execFileSync('node', [SCRIPT, 'R0', '--out', out], { stdio: 'pipe' });
      const base = readFileSync(path.join(dir, 'guia-base.md'), 'utf8');
      expect(base).toContain('cloud.mjs secao 5');
      expect(readFileSync(out, 'utf8')).toContain('**Tela inicial.**');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Etapa #1533 (TE3, decisão 14 (4)): o `passo R25` traz o preparo inteiro, sem cortar cerca de código.
describe('passo R25: o preparo inteiro (etapa #1533, TE3)', () => {
  async function passoR25(roteiros: string[]): Promise<string> {
    const mod: {
      buildRoundGuide: (md: string, r: string[], o?: { commit?: string }) => string;
      guideExcerpt: (guide: string, itens: string[]) => string;
    } = await import('../../scripts/testing/round-guide.mjs');
    return mod.guideExcerpt(mod.buildRoundGuide(GUIDE, roteiros, { commit: 'abc1234' }), [
      'R25',
    ]);
  }

  for (const [nome, roteiros] of [
    ['guia all', ['all']],
    ['guia do bloco 2 (R0, R15, R25)', ['R0', 'R15', 'R25']],
  ] as const) {
    it(`${nome}: o tokens.mjs vem do repositório e as funções tinta, sonda e medir, da cerca de abertura à de fechamento`, async () => {
      const out = await passoR25([...roteiros]);
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
      // O preparo da biblioteca com tokens é o `scripts/testing/tokens.mjs` do repositório (MC1),
      // não um bloco do guia: o guia o cita e o arquivo existe no commit que o testador compila.
      expect(out).toContain('O `scripts/testing/tokens.mjs` do repositório');
      expect(existsSync('scripts/testing/tokens.mjs')).toBe(true);
      const tools = block('tinta() {');
      for (const fn of ['sonda()', 'medir()', 'unid()', 'caixa()']) {
        expect(tools).toContain(fn);
      }
      expect(out).not.toContain('… corte em 25.000 caracteres');
    });
  }
});

// Etapa #1639 (TC1, decisão 3): `--faixas` divide cada roteiro em lotes de até 20 passos para os subagentes.
interface Faixa {
  token: string;
  steps: number;
}
interface FaixasModule {
  FAIXA_LIMIT: number;
  planFaixas: (md: string, roteiros: string[], o?: { limit?: number }) => Faixa[];
  formatFaixas: (lotes: Faixa[]) => string;
  guidePreparo: (guide: string, itens: string[], fallback?: string) => string;
  buildRoundGuide: (md: string, r: string[], o?: { commit?: string }) => string;
  guideExcerpt: (guide: string, itens: string[]) => string;
}
const loadFaixas = (): Promise<FaixasModule> =>
  import('../../scripts/testing/round-guide.mjs') as unknown as Promise<FaixasModule>;

describe('round-guide.mjs --faixas (#1639, TC1, decisão 3)', () => {
  const porRoteiro = (lotes: Faixa[]): Record<string, number[]> => {
    const out: Record<string, number[]> = {};
    for (const l of lotes) (out[l.token.split('.')[0] ?? ''] ??= []).push(l.steps);
    return out;
  };

  it('FAIXA_LIMIT é 20', async () => {
    expect((await loadFaixas()).FAIXA_LIMIT).toBe(20);
  });

  it('o aceite: R25 em 5 lotes, R12 em 3, R17, R9 e R3 em 2, R13 inteiro; a soma é a dos passos do guia', async () => {
    const { planFaixas } = await loadFaixas();
    const roteiros = ['R25', 'R12', 'R3', 'R13', 'R17', 'R9'];
    const lotes = planFaixas(GUIDE, roteiros);
    const by = porRoteiro(lotes);
    const g =
      (await import('../../scripts/testing/round-guide.mjs')) as unknown as GroupsModule;
    const passos = Object.fromEntries(
      g.planGroups(GUIDE, roteiros).items.map((i) => [i.token, i.steps]),
    );
    const esperado = { R25: 5, R12: 3, R17: 2, R9: 2, R3: 2, R13: 1 } as const;
    for (const [id, n] of Object.entries(esperado)) {
      expect(by[id], id).toHaveLength(n);
      expect(
        by[id]?.reduce((a, b) => a + b, 0),
        id,
      ).toBe(passos[id]);
    }
    for (const l of lotes) expect(l.steps).toBeLessThanOrEqual(20);
  });

  it('roteiro de até 20 passos é um lote com o token do roteiro; acima, faixas R<n>.<a>-R<n>.<b>', async () => {
    const { planFaixas } = await loadFaixas();
    const lotes = planFaixas(GUIDE, ['R13', 'R25']);
    expect(lotes[0]?.token).toBe('R13');
    expect(lotes[0]?.steps).toBeLessThanOrEqual(20);
    expect(lotes[1]?.token).toBe('R25.1-R25.20');
    expect(lotes[2]?.token).toBe('R25.21-R25.40');
  });

  it('as faixas cobrem os passos de cada roteiro, sem repetir nem pular', async () => {
    const { planFaixas } = await loadFaixas();
    for (const id of ['R25', 'R12', 'R22', 'R3', 'R9', 'R17']) {
      const guide = (await loadFaixas()).buildRoundGuide(GUIDE, [id], {
        commit: 'abc1234',
      });
      const inicio = guide.search(new RegExp(`^### ${id}\\b`, 'm'));
      const resto = guide.slice(inicio + 4);
      const fim = resto.search(/^### /m);
      const secao = fim < 0 ? resto : resto.slice(0, fim);
      const codes = [
        ...secao.matchAll(new RegExp(`^\\|\\s*(?:\\*\\*)?(${id}\\.\\d+[a-z]?)`, 'gm')),
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

  it('o passo que o guideExcerpt junta ao anterior (R22.6a com R22.6) não se separa', async () => {
    const { planFaixas } = await loadFaixas();
    const lotes = planFaixas(GUIDE, ['R22'], { limit: 6 });
    expect(lotes[0]?.token).toBe('R22.1-R22.6a');
    expect(lotes[1]?.token.startsWith('R22.7-')).toBe(true);
  });

  it('uma faixa pedida é respeitada e só se parte acima do limite', async () => {
    const { planFaixas } = await loadFaixas();
    const um = planFaixas(GUIDE, ['R6.3-R6.7']);
    expect(um.map((l) => l.token)).toEqual(['R6.3-R6.7']);
    const partido = planFaixas(GUIDE, ['R6.3-R6.7'], { limit: 2 });
    expect(partido.length).toBeGreaterThan(1);
    expect(partido[0]?.token.startsWith('R6.3-')).toBe(true);
    expect(partido[0]?.steps).toBe(2);
    expect(partido.reduce((n, l) => n + l.steps, 0)).toBe(um[0]?.steps);
  });

  it('o R0 fica fora e roteiros pequenos não se juntam; a ordem é a do guia', async () => {
    const { planFaixas } = await loadFaixas();
    const lotes = planFaixas(GUIDE, ['R12', 'R0', 'R2']);
    expect(lotes.map((l) => l.token.split('.')[0])).toEqual(['R2', 'R12', 'R12', 'R12']);
    expect(planFaixas(GUIDE, ['R0'])).toEqual([]);
  });

  it('uma faixa pedida que termina em R12.11 leva todos os passos com letra e conta certo', async () => {
    const { planFaixas } = await loadFaixas();
    const lotes = planFaixas(GUIDE, ['R12.1-R12.11']);
    const total = lotes.reduce((n, l) => n + l.steps, 0);
    expect(lotes.at(-1)?.token.endsWith('R12.11')).toBe(true);
    const excerpt = (await loadFaixas()).guideExcerpt(GUIDE, ['R12.1-R12.11']);
    const linhas = [...excerpt.matchAll(/^\|\s*(?:\*\*)?R12\.\d+[a-z]?\b/gm)];
    expect(total).toBe(linhas.length);
  });

  it('o corte automático não separa R12.11c de R12.11d', async () => {
    const { planFaixas } = await loadFaixas();
    for (const l of planFaixas(GUIDE, ['R12'])) {
      expect(l.token.endsWith('R12.11c')).toBe(false);
    }
  });

  it('faixas pedidas que se sobrepõem não repetem passos', async () => {
    const { planFaixas } = await loadFaixas();
    const lotes = planFaixas(GUIDE, ['R25.1-R25.20', 'R25.5-R25.30']);
    expect(lotes.reduce((n, l) => n + l.steps, 0)).toBe(
      planFaixas(GUIDE, ['R25.1-R25.30']).reduce((n, l) => n + l.steps, 0),
    );
    expect(lotes[0]?.token).toBe('R25.1-R25.20');
  });

  it('roteiro inexistente lança', async () => {
    const { planFaixas } = await loadFaixas();
    expect(() => planFaixas(GUIDE, ['R99'])).toThrow(/R99/);
  });

  it('a CLI imprime uma linha por lote, na ordem do guia; sem item sai com 2', () => {
    const r = spawnSync(
      'node',
      [SCRIPT, '--faixas', 'R25', 'R12', 'R3', 'R13', 'R17', 'R9'],
      {
        encoding: 'utf8',
      },
    );
    expect(r.status).toBe(0);
    const lines = r.stdout.trimEnd().split('\n');
    expect(lines).toHaveLength(15);
    expect(lines[0]).toMatch(/^lote 1 de 15: R3\.1-R3\.\d+[a-z]? \(20 passos\)$/);
    expect(lines.at(-1)).toMatch(
      /^lote 15 de 15: R25\.\d+[a-z]?-R25\.\d+[a-z]? \(\d+ passos\)$/,
    );
    const none = spawnSync('node', [SCRIPT, '--faixas'], { encoding: 'utf8' });
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('Uso: node scripts/testing/round-guide.mjs --faixas');
  });
});

describe('round-guide.mjs: o preparo de um roteiro (#1639, TC1, decisão 4)', () => {
  it('guidePreparo do R25 traz o título, o Preparo e as funções, sem nenhuma linha de passo', async () => {
    const { guidePreparo, buildRoundGuide } = await loadFaixas();
    const guide = buildRoundGuide(GUIDE, ['all'], { commit: 'abc1234' });
    const out = guidePreparo(guide, ['R25']);
    expect(out.split('\n')[0]).toMatch(/^### R25\b/);
    for (const fn of ['tinta() {', 'sonda()', 'medir()']) expect(out).toContain(fn);
    expect(out).toContain('O `scripts/testing/tokens.mjs` do repositório');
    expect(out).not.toMatch(/^\| R25\./m);
    expect(out).not.toMatch(/^\| Passo\b/m);
    expect(out).not.toContain('… corte em 25.000 caracteres');
  });

  it('item que não é roteiro inteiro lança com o uso', async () => {
    const { guidePreparo, buildRoundGuide } = await loadFaixas();
    const guide = buildRoundGuide(GUIDE, ['R25'], { commit: 'abc1234' });
    expect(() => guidePreparo(guide, ['R25.30-R25.31'])).toThrow(/--preparo/);
    expect(() => guidePreparo(guide, ['R25.3'])).toThrow(/--preparo/);
  });

  it('consulta.subagente está em SECOES_SOB_DEMANDA com o "quando ler"', async () => {
    const mod: {
      SECOES_SOB_DEMANDA: { chave: string; quando: string; fonte: string }[];
    } = await import('../../scripts/testing/round-guide.mjs');
    const e = mod.SECOES_SOB_DEMANDA.find((s) => s.chave === 'consulta.subagente');
    expect(e?.fonte).toBe('consulta');
    expect(e?.quando).toBe('antes do primeiro lote (o R0)');
  });
});
