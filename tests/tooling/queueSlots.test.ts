// @vitest-environment node
// Fases VG1 e VG2 (etapa #1440). VG1: o painel calcula a nota "Vagas k/N" com o motivo de cada `ready` que não
// começou, diz quais começam agora e guarda o contexto do coordenador (alerta acima de 35%).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const PAGE = '.claude/skills/implementar-fila/painel/index.html';
const NOW = '2026-11-10T10:00:00Z';
// Testes que sobem dezenas de subprocessos do painel.py: folga para o CI sob carga.
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

function ficha(dep: string, toca: string, schema = 'não'): string {
  return `dep=${dep} | nivel=impact: low | mcp=não | schema=${schema} | toca=${toca}`;
}

function etapa(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Etapa ${issue}`, `plan=${plan}`, ...extra);
}

describe('painel.py — vagas (VG1, #1440)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'vagas-'));
    run('init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('start --paralelo N grava meta.paralelo, repete sem mexer no runStart e, sem o campo, a conta usa 2', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'));
    etapa('#2', ficha('nenhuma', 'b.ts'));
    etapa('#3', ficha('nenhuma', 'c.ts'));
    run('log', dir, 'x');
    expect(vagas()).toBe('Vagas 0/2 · #1 começa · #2 começa · #3 vagas cheias');
    run('start', dir, '--paralelo', '3');
    const first = json('meta')[0]?.runStart;
    expect(json('meta')[0]?.paralelo).toBe(3);
    expect(first).toBe(NOW);
    execFileSync('python3', [
      SCRIPT,
      '--now',
      '2026-11-10T11:00:00Z',
      'start',
      dir,
      '--paralelo',
      '4',
    ]);
    expect(json('meta')[0]?.runStart).toBe(NOW);
    expect(json('meta')[0]?.paralelo).toBe(4);
  });

  it('hold é campo da linha, aceito pelo row e mostrado pelo show #n', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'hold=pausada pelo dono');
    expect(json('queue')[0]?.hold).toBe('pausada pelo dono');
    expect(run('show', dir, '#1')).toContain('hold: pausada pelo dono');
    expect(vagas()).toContain('#1 pausada pelo dono');
    run('row', dir, '#1', 'hold=');
    expect(vagas()).toContain('#1 começa');
  });

  it('merged acrescenta a meta.merged sem repetir e recusa #N inválido (código 2)', () => {
    run('merged', dir, '#7');
    run('merged', dir, '#7');
    run('merged', dir, '#8');
    expect(json('meta')[0]?.merged).toEqual(['#7', '#8']);
    const bad = runRaw('merged', dir, '7x');
    expect(bad.status).toBe(2);
  });

  it('estado das dependências: :main, meta.merged e linha concluída satisfazem; :aberta, sem estado e ? não', () => {
    run('merged', dir, '#20');
    run('row', dir, '#30', 'status=concluída');
    etapa('#1', ficha('#10:main', 'a.ts'));
    etapa('#2', ficha('#11:aberta', 'b.ts'));
    etapa('#3', ficha('#12', 'c.ts'));
    etapa('#4', ficha('#20', 'd.ts'));
    etapa('#5', ficha('#30', 'e.ts'));
    etapa('#6', ficha('nenhuma', 'f.ts'));
    etapa('#7', ficha('?', 'g.ts'));
    etapa('#8', ficha('#11:aberta,#12', 'h.ts'));
    run('start', dir, '--paralelo', '9');
    expect(vagas()).toBe(
      'Vagas 0/9 · #1 começa · #2 dep #11 · #3 dep #12 · #4 começa · #5 começa · #6 começa · #7 ficha incompleta (dep) · #8 dep #11, #12 · nenhuma ready elegível',
    );
  });

  it('a conta: ocupadas, começadas, ordem dos motivos, candidata que começa conta para as seguintes', () => {
    run('start', dir, '--paralelo', '3');
    etapa(
      '#1',
      ficha('nenhuma', 'docs/TESTING.md#R12'),
      'status=em andamento',
      'started=now',
    );
    etapa('#2', ficha('nenhuma', 'docs/TESTING.md#R25'));
    etapa('#3', ficha('nenhuma', 'docs/TESTING.md#R12'));
    etapa('#4', ficha('#9:aberta', 'docs/TESTING.md#R12'));
    etapa('#5', ficha('nenhuma', 'x.ts', 'v19'), 'status=esperando dono');
    etapa('#6', ficha('nenhuma', 'y.ts', 'v19'));
    etapa('#7', ficha('nenhuma', 'docs/TESTING.md#R25'));
    etapa('#8', ficha('nenhuma', 'z.ts'));
    const out = vagas();
    expect(out).toBe(
      'Vagas 1/3 · #2 começa · #3 arquivo docs/TESTING.md#R12 com #1 · #4 dep #9 · #6 schema com #5 · #7 arquivo docs/TESTING.md#R25 com #2 · #8 começa',
    );
    const show = run('show', dir);
    expect(show).toContain(`vagas: ${out}`);
    expect(show).toContain('começar agora: #2 #8');
  });

  it('aguardando com started conta como começada e não mesclada; motivo hold vem antes do dep', () => {
    run('start', dir, '--paralelo', '5');
    etapa('#1', ficha('nenhuma', 'a.ts'), 'started=now');
    etapa('#2', ficha('nenhuma', 'a.ts'));
    etapa('#3', ficha('#99:aberta', 'q.ts'), 'hold=ordem do dono (por último)');
    expect(vagas()).toBe(
      'Vagas 0/5 · #2 arquivo a.ts com #1 · #3 ordem do dono (por último) · nenhuma ready elegível',
    );
    expect(run('show', dir)).toContain('começar agora: nenhuma');
  });

  it('nenhuma ready elegível quando sobra vaga; vagas cheias sem vaga', () => {
    run('start', dir, '--paralelo', '1');
    etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento');
    etapa('#2', ficha('nenhuma', 'b.ts'));
    expect(vagas()).toBe('Vagas 1/1 · #2 vagas cheias');
    run('row', dir, '#2', 'status=concluída');
    expect(vagas()).toBe('Vagas 1/1');
    run('row', dir, '#1', 'status=concluída');
    expect(vagas()).toBe('Vagas 0/1 · nenhuma ready elegível');
  });

  it(
    'comparação do Toca em: roteiro, arquivo inteiro, ignorados, pasta, crases e ?',
    () => {
      run('start', dir, '--paralelo', '9');
      const motivo = (a: string, b: string): string => {
        run('init', dir, '--force');
        run('start', dir, '--paralelo', '9');
        etapa('#1', ficha('nenhuma', a), 'status=em andamento');
        etapa('#2', ficha('nenhuma', b));
        return vagas().split(' · ')[1] ?? '';
      };
      expect(motivo('docs/TESTING.md#R12', 'docs/TESTING.md#R25')).toBe('#2 começa');
      expect(motivo('docs/TESTING.md#R12', 'docs/TESTING.md#R12')).toBe(
        '#2 arquivo docs/TESTING.md#R12 com #1',
      );
      expect(motivo('docs/TESTING.md#R12', 'docs/TESTING.md')).toBe(
        '#2 ficha incompleta (toca: docs/TESTING.md)',
      );
      expect(motivo('docs/TESTING.md', 'docs/TESTING.md#R12')).toBe(
        '#2 arquivo docs/TESTING.md#R12 com #1',
      );
      expect(motivo('docs/TESTING-NUVEM.md#blocos', 'docs/TESTING-NUVEM.md#blocos')).toBe(
        '#2 começa',
      );
      expect(motivo('mcp/version.ts', 'mcp/version.ts')).toBe('#2 começa');
      expect(motivo('changelog/a.md', 'changelog/a.md')).toBe('#2 começa');
      expect(motivo('docs/design-system/a.md', 'docs/design-system/a.md')).toBe(
        '#2 começa',
      );
      expect(motivo('docs/TESTING-NUVEM.md', 'docs/TESTING-NUVEM.md#ambiente')).toBe(
        '#2 arquivo docs/TESTING-NUVEM.md#ambiente com #1',
      );
      expect(motivo('tests/tooling/', 'tests/tooling/a.test.ts')).toBe(
        '#2 arquivo tests/tooling/a.test.ts com #1',
      );
      expect(motivo('tests/tooling/**', 'tests/tooling/a.test.ts')).toBe(
        '#2 arquivo tests/tooling/a.test.ts com #1',
      );
      expect(motivo('tests/tooling/a.test.ts', 'tests/tooling/**')).toBe(
        '#2 ficha incompleta (toca: tests/tooling/**)',
      );
      expect(motivo('`./src/a.ts`, `src/b.ts`', ' src/a.ts ')).toBe(
        '#2 arquivo src/a.ts com #1',
      );
      expect(motivo('src/a.ts', '?')).toBe('#2 ficha incompleta (toca)');
      expect(motivo('src/i18n/pt-BR.ts', 'src/i18n/pt-BR.ts')).toBe(
        '#2 arquivo src/i18n/pt-BR.ts com #1',
      );
    },
    TEMPO_SUBPROCESSOS,
  );

  it('o texto da issue (decisão 1.5) vira teste e toda gravação o recalcula, inclusive log e current', () => {
    run('start', dir, '--paralelo', '5');
    etapa('#1219', ficha('nenhuma', 'docs/TESTING.md'), 'status=em andamento');
    etapa('#1390', ficha('#1384:aberta', 'a.ts'));
    etapa('#1273', ficha('nenhuma', 'docs/TESTING.md#R9'));
    etapa('#1232', ficha('nenhuma', 'b.ts'));
    const esperado =
      'Vagas 1/5 · #1390 dep #1384 · #1273 arquivo docs/TESTING.md#R9 com #1219 · #1232 começa · nenhuma ready elegível';
    expect(vagas()).toBe(esperado);
    run('merged', dir, '#1384');
    expect(vagas()).toBe(
      'Vagas 1/5 · #1390 começa · #1273 arquivo docs/TESTING.md#R9 com #1219 · #1232 começa · nenhuma ready elegível',
    );
    run('row', dir, '#1219', 'status=concluída');
    run('log', dir, 'oi');
    expect(vagas()).toBe(
      'Vagas 0/5 · #1390 começa · #1273 começa · #1232 começa · nenhuma ready elegível',
    );
    run('row', dir, '#1273', 'status=em andamento');
    run('current', dir, 'x');
    expect(vagas()).toBe(
      'Vagas 1/5 · #1390 começa · #1232 começa · nenhuma ready elegível',
    );
  });

  it('aceite da issue: fila de exemplo com paralelo 3', () => {
    run('start', dir, '--paralelo', '3');
    etapa('#1', ficha('nenhuma', 'docs/TESTING.md#R12'), 'status=em andamento');
    etapa('#2', ficha('nenhuma', 'docs/TESTING.md#R25'));
    etapa('#3', ficha('nenhuma', 'docs/TESTING.md#R12'));
    etapa('#4', ficha('#5:aberta', 'src/x.ts'));
    expect(run('show', dir)).toContain(
      'vagas: Vagas 1/3 · #2 começa · #3 arquivo docs/TESTING.md#R12 com #1 · #4 dep #5 · nenhuma ready elegível',
    );
    expect(run('show', dir)).toContain('começar agora: #2');
  });

  it('context grava meta.context e contextAt; inteiro de 0 a 100, senão erro de uso (código 2)', () => {
    run('context', dir, '55');
    expect(json('meta')[0]?.context).toBe(55);
    expect(json('meta')[0]?.contextAt).toBe(NOW);
    for (const bad of ['101', '-1', 'x', '5.5', '']) {
      expect(runRaw('context', dir, bad).status).toBe(2);
    }
  });

  it('show: contexto — sem registro, 35% sem alerta, 36% com o alerta de troca', () => {
    expect(run('show', dir)).toContain('contexto: —');
    run('context', dir, '35');
    const ok = run('show', dir);
    expect(ok).toContain(`contexto: 35% (${NOW})`);
    expect(ok).not.toContain('troque de sessão');
    run('context', dir, '36');
    expect(run('show', dir)).toContain(
      `contexto: 36% (${NOW}) — acima de 35%: troque de sessão agora ("Troca de sessão")`,
    );
  });

  it('show imprime vagas e começar agora depois de atual:', () => {
    run('current', dir, 'rodando');
    const lines = run('show', dir).split('\n');
    const i = lines.findIndex((l) => l.startsWith('atual:'));
    expect(lines[i + 1]).toMatch(/^vagas: /);
    expect(lines[i + 2]).toBe('começar agora: nenhuma');
  });

  it('a página mostra a nota no subtítulo e o card "Dependências e ordem de entrada" a partir de meta.grafoNos', () => {
    const html = readFileSync(PAGE, 'utf8');
    expect(html).toContain('Dependências e ordem de entrada');
    expect(html).toContain('m.grafoNos');
    expect(html).toContain('m.vagas');
    expect(html).not.toContain('Por que há vaga livre');
    expect(html).not.toContain('id="mp-vagas"');
    expect(html.indexOf('Dependências e ordem de entrada')).toBeLessThan(
      html.indexOf('Passo a passo'),
    );
  });
});

// Fase VG2 (etapa #1440): os skills e o PROCESS.md usam a nota de vagas, o contexto e a comparação por roteiro.
describe('implementar-fila e detalhar-backlog: vagas, contexto e roteiros (VG2, #1440)', () => {
  const fila = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const detalhar = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const processo = readFileSync('docs/PROCESS.md', 'utf8');

  it('"Ficha da etapa" pede o estado das dependências e o toca por roteiro (decisão 7)', () => {
    const ficha = section(fila, '### Ficha da etapa');
    expect(ficha).toContain(':main');
    expect(ficha).toContain(':aberta');
    expect(ficha).toContain('docs/TESTING.md#R');
    expect(ficha).toContain('docs/TESTING-NUVEM.md#blocos');
  });

  it('"1. Começo" e "Na sessão nova" rodam o start --paralelo N (decisão 1.1)', () => {
    expect(between(fila, '## 2. Fila', '## 3. Por etapa')).toContain(
      'painel.py start <pasta> --paralelo N',
    );
    expect(between(fila, '**Na sessão nova**', '## Fim')).toContain(
      'start <pasta> --paralelo N',
    );
  });

  it('"Conferências de reserva" começa pelo contexto e depois usa o começar agora (decisões 3.1 e 3.3)', () => {
    const reserva = between(fila, '**Conferências de reserva:**', '**CI vermelho');
    expect(reserva).toContain('painel.py context');
    expect(reserva).toContain('começar agora');
    expect(reserva.indexOf('painel.py context')).toBeLessThan(
      reserva.indexOf('skill mudou na `main`'),
    );
    expect(reserva).toMatch(/Sem atrasadas, sem `começar agora`/);
  });

  it('"Paralelo" aponta para o painel.py, o roteiro e a tabela de blocos (decisões 4 a 6 e 8)', () => {
    const paralelo = section(fila, '## Paralelo');
    expect(paralelo).toContain('painel.py');
    expect(paralelo).toContain('docs/TESTING.md#R12');
    expect(paralelo).toContain('docs/TESTING-NUVEM.md#blocos');
    expect(paralelo).toContain('vagas:');
    expect(paralelo).toContain('começar agora:');
  });

  it('"Painel" lista os comandos novos e as linhas novas do show (decisão 10)', () => {
    const painel = section(fila, '## Painel');
    for (const termo of [
      'start <pasta> --paralelo N',
      'hold=',
      "merged <pasta> '#N'",
      'context <pasta> <pct>',
      'contexto:',
    ]) {
      expect(painel).toContain(termo);
    }
  });

  it('"Mudanças na fila" tem o recado de estado, o Seguir/Segurar e o hold (decisões 9 e 3.4)', () => {
    const mudancas = section(fila, '## Mudanças na fila durante a execução');
    expect(mudancas).toContain('Seguir (Recomendado)');
    expect(mudancas).toContain('Segurar');
    expect(mudancas).toContain('hold=');
    expect(mudancas).toContain('pausada pelo dono');
    expect(mudancas).toContain('ordem do dono (');
  });

  it('"Troca de sessão" mantém Acima de 35%, troca na hora e perde o aviso de filha (decisões 3.1 e 3.2)', () => {
    const troca = section(fila, '## Troca de sessão');
    expect(troca).toContain('Acima de 35%');
    expect(troca).toContain('na hora');
    expect(troca).not.toContain('a cada aviso de filha');
  });

  it('"Entre etapas" marca a dependência fora da fila como merged e começa o que o começar agora lista', () => {
    const entre = between(fila, '7. **Entre etapas:**', '**Arquivar as sessões**');
    expect(entre).toContain('painel.py merged');
    expect(entre).toContain('começar agora');
  });

  it('o detalhar-backlog compara o Toca em: por roteiro (decisão 11)', () => {
    const passos = between(
      detalhar,
      '3. Rascunhe o plano inteiro',
      '5. Decisão de produto',
    );
    expect(passos).toContain('docs/TESTING.md#R12');
    expect(passos).toContain('docs/TESTING-NUVEM.md#blocos');
    expect(passos).toContain('arquivo em comum');
    expect(detalhar).toContain('mcp/version.ts');
  });

  it('o PROCESS.md cita o roteiro no Toca em: do detalhamento (decisão 12)', () => {
    const detalhe =
      processo.split('\n').find((l) => l.includes('**Detalhar uma etapa:**')) ?? '';
    expect(detalhe).toContain('docs/TESTING.md#R12');
    expect(detalhe).toContain('docs/TESTING-NUVEM.md#blocos');
  });

  it('achados da revisão: pausa sem apagar hold, linhagem, contexto da sessão nova, dep fechada e merged na conferência', () => {
    const mudancas = section(fila, '## Mudanças na fila durante a execução');
    expect(mudancas).toContain('sem `hold`');
    expect(mudancas).toContain('só nos `pausada pelo dono`');
    const reserva = between(fila, '**Conferências de reserva:**', '**CI vermelho');
    expect(reserva).toContain('Limite de linhagem');
    expect(reserva).toContain('painel.py merged');
    expect(reserva).toContain('não publica');
    const nova = between(fila, '**Na sessão nova**', '## Fim');
    expect(nova).toContain('painel.py context');
    expect(section(fila, '### Ficha da etapa')).toContain('fechada como concluída');
  });
});

// Fase VG3 (etapa #1440): correções da revisão final do épico.
describe('painel.py — correções da revisão final (VG3, #1440)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'vagas-'));
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
    return vagas().split(' · ')[1] ?? '';
  };

  it(
    'achado 2: glob (src/i18n/*, *.ts) e pasta sem barra final casam com o que está debaixo',
    () => {
      expect(motivo('src/i18n/*', 'src/i18n/pt-BR.ts')).toBe(
        '#2 arquivo src/i18n/pt-BR.ts com #1',
      );
      expect(motivo('src/i18n/pt-BR.ts', 'src/i18n/pt*.ts')).toBe(
        '#2 arquivo src/i18n/pt*.ts com #1',
      );
      expect(motivo('src/model/*.ts', 'src/model/a.ts')).toBe(
        '#2 arquivo src/model/a.ts com #1',
      );
      expect(motivo('src/model/*.ts', 'src/store/a.ts')).toBe('#2 começa');
      expect(motivo('src/model', 'src/model/a.ts')).toBe(
        '#2 arquivo src/model/a.ts com #1',
      );
      expect(motivo('src/model', 'src/modelo/a.ts')).toBe('#2 começa');
    },
    TEMPO_SUBPROCESSOS,
  );

  it('achado 3: anotação entre parênteses depois do caminho é descartada, mesmo com vírgula dentro', () => {
    expect(motivo('src/store/session.ts (novo método)', 'src/store/session.ts')).toBe(
      '#2 arquivo src/store/session.ts com #1',
    );
    expect(motivo('src/a.ts (um, dois), src/b.ts', 'src/b.ts')).toBe(
      '#2 arquivo src/b.ts com #1',
    );
  });

  it('achado 4: âncoras diferentes separam os .md de docs/ e da raiz; nos outros arquivos conflitam', () => {
    expect(
      motivo(
        'docs/ARCHITECTURE.md#desempenho',
        'docs/ARCHITECTURE.md#espacos-pertencimento-e-gestos',
      ),
    ).toBe('#2 começa');
    expect(motivo('viewer/README.md#X', 'viewer/README.md#Y')).toBe(
      '#2 arquivo viewer/README.md#Y com #1',
    );
    expect(motivo('docs/TESTING.md#R1', 'docs/TESTING.md#R2')).toBe('#2 começa');
  });

  it('achado 5: item vazio na dependência é ignorado; hold sai quando a etapa deixa de aguardar', () => {
    etapa('#1', ficha('#12:main,', 'a.ts'));
    etapa('#2', ficha('#12:main,,#13:main', 'b.ts'));
    expect(vagas()).toBe('Vagas 0/9 · #1 começa · #2 começa · nenhuma ready elegível');
    etapa('#3', ficha('nenhuma', 'c.ts'), 'hold=pausada pelo dono');
    run('row', dir, '#3', 'status=em andamento');
    expect(json('queue').find((r) => r.issue === '#3')?.hold).toBe('');
    run('row', dir, '#3', 'status=aguardando', 'hold=ordem do dono (por último)');
    expect(json('queue').find((r) => r.issue === '#3')?.hold).toBe(
      'ordem do dono (por último)',
    );
  });

  it('achado 10: meta.vagasItens guarda cada pedaço inteiro, mesmo com " · " no hold, e a página o usa', () => {
    etapa('#1', ficha('nenhuma', 'a.ts'), 'hold=ordem do dono (a · b)');
    etapa('#2', ficha('nenhuma', 'b.ts'));
    expect(json('meta')[0]?.vagasItens).toEqual([
      'Vagas 0/9',
      '#1 ordem do dono (a · b)',
      '#2 começa',
      'nenhuma ready elegível',
    ]);
    const html = readFileSync(PAGE, 'utf8');
    expect(html).toContain('m.vagasItens');
  });
});
