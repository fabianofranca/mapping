// Sequenciador do Vitest que divide `--shard=i/N` pelo tempo de cada arquivo (etapa Vitest rápido).
// O padrão divide por número de arquivos (hash do caminho): com 4 shards, o mais lento levava
// 53 s e o mais rápido, 33 s. Aqui a divisão é gulosa (maior primeiro, para o shard menos
// carregado), com os tempos de `tests/support/durations.json` (`npm run test:durations`).
// Tempo desatualizado só desequilibra: todo arquivo cai em exatamente um shard.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

export type Durations = Record<string, number>;

/**
 * Custo fixo de cada arquivo, em segundos (import, transformação, ambiente), que o tempo
 * medido do arquivo não inclui: um shard de ~200 arquivos pequenos levava ~55 s contra ~36 s
 * de um de ~50 arquivos com a mesma soma dos tempos (≈ 0,2 s por arquivo).
 */
export const FILE_OVERHEAD = 0.2;

/** Mediana dos tempos conhecidos (1 s sem nenhum): é o tempo de um arquivo ainda sem registro. */
export function medianDuration(durations: Durations): number {
  const values = Object.values(durations).sort((a, b) => a - b);
  if (values.length === 0) return 1;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

/**
 * Reparte os caminhos em `count` shards (índice 0 = shard 1). Determinístico e independente
 * da ordem de entrada: ordena por tempo (maior primeiro) e, no empate, pelo caminho; cada
 * arquivo vai para o shard menos carregado (empate: o de menor índice).
 */
export function balanceShards(
  paths: readonly string[],
  durations: Durations,
  count: number,
): string[][] {
  const fallback = medianDuration(durations);
  const timed = [...new Set(paths)]
    .map((path) => ({ path, seconds: (durations[path] ?? fallback) + FILE_OVERHEAD }))
    .sort(
      (a, b) => b.seconds - a.seconds || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );
  const shards: string[][] = Array.from({ length: count }, () => []);
  const loads: number[] = new Array<number>(count).fill(0);
  for (const { path, seconds } of timed) {
    let target = 0;
    for (let i = 1; i < count; i++) if (loads[i]! < loads[target]!) target = i;
    shards[target]!.push(path);
    loads[target]! += seconds;
  }
  return shards;
}

const durationsFile = new URL('./durations.json', import.meta.url);

function readDurations(): Durations {
  try {
    return JSON.parse(readFileSync(durationsFile, 'utf8')) as Durations;
  } catch {
    return {}; // sem arquivo de tempos, todos valem a mesma coisa (divisão por contagem)
  }
}

export default class TimedSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config;
    if (!shard) return files;
    const byPath = new Map<string, TestSpecification[]>();
    for (const spec of files) {
      const path = relative(root, spec.moduleId).split('\\').join('/');
      byPath.set(path, [...(byPath.get(path) ?? []), spec]);
    }
    const mine = balanceShards([...byPath.keys()], readDurations(), shard.count)[
      shard.index - 1
    ];
    return (mine ?? []).flatMap((path) => byPath.get(path) ?? []);
  }
}
