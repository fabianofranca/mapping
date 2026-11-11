// Decisão do `ci-rerun.yml` (etapa #1325): o job morreu por runner abandonado? Só Node, sem
// dependências. O YAML só junta os dados (o `ci.yml` da `main` e a lista de jobs da execução).
//   decide --ci <ci.yml> --jobs <arquivo> [--output <arquivo>]
//     Lê os jobs esperados do `ci.yml` e a resposta de `actions/runs/<id>/jobs` e escreve
//     `rerun=true|false`, `abandoned=<lista>` e `reason=<motivo>` em `--output` (o
//     `$GITHUB_OUTPUT`; sem ele, no stdout).
//   queued --runs <arquivo> --jobs <arquivo> --head <sha> [--now <ISO>] [--output <arquivo>]
//     Etapa #1669: a execução do CI mais recente do commit está presa em `queued` sem jobs há
//     mais de 15 min? Lê `actions/workflows/ci.yml/runs?head_sha=…` (`--runs`) e
//     `actions/runs/<id da mais recente>/jobs` (`--jobs`) e escreve sete linhas (`preso`, `run`,
//     `link`, `minutos`, `execucoes`, `reaberto`, `reason`) em `--output`; sem ele, no stdout.
//     Quem lê o CI (a fase, o coordenador) usa esta resposta e não a impressão de quem lê.
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const AGGREGATOR = 'check';
const COVERAGE = 'coverage';
const TEST_PREFIX = 'test (';

/** Blocos dos jobs de primeiro nível: `[nome, texto]` na ordem do arquivo. */
function jobBlocks(yaml) {
  const start = yaml.search(/^jobs:\s*$/m);
  if (start < 0) throw new Error('ci.yml sem a chave jobs:.');
  const lines = yaml.slice(start).split('\n').slice(1);
  const blocks = [];
  for (const line of lines) {
    if (/^[^\s#]/.test(line)) break;
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (key) blocks.push([key[1], []]);
    else if (blocks.length > 0) blocks[blocks.length - 1][1].push(line);
  }
  return blocks.map(([name, body]) => [name, body.join('\n')]);
}

/** Nomes dos jobs que a execução do `ci.yml` deve ter (a matriz de uma lista vira `job (valor)`). */
export function expectedJobs(yaml) {
  const names = [];
  for (const [name, body] of jobBlocks(yaml)) {
    if (/^ {4}name:/m.test(body)) {
      throw new Error(
        `O job ${name} do ci.yml tem name: próprio; o ci-rerun não sabe lê-lo.`,
      );
    }
    if (!/^ {6}matrix:/m.test(body)) {
      names.push(name);
      continue;
    }
    const matrix = /^ {6}matrix:\n {8}([A-Za-z0-9_-]+): \[([^\]]*)\]\n(?! {8}\S)/m.exec(
      body,
    );
    if (!matrix) {
      throw new Error(
        `A matriz do job ${name} não é uma lista simples (chave: [a, b]); o ci-rerun não sabe lê-la.`,
      );
    }
    for (const value of matrix[2].split(',')) names.push(`${name} (${value.trim()})`);
  }
  return names;
}

/**
 * `expected`: nomes esperados; `jobs`: `[{ name, conclusion }]` da execução.
 * Abandonado = esperado que não aparece. Falha legítima = job presente que não terminou em
 * `success`/`skipped`, salvo o agregador `check` e o `coverage` quando algum `test (n)` sumiu.
 */
export function decideRerun({ expected, jobs }) {
  const seen = new Map(jobs.map((job) => [job.name, job.conclusion]));
  const abandoned = expected.filter((name) => !seen.has(name));
  const testAbandoned = abandoned.some((name) => name.startsWith(TEST_PREFIX));
  const legit = expected.filter((name) => {
    if (!seen.has(name) || name === AGGREGATOR) return false;
    if (name === COVERAGE && testAbandoned) return false;
    const conclusion = seen.get(name);
    return conclusion !== 'success' && conclusion !== 'skipped';
  });
  if (legit.length > 0) {
    return { rerun: false, abandoned, reason: `falha legítima (${legit.join(', ')})` };
  }
  if (abandoned.length === 0) {
    return { rerun: false, abandoned, reason: 'nenhum job abandonado' };
  }
  return { rerun: true, abandoned, reason: `abandonados ${abandoned.join(', ')}` };
}

/** Limite da execução na fila sem jobs: mais de 900 s desde o `created_at` (decisão 1 da #1669). */
const QUEUED_LIMIT_SECONDS = 900;

/**
 * `runs`: execuções do `ci.yml` (`workflow_runs`); `jobsTotal`: `total_count` dos jobs da mais
 * recente do commit; `head`: o `head.sha` do PR; `now`: ISO (ou `Date`).
 * Preso = a execução mais recente do commit (maior `created_at`) em `queued`, sem jobs, há mais de
 * 15 min. `reaberto` = o commit já tem 2 ou mais execuções (o PR já foi fechado e reaberto).
 */
export function decideQueued({ runs, jobsTotal, head, now }) {
  const ofCommit = runs.filter((run) => run.head_sha === head);
  const empty = {
    preso: false,
    run: '',
    link: '',
    minutos: 0,
    execucoes: 0,
    reaberto: false,
  };
  if (ofCommit.length === 0) {
    return { ...empty, reason: 'sem execução do CI no commit' };
  }
  const latest = ofCommit.reduce((best, run) =>
    Date.parse(run.created_at) > Date.parse(best.created_at) ? run : best,
  );
  const seconds = Math.floor(
    (new Date(now).getTime() - Date.parse(latest.created_at)) / 1000,
  );
  const minutos = Math.max(0, Math.floor(seconds / 60));
  const decision = {
    preso: false,
    run: String(latest.id),
    link: latest.html_url,
    minutos,
    execucoes: ofCommit.length,
    reaberto: ofCommit.length >= 2,
  };
  if (jobsTotal > 0) return { ...decision, reason: `${jobsTotal} jobs` };
  if (latest.status !== 'queued')
    return { ...decision, reason: `status ${latest.status}` };
  if (seconds <= QUEUED_LIMIT_SECONDS) {
    return { ...decision, reason: `há ${minutos} min (limite 15)` };
  }
  return { ...decision, preso: true, reason: `na fila sem jobs há ${minutos} min` };
}

function option(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

function runDecide(argv) {
  const ci = option(argv, '--ci');
  const jobsFile = option(argv, '--jobs');
  if (!ci || !jobsFile)
    throw new Error(
      'Uso: node scripts/ci/ciRerun.mjs decide --ci <ci.yml> --jobs <arquivo> [--output <arquivo>]',
    );
  const expected = expectedJobs(readFileSync(ci, 'utf8'));
  const payload = JSON.parse(readFileSync(jobsFile, 'utf8'));
  if (!Array.isArray(payload.jobs))
    throw new Error('O arquivo de jobs não tem a lista jobs.');
  const decision = decideRerun({ expected, jobs: payload.jobs });
  const text =
    `rerun=${decision.rerun}\n` +
    `abandoned=${decision.abandoned.join(', ')}\n` +
    `reason=${decision.reason}\n`;
  const output = option(argv, '--output');
  if (output) appendFileSync(output, text);
  else process.stdout.write(text);
  return 0;
}

const QUEUED_USAGE =
  'Uso: node scripts/ci/ciRerun.mjs queued --runs <arquivo> --jobs <arquivo> --head <sha> [--now <ISO>] [--output <arquivo>]';

function runQueued(argv) {
  const runsFile = option(argv, '--runs');
  const jobsFile = option(argv, '--jobs');
  const head = option(argv, '--head');
  if (!runsFile || !jobsFile || !head) throw new Error(QUEUED_USAGE);
  const runsPayload = JSON.parse(readFileSync(runsFile, 'utf8'));
  if (!Array.isArray(runsPayload.workflow_runs))
    throw new Error('O arquivo de execuções não tem a lista workflow_runs.');
  const runs = runsPayload.workflow_runs;
  const latestId = decideQueued({ runs, jobsTotal: 0, head, now: new Date() }).run;
  let jobsTotal = 0;
  if (latestId !== '') {
    const payload = JSON.parse(readFileSync(jobsFile, 'utf8'));
    if (!Array.isArray(payload.jobs) || typeof payload.total_count !== 'number')
      throw new Error('O arquivo de jobs não tem total_count nem a lista jobs.');
    const other = payload.jobs.find((job) => String(job.run_id) !== latestId);
    if (other)
      throw new Error(
        `O job ${other.name ?? '?'} tem run_id ${other.run_id}, diferente da execução mais recente do commit (${latestId}).`,
      );
    jobsTotal = payload.total_count;
  }
  const now = option(argv, '--now') ?? new Date().toISOString();
  const d = decideQueued({ runs, jobsTotal, head, now });
  const text =
    `preso=${d.preso}\n` +
    `run=${d.run}\n` +
    `link=${d.link}\n` +
    `minutos=${d.minutos}\n` +
    `execucoes=${d.execucoes}\n` +
    `reaberto=${d.reaberto}\n` +
    `reason=${d.reason}\n`;
  const output = option(argv, '--output');
  if (output) appendFileSync(output, text);
  else process.stdout.write(text);
  return 0;
}

function main(argv) {
  if (argv[0] === 'queued') return runQueued(argv);
  if (argv[0] !== 'decide')
    throw new Error(
      'Uso: node scripts/ci/ciRerun.mjs decide --ci <ci.yml> --jobs <arquivo> | queued --runs <arquivo> --jobs <arquivo> --head <sha>',
    );
  return runDecide(argv);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
