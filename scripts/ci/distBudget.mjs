// Subida automática do teto do `dist/index.html` (etapa #1324, decisões 6, 8 e 9). Só Node, sem
// dependências.
//   raise --ci <ci.yml> --size <bytes> --main-size <bytes> --review-ceiling <bytes>
//         [--write [--epic <nome>] [--date <AAAA-MM-DD>]]
//     Confere as condições numéricas e imprime uma linha:
//       "sobe: <teto> → <teto novo> (excesso E, crescimento G, subidas desde a revisão S)"
//       "chama o dono: <motivo>"
//       "nada a subir: ..." (o tamanho já cabe no teto)
//     Com `--write` e a subida, troca o `INDEX_HTML_MAX_BYTES` do `ci.yml` e acrescenta a frase ao
//     comentário que o antecede. Nunca escreve quando chama o dono.
// As outras condições da decisão 6 (o tamanho é a única falha do PR) o chamador confere antes.
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const KIB = 1024;
/** Quanto o teto sobe de uma vez, e o excesso máximo que a subida cobre. */
export const RAISE_BYTES = 16 * KIB;
/** Crescimento máximo do épico sobre a `main`. */
export const MAX_GROWTH = 32 * KIB;
/** Soma máxima das subidas automáticas desde a última revisão do dono. */
export const MAX_SINCE_REVIEW = 64 * KIB;

const BUDGET_LINE = /^( *)INDEX_HTML_MAX_BYTES: (\d+)$/m;

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
  if (excess > RAISE_BYTES) {
    reasons.push(`o excesso de ${excess} bytes passa de 16 KiB (${RAISE_BYTES} bytes)`);
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

/** Devolve o texto do `ci.yml` com o teto novo e a frase no comentário da linha anterior. */
export function applyRaise(yaml, d, { epic, date }) {
  const match = BUDGET_LINE.exec(yaml);
  if (!match) throw new Error('ci.yml sem INDEX_HTML_MAX_BYTES.');
  const current = Number(match[2]);
  if (current !== d.ceiling) {
    throw new Error(`O ci.yml tem teto ${current}, não ${d.ceiling}.`);
  }
  const sentence = ` Subido para ${grouped(d.next)} (${kib(d.next)} KiB) pela regra do orçamento (${date}, épico \`${epic}\`): excesso de ${d.excess} bytes, crescimento de ${d.growth} bytes sobre a \`main\`.`;
  const lines = yaml.split('\n');
  const at = lines.findIndex((l) => BUDGET_LINE.test(l));
  const prev = lines[at - 1] ?? '';
  if (!/^ *#/.test(prev)) {
    throw new Error(
      'A linha antes do INDEX_HTML_MAX_BYTES não é o comentário do orçamento.',
    );
  }
  lines[at - 1] = prev.trimEnd() + sentence;
  lines[at] = `${match[1]}INDEX_HTML_MAX_BYTES: ${d.next}`;
  return lines.join('\n');
}

const VALUE_FLAGS = ['ci', 'size', 'main-size', 'review-ceiling', 'epic', 'date'];

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

export function main(argv) {
  const args = parseArgs(argv);
  if (args._[0] !== 'raise') {
    throw new Error(
      'Uso: distBudget.mjs raise --ci <ci.yml> --size <bytes> --main-size <bytes> --review-ceiling <bytes> [--write --epic <nome> [--date <AAAA-MM-DD>]]',
    );
  }
  if (!args.ci) throw new Error('--ci precisa do caminho do ci.yml.');
  const yaml = readFileSync(args.ci, 'utf8');
  const ceilingMatch = BUDGET_LINE.exec(yaml);
  if (!ceilingMatch) throw new Error('ci.yml sem INDEX_HTML_MAX_BYTES.');
  const d = decide({
    ceiling: Number(ceilingMatch[2]),
    size: intArg(args, 'size'),
    mainSize: intArg(args, 'main-size'),
    reviewCeiling: intArg(args, 'review-ceiling'),
  });
  if (args.write && d.action === 'raise') {
    if (!args.epic) throw new Error('--write precisa de --epic <nome>.');
    const date = args.date ?? new Date().toISOString().slice(0, 10);
    writeFileSync(args.ci, applyRaise(yaml, d, { epic: args.epic, date }));
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
