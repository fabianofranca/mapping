// Subida automática do teto do `dist/index.html` (etapa #1324, decisões 6, 8 e 9) e o teto num arquivo
// de dados (etapa #1614, decisão 3). Só Node, sem dependências.
//   ceiling [--budget <arquivo>]
//     Imprime o `indexHtmlMaxBytes` do arquivo. É o que o passo "Tamanho do dist/index.html" do
//     `ci.yml` chama. Arquivo inválido sai com 2 e a mensagem no stderr.
//   raise --size <bytes> --main-size <bytes> --review-ceiling <bytes> [--budget <arquivo>]
//         [--write [--epic <nome>] [--date <AAAA-MM-DD>]]
//     Confere as condições numéricas e imprime uma linha:
//       "sobe: <teto> → <teto novo> (excesso E, crescimento G, subidas desde a revisão S)"
//       "chama o dono: <motivo>"
//       "nada a subir: ..." (o tamanho já cabe no teto)
//     A subida é de 16 KiB e só vale com excesso de até 14 KiB (14.336 bytes): assim sobram sempre
//     pelo menos 2 KiB de margem depois dela (etapa #1384, decisão 10). Excesso maior chama o dono.
//     Com `--write` e a subida, troca o `indexHtmlMaxBytes` do arquivo e acrescenta a frase ao fim do
//     `history`. Nunca escreve quando chama o dono.
// `--budget` tem como padrão `scripts/ci/dist-budget.json`, relativo à pasta corrente (a raiz do clone).
// O `--ci <ci.yml>` saiu na etapa #1614 e é recusado.
// As outras condições da decisão 6 (o tamanho é a única falha do PR) o chamador confere antes.
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const KIB = 1024;
/** Quanto o teto sobe de uma vez. */
export const RAISE_BYTES = 16 * KIB;
/** Margem mínima que sobra depois da subida. */
export const MIN_MARGIN = 2 * KIB;
/** Excesso máximo que a subida cobre: 14 KiB, para sobrar `MIN_MARGIN`. */
export const MAX_EXCESS = RAISE_BYTES - MIN_MARGIN;
/** Crescimento máximo do épico sobre a `main`. */
export const MAX_GROWTH = 32 * KIB;
/** Soma máxima das subidas automáticas desde a última revisão do dono. */
export const MAX_SINCE_REVIEW = 64 * KIB;

/** Arquivo do teto, relativo à pasta corrente. */
export const DEFAULT_BUDGET = 'scripts/ci/dist-budget.json';

/** `1933312` → `1.933.312`. */
function grouped(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Decisão pura: `{ action: 'raise' | 'owner' | 'none', ... }`. */
export function decide({ ceiling, size, mainSize, reviewCeiling }) {
  const excess = size - ceiling;
  if (excess <= 0) {
    return { action: 'none', reason: `${size} bytes cabem no teto de ${ceiling} bytes` };
  }
  const growth = size - mainSize;
  const next = ceiling + RAISE_BYTES;
  const since = next - reviewCeiling;
  const reasons = [];
  if (excess > MAX_EXCESS) {
    reasons.push(
      `o excesso de ${excess} bytes passa de 14 KiB (${MAX_EXCESS} bytes): com a subida de 16 KiB, a margem ficaria abaixo de 2 KiB`,
    );
  }
  if (growth > MAX_GROWTH) {
    reasons.push(
      `o épico cresceu ${growth} bytes sobre a main, mais de 32 KiB (${MAX_GROWTH} bytes)`,
    );
  }
  if (since > MAX_SINCE_REVIEW) {
    reasons.push(
      `as subidas desde a última revisão do dono passariam de 64 KiB (${since} bytes contando com esta; limite ${MAX_SINCE_REVIEW})`,
    );
  }
  if (reasons.length > 0) return { action: 'owner', reason: reasons.join('; ') };
  return { action: 'raise', ceiling, next, excess, growth, since };
}

export function describeDecision(d) {
  if (d.action === 'none') return `nada a subir: ${d.reason}`;
  if (d.action === 'owner') return `chama o dono: ${d.reason}`;
  return `sobe: ${d.ceiling} → ${d.next} (excesso ${d.excess}, crescimento ${d.growth}, subidas desde a revisão ${d.since})`;
}

/** KiB com vírgula decimal só quando o teto não é múltiplo de 1 KiB: `1904` ou `1.904,5`. */
function kib(bytes) {
  const v = bytes / KIB;
  if (Number.isInteger(v)) return grouped(v);
  const [int, frac] = v.toFixed(1).split('.');
  return `${grouped(int)},${frac}`;
}

/** Lê e valida o arquivo do teto: `{ indexHtmlMaxBytes: <inteiro positivo>, history: string[] }`. */
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

/** Devolve os dados com o teto novo e a frase da subida no fim do `history`. */
export function applyRaise(data, d, { epic, date }) {
  if (data.indexHtmlMaxBytes !== d.ceiling) {
    throw new Error(`O arquivo tem teto ${data.indexHtmlMaxBytes}, não ${d.ceiling}.`);
  }
  const sentence = `Subido para ${grouped(d.next)} (${kib(d.next)} KiB) pela regra do orçamento (${date}, épico \`${epic}\`): excesso de ${d.excess} bytes, crescimento de ${d.growth} bytes sobre a \`main\`.`;
  return { ...data, indexHtmlMaxBytes: d.next, history: [...data.history, sentence] };
}

const VALUE_FLAGS = [
  'budget',
  'ci',
  'size',
  'main-size',
  'review-ceiling',
  'epic',
  'date',
];

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
  'Uso: distBudget.mjs ceiling [--budget <arquivo>] | distBudget.mjs raise --size <bytes> --main-size <bytes> --review-ceiling <bytes> [--budget <arquivo>] [--write --epic <nome> [--date <AAAA-MM-DD>]]';

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
    // O texto que o Prettier deixa para JSON enquanto o `history` tem frases longas (o array não cabe
    // numa linha); `tests/tooling/distBudget.test.ts` confere.
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
