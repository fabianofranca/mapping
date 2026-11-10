// Guia da rodada (etapa #421, decisão 7): gera o docs/TESTING.md só com os roteiros pedidos.
//
// Uso:
//   node scripts/testing/round-guide.mjs <roteiro…> [--out <pasta>/<nome>.md]   (ex.: R0 R2 R4 R11; `all` = todos)
//   node scripts/testing/round-guide.mjs --grupos <roteiro…>            (divide a dirigida em grupos; ver abaixo)
//
// Com `--out`, grava três arquivos (etapa #1232, GL1): `<nome>.md` (o guia da rodada), `<nome>-base.md`
// (o mesmo guia sem as seções `### R<n>`, que viram uma linha com o comando) e `<nome>-indice.tsv`
// (seção, roteiro e passo → linhas do `<nome>.md`). O roteiro e os passos saem por demanda com
// `node scripts/testing/cloud.mjs passo <item…>` (`guideExcerpt`, abaixo).
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
// "Registro do marco Uso real"; no quadro do "Comece aqui" ficam só as linhas dos roteiros pedidos
// (MF3, #1025: o quadro inteiro pesa uns 5 mil caracteres em todo guia de bloco); mantém o resto na
// ordem do guia ("Comece aqui", seções 1 a 7, a
// introdução da seção 8, o template do relato e os apêndices A e B). A granularidade é o roteiro
// inteiro. Roteiro inexistente: erro com a lista dos que existem (código de saída 2).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    if (raw.toLowerCase() === 'all') {
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

const OVERVIEW_ROW = /^\|\s*(?:\d+|sob demanda)\s*\|\s*(R\d+|R[A-Z])\b/;

/**
 * As linhas do quadro "Comece aqui" sem as linhas dos roteiros que o guia não leva (e dos sob
 * demanda, que também saem): sobra a linha de cada roteiro pedido, a da seção 6 e o resto do texto.
 * O quadro lista os 27 roteiros e pesa uns 5 mil caracteres em todo guia de bloco.
 */
function trimOverview(lines, wanted) {
  return lines.filter((line) => {
    const id = OVERVIEW_ROW.exec(line)?.[1];
    return id === undefined || wanted.has(id);
  });
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
      if (/^Comece aqui/.test(section.title))
        section.lines = trimOverview(section.lines, wanted);
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

// --- Guia da rodada sob demanda (etapa #1232, GL1) ---

/** Linhas de passo de um trecho (fora de bloco de código): o código e o índice da linha. */
function stepRows(lines) {
  const rows = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      fence = !fence;
      return;
    }
    const code = fence ? undefined : STEP_ROW.exec(line)?.[1];
    if (code) rows.push({ code, i });
  });
  return rows;
}

/**
 * A base do guia da rodada: o mesmo guia do `buildRoundGuide`, sem as seções `### R<n>`, cada uma
 * trocada por uma linha com o comando que a imprime (`cloud.mjs passo R<n>`). `name` é o nome do
 * arquivo do índice (`<name>-indice.tsv`).
 */
export function buildGuideBase(
  markdown,
  roteiros,
  { commit = 'desconhecido', name = 'guia' } = {},
) {
  const out = [];
  for (const section of splitSections(buildRoundGuide(markdown, roteiros, { commit }))) {
    const id = section.level === 3 ? ROTEIRO.exec(section.title)?.[1] : undefined;
    if (id) {
      out.push(
        `### ${section.title}: \`node scripts/testing/cloud.mjs passo ${id}\``,
        '',
      );
    } else if (section.level === 0) {
      const [note = '', ...rest] = section.lines;
      out.push(
        note,
        `> Os roteiros saem por \`cloud.mjs passo\`; o índice está em \`${name}-indice.tsv\`.`,
        ...rest,
      );
    } else {
      out.push(...section.lines);
    }
  }
  return out.join('\n');
}

/**
 * O índice do guia da rodada, em TSV (`tipo`, `chave`, `ini`, `fim`, `título`), com linhas 1-based
 * do próprio guia: uma `secao` por cabeçalho que não é roteiro, um `roteiro` por `### R<n>` e um
 * `passo` por linha de passo.
 */
export function buildGuideIndex(guideText) {
  const lines = guideText.split('\n');
  const cell = (text) =>
    String(text)
      .replace(/[\t\r\n]+/g, ' ')
      .trim();
  const rows = [['tipo', 'chave', 'ini', 'fim', 'título']];
  let consumed = 0;
  for (const section of splitSections(guideText)) {
    const ini = consumed + 1;
    consumed += section.lines.length;
    if (section.level === 0) continue;
    let fim = consumed;
    while (fim > ini && !lines[fim - 1].trim()) fim -= 1;
    const id = section.level === 3 ? ROTEIRO.exec(section.title)?.[1] : undefined;
    rows.push([
      id ? 'roteiro' : 'secao',
      id ?? cell(section.title),
      ini,
      fim,
      cell(section.title),
    ]);
    if (!id) continue;
    for (const { code, i } of stepRows(section.lines)) {
      const action = section.lines[i].split(/(?<!\\)\|/)[2] ?? '';
      rows.push(['passo', code, ini + i, ini + i, cell(action).slice(0, 80)]);
    }
  }
  return `${rows.map((row) => row.join('\t')).join('\n')}\n`;
}

/** Limite de caracteres do que o `cloud.mjs passo` imprime (abaixo dos 30 mil do Bash). */
export const EXCERPT_LIMIT = 25000;
const CUT_RESERVE = 200;
const STEP_ITEM = /^(R\d+)\.(\d+[a-z]?)$/i;
const STEP_HEADER = /^\|\s*Passo\b/;

/** Interpreta um item do `passo`: `R12`, `R12.4` ou `R12.4-R12.9`. */
function parseExcerptItem(raw) {
  const range = RANGE.exec(raw);
  if (range) {
    const id = range[1].toUpperCase();
    if (id !== range[3].toUpperCase()) {
      throw new Error(`Faixa de passos de roteiros diferentes: ${raw}.`);
    }
    return {
      raw,
      id,
      from: `${id}.${range[2].toLowerCase()}`,
      to: `${id}.${range[4].toLowerCase()}`,
    };
  }
  const step = STEP_ITEM.exec(raw);
  if (step) {
    const code = `${step[1].toUpperCase()}.${step[2].toLowerCase()}`;
    return { raw, id: step[1].toUpperCase(), from: code, to: code };
  }
  if (/^R\d+$/i.test(raw)) return { raw, id: raw.toUpperCase() };
  throw new Error(`Item inválido: ${raw}. Use R<n>, R<n>.<m> ou R<n>.<a>-R<n>.<b>.`);
}

/** O roteiro inteiro sem as linhas de passo: cada sequência delas vira `Passos (k): a, b, …, z`. */
function wholeRoteiro(section, rows) {
  const stepAt = new Map(rows.map((r) => [r.i, r.code]));
  const entries = [];
  let run = [];
  const flush = () => {
    if (run.length === 0) return;
    const shown = run.length <= 3 ? run : [run[0], run[1], '…', run[run.length - 1]];
    entries.push({ text: `Passos (${run.length}): ${shown.join(', ')}` });
    run = [];
  };
  section.lines.forEach((line, i) => {
    if (stepAt.has(i)) run.push(stepAt.get(i));
    else {
      flush();
      entries.push({ text: line });
    }
  });
  flush();
  while (entries.length && !entries[entries.length - 1].text.trim()) entries.pop();
  return entries;
}

/** As linhas do primeiro ao último passo pedido, com o cabeçalho da tabela do primeiro. */
function stepRange(section, rows, item, guideId) {
  const codes = rows.map((r) => r.code);
  const absent = (code) => {
    const span = codes.length
      ? `tem ${codes[0]} a ${codes[codes.length - 1]} (${codes.length} passos)`
      : 'não tem passos';
    return new Error(`${code} não está no guia da rodada; o ${guideId} ${span}`);
  };
  const a = codes.indexOf(item.from);
  let b = codes.indexOf(item.to);
  if (a < 0) throw absent(item.from);
  if (b < 0) throw absent(item.to);
  if (b < a)
    throw new Error(
      `Faixa inválida: ${item.from}-${item.to}. Passos: ${codes.join(', ')}.`,
    );
  // O último passo pedido leva consigo os que dependem dele (R22.6 traz o R22.6a).
  while (
    /\d$/.test(item.to) &&
    codes[b + 1]?.startsWith(item.to) &&
    /^[a-z]$/.test(codes[b + 1].slice(item.to.length))
  ) {
    b += 1;
  }
  const first = rows[a].i;
  const entries = [];
  for (let h = first - 1; h >= 0; h -= 1) {
    if (STEP_HEADER.test(section.lines[h])) {
      entries.push({ text: section.lines[h] }, { text: section.lines[h + 1] });
      break;
    }
  }
  const stepAt = new Map(rows.map((r) => [r.i, r.code]));
  for (let i = first; i <= rows[b].i; i += 1) {
    entries.push({ text: section.lines[i], code: stepAt.get(i) });
  }
  return entries;
}

/** Corta as linhas em `EXCERPT_LIMIT` caracteres, na última linha inteira, e diz como continuar. */
function cutExcerpt(entries, items) {
  const total = entries.reduce((n, e) => n + e.text.length + 1, -1);
  if (total <= EXCERPT_LIMIT) return entries.map((e) => e.text).join('\n');
  let size = 0;
  let end = 0;
  while (end < entries.length) {
    const next = size + entries[end].text.length + (end ? 1 : 0);
    if (next > EXCERPT_LIMIT - CUT_RESERVE && end > 0) break;
    size = next;
    end += 1;
  }
  const rest = entries.slice(end);
  const item = items[rest[0].item];
  const next = rest.find((e) => e.code && e.item === rest[0].item)?.code;
  const target = next ? (next === item.to ? next : `${next}-${item.to}`) : item.raw;
  const later = [...new Set(rest.map((e) => e.item))]
    .filter((n) => items[n] !== item)
    .map((n) => items[n].raw);
  const tail = later.length ? `; depois, os itens ${later.join(' ')}` : '';
  const message = `… corte em 25.000 caracteres: continue com cloud.mjs passo ${target}${tail}`;
  return [...entries.slice(0, end).map((e) => e.text), message].join('\n');
}

/**
 * O trecho do guia da rodada para o `cloud.mjs passo`: `R<n>` (o roteiro sem as linhas de passo),
 * `R<n>.<m>` ou `R<n>.<a>-R<n>.<b>` (as linhas dos passos, com o cabeçalho da tabela). Os itens saem
 * na ordem pedida, separados por `---`; erro de item lança `Error` sem imprimir trecho.
 */
export function guideExcerpt(guideText, itens) {
  const sections = new Map();
  for (const section of splitSections(guideText)) {
    const id = section.level === 3 ? ROTEIRO.exec(section.title)?.[1] : undefined;
    if (id) sections.set(id, { section, rows: stepRows(section.lines) });
  }
  const items = itens.map(parseExcerptItem);
  const entries = [];
  items.forEach((item, n) => {
    const found = sections.get(item.id);
    if (!found) {
      throw new Error(
        `${item.from ?? item.id} não está no guia da rodada; o guia tem ${[...sections.keys()].join(', ')}. Para outro roteiro, gere o guia de novo com round-guide.mjs ou procure o trecho com Grep no docs/TESTING.md.`,
      );
    }
    const part = item.from
      ? stepRange(found.section, found.rows, item, item.id)
      : wholeRoteiro(found.section, found.rows);
    if (n > 0) entries.push({ text: '---', item: n });
    for (const entry of part) entries.push({ ...entry, item: n });
  });
  return cutExcerpt(entries, items);
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
  const commit = currentCommit();
  let guide;
  try {
    guide = buildRoundGuide(markdown, roteiros, { commit });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  if (out) {
    const stem = out.replace(/\.md$/i, '');
    const files = [
      [out, guide],
      [
        `${stem}-base.md`,
        buildGuideBase(markdown, roteiros, { commit, name: path.basename(stem) }),
      ],
      [`${stem}-indice.tsv`, buildGuideIndex(guide)],
    ];
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    for (const [file, text] of files) {
      fs.writeFileSync(file, text);
      const percent = Math.round(
        (Buffer.byteLength(text) / Buffer.byteLength(markdown)) * 100,
      );
      console.error(
        `${file}: ${Buffer.byteLength(text)} bytes (${percent}% do docs/TESTING.md)`,
      );
    }
  } else {
    process.stdout.write(`${guide}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
