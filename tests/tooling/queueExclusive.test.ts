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

  it('a exclusiva na frente segura as candidatas de depois dela (#1813)', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    etapa('#3', ficha('nenhuma', 'c.ts'));
    expect(motivos().slice(0, 2)).toEqual([
      '#2 exclusiva (espera a fila esvaziar)',
      '#3 segurada para a exclusiva #2',
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

describe('painel.py — exclusiva na frente drena a fila (#1813)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a drenagem e o começo: o show diz quem drena; com a fila vazia, a exclusiva começa', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    etapa('#3', ficha('nenhuma', 'c.ts'));
    expect(motivos().slice(0, 2)).toEqual([
      '#2 exclusiva (espera a fila esvaziar)',
      '#3 segurada para a exclusiva #2',
    ]);
    const show = run('show', dir);
    expect(show).toContain('começar agora: nenhuma\ndrenando para a exclusiva: #2\n');
    run('row', dir, '#1', 'status=concluída');
    expect(motivos().slice(0, 2)).toEqual(['#2 começa', '#3 exclusiva #2 em andamento']);
    expect(run('show', dir)).toContain(
      'começar agora: #2\ndrenando para a exclusiva: nenhuma\n',
    );
  });

  it('a comum da frente que espera arquivo conta: não há drenagem e as de depois seguem', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('nenhuma', 'a.ts'));
    etapa('#3', ficha('nenhuma', 'c.ts'), 'exclusive=sim');
    etapa('#4', ficha('nenhuma', 'd.ts'));
    expect(motivos().slice(0, 3)).toEqual([
      '#2 arquivo a.ts com #1',
      '#3 exclusiva (espera a fila esvaziar)',
      '#4 começa',
    ]);
    expect(run('show', dir)).toContain('drenando para a exclusiva: nenhuma');
  });

  it('hold, ficha incompleta e dep não contam; a comum que começa no mesmo cálculo não tira a exclusiva da frente', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('#1:aberta', 'b.ts'));
    etapa('#3', ficha('nenhuma', 'c.ts'), 'hold=esperando dono (x)');
    etapa('#4', ficha('?', 'd.ts'));
    etapa('#5', ficha('nenhuma', 'e.ts'), 'exclusive=sim');
    etapa('#6', ficha('nenhuma', 'f.ts'));
    expect(motivos().slice(0, 5)).toEqual([
      '#2 dep #1',
      '#3 esperando dono (x)',
      '#4 ficha incompleta (dep)',
      '#5 exclusiva (espera a fila esvaziar)',
      '#6 segurada para a exclusiva #5',
    ]);
    run('row', dir, '#1', 'status=concluída');
    expect(motivos().slice(0, 5)).toEqual([
      '#2 começa',
      '#3 esperando dono (x)',
      '#4 ficha incompleta (dep)',
      '#5 exclusiva (espera a fila esvaziar)',
      '#6 segurada para a exclusiva #5',
    ]);
    expect(run('show', dir)).toContain('drenando para a exclusiva: #5');
  });

  it('a exclusiva com dependência aberta não drena', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('#1:aberta', 'b.ts'), 'exclusive=sim');
    etapa('#3', ficha('nenhuma', 'c.ts'));
    expect(motivos().slice(0, 2)).toEqual(['#2 dep #1', '#3 começa']);
    expect(run('show', dir)).toContain('drenando para a exclusiva: nenhuma');
  });

  it('com duas exclusivas, a primeira drena e a segunda fica segurada', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    etapa('#3', ficha('nenhuma', 'c.ts'), 'exclusive=sim');
    expect(motivos().slice(0, 2)).toEqual([
      '#2 exclusiva (espera a fila esvaziar)',
      '#3 segurada para a exclusiva #2',
    ]);
  });

  it('os textos do skill dizem a drenagem', () => {
    const skill = leitura(SKILL);
    const mudancas = section(skill, '## Mudanças na fila durante a execução');
    expect(mudancas).toContain('segurada para a exclusiva');
    expect(mudancas).toContain('drenando para a exclusiva');
    expect(mudancas).toContain('severity: high');
    const painel = section(skill, '## Painel');
    expect(painel).toContain('segurada para a exclusiva');
    expect(painel).toContain('drenando para a exclusiva');
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
    'FLOW.md, PROCESS.md e SKILL.md se comparam por seção; TESTING.md como antes',
    () => {
      expect(
        motivo('docs/FLOW.md#fase-de-correcao', 'docs/FLOW.md#para-o-testador'),
      ).toBe('#2 começa');
      expect(
        motivo('docs/FLOW.md#fase-de-correcao', 'docs/FLOW.md#fase-de-correcao'),
      ).toBe('#2 arquivo docs/FLOW.md#fase-de-correcao com #1');
      expect(motivo('docs/FLOW.md', 'docs/FLOW.md#fase-de-correcao')).toBe(
        '#2 arquivo docs/FLOW.md#fase-de-correcao com #1',
      );
      expect(motivo('docs/FLOW.md#fase-de-correcao', 'docs/FLOW.md')).toBe(
        '#2 ficha incompleta (toca: docs/FLOW.md)',
      );
      expect(motivo('docs/FLOW.md', 'docs/FLOW.md')).toBe(
        '#2 ficha incompleta (toca: docs/FLOW.md)',
      );
      const skill = '.claude/skills/implementar-fila/SKILL.md';
      expect(motivo(`${skill}#paralelo`, `${skill}#painel`)).toBe('#2 começa');
      expect(motivo(`${skill}#paralelo`, `${skill}#paralelo`)).toBe(
        `#2 arquivo ${skill}#paralelo com #1`,
      );
      expect(motivo(`${skill}#paralelo`, skill)).toBe(
        `#2 ficha incompleta (toca: ${skill})`,
      );
      const outro = '.claude/skills/detalhar-backlog/SKILL.md';
      expect(motivo(`${skill}#paralelo`, `${outro}#argumentos`)).toBe('#2 começa');
      expect(motivo('docs/PROCESS.md#etapas', 'docs/PROCESS.md#fluxo-de-trabalho')).toBe(
        '#2 começa',
      );
      expect(motivo('docs/PROCESS.md#etapas', 'docs/PROCESS.md#etapas')).toBe(
        '#2 arquivo docs/PROCESS.md#etapas com #1',
      );
      expect(motivo('docs/PROCESS.md', 'docs/PROCESS.md#etapas')).toBe(
        '#2 arquivo docs/PROCESS.md#etapas com #1',
      );
      expect(motivo('docs/TESTING.md#R12', 'docs/TESTING.md#R6')).toBe('#2 começa');
      expect(motivo('docs/TESTING.md#R12', 'docs/TESTING.md')).toBe(
        '#2 ficha incompleta (toca: docs/TESTING.md)',
      );
    },
    TEMPO_SUBPROCESSOS,
  );
});

describe('painel.py — todo .md de docs/ e da raiz por seção (TS1, decisões 1, 2, 4, 5 e 8)', () => {
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

  it('os .md de docs/ se comparam por seção; sem âncora ou a mesma âncora conflita', () => {
    const arq = 'docs/ARCHITECTURE.md';
    expect(motivo(`${arq}#performance`, `${arq}#session-and-saving`)).toBe('#2 começa');
    expect(motivo(`${arq}#performance`, `${arq}#performance`)).toBe(
      `#2 arquivo ${arq}#performance com #1`,
    );
    expect(motivo(arq, `${arq}#performance`)).toBe(
      `#2 arquivo ${arq}#performance com #1`,
    );
    expect(motivo(`${arq}#performance`, arq)).toBe(`#2 ficha incompleta (toca: ${arq})`);
  });

  it('os .md da raiz se comparam por seção, com ./ normalizado e .md novo da raiz', () => {
    expect(motivo('CLAUDE.md#architecture-rules', 'CLAUDE.md#workflow-summary')).toBe(
      '#2 começa',
    );
    expect(motivo('CLAUDE.md#stack', 'CLAUDE.md#stack')).toBe(
      '#2 arquivo CLAUDE.md#stack com #1',
    );
    expect(motivo('CLAUDE.md', 'CLAUDE.md#project')).toBe(
      '#2 arquivo CLAUDE.md#project com #1',
    );
    expect(motivo('CLAUDE.md#project', 'CLAUDE.md')).toBe(
      '#2 ficha incompleta (toca: CLAUDE.md)',
    );
    expect(motivo('README.md#how-to-test', 'README.md#documentation')).toBe('#2 começa');
    expect(motivo('README.md', 'README.md#documentation')).toBe(
      '#2 arquivo README.md#documentation com #1',
    );
    expect(motivo('./CLAUDE.md#stack', 'CLAUDE.md#code')).toBe('#2 começa');
    expect(motivo('AGENTS.md#a', 'AGENTS.md#b')).toBe('#2 começa');
  });

  it('docs/TESTING-NUVEM.md por seção; #blocos não conta; docs/design-system/ não conta', () => {
    expect(motivo('docs/TESTING-NUVEM.md#relato', 'docs/TESTING-NUVEM.md#ambiente')).toBe(
      '#2 começa',
    );
    expect(motivo('docs/TESTING-NUVEM.md#blocos', 'docs/TESTING-NUVEM.md#relato')).toBe(
      '#2 começa',
    );
    expect(motivo('docs/design-system/x.md', 'docs/design-system/x.md')).toBe(
      '#2 começa',
    );
  });

  it('subpasta nova de docs/ também se compara por seção', () => {
    expect(motivo('docs/guias/a.md#x', 'docs/guias/a.md#y')).toBe('#2 começa');
    expect(motivo('docs/guias/a.md#x', 'docs/guias/a.md#x')).toBe(
      '#2 arquivo docs/guias/a.md#x com #1',
    );
  });

  it('pasta e glob continuam cobrindo tudo o que casam, com ou sem âncora', () => {
    expect(motivo('docs/', 'docs/ARCHITECTURE.md#performance')).toBe(
      '#2 arquivo docs/ARCHITECTURE.md#performance com #1',
    );
    expect(motivo('docs/*.md', 'docs/FLOW.md#fase-de-correcao')).toBe(
      '#2 arquivo docs/FLOW.md#fase-de-correcao com #1',
    );
    expect(motivo('*.md', 'CLAUDE.md#stack')).toBe('#2 arquivo CLAUDE.md#stack com #1');
    const glob = 'tests/storage/folder*.test.ts';
    expect(motivo(`${glob}#a`, `${glob}#b`)).toBe(`#2 arquivo ${glob}#b com #1`);
    expect(motivo('*.md#a', '*.md#b')).toBe('#2 ficha incompleta (toca: *.md#b)');
  });

  it('fora de docs/ e da raiz, ou não .md: arquivo inteiro (âncoras diferentes conflitam)', () => {
    for (const f of [
      'viewer/README.md',
      'examples/README.md',
      'mappings-workspace/AGENTS.md',
      'libraries/kotlin/docs/x.md',
      'docs/x.schema.json',
    ]) {
      expect(motivo(`${f}#a`, `${f}#b`)).toBe(`#2 arquivo ${f}#b com #1`);
    }
  });

  it('o TESTING.md segue por roteiro', () => {
    expect(motivo('docs/TESTING.md#R1', 'docs/TESTING.md#R2')).toBe('#2 começa');
    expect(motivo('docs/TESTING.md', 'docs/TESTING.md#R2')).toBe(
      '#2 arquivo docs/TESTING.md#R2 com #1',
    );
  });

  it('os textos dos skills, do PROCESS e do FLOW dizem a regra nova', () => {
    const skill = leitura(SKILL);
    const paralelo = section(skill, '## Paralelo');
    expect(paralelo).toContain('docs/ARCHITECTURE.md#desempenho');
    expect(paralelo).toContain('CLAUDE.md#');
    expect(paralelo).not.toContain(
      'o `docs/ARCHITECTURE.md` contam como arquivo inteiro',
    );
    expect(paralelo).not.toContain('O `CLAUDE.md` e os outros arquivos contam inteiros');

    const ficha = section(skill, '### Ficha da etapa');
    expect(ficha).toContain('docs/*.md');
    expect(ficha).toContain('CLAUDE.md#');
    expect(ficha).not.toContain('O `CLAUDE.md` e os outros arquivos ficam inteiros');

    const passos = between(
      leitura(DETALHAR),
      '3. Rascunhe o plano inteiro',
      '5. Decisão de produto',
    );
    expect(passos).toContain('docs/ARCHITECTURE.md#');
    expect(passos).toContain('CLAUDE.md#');
    expect(passos).not.toContain('inclusive o `CLAUDE.md`, sem âncora');

    const detalhar = between(leitura('docs/PROCESS.md'), '**Detalhar uma etapa:**', '\n');
    expect(detalhar).toContain('docs/ARCHITECTURE.md#');
    expect(detalhar).toContain('CLAUDE.md#');

    const dono = section(leitura('docs/FLOW.md'), '## Para o dono, nos três chats');
    expect(dono).toContain('docs/*.md');
    expect(dono).toContain('CLAUDE.md');
  });
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
