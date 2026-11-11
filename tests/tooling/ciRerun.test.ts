// @vitest-environment node
// Etapa #1325, fase CA1 (decisão 5): a regra "o job morreu por runner abandonado" do
// `ci-rerun.yml`, com as listas de jobs reais de 2026-11-09 como fixtures.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem declaração de tipos
import { decideQueued, decideRerun, expectedJobs } from '../../scripts/ci/ciRerun.mjs';

interface Job {
  name: string;
  conclusion: string | null;
}
interface Decision {
  rerun: boolean;
  abandoned: string[];
  reason: string;
}
const expectedOf = expectedJobs as (yaml: string) => string[];
const decide = decideRerun as (input: { expected: string[]; jobs: Job[] }) => Decision;

const ciYml = readFileSync('.github/workflows/ci.yml', 'utf8');
const expected = expectedOf(ciYml);
const ok = (name: string): Job => ({ name, conclusion: 'success' });
const bad = (name: string, conclusion = 'failure'): Job => ({ name, conclusion });
const allOk = expected.map(ok);
const without = (jobs: Job[], ...names: string[]): Job[] =>
  jobs.filter((job) => !names.includes(job.name));
const replace = (jobs: Job[], job: Job): Job[] =>
  jobs.map((other) => (other.name === job.name ? job : other));

describe('jobs esperados, lidos do ci.yml', () => {
  it('o ci.yml atual se lê inteiro, com a matriz do test expandida', () => {
    expect(expected).toEqual([
      'epic',
      'static',
      'test (1)',
      'test (2)',
      'test (3)',
      'test (4)',
      'coverage',
      'build',
      'check',
      'e2e',
    ]);
  });

  it('comentário na coluna 0 entre jobs não trunca a lista', () => {
    const yaml = 'jobs:\n  a:\n    runs-on: x\n# solto\n\n  b:\n    runs-on: x\n';
    expect(expectedOf(yaml)).toEqual(['a', 'b']);
  });

  it('chave de topo depois de jobs: encerra a lista', () => {
    const yaml = 'jobs:\n  a:\n    runs-on: x\nenv:\n  b:\n';
    expect(expectedOf(yaml)).toEqual(['a']);
  });

  it('job com name: próprio faz o script falhar', () => {
    const yaml = 'jobs:\n  static:\n    name: Estático\n    runs-on: ubuntu-latest\n';
    expect(() => expectedOf(yaml)).toThrow(/name:/);
  });

  it('matriz de outro formato faz o script falhar', () => {
    const yaml =
      'jobs:\n  test:\n    strategy:\n      matrix:\n        os: [a, b]\n        node: [1, 2]\n    runs-on: x\n';
    expect(() => expectedOf(yaml)).toThrow(/matriz/);
  });
});

describe('decisão de reexecução', () => {
  // Run 42672468793, tentativa 1 (#925): só test (3), coverage e check aparecem.
  it('run 42672468793 (tentativa 1): reexecuta os abandonados', () => {
    const jobs = [ok('test (3)'), ok('coverage'), bad('check')];
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(true);
    expect(decision.abandoned).toEqual([
      'epic',
      'static',
      'test (1)',
      'test (2)',
      'test (4)',
      'build',
      'e2e',
    ]);
  });

  // Run 42672325637, tentativa 1 (#971): só o check existe.
  it('run 42672325637 (tentativa 1): reexecuta os abandonados', () => {
    const decision = decide({ expected, jobs: [bad('check')] });
    expect(decision.rerun).toBe(true);
    expect(decision.abandoned).toHaveLength(expected.length - 1);
    expect(decision.reason).toContain('epic');
  });

  it('falha de teste comum não reexecuta', () => {
    const jobs = replace(allOk, bad('test (2)'));
    const decision = decide({ expected, jobs: replace(jobs, bad('check')) });
    expect(decision.rerun).toBe(false);
    expect(decision.reason).toBe('falha legítima (test (2))');
  });

  it('timeout (job presente com falha) não reexecuta', () => {
    const jobs = replace(replace(allOk, bad('static')), bad('check'));
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(false);
    expect(decision.reason).toBe('falha legítima (static)');
  });

  it('job cancelado conta como falha legítima', () => {
    const decision = decide({
      expected,
      jobs: replace(allOk, bad('build', 'cancelled')),
    });
    expect(decision.rerun).toBe(false);
  });

  it('test (n) abandonado com o coverage vermelho reexecuta', () => {
    // Como na tentativa 3 do run 42672468793: o coverage falha por falta dos blobs.
    const jobs = replace(
      replace(without(allOk, 'test (4)'), bad('coverage')),
      bad('check'),
    );
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(true);
    expect(decision.abandoned).toEqual(['test (4)']);
    expect(decision.reason).toBe('abandonados test (4)');
  });

  it('coverage vermelho sem test abandonado é falha legítima', () => {
    const decision = decide({ expected, jobs: replace(allOk, bad('coverage')) });
    expect(decision.rerun).toBe(false);
    expect(decision.reason).toBe('falha legítima (coverage)');
  });

  it('falha legítima não reexecuta mesmo havendo abandonados', () => {
    const jobs = [bad('static'), bad('check')];
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(false);
    expect(decision.reason).toBe('falha legítima (static)');
  });

  it('sem abandonados não reexecuta', () => {
    const decision = decide({ expected, jobs: allOk });
    expect(decision.rerun).toBe(false);
    expect(decision.abandoned).toEqual([]);
    expect(decision.reason).toBe('nenhum job abandonado');
  });

  it('job pulado não é falha', () => {
    const jobs = replace(allOk, bad('epic', 'skipped'));
    expect(decide({ expected, jobs }).reason).toBe('nenhum job abandonado');
  });

  it('um job a mais no PR (fora da main) não conta', () => {
    const jobs = [...allOk, bad('novo-job')];
    const decision = decide({ expected, jobs });
    expect(decision.rerun).toBe(false);
    expect(decision.abandoned).toEqual([]);
  });
});

describe('comando decide', () => {
  const run = (jobs: Job[], extra: string[] = []) => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-rerun-'));
    const jobsFile = join(dir, 'jobs.json');
    const output = join(dir, 'output');
    writeFileSync(jobsFile, JSON.stringify({ total_count: jobs.length, jobs }));
    const result = spawnSync(
      process.execPath,
      [
        'scripts/ci/ciRerun.mjs',
        'decide',
        '--ci',
        '.github/workflows/ci.yml',
        '--jobs',
        jobsFile,
        '--output',
        output,
        ...extra,
      ],
      { encoding: 'utf8' },
    );
    return { result, output: readFileSync(output, 'utf8') };
  };

  it('escreve rerun, abandoned e reason no --output', () => {
    const { result, output } = run([bad('check')]);
    expect(result.status).toBe(0);
    expect(output).toContain('rerun=true\n');
    expect(output).toContain('abandoned=epic, static, test (1)');
    expect(output).toContain('reason=abandonados epic, static');
  });

  it('não reexecuta falha legítima', () => {
    const { output } = run(replace(allOk, bad('static')));
    expect(output).toContain('rerun=false\n');
    expect(output).toContain('abandoned=\n');
    expect(output).toContain('reason=falha legítima (static)');
  });

  it('sai com erro quando o ci.yml não se lê', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-rerun-'));
    const ci = join(dir, 'ci.yml');
    writeFileSync(ci, 'jobs:\n  a:\n    name: x\n');
    const jobs = join(dir, 'jobs.json');
    writeFileSync(jobs, '{"jobs":[]}');
    const result = spawnSync(
      process.execPath,
      ['scripts/ci/ciRerun.mjs', 'decide', '--ci', ci, '--jobs', jobs],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('name:');
  });
});

// Etapa #1669 (QF1): execução do CI presa em `queued` sem jobs, com as execuções reais de
// 2026-11-11 (PR #1664) como fixtures.
interface Run {
  id: number;
  head_sha: string;
  status: string;
  created_at: string;
  html_url: string;
}
interface QueuedDecision {
  preso: boolean;
  run: string;
  link: string;
  minutos: number;
  execucoes: number;
  reaberto: boolean;
  reason: string;
}
const decideQ = decideQueued as (input: {
  runs: Run[];
  jobsTotal: number;
  head: string;
  now: string;
}) => QueuedDecision;

const OLD = 'b1221ea';
const HEAD = 'e871e5c';
const run = (id: number, sha: string, createdAt: string, status = 'queued'): Run => ({
  id,
  head_sha: sha,
  status,
  created_at: createdAt,
  html_url: `https://github.com/fabianofranca/mapping/actions/runs/${id}`,
});
const r2676 = run(43095704874, OLD, '2026-11-11T20:22:56Z');
const r2677 = run(43097220825, HEAD, '2026-11-11T20:38:06Z');
const r2678 = run(43103790776, HEAD, '2026-11-11T21:31:27Z');

describe('decideQueued: execução presa na fila (#1669)', () => {
  it('a 2677 sozinha no commit, às 20:57Z, está presa e ainda não foi reaberta', () => {
    const d = decideQ({
      runs: [r2677],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T20:57:00Z',
    });
    expect(d).toEqual({
      preso: true,
      run: '43097220825',
      link: 'https://github.com/fabianofranca/mapping/actions/runs/43097220825',
      minutos: 18,
      execucoes: 1,
      reaberto: false,
      reason: 'na fila sem jobs há 18 min',
    });
  });

  it('exatamente 15 min não é preso; 15 min e 1 s é', () => {
    const at15 = decideQ({
      runs: [r2677],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T20:53:06Z',
    });
    expect(at15.preso).toBe(false);
    expect(at15.reason).toBe('há 15 min (limite 15)');
    const over = decideQ({
      runs: [r2677],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T20:53:07Z',
    });
    expect(over.preso).toBe(true);
    expect(over.minutos).toBe(15);
    expect(over.reason).toBe('na fila sem jobs há 15 min');
  });

  it('a mais recente com jobs não está presa', () => {
    const d = decideQ({
      runs: [r2677, r2678],
      jobsTotal: 10,
      head: HEAD,
      now: '2026-11-11T21:40:00Z',
    });
    expect(d.preso).toBe(false);
    expect(d.reason).toBe('10 jobs');
    expect(d.run).toBe('43103790776');
    expect(d.execucoes).toBe(2);
    expect(d.reaberto).toBe(true);
  });

  it.each(['in_progress', 'waiting'])('a mais recente %s não está presa', (status) => {
    const d = decideQ({
      runs: [run(43097220825, HEAD, '2026-11-11T20:38:06Z', status)],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T21:40:00Z',
    });
    expect(d.preso).toBe(false);
    expect(d.reason).toBe(`status ${status}`);
  });

  it('presa de um commit anterior não conta: sem execução do commit atual', () => {
    const d = decideQ({
      runs: [r2676],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T21:40:00Z',
    });
    expect(d).toEqual({
      preso: false,
      run: '',
      link: '',
      minutos: 0,
      execucoes: 0,
      reaberto: false,
      reason: 'sem execução do CI no commit',
    });
  });

  it('2677 e 2678 no mesmo commit com a 2678 presa: preso de novo, já reaberto', () => {
    const d = decideQ({
      runs: [r2677, r2678],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T21:50:00Z',
    });
    expect(d.preso).toBe(true);
    expect(d.reaberto).toBe(true);
    expect(d.execucoes).toBe(2);
    expect(d.run).toBe('43103790776');
    expect(d.minutos).toBe(18);
  });

  it('a mais recente sai do created_at, não da ordem da lista', () => {
    const d = decideQ({
      runs: [r2678, r2676, r2677],
      jobsTotal: 0,
      head: HEAD,
      now: '2026-11-11T21:50:00Z',
    });
    expect(d.run).toBe('43103790776');
    expect(d.execucoes).toBe(2);
  });
});

describe('decideQueued: entrada inválida (#1669, revisão)', () => {
  it('now inválido é erro, não preso=true com NaN', () => {
    expect(() =>
      decideQ({ runs: [r2677], jobsTotal: 0, head: HEAD, now: 'amanha' }),
    ).toThrow(/now/);
  });

  it('created_at ilegível é erro', () => {
    expect(() =>
      decideQ({
        runs: [run(1, HEAD, 'ontem')],
        jobsTotal: 0,
        head: HEAD,
        now: '2026-11-11T21:50:00Z',
      }),
    ).toThrow(/created_at/);
  });
});

describe('comando queued (#1669)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-queued-'));
  const write = (name: string, value: unknown): string => {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const exec = (args: string[]) =>
    spawnSync(process.execPath, ['scripts/ci/ciRerun.mjs', 'queued', ...args], {
      encoding: 'utf8',
    });

  it('escreve as sete linhas no --output', () => {
    const runs = write('runs.json', { total_count: 2, workflow_runs: [r2676, r2677] });
    const jobs = write('jobs.json', { total_count: 0, jobs: [] });
    const output = join(dir, 'out-file');
    const result = exec([
      '--runs',
      runs,
      '--jobs',
      jobs,
      '--head',
      HEAD,
      '--now',
      '2026-11-11T20:57:00Z',
      '--output',
      output,
    ]);
    expect(result.status).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(
      'preso=true\n' +
        'run=43097220825\n' +
        'link=https://github.com/fabianofranca/mapping/actions/runs/43097220825\n' +
        'minutos=18\n' +
        'execucoes=1\n' +
        'reaberto=false\n' +
        'reason=na fila sem jobs há 18 min\n',
    );
  });

  it('sem --output escreve as mesmas linhas no stdout', () => {
    const runs = write('runs2.json', { workflow_runs: [r2677, r2678] });
    const jobs = write('jobs2.json', {
      total_count: 10,
      jobs: [{ run_id: 43103790776, name: 'epic' }],
    });
    const result = exec(['--runs', runs, '--jobs', jobs, '--head', HEAD]);
    expect(result.status).toBe(0);
    expect(result.stdout.split('\n').filter(Boolean)).toHaveLength(7);
    expect(result.stdout).toContain('preso=false\n');
    expect(result.stdout).toContain('reaberto=true\n');
    expect(result.stdout).toContain('reason=10 jobs\n');
  });

  it('sem execução do commit o --jobs não é lido', () => {
    const runs = write('runs3.json', { workflow_runs: [r2676] });
    const result = exec([
      '--runs',
      runs,
      '--jobs',
      join(dir, 'nao-existe.json'),
      '--head',
      HEAD,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('preso=false\n');
    expect(result.stdout).toContain('reason=sem execução do CI no commit\n');
  });

  it('job de outro run_id é erro', () => {
    const runs = write('runs4.json', { workflow_runs: [r2677, r2678] });
    const jobs = write('jobs4.json', {
      total_count: 1,
      jobs: [{ run_id: 43097220825, name: 'epic' }],
    });
    const result = exec(['--runs', runs, '--jobs', jobs, '--head', HEAD]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('run_id');
  });

  it('--now ilegível sai com erro', () => {
    const runs = write('runs6.json', { workflow_runs: [r2677] });
    const jobs = write('jobs6.json', { total_count: 0, jobs: [] });
    const result = exec([
      '--runs',
      runs,
      '--jobs',
      jobs,
      '--head',
      HEAD,
      '--now',
      'amanha',
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--now');
  });

  it('valor de opção que é outra flag conta como argumento faltando', () => {
    const runs = write('runs7.json', { workflow_runs: [r2677] });
    const jobs = write('jobs7.json', { total_count: 0, jobs: [] });
    const result = exec(['--runs', runs, '--jobs', jobs, '--head', '--now', 'x']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Uso: node scripts/ci/ciRerun.mjs queued');
  });

  it('argumento faltando sai com erro e a mensagem de uso', () => {
    const result = exec(['--runs', write('runs5.json', { workflow_runs: [] })]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Uso: node scripts/ci/ciRerun.mjs queued');
  });
});
