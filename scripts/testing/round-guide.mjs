// Guia da rodada (etapa #421, decisão 7): gera o docs/TESTING.md só com os roteiros pedidos.
//
// Uso:
//   node scripts/testing/round-guide.mjs <roteiro…> [--out <arquivo>]   (ex.: R0 R2 R4 R11; `all` = todos)
//   node scripts/testing/round-guide.mjs --grupos <roteiro…>            (divide a dirigida em grupos; ver abaixo)
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

// --- Rodada dirigida em grupos paralelos (etapa #1148, TR4, decisões 15 a 17) ---

/** Passos por grupo: acima disso (sem o R0), a dirigida se divide em sessões paralelas. */
export const GROUP_LIMIT = 40;
/** No máximo 5 sessões por rodada. */
export const MAX_GROUPS = 5;

/**
 * Cadeias de dependência que nunca se separam entre grupos (decisão 16; docs/TESTING-NUVEM.md,
 * "Rodada dirigida em grupos"). Cada item é um roteiro (`R1`) ou uma faixa (`R6.3-R6.7`).
 */
export const CHAINS = [
  {
    name: 'principal',
    items: ['R1', 'R3', 'R5', 'R6.3-R6.7', 'R6.12-R6.14', 'R7', 'R8'],
  },
  { name: 'loja', items: ['R4', 'R6.8a-R6.11'] },
  { name: 'telas', items: ['R9', 'R10'] },
];

/** Códigos dos passos de cada roteiro principal (fora de bloco de código), na ordem do guia. */
function stepsByRoteiro(markdown) {
  const map = new Map();
  for (const section of splitSections(markdown)) {
    const id = section.level === 3 ? ROTEIRO.exec(section.title)?.[1] : undefined;
    if (!id) continue;
    let fence = false;
    const codes = [];
    for (const line of section.lines) {
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        fence = !fence;
        continue;
      }
      const code = fence ? undefined : STEP_ROW.exec(line)?.[1];
      if (code) codes.push(code);
    }
    map.set(id, codes);
  }
  return map;
}

/** Os códigos de um item (`R12` ou `R6.3-R6.7`). */
function itemCodes(token, byRoteiro) {
  const range = RANGE.exec(token);
  if (!range) return byRoteiro.get(token.toUpperCase()) ?? [];
  const id = range[1].toUpperCase();
  const codes = byRoteiro.get(id) ?? [];
  const a = codes.indexOf(`${id}.${range[2]}`);
  const b = codes.indexOf(`${id}.${range[4]}`);
  if (a < 0 || b < 0 || b < a) {
    throw new Error(`Faixa inválida: ${token}. Passos: ${codes.join(', ')}.`);
  }
  return codes.slice(a, b + 1);
}

/**
 * Divide os roteiros pedidos em grupos de até `limit` passos (sem o R0), no máximo 5, sem separar
 * uma cadeia nem um roteiro. Devolve os passos de cada item, o total e os grupos propostos.
 */
export function planGroups(markdown, roteiros, { limit = GROUP_LIMIT } = {}) {
  const existing = listRoteiros(markdown);
  const byRoteiro = stepsByRoteiro(markdown);
  const { whole, ranges } = parseRequest(roteiros, existing);
  const order = (code) => existing.indexOf(code.split('.')[0]);
  // Um token por roteiro inteiro ou faixa pedida; o inteiro vence a faixa; o R0 fica de fora.
  const tokens = [];
  for (const id of existing) {
    if (id === 'R0') continue;
    if (whole.has(id)) tokens.push(id);
    else
      for (const r of ranges.get(id) ?? []) tokens.push(`${id}.${r.from}-${id}.${r.to}`);
  }
  const chainOf = new Map();
  for (const chain of CHAINS) {
    for (const item of chain.items) {
      for (const code of itemCodes(item, byRoteiro)) chainOf.set(code, chain.name);
    }
  }
  const items = tokens.map((token) => ({ token, codes: itemCodes(token, byRoteiro) }));
  // União das chaves (cadeia, ou o próprio roteiro) que um mesmo item toca.
  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root);
    parent.set(k, root);
    return root;
  };
  const keysOf = (item) =>
    new Set(item.codes.map((c) => chainOf.get(c) ?? c.split('.')[0]));
  for (const item of items) {
    const [first, ...rest] = [...keysOf(item)];
    if (first === undefined) continue;
    for (const k of rest) parent.set(find(k), find(first));
    find(first);
  }
  const units = new Map();
  for (const item of items) {
    const [first] = [...keysOf(item)];
    if (first === undefined) continue;
    const root = find(first);
    const unit = units.get(root) ?? { items: [], codes: new Set() };
    unit.items.push(item);
    for (const c of item.codes) unit.codes.add(c);
    units.set(root, unit);
  }
  const list = [...units.values()].map((u) => ({
    tokens: u.items.map((i) => i.token),
    steps: u.codes.size,
    first: Math.min(...u.items.map((i) => order(i.codes[0] ?? 'R0.0'))),
  }));
  const total = list.reduce((n, u) => n + u.steps, 0);
  const planItems = items.map((i) => ({ token: i.token, steps: i.codes.length }));
  if (total <= limit) return { items: planItems, total, single: true, groups: [] };
  // Maior primeiro; cada unidade vai ao grupo mais cheio onde ainda cabe, senão abre um grupo.
  const groups = [];
  for (const unit of [...list].sort((a, b) => b.steps - a.steps || a.first - b.first)) {
    const fits = groups
      .filter((g) => g.steps + unit.steps <= limit)
      .sort((a, b) => b.steps - a.steps)[0];
    if (fits) {
      fits.units.push(unit);
      fits.steps += unit.steps;
    } else if (groups.length < MAX_GROUPS) {
      groups.push({ units: [unit], steps: unit.steps });
    } else {
      // Passou de 5 grupos: o excedente vai ao grupo mais leve (passa de ~40, nunca de 5 sessões).
      const lightest = groups.reduce((a, b) => (b.steps < a.steps ? b : a));
      lightest.units.push(unit);
      lightest.steps += unit.steps;
    }
  }
  groups.sort((a, b) => b.steps - a.steps);
  return {
    items: planItems,
    total,
    single: false,
    groups: groups.map((g, i) => ({
      n: i + 1,
      steps: g.steps,
      tokens: g.units
        .sort((a, b) => a.first - b.first)
        .flatMap((u) => u.tokens)
        .sort(
          (a, b) => existing.indexOf(a.split('.')[0]) - existing.indexOf(b.split('.')[0]),
        ),
    })),
  };
}

/** O texto que o `--grupos` imprime: passos por item, total e uma linha `grupo k de n` por grupo. */
export function formatGroupPlan(plan, { limit = GROUP_LIMIT } = {}) {
  const lines = ['Passos por item (sem o R0):'];
  for (const i of plan.items) lines.push(`  ${i.token}: ${i.steps}`);
  lines.push(`Total: ${plan.total} (limite por grupo: ${limit})`, '');
  if (plan.single) {
    lines.push('uma sessão');
  } else {
    for (const g of plan.groups) lines.push(`# grupo ${g.n}: ${g.steps} passos`);
    for (const g of plan.groups) {
      lines.push(`grupo ${g.n} de ${plan.groups.length}: ${g.tokens.join(' ')}`);
    }
  }
  return lines.join('\n');
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

function runGroupsCli(roteiros) {
  if (roteiros.length === 0) {
    console.error('Uso: node scripts/testing/round-guide.mjs --grupos <roteiro|faixa…>');
    process.exitCode = 2;
    return;
  }
  try {
    const plan = planGroups(fs.readFileSync(GUIDE_FILE, 'utf8'), roteiros);
    process.stdout.write(`${formatGroupPlan(plan)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

function runCli(argv) {
  if (argv.includes('--grupos')) {
    runGroupsCli(argv.filter((a) => a !== '--grupos'));
    return;
  }
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
