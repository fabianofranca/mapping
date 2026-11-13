// @vitest-environment node
// Fase TA1 (etapa #1812, decisões 1 a 7 e 12): o `toca` da ficha lista arquivos e seções. Pasta, `**`, padrão
// fora da regra, documento com seções inteiro e âncora fora da forma dão `ficha incompleta (toca: <citação>)`;
// o comando `painel.py toca "<citações>"` confere uma lista. Fase TA2 (decisões 10 e 12): os textos dos skills
// e dos docs dizem a regra só nas seções do "Toca em:".
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-13T10:00:00Z';
// Testes que sobem dezenas de subprocessos do painel.py: folga para o CI sob carga.
const TEMPO_SUBPROCESSOS = 60_000;

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function vagas(): string {
  const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Array<
    Record<string, unknown>
  >;
  return String(meta[0]?.vagas);
}

function motivos(): string[] {
  return vagas().split(' · ').slice(1);
}

function ficha(dep: string, toca: string, schema = 'não'): string {
  return `dep=${dep} | nivel=impact: low | mcp=não | schema=${schema} | toca=${toca}`;
}

function etapa(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Etapa ${issue}`, `plan=${plan}`, ...extra);
}

/** O motivo da candidata #2, sozinha na fila, com o `toca` dado. */
function motivo(toca: string): string | undefined {
  etapa('#2', ficha('nenhuma', toca));
  return motivos().find((m) => m.startsWith('#2 '));
}

const INVALIDAS = [
  'src/model/',
  'src/model',
  'tests/tooling/**',
  'src/**/x.ts',
  'src/i18n/*',
  'tests/e2e/*Fixture.ts',
  'libraries/*/x.json',
  'docs/TESTING*.md',
  'README*.md',
  'docs/TESTING.md',
  'docs/ARCHITECTURE.md',
  'CLAUDE.md',
  '.claude/skills/implementar-fila/SKILL.md',
  'docs/TESTING.md#R9.12',
  'docs/FLOW.md#Paralelo',
];

const VALIDAS = [
  'src/model/markings.ts',
  'tests/storage/folder*.test.ts',
  'docs/TESTING.md#R9',
  'docs/TESTING.md#RP',
  'docs/TESTING.md#8-roteiros',
  'docs/TESTING.md#inicio',
  'docs/ARCHITECTURE.md#desempenho',
  'CLAUDE.md#regras-de-arquitetura',
  'CLAUDE.md#inicio',
  '.claude/skills/implementar-fila/SKILL.md#paralelo',
  'docs/nao-existe.md',
  'viewer/README.md',
  'viewer/README.md#a',
  'package.json',
];

describe('painel.py — validação do toca na ficha (TA1, #1812)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'toca-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    'pasta, **, padrão fora da regra, documento inteiro e âncora fora da forma dão ficha incompleta (toca: <citação>)',
    () => {
      for (const c of INVALIDAS) {
        expect(motivo(c), c).toBe(`#2 ficha incompleta (toca: ${c})`);
      }
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'arquivo, padrão com prefixo, seção na forma, documento novo e arquivo novo valem',
    () => {
      for (const c of [...VALIDAS, 'src/x.ts (novo)']) {
        expect(motivo(c), c).toBe('#2 começa');
      }
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'o que não conta é filtrado antes da validação',
    () => {
      for (const c of [
        'changelog/',
        'changelog/toca-por-arquivo.md',
        'docs/design-system/',
        'docs/design-system/x.md',
        'mcp/version.ts',
        'docs/TESTING-NUVEM.md#blocos',
      ]) {
        expect(motivo(`src/a.ts, ${c}`), c).toBe('#2 começa');
      }
    },
    TEMPO_SUBPROCESSOS,
  );

  it('ordem e combinação: dep antes, a primeira citação inválida é a citada, fases depois; ? continua (toca)', () => {
    etapa('#1', ficha('?', 'docs/TESTING.md'));
    etapa('#2', ficha('nenhuma', 'src/a.ts, src/model/, docs/TESTING.md'));
    etapa('#3', `${ficha('nenhuma', 'src/b.ts, tests/**')} | fases=?`);
    etapa('#4', ficha('nenhuma', '?'));
    expect(motivos().slice(0, 4)).toEqual([
      '#1 ficha incompleta (dep, toca: docs/TESTING.md)',
      '#2 ficha incompleta (toca: src/model/)',
      '#3 ficha incompleta (toca: tests/**, fases)',
      '#4 ficha incompleta (toca)',
    ]);
    expect(run('show', dir)).toContain('fichas a refazer: #1 #2 #3 #4');
  });

  it('a etapa começada com citação antiga entra nas fichas a refazer e continua segurando como hoje', () => {
    etapa('#1', ficha('nenhuma', 'src/model/'), 'status=em andamento');
    etapa('#2', ficha('nenhuma', 'src/model/a.ts'));
    etapa('#3', ficha('nenhuma', 'docs/TESTING.md'), 'status=esperando dono');
    etapa('#4', ficha('nenhuma', 'docs/TESTING.md#R9'));
    etapa('#5', ficha('nenhuma', 'src/b.ts'));
    expect(motivos().slice(0, 3)).toEqual([
      '#2 arquivo src/model/a.ts com #1',
      '#4 arquivo docs/TESTING.md#R9 com #3',
      '#5 começa',
    ]);
    expect(run('show', dir)).toContain('fichas a refazer: #1 #3');
  });

  it('o ? no meio da lista também deixa a ficha incompleta (achado da revisão)', () => {
    etapa('#1', ficha('nenhuma', 'src/a.ts, ?'));
    expect(motivos()[0]).toBe('#1 ficha incompleta (toca: ?)');
    expect(run('show', dir)).toContain('fichas a refazer: #1');
  });

  it('a exclusiva não passa pela validação (só o ? a deixa incompleta)', () => {
    etapa('#1', ficha('nenhuma', 'tests/**, docs/FLOW.md'), 'exclusive=sim');
    expect(motivos()[0]).toBe('#1 começa');
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
    run('row', dir, '#1', `plan=${ficha('nenhuma', '?')}`);
    expect(motivos()[0]).toBe('#1 ficha incompleta (toca)');
    expect(run('show', dir)).toContain('fichas a refazer: #1');
  });

  it('a linha que deixa de ser exclusiva passa pela validação', () => {
    etapa('#1', ficha('nenhuma', 'tests/**'), 'exclusive=sim');
    run('row', dir, '#1', 'exclusive=');
    expect(motivos()[0]).toBe('#1 ficha incompleta (toca: tests/**)');
  });
});

describe('painel.py toca "<citações>" (TA1, decisão 7)', () => {
  it('lista válida: ok e código 0', () => {
    const r = runRaw('toca', 'src/a.ts, docs/TESTING.md#R9');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('ok\n');
    const todas = runRaw(
      'toca',
      VALIDAS.join(', ') + ', `./src/x.ts` (novo), changelog/',
    );
    expect(todas.stdout).toBe('ok\n');
    expect(todas.status).toBe(0);
  });

  it('uma linha por citação inválida, com o motivo, e código 1', () => {
    const um = runRaw('toca', 'src/model/');
    expect(um.status).toBe(1);
    expect(um.stdout).toBe('inválida: src/model/ — pasta\n');
    const r = runRaw(
      'toca',
      'src/a.ts, src/model, `src/**/x.ts`, src/i18n/*, docs/TESTING*.md, docs/TESTING.md, docs/TESTING.md#R9.12, docs/FLOW.md#Paralelo, docs/design-system/',
    );
    expect(r.status).toBe(1);
    expect(r.stdout.split('\n').filter(Boolean)).toEqual([
      'inválida: src/model — pasta',
      'inválida: src/**/x.ts — **',
      'inválida: src/i18n/* — padrão',
      'inválida: docs/TESTING*.md — padrão',
      'inválida: docs/TESTING.md — documento inteiro',
      'inválida: docs/TESTING.md#R9.12 — âncora',
      'inválida: docs/FLOW.md#Paralelo — âncora',
    ]);
  });

  it('? diz que a ficha não diz e sai com 1, sozinho ou no meio da lista', () => {
    const r = runRaw('toca', '?');
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('inválida: ? — a ficha não diz\n');
    const meio = runRaw('toca', 'src/a.ts, ?');
    expect(meio.status).toBe(1);
    expect(meio.stdout).toBe('inválida: ? — a ficha não diz\n');
  });

  it('a pasta e o documento se leem na raiz do repositório, não no diretório atual', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'toca-cwd-'));
    try {
      const script = path.resolve(SCRIPT);
      const r = spawnSync('python3', [script, 'toca', 'src/model, CLAUDE.md'], {
        cwd,
        encoding: 'utf8',
      });
      expect(r.stdout.split('\n').filter(Boolean)).toEqual([
        'inválida: src/model — pasta',
        'inválida: CLAUDE.md — documento inteiro',
      ]);
      expect(r.status).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('não entra no lote do apply (código 2, como o slug)', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'toca-'));
    try {
      run('init', dir);
      const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
        input: 'toca "src/a.ts"\n',
        encoding: 'utf8',
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('linha 1');
      expect(r.stderr).toContain('`toca` não entra no lote');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('painel.py toca — correções da revisão (CL1, #1812)', () => {
  const conflita = (a: string, b: string): boolean => {
    const d = mkdtempSync(path.join(tmpdir(), 'toca-cl1-'));
    try {
      run('init', d);
      run('start', d, '--paralelo', '9');
      run(
        'row',
        d,
        '#1',
        'title=A',
        `plan=${ficha('nenhuma', a)}`,
        'status=em andamento',
      );
      run('row', d, '#2', 'title=B', `plan=${ficha('nenhuma', b)}`);
      const meta = JSON.parse(readFileSync(path.join(d, 'meta.json'), 'utf8')) as Array<
        Record<string, unknown>
      >;
      return String(meta[0]?.vagas).includes('#2 arquivo');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  it(
    'achado 1: dois globs que casam o mesmo arquivo conflitam; `?` e `[...]` não são aceitos',
    () => {
      expect(conflita('tests/a*x.ts', 'tests/ab*.ts')).toBe(true);
      expect(conflita('tests/a*.ts', 'tests/b*.ts')).toBe(false);
      expect(conflita('tests/a*.ts', 'tests/abc.ts')).toBe(true);
      for (const c of ['tests/a?.ts', 'tests/[ab].ts']) {
        const r = runRaw('toca', c);
        expect(r.status, c).toBe(1);
        expect(r.stdout, c).toBe(`inválida: ${c} — padrão\n`);
      }
    },
    TEMPO_SUBPROCESSOS,
  );

  it('achado 2: o slug minúsculo do roteiro (#r9) é rejeitado e a caixa não esconde conflito', () => {
    const r = runRaw('toca', 'docs/TESTING.md#r9');
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('inválida: docs/TESTING.md#r9 — âncora\n');
  });

  it('achado 3: a âncora é conferida contra os `##` do arquivo existente', () => {
    const r = runRaw(
      'toca',
      'docs/FLOW.md#para-a-sesao-da-fase, docs/FLOW.md#para-a-sessao-da-fase, docs/FLOW.md#inicio, docs/novo-doc.md#qualquer',
    );
    expect(r.stdout).toBe('inválida: docs/FLOW.md#para-a-sesao-da-fase — âncora\n');
    expect(r.status).toBe(1);
  });

  it('achado 4: o texto da Ficha da etapa cobre a linha exclusiva', () => {
    const fila = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
    const ficha = section(fila, '### Ficha da etapa');
    expect(ficha).toContain('exclusive=sim');
  });

  it('achado 5: a validação do toca não repete o acesso ao sistema de arquivos', () => {
    const py = `
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("painel", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
n = {"c": 0}
for name in ("isdir", "isfile", "exists"):
    orig = getattr(os.path, name)
    def wrap(p, _o=orig):
        n["c"] += 1
        return _o(p)
    setattr(os.path, name, wrap)
plan = "dep=nenhuma | nivel=impact: low | mcp=não | schema=não | toca=docs/FLOW.md#inicio, src/a.ts, tests/a*.ts"
m.incomplete_fields(plan)
uma = n["c"]
for _ in range(20):
    m.incomplete_fields(plan)
print(uma, n["c"])
`;
    const r = spawnSync('python3', ['-c', py, SCRIPT], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    const [uma, depois] = r.stdout.trim().split(' ').map(Number);
    expect(depois).toBe(uma); // 20 repetições não acessam o disco de novo
  });

  it('achado 6: fora da árvore esperada a raiz vem do git ou do .git, ou a conferência falha segura', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'toca-raiz-'));
    try {
      const copia = path.join(base, 'painel.py');
      writeFileSync(copia, readFileSync(SCRIPT));
      const repo = path.resolve('.');
      const noRepo = spawnSync('python3', [copia, 'toca', 'src/model, CLAUDE.md'], {
        cwd: repo,
        encoding: 'utf8',
      });
      expect(noRepo.stdout.split('\n').filter(Boolean)).toEqual([
        'inválida: src/model — pasta',
        'inválida: CLAUDE.md — documento inteiro',
      ]);
      const fora = spawnSync('python3', [copia, 'toca', 'src/model'], {
        cwd: base,
        encoding: 'utf8',
      });
      expect(fora.status).toBe(1);
      expect(fora.stdout).toBe('inválida: src/model — raiz do repositório não achada\n');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('os textos da regra do toca (TA2, #1812, decisão 12)', () => {
  const fila = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const detalhar = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const process = readFileSync('docs/PROCESS.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');

  it('a "Ficha da etapa" manda rodar o painel.py toca, cita #inicio e diz "nunca pasta"', () => {
    const ficha = section(fila, '### Ficha da etapa');
    expect(ficha).toContain('painel.py toca');
    expect(ficha).toContain('#inicio');
    expect(ficha).toContain('nunca pasta');
  });

  it('o "Paralelo" diz o motivo ficha incompleta (toca: <citação>)', () => {
    expect(section(fila, '## Paralelo')).toContain('ficha incompleta (toca:');
  });

  it('o "Painel" lista o comando painel.py toca', () => {
    expect(section(fila, '## Painel')).toContain('painel.py toca');
  });

  it('o "3. Por etapa" cita a citação inválida e, no "Entre etapas", o refazer sem editar issue', () => {
    const etapa = section(fila, '## 3. Por etapa');
    expect(etapa).toContain('citação inválida');
    const entre = etapa.slice(etapa.indexOf('7. **Entre etapas:**'));
    expect(entre).toContain('fichas a refazer');
    expect(entre).toContain('"Toca em:" das sub-issues');
    expect(entre).toContain('sem editar');
  });

  it('o briefing do detalhar-backlog confere o "Toca em:" com o painel.py toca e cita #inicio', () => {
    const briefing = between(
      detalhar,
      '3. Rascunhe o plano inteiro',
      '5. Decisão de produto',
    );
    expect(briefing).toContain('painel.py toca');
    expect(briefing).toContain('#inicio');
    // a conferência é uma frase própria, depois da lista do que cada fase leva (revisão: não no meio dela)
    expect(briefing.indexOf('painel.py toca')).toBeGreaterThan(
      briefing.indexOf('os checkboxes e o aceite'),
    );
  });

  it('o docs/PROCESS.md e o docs/FLOW.md dizem "nunca pasta"', () => {
    const linha = process.split('\n').find((l) => l.includes('**Detalhar uma etapa:**'));
    expect(linha).toContain('nunca pasta');
    expect(section(flow, '## Para o dono, nos três chats')).toContain('nunca pasta');
  });
});
