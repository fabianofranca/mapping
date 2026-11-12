// @vitest-environment node
// Fase FM2 (etapa #1532, decisões 11 a 14): ficha incompleta, etapa exclusiva, "Drenar", seções no Paralelo e `slug`.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const SKILL = '.claude/skills/implementar-fila/SKILL.md';
const DETALHAR = '.claude/skills/detalhar-backlog/SKILL.md';
const NOW = '2026-11-10T10:00:00Z';
const TEMPO_SUBPROCESSOS = 30_000;

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function json(name: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Array<
    Record<string, unknown>
  >;
}

function vagas(): string {
  return String(json('meta')[0]?.vagas);
}

function ficha(dep: string, toca: string, fases = 'FM1:#1:high'): string {
  const partes = [`dep=${dep}`, 'nivel=impact: low', 'mcp=não', 'schema=não'];
  if (fases) partes.push(`fases=${fases}`);
  if (toca) partes.push(`toca=${toca}`);
  return partes.join(' | ');
}

function etapa(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Etapa ${issue}`, `plan=${plan}`, ...extra);
}

function motivos(): string[] {
  return vagas().split(' · ').slice(1);
}

function leitura(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('painel.py — ficha incompleta (FM2, decisão 11)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    'dep, toca e fases em ? (ou sem o campo) dão "ficha incompleta" na ordem dep, toca, fases',
    () => {
      etapa('#1', 'dep=? | toca=a.ts | fases=FM1:#1:high');
      etapa('#2', 'dep=nenhuma | toca=? | fases=FM1:#1:high');
      etapa('#3', 'dep=nenhuma | toca=c.ts | fases=?');
      etapa('#4', 'dep=? | toca=? | fases=?');
      etapa('#5', 'nivel=impact: low | fases=FM1:#1:high');
      etapa('#6', 'dep=nenhuma | toca=f.ts | fases=FM1:#1:high');
      expect(motivos().slice(0, 6)).toEqual([
        '#1 ficha incompleta (dep)',
        '#2 ficha incompleta (toca)',
        '#3 ficha incompleta (fases)',
        '#4 ficha incompleta (dep, toca, fases)',
        '#5 ficha incompleta (dep, toca)',
        '#6 começa',
      ]);
    },
    TEMPO_SUBPROCESSOS,
  );

  it('o show imprime "fichas a refazer" (ou nenhuma)', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'));
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
    etapa('#2', ficha('nenhuma', '?'));
    etapa('#3', ficha('?', 'c.ts'));
    const show = run('show', dir);
    expect(show).toContain('fichas a refazer: #2 #3');
    expect(show).toContain('#2 ficha incompleta (toca)');
    run('row', dir, '#2', `plan=${ficha('nenhuma', 'b.ts')}`);
    run('row', dir, '#3', 'status=concluída');
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
  });

  it('o hold vem antes da ficha incompleta', () => {
    etapa('#1', ficha('?', '?'), 'hold=pausada pelo dono');
    expect(motivos()[0]).toBe('#1 pausada pelo dono');
  });

  it('etapa começada com toca=? continua conflitando com toda candidata', () => {
    etapa('#1', ficha('nenhuma', '?'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('nenhuma', 'b.ts'));
    expect(motivos()[0]).toBe('#2 arquivo ? com #1');
  });
});

describe('painel.py — etapa exclusiva (FM2, decisão 12)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('row exclusive=sim grava o campo e exclusive= o limpa; outro valor é erro', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'));
    run('row', dir, '#1', 'exclusive=sim');
    expect(json('queue')[0]?.exclusive).toBe('sim');
    expect(run('show', dir, '#1')).toContain('exclusive: sim');
    run('row', dir, '#1', 'exclusive=');
    expect(json('queue')[0]?.exclusive).toBe('');
    expect(runRaw('row', dir, '#1', 'exclusive=talvez').status).toBe(2);
  });

  it(
    'não começa com etapa começada e não mesclada (em andamento, esperando dono, falhou, aguardando com started)',
    () => {
      for (const extra of [
        ['status=em andamento'],
        ['status=esperando dono'],
        ['status=falhou'],
        ['status=aguardando', 'started=now'],
      ]) {
        run('init', dir, '--force');
        run('start', dir, '--paralelo', '9');
        etapa('#1', ficha('nenhuma', 'a.ts'), ...extra, 'started=now');
        etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
        expect(motivos()[0]).toBe('#2 exclusiva (espera a fila esvaziar)');
        run('row', dir, '#1', 'status=concluída');
        expect(motivos()[0]).toBe('#2 começa');
      }
    },
    TEMPO_SUBPROCESSOS,
  );

  it('não começa quando uma não exclusiva começa no mesmo cálculo; antes dela, começa e a segura', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'));
    etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    expect(motivos().slice(0, 2)).toEqual([
      '#1 começa',
      '#2 exclusiva (espera a fila esvaziar)',
    ]);
    run('init', dir, '--force');
    run('start', dir, '--paralelo', '9');
    etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    etapa('#1', ficha('nenhuma', 'a.ts'));
    run('row', dir, '#2', 'order=1');
    run('row', dir, '#1', 'order=2');
    expect(motivos().slice(0, 2)).toEqual(['#2 começa', '#1 exclusiva #2 em andamento']);
  });

  it('a exclusiva que espera não segura as candidatas comuns de depois dela (a drenagem é o "Drenar")', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    etapa('#3', ficha('nenhuma', 'c.ts'));
    expect(motivos().slice(0, 2)).toEqual([
      '#2 exclusiva (espera a fila esvaziar)',
      '#3 começa',
    ]);
  });

  it('com a exclusiva começada, nenhuma outra começa', () => {
    etapa(
      '#1',
      ficha('nenhuma', 'a.ts'),
      'exclusive=sim',
      'status=em andamento',
      'started=now',
    );
    etapa('#2', ficha('nenhuma', 'b.ts'));
    etapa('#3', ficha('nenhuma', 'c.ts'), 'exclusive=sim');
    expect(motivos().slice(0, 2)).toEqual([
      '#2 exclusiva #1 em andamento',
      '#3 exclusiva #1 em andamento',
    ]);
    expect(run('show', dir)).toContain('começar agora: nenhuma');
  });

  it(
    'com a exclusiva começada e parada (falhou, esperando dono, aguardando), o motivo diz o estado e a fila segue segurada (PP1, decisões 2 e 3 da #1595)',
    () => {
      const casos: Array<[string[], string]> = [
        [['status=falhou'], 'exclusiva #1 falhou'],
        [['status=esperando dono'], 'exclusiva #1 esperando dono'],
        [['status=aguardando', 'started=now'], 'exclusiva #1 aguardando'],
      ];
      for (const [extra, motivo] of casos) {
        run('init', dir, '--force');
        run('start', dir, '--paralelo', '9');
        etapa('#1', ficha('nenhuma', 'a.ts'), 'exclusive=sim', 'started=now', ...extra);
        etapa('#2', ficha('nenhuma', 'b.ts'));
        etapa('#3', ficha('nenhuma', 'c.ts'), 'exclusive=sim');
        expect(motivos().slice(0, 2)).toEqual([`#2 ${motivo}`, `#3 ${motivo}`]);
        expect(run('show', dir)).toContain('começar agora: nenhuma');
      }
    },
    TEMPO_SUBPROCESSOS,
  );

  it('a saída da exclusiva parada é do dono: exclusive= na linha dela libera a fila', () => {
    etapa(
      '#1',
      ficha('nenhuma', 'a.ts'),
      'exclusive=sim',
      'status=falhou',
      'started=now',
    );
    etapa('#2', ficha('nenhuma', 'b.ts'));
    expect(motivos()[0]).toBe('#2 exclusiva #1 falhou');
    run('row', dir, '#1', 'exclusive=');
    run('log', dir, 'exclusiva #1 liberada pelo dono');
    expect(motivos()[0]).toBe('#2 começa');
    expect(run('show', dir)).toContain('começar agora: #2');
  });

  it('duas exclusivas começam uma por vez, na ordem', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'exclusive=sim');
    etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    expect(motivos().slice(0, 2)).toEqual(['#1 começa', '#2 exclusiva #1 em andamento']);
    expect(run('show', dir)).toContain('começar agora: #1');
  });

  it('o hold vem antes de exclusive no motivo', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim', 'hold=esperando dono (x)');
    expect(motivos()[0]).toBe('#2 esperando dono (x)');
  });
});

describe('painel.py — seções no Paralelo (FM2, decisão 14)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const motivo = (a: string, b: string): string => {
    run('init', dir, '--force');
    run('start', dir, '--paralelo', '9');
    etapa('#1', ficha('nenhuma', a), 'status=em andamento');
    etapa('#2', ficha('nenhuma', b));
    return motivos()[0] ?? '';
  };

  it(
    'FLOW.md, PROCESS.md e SKILL.md se comparam por seção; CLAUDE.md e TESTING.md como antes',
    () => {
      expect(motivo('docs/FLOW.md#a', 'docs/FLOW.md#b')).toBe('#2 começa');
      expect(motivo('docs/FLOW.md#a', 'docs/FLOW.md#a')).toBe(
        '#2 arquivo docs/FLOW.md#a com #1',
      );
      expect(motivo('docs/FLOW.md', 'docs/FLOW.md#a')).toBe(
        '#2 arquivo docs/FLOW.md#a com #1',
      );
      expect(motivo('docs/FLOW.md#a', 'docs/FLOW.md')).toBe(
        '#2 arquivo docs/FLOW.md com #1',
      );
      expect(motivo('docs/FLOW.md', 'docs/FLOW.md')).toBe(
        '#2 arquivo docs/FLOW.md com #1',
      );
      const skill = '.claude/skills/implementar-fila/SKILL.md';
      expect(motivo(`${skill}#x`, `${skill}#y`)).toBe('#2 começa');
      expect(motivo(`${skill}#x`, `${skill}#x`)).toBe(`#2 arquivo ${skill}#x com #1`);
      expect(motivo(`${skill}#x`, skill)).toBe(`#2 arquivo ${skill} com #1`);
      const outro = '.claude/skills/detalhar-backlog/SKILL.md';
      expect(motivo(`${skill}#x`, `${outro}#x`)).toBe('#2 começa');
      expect(motivo('docs/PROCESS.md#a', 'docs/PROCESS.md#b')).toBe('#2 começa');
      expect(motivo('docs/PROCESS.md#a', 'docs/PROCESS.md#a')).toBe(
        '#2 arquivo docs/PROCESS.md#a com #1',
      );
      expect(motivo('docs/PROCESS.md', 'docs/PROCESS.md#a')).toBe(
        '#2 arquivo docs/PROCESS.md#a com #1',
      );
      expect(motivo('CLAUDE.md#a', 'CLAUDE.md#b')).toBe('#2 arquivo CLAUDE.md#b com #1');
      expect(motivo('docs/TESTING.md#R12', 'docs/TESTING.md#R6')).toBe('#2 começa');
      expect(motivo('docs/TESTING.md#R12', 'docs/TESTING.md')).toBe(
        '#2 arquivo docs/TESTING.md com #1',
      );
    },
    TEMPO_SUBPROCESSOS,
  );
});

describe('painel.py slug (FM2, decisão 14)', () => {
  it('o título do ## em minúsculas, sem acento, com - entre as sequências e sem - nas pontas', () => {
    expect(run('slug', '3. Por etapa').trim()).toBe('3-por-etapa');
    expect(run('slug', 'Para o dono, nos três chats').trim()).toBe(
      'para-o-dono-nos-tres-chats',
    );
    expect(run('slug', 'Mudanças na fila durante a execução').trim()).toBe(
      'mudancas-na-fila-durante-a-execucao',
    );
    expect(run('slug', '  ¿Quê? (já)!  ').trim()).toBe('que-ja');
  });

  it('não entra no lote e não aceita pasta', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    try {
      run('init', dir);
      const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
        input: 'slug "x"\n',
        encoding: 'utf8',
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('linha 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('textos do skill e do FLOW (FM2)', () => {
  it('implementar-fila cita a etapa exclusiva, "Drenar", fichas a refazer e o Toca em do bug dependente', () => {
    const skill = leitura(SKILL);
    expect(skill).toContain('exclusive=sim');
    expect(skill).toContain('Drenar');
    expect(skill).toContain('Fila drenada');
    expect(skill).toContain('fichas a refazer');
    expect(skill).toContain('ficha incompleta');
    expect(skill).toContain('painel.py slug');
    const passo4 = between(
      skill,
      '**Achado que depende de código de outro épico**',
      '## Mudanças na fila durante a execução',
    );
    expect(passo4).toContain('**Toca em:**');
    expect(passo4).toContain('**Fases:**');
  });

  it('o Paralelo e o passo 4 do detalhar-backlog citam a seção', () => {
    expect(section(leitura(SKILL), '## Paralelo')).toContain('docs/FLOW.md#');
    const detalhar = leitura(DETALHAR);
    expect(detalhar).toContain('SKILL.md#');
    expect(detalhar).toContain('`##`');
  });

  it('o item 2 de "Para o dono" cita a comparação por seção', () => {
    const flow = leitura('docs/FLOW.md');
    expect(section(flow, '## Para o dono, nos três chats')).toContain('por seção');
  });
});
