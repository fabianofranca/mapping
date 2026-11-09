// Guia da rodada (etapa #421, decisão 7): gera o docs/TESTING.md só com os roteiros pedidos.
//
// Uso:
//   node scripts/testing/round-guide.mjs <roteiro…> [--out <arquivo>]   (ex.: R0 R2 R4 R11; `all` = todos)
//
// Um roteiro pode ser pedido por faixa de passos (`R6.3-R6.7`): o guia leva só as linhas da tabela
// do roteiro nessa faixa (mais o cabeçalho e o texto de preparo). Duas faixas do mesmo roteiro se
// somam; o roteiro inteiro (`R6`) vence a faixa.
//
// Trechos marcados (etapa #841, RB1): no docs/TESTING.md, um trecho que só alguns roteiros usam fica
// entre `<!-- roteiros: R12 R22 -->` e `<!-- /roteiros -->` (cada marca em linha própria, sem
// aninhar). O trecho só entra no guia se um desses roteiros for pedido; trecho sem marca vai em
// todos os guias. A marca é um comentário HTML: não aparece no guia lido por gente.
//
// Tira do guia os roteiros não pedidos, os "Roteiros sob demanda (manuais)", a seção 9 e o
// "Registro do marco Uso real"; mantém o resto na ordem do guia ("Comece aqui", seções 1 a 7, a
// introdução da seção 8, o template do relato e os apêndices A e B). A granularidade é o roteiro
// inteiro. Roteiro inexistente: erro com a lista dos que existem (código de saída 2).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const GUIDE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'TESTING.md',
);

/** Parte o Markdown em trechos por cabeçalho `##`/`###` fora de bloco de código. */
function splitSections(markdown) {
  const sections = [{ level: 0, title: '', lines: [] }];
  let fence = null;
  for (const line of markdown.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }
    const heading = fence || marker ? null : /^(#{2,3}) (.*)$/.exec(line);
    if (heading) {
      sections.push({ level: heading[1].length, title: heading[2], lines: [line] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

const ROTEIRO = /^(R\d+)\b/;

/** Ids dos roteiros (`R0`, `R1`, …) que o guia tem, na ordem em que aparecem. */
export function listRoteiros(markdown) {
  return splitSections(markdown)
    .filter((section) => section.level === 3 && ROTEIRO.test(section.title))
    .map((section) => ROTEIRO.exec(section.title)[1]);
}

const MARK_OPEN = /^<!-- roteiros: ([^>]*?) -->$/;
const MARK_CLOSE = '<!-- /roteiros -->';
const STEP_ROW = /^\|\s*(?:\*\*)?(R\d+\.\d+[a-z]?)(?:\*\*)?[^|]*\|/;
const RANGE = /^(R\d+)\.(\d+[a-z]?)-(R\d+)\.(\d+[a-z]?)$/i;

/** Tira as marcas de trecho: o trecho fica se um dos roteiros citados é pedido. */
function applyMarks(text, wanted, existing) {
  const out = [];
  let open = null;
  for (const line of text.split('\n')) {
    const mark = MARK_OPEN.exec(line);
    if (mark) {
      if (open) throw new Error('Marca <!-- roteiros --> aninhada no guia.');
      const ids = mark[1].trim().split(/\s+/).filter(Boolean);
      for (const id of ids) {
        if (!existing.includes(id)) {
          throw new Error(
            `Marca cita roteiro inexistente: ${id}. Existem: ${existing.join(', ')}.`,
          );
        }
      }
      open = { keep: ids.some((id) => wanted.has(id)) };
    } else if (line === MARK_CLOSE) {
      if (!open) throw new Error('Marca <!-- /roteiros --> sem abertura no guia.');
      open = null;
    } else if (!open || open.keep) {
      out.push(line);
    }
  }
  if (open)
    throw new Error('Marca <!-- roteiros --> sem o <!-- /roteiros --> de fechamento.');
  return out.join('\n');
}

/** Códigos dos passos (`R6.3`, `R6.8a`…) da tabela de um trecho de roteiro, na ordem. */
function stepCodes(lines) {
  return lines.map((line) => STEP_ROW.exec(line)?.[1]).filter(Boolean);
}

/** O trecho do roteiro só com as linhas de passo dentro das faixas (`from`/`to` sem o roteiro). */
function cutRanges(lines, ranges, id) {
  const codes = stepCodes(lines);
  const allowed = new Set();
  for (const { from, to } of ranges) {
    const a = codes.indexOf(`${id}.${from}`);
    const b = codes.indexOf(`${id}.${to}`);
    if (a < 0 || b < 0 || b < a) {
      throw new Error(
        `Faixa inválida: ${id}.${from}-${id}.${to}. Passos: ${codes.join(', ')}.`,
      );
    }
    for (const code of codes.slice(a, b + 1)) allowed.add(code);
  }
  return lines.filter((line) => {
    const code = STEP_ROW.exec(line)?.[1];
    return !code || allowed.has(code);
  });
}

/** Separa os argumentos em roteiros inteiros e faixas por roteiro. */
function parseRequest(roteiros, existing) {
  const whole = new Set();
  const ranges = new Map();
  for (const raw of roteiros) {
    if (raw === 'all') {
      for (const id of existing) whole.add(id);
      continue;
    }
    const range = RANGE.exec(raw);
    if (range) {
      const id = range[1].toUpperCase();
      if (id !== range[3].toUpperCase()) {
        throw new Error(`Faixa de passos de roteiros diferentes: ${raw}.`);
      }
      const list = ranges.get(id) ?? [];
      list.push({ from: range[2], to: range[4] });
      ranges.set(id, list);
    } else {
      whole.add(raw.toUpperCase());
    }
  }
  for (const id of [...whole, ...ranges.keys()]) {
    if (!existing.includes(id)) {
      throw new Error(`Roteiro inexistente: ${id}. Existem: ${existing.join(', ')}.`);
    }
  }
  return { whole, ranges };
}

/** O guia sem os roteiros não pedidos, os sob demanda, a seção 9 e o registro do Uso real. */
export function buildRoundGuide(markdown, roteiros, { commit = 'desconhecido' } = {}) {
  const existing = listRoteiros(markdown);
  const { whole, ranges } = parseRequest(roteiros, existing);
  const wanted = new Set([...whole, ...ranges.keys()]);
  let dropParent = false;
  const kept = [];
  for (const section of splitSections(markdown)) {
    if (section.level === 2) {
      dropParent = /^9\./.test(section.title);
    }
    const roteiro = section.level === 3 ? ROTEIRO.exec(section.title)?.[1] : undefined;
    const drop =
      (section.level === 2 && dropParent) ||
      (section.level === 3 &&
        (dropParent ||
          (roteiro && !wanted.has(roteiro)) ||
          /^Roteiros sob demanda/.test(section.title) ||
          /^Registro do marco/.test(section.title)));
    if (drop) continue;
    const cut = roteiro && !whole.has(roteiro) && ranges.has(roteiro);
    kept.push(
      (cut ? cutRanges(section.lines, ranges.get(roteiro), roteiro) : section.lines).join(
        '\n',
      ),
    );
  }
  const ids = existing
    .filter((id) => wanted.has(id))
    .map((id) =>
      whole.has(id)
        ? id
        : `${id} (${ranges
            .get(id)
            .map((r) => `${id}.${r.from}-${id}.${r.to}`)
            .join(', ')})`,
    );
  const note = `> Guia da rodada (commit ${commit}): roteiros ${ids.join(', ')}. O guia inteiro é o docs/TESTING.md; consulte-o por trecho (Grep) para o que faltar aqui.`;
  return `${note}\n\n${applyMarks(kept.join('\n'), wanted, existing)}`;
}

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'desconhecido';
  }
}

function runCli(argv) {
  const roteiros = [];
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      out = argv[(i += 1)];
    } else {
      roteiros.push(argv[i]);
    }
  }
  if (roteiros.length === 0 || (argv.includes('--out') && !out)) {
    console.error(
      'Uso: node scripts/testing/round-guide.mjs <roteiro|faixa…|all> [--out <arquivo>]',
    );
    process.exitCode = 2;
    return;
  }
  const markdown = fs.readFileSync(GUIDE_FILE, 'utf8');
  let guide;
  try {
    guide = buildRoundGuide(markdown, roteiros, { commit: currentCommit() });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  const percent = Math.round(
    (Buffer.byteLength(guide) / Buffer.byteLength(markdown)) * 100,
  );
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, guide);
    console.error(
      `${out}: ${Buffer.byteLength(guide)} bytes (${percent}% do docs/TESTING.md)`,
    );
  } else {
    process.stdout.write(`${guide}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2));
}
