// Automatic raise of the `dist/index.html` ceiling (stage #1324, decisions 6, 8 and 9), the ceiling in a
// data file (stage #1614, decision 3) and the raise that never stops the queue (stage #1802, decisions 1 to 3).
// Node only, no dependencies.
//   ceiling [--budget <file>]
//     Prints the file's `indexHtmlMaxBytes`. It is what the "Tamanho do dist/index.html" step of
//     `ci.yml` calls. An invalid file exits with 2 and the message on stderr.
//   raise --size <bytes> --main-size <bytes> --review-ceiling <bytes> [--budget <file>]
//         [--write [--epic <name>] [--date <YYYY-MM-DD>]]
//     Raises the ceiling enough for the build to pass and prints:
//       "sobe: <ceiling> → <new ceiling> (excesso E, crescimento G, subidas desde a revisão S)"
//       "bug: <reasons separated by "; ">"  (2nd line, only when the raise exceeds a limit)
//       "nada a subir: ..." (the size already fits the ceiling)
//     The raise is `k` steps of 16 KiB, with `k` the smallest integer ≥ 1 that leaves at least 2 KiB of
//     margin (k = ceil((excess + 2 KiB) / 16 KiB)). It never stops the queue waiting for the owner: an excess above
//     14 KiB, growth above 32 KiB over `main` and raises since the owner's review above
//     64 KiB only add the `bug:` line, for the owner to review later.
//     With `--write` and the raise (with or without the `bug:` line), it replaces the file's `indexHtmlMaxBytes` and
//     appends the sentence to the end of `history` (with " Acima dos limites: …" when there is a `bug:`).
//     The exit code is 0 on every answer; a usage error exits with 2.
// `--budget` defaults to `scripts/ci/dist-budget.json`, relative to the current folder (the clone root).
// `--ci <ci.yml>` was dropped in stage #1614 and is refused.
// The other conditions of decision 6 (the size is the PR's only failure) the caller checks beforehand.
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const KIB = 1024;
/** How much the ceiling rises at once. */
export const RAISE_BYTES = 16 * KIB;
/** Minimum margin left after the raise. */
export const MIN_MARGIN = 2 * KIB;
/** Maximum excess the raise covers: 14 KiB, to leave `MIN_MARGIN`. */
export const MAX_EXCESS = RAISE_BYTES - MIN_MARGIN;
/** Maximum growth of the epic over `main`. */
export const MAX_GROWTH = 32 * KIB;
/** Maximum sum of the automatic raises since the owner's last review. */
export const MAX_SINCE_REVIEW = 64 * KIB;

/** The ceiling file, relative to the current folder. */
export const DEFAULT_BUDGET = 'scripts/ci/dist-budget.json';

/** `1933312` → `1.933.312`. */
function grouped(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Os limites que, ultrapassados pela subida, pedem um `bug` (o `reason` vai na linha `bug:`, o `item` no `history`). */
function overLimits({ excess, growth, since, steps }) {
  const over = [];
  if (excess > MAX_EXCESS) {
    over.push({
      reason: `o excesso de ${excess} bytes passa de 14 KiB (${MAX_EXCESS} bytes): a subida foi de ${(steps * RAISE_BYTES) / KIB} KiB, em passos de 16 KiB`,
      item: 'excesso acima de 14 KiB',
    });
  }
  if (growth > MAX_GROWTH) {
    over.push({
      reason: `o épico cresceu ${growth} bytes sobre a main, mais de 32 KiB (${MAX_GROWTH} bytes)`,
      item: 'crescimento acima de 32 KiB sobre a `main`',
    });
  }
  if (since > MAX_SINCE_REVIEW) {
    over.push({
      reason: `as subidas desde a última revisão do dono somam ${since} bytes contando com esta, mais de 64 KiB (${MAX_SINCE_REVIEW} bytes)`,
      item: 'subidas desde a revisão do dono acima de 64 KiB',
    });
  }
  return over;
}

/** Pure decision: `{ action: 'raise' | 'none', ... }`. The raise is never refused (stage #1802, decision 1). */
export function decide({ ceiling, size, mainSize, reviewCeiling }) {
  const excess = size - ceiling;
  if (excess <= 0) {
    return { action: 'none', reason: `${size} bytes cabem no teto de ${ceiling} bytes` };
  }
  const growth = size - mainSize;
  const steps = Math.ceil((excess + MIN_MARGIN) / RAISE_BYTES);
  const next = ceiling + steps * RAISE_BYTES;
  const since = next - reviewCeiling;
  const over = overLimits({ excess, growth, since, steps });
  return { action: 'raise', ceiling, next, excess, growth, since, over };
}

/** The `sobe:` line and, when the raise exceeds a limit, the `bug:` line (separated by `\n`). */
export function describeDecision(d) {
  if (d.action === 'none') return `nada a subir: ${d.reason}`;
  const sobe = `sobe: ${d.ceiling} → ${d.next} (excesso ${d.excess}, crescimento ${d.growth}, subidas desde a revisão ${d.since})`;
  if (d.over.length === 0) return sobe;
  return `${sobe}\nbug: ${d.over.map((o) => o.reason).join('; ')}`;
}

/** KiB with a decimal comma only when the ceiling is not a multiple of 1 KiB: `1904` or `1.904,5`. */
function kib(bytes) {
  const v = bytes / KIB;
  if (Number.isInteger(v)) return grouped(v);
  const [int, frac] = v.toFixed(1).split('.');
  return `${grouped(int)},${frac}`;
}

/** Reads and validates the ceiling file: `{ indexHtmlMaxBytes: <positive integer>, history: string[] }`. */
export function loadBudget(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(
      `${file}: não foi possível ler o arquivo do teto (${e instanceof Error ? e.message : String(e)}).`,
      { cause: e },
    );
  }
  const ceiling = data?.indexHtmlMaxBytes;
  if (!Number.isInteger(ceiling) || ceiling <= 0) {
    throw new Error(
      `${file}: indexHtmlMaxBytes precisa ser um número inteiro positivo de bytes.`,
    );
  }
  if (!Array.isArray(data.history) || !data.history.every((h) => typeof h === 'string')) {
    throw new Error(`${file}: history precisa ser uma lista de frases (strings).`);
  }
  return data;
}

/** Devolve os dados com o teto novo e a frase da subida no fim do `history` (com os itens acima dos limites, se houver). */
export function applyRaise(data, d, { epic, date }) {
  if (data.indexHtmlMaxBytes !== d.ceiling) {
    throw new Error(`O arquivo tem teto ${data.indexHtmlMaxBytes}, não ${d.ceiling}.`);
  }
  const above =
    d.over.length > 0
      ? ` Acima dos limites: ${d.over.map((o) => o.item).join('; ')}.`
      : '';
  const sentence = `Subido para ${grouped(d.next)} (${kib(d.next)} KiB) pela regra do orçamento (${date}, épico \`${epic}\`): excesso de ${d.excess} bytes, crescimento de ${d.growth} bytes sobre a \`main\`.${above}`;
  return { ...data, indexHtmlMaxBytes: d.next, history: [...data.history, sentence] };
}

const VALUE_FLAGS = ['budget', 'size', 'main-size', 'review-ceiling', 'epic', 'date'];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    if (key === 'write') {
      out.write = true;
      continue;
    }
    if (key === 'ci') {
      throw new Error(
        `--ci saiu na etapa #1614: o teto fica em ${DEFAULT_BUDGET} (use --budget <arquivo> ou omita)`,
      );
    }
    if (!VALUE_FLAGS.includes(key)) throw new Error(`Flag desconhecida: ${a}.`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${a} precisa de um valor.`);
    }
    out[key] = value;
  }
  return out;
}

function intArg(args, name) {
  const raw = args[name];
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new Error(`--${name} precisa de um número inteiro de bytes.`);
  }
  return Number(raw);
}

const USAGE =
  'Uso: distBudget.mjs ceiling [--budget <arquivo>] | distBudget.mjs raise --size <bytes> --main-size <bytes> --review-ceiling <bytes> [--budget <arquivo>] [--write --epic <nome> [--date <AAAA-MM-DD>]] (o raise sempre sobe; uma 2ª linha `bug:` diz quando a subida passou de um limite)';

export function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (command !== 'raise' && command !== 'ceiling') throw new Error(USAGE);
  const file = args.budget ?? DEFAULT_BUDGET;
  const data = loadBudget(file);
  if (command === 'ceiling') return String(data.indexHtmlMaxBytes);
  const d = decide({
    ceiling: data.indexHtmlMaxBytes,
    size: intArg(args, 'size'),
    mainSize: intArg(args, 'main-size'),
    reviewCeiling: intArg(args, 'review-ceiling'),
  });
  if (args.write && d.action === 'raise') {
    if (!args.epic) throw new Error('--write precisa de --epic <nome>.');
    const date = args.date ?? new Date().toISOString().slice(0, 10);
    const next = applyRaise(data, d, { epic: args.epic, date });
    // The text Prettier leaves for JSON while `history` has long sentences (the array does not fit
    // on one line); `tests/tooling/distBudget.test.ts` checks it.
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  }
  return describeDecision(d);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${main(process.argv.slice(2))}\n`);
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
