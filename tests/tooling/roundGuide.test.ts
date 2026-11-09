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
