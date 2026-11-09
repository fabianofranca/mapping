// @vitest-environment node
// Etapa #1325, fase CA1 (decisão 5): a regra "o job morreu por runner abandonado" do
// `ci-rerun.yml`, com as listas de jobs reais de 2026-11-09 como fixtures.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem declaração de tipos
import { decideRerun, expectedJobs } from '../../scripts/ci/ciRerun.mjs';

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
