// Regenera tests/support/durations.json (caminho relativo → segundos) para o sequenciador
// de shards (tests/support/timedSequencer.ts). Mede como o CI: os 4 shards, um depois do
// outro, com cobertura e sem relatório. Medir a suíte inteira de uma vez infla os arquivos de
// componentes (o jsdom disputa CPU) e desequilibra os shards; com um só worker o Vitest
// derruba o processo (vmThreads). O tempo de um arquivo muda um pouco com os vizinhos de shard,
// então rodar de novo refina (cada rodada usa a divisão da anterior). Leva ~3 min; só precisa
// rodar quando a suíte mudar muito. Tempo desatualizado desequilibra, nunca perde arquivo.
//   npm run test:durations                    roda os 4 shards e grava os tempos
//   npm run test:durations -- a.json b.json   usa relatórios já gerados (`--reporter=json`)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join, relative } from 'node:path';

const SHARDS = 4;
const root = process.cwd();
const target = join(root, 'tests/support/durations.json');

/** Relatório `--reporter=json` do Vitest → pares [caminho relativo, segundos com 1 casa]. */
function durationsFromReport(file) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  return report.testResults.map((result) => [
    relative(root, result.name).split('\\').join('/'),
    Math.round(((result.endTime - result.startTime) / 1000) * 10) / 10,
  ]);
}

function runShards(dir) {
  return Array.from({ length: SHARDS }, (_, i) => {
    const file = join(dir, `shard-${i + 1}.json`);
    execFileSync(
      'npx',
      [
        'vitest',
        'run',
        '--coverage',
        `--shard=${i + 1}/${SHARDS}`,
        '--reporter=json',
        `--outputFile=${file}`,
      ],
      { stdio: 'inherit', env: { ...process.env, COVERAGE_REPORT: 'off' } },
    );
    return file;
  });
}

const given = process.argv.slice(2);
const dir = given.length ? undefined : mkdtempSync(join(tmpdir(), 'durations-'));
try {
  const files = given.length ? given : runShards(dir);
  const entries = files.flatMap(durationsFromReport);
  const sorted = entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  writeFileSync(target, JSON.stringify(Object.fromEntries(sorted), null, 2) + '\n');
  process.stdout.write(`${sorted.length} arquivos em ${relative(root, target)}\n`);
} finally {
  if (dir) rmSync(dir, { recursive: true, force: true });
}
