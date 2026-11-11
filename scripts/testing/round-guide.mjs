// Guia da rodada (etapa #421, decisão 7): gera o docs/TESTING.md só com os roteiros pedidos.
//
// Uso:
//   node scripts/testing/round-guide.mjs <roteiro…> [--out <pasta>/<nome>.md]   (ex.: R0 R2 R4 R11; `all` = todos)
//   node scripts/testing/round-guide.mjs --grupos <roteiro…>            (divide a dirigida em grupos; ver abaixo)
//   node scripts/testing/round-guide.mjs --faixas <roteiro|faixa…>      (lotes de até 20 passos para os subagentes do testador)
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
// Base obrigatória (etapa #1533, TE1): o `<nome>-base.md` leva só o que o testador precisa antes de
// começar (ver `SECOES_SOB_DEMANDA`); as outras seções do guia viram uma linha com o comando
// `cloud.mjs secao <chave>`, que `guideSection` atende.
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
const STEP_ITEM = /^(R\d+)\.(\d+[a-z]?)$/i;
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
    } else if (STEP_ITEM.test(raw)) {
      // Passo avulso (`R0.1`): a faixa de um passo só.
      const [rawId, step] = raw.split('.');
      const id = rawId.toUpperCase();
      const list = ranges.get(id) ?? [];
      list.push({ from: step, to: step });
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

/**
 * Seções que o testador lê sob demanda (etapa #1533, TE1, decisões 1 e 4): a chave do `cloud.mjs
 * secao`, o início do título (`titulo`), o `nivel` do cabeçalho, a `fonte` (`guia`: o `apoio/guia.md`;
 * `consulta`: o `docs/TESTING-NUVEM-CONSULTA.md` do clone; `consulta.regras` guarda as regras do R21 e do passo que exige o dono) e o `quando` ler.
 */
export const SECOES_SOB_DEMANDA = [
  {
    chave: '1',
    titulo: '1. Onde pegar a app',
    nivel: 2,
    fonte: 'guia',
    quando: 'se a URL da app ou o canal (estável ou prévia) estiver em dúvida',
  },
  {
    chave: '2',
    titulo: '2. Requisitos',
    nivel: 2,
    fonte: 'guia',
    quando:
      'se faltar pasta de trabalho, imagem de teste ou se uma extensão atrapalhar a digitação',
  },
  {
    chave: '3',
    titulo: '3. Conferir a versão que está aberta',
    nivel: 2,
    fonte: 'guia',
    quando:
      'antes do R0.1, para achar o build id na barra de status ou em Configurações › Sobre',
  },
  {
    chave: '5',
    titulo: '5. Mapa da interface',
    nivel: 2,
    fonte: 'guia',
    quando:
      'quando um passo citar um nome, ícone, janela ou notação da interface que você não achar',
  },
  {
    chave: '6',
    titulo: '6. Instalar o servidor MCP',
    nivel: 2,
    fonte: 'guia',
    quando:
      'antes da seção 6 da rodada (repositório de teste e MCP), no bloco ou grupo que a tem',
  },
  {
    chave: '7',
    titulo: '7. Como relatar um problema',
    nivel: 2,
    fonte: 'guia',
    quando:
      'antes do primeiro achado e antes de escrever o relato (severidade e Diagnóstico)',
  },
  {
    chave: 'A.seletores',
    titulo: 'Seletores e nomes que enganam',
    nivel: 3,
    fonte: 'guia',
    quando:
      'quando um localizador falhar por timeout, por modo estrito ou por nome repetido',
  },
  {
    chave: 'B',
    titulo: 'Apêndice B',
    nivel: 2,
    fonte: 'guia',
    quando:
      'nas operações de disco (mover, copiar, tirar a permissão de escrita): R6.8b e R6.11',
  },
  {
    chave: 'consulta.subagente',
    titulo: 'Subagente por lote',
    nivel: 2,
    fonte: 'consulta',
    quando: 'antes do primeiro lote (o R0)',
  },
  {
    chave: 'consulta.grupos',
    titulo: 'Rodada dirigida em grupos',
    nivel: 2,
    fonte: 'consulta',
    quando:
      'se a mensagem disser "grupo k de n" ou se você tiver de dividir uma dirigida',
  },
  {
    chave: 'consulta.passada',
    titulo: 'Passada visual',
    nivel: 2,
    fonte: 'consulta',
    quando:
      'antes da passada visual (bloco 4, ou a dirigida que a pede) e no reteste de janelas',
  },
  {
    chave: 'consulta.regras',
    titulo: 'Regras de exceção',
    nivel: 2,
    fonte: 'consulta',
    quando: 'antes do R21 (tag da release) ou de um passo que só a pessoa faria',
  },
  {
    chave: 'consulta.historico',
    titulo: 'Histórico dos blocos',
    nivel: 2,
    fonte: 'consulta',
    quando: 'só para comparar tempos e contagens com as rodadas anteriores',
  },
];

/** A entrada de `SECOES_SOB_DEMANDA` do guia (`fonte: 'guia'`) que esta seção é, se for. */
function onDemandEntry(section) {
  if (section.level < 2) return undefined;
  return SECOES_SOB_DEMANDA.find(
    (e) =>
      e.fonte === 'guia' &&
      e.nivel === section.level &&
      section.title.startsWith(e.titulo),
  );
}

/** A linha do comando que no lugar da seção sob demanda diz como lê-la. */
function onDemandPointer(section, entry) {
  return [
    `${'#'.repeat(section.level)} ${section.title}: \`node scripts/testing/cloud.mjs secao ${entry.chave}\``,
    '',
    `Quando ler: ${entry.quando}.`,
    '',
  ];
}

/**
 * O guia sem os roteiros não pedidos, os sob demanda, a seção 9 e o registro do Uso real. Com
 * `mandatoryOnly`, também sem as seções de `SECOES_SOB_DEMANDA`, cada uma trocada por uma linha com o
 * comando `cloud.mjs secao` (o que o testador lê antes dos roteiros; é a medida do limite dos blocos).
 */
export function buildRoundGuide(
  markdown,
  roteiros,
  { commit = 'desconhecido', mandatoryOnly = false } = {},
) {
  const existing = listRoteiros(markdown);
  const { whole, ranges } = parseRequest(roteiros, existing);
  const wanted = new Set([...whole, ...ranges.keys()]);
  let dropParent = false;
  let pointedLevel2 = false;
  const kept = [];
  for (const section of splitSections(markdown)) {
    if (section.level === 2) {
      dropParent = /^9\./.test(section.title);
      pointedLevel2 = false;
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
    const entry = mandatoryOnly ? onDemandEntry(section) : undefined;
    if (entry) {
      pointedLevel2 = section.level === 2;
      kept.push(onDemandPointer(section, entry).join('\n'));
      continue;
    }
    if (pointedLevel2 && section.level === 3) continue;
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
 * A base do guia da rodada: o `buildRoundGuide` com `mandatoryOnly` (a base obrigatória), sem as
 * seções `### R<n>`, cada uma trocada por uma linha com o comando que a imprime (`cloud.mjs passo
 * R<n>`). `name` é o nome do
 * arquivo do índice (`<name>-indice.tsv`).
 */
export function buildGuideBase(
  markdown,
  roteiros,
  { commit = 'desconhecido', name = 'guia' } = {},
) {
  const out = [];
  const guide = buildRoundGuide(markdown, roteiros, { commit, mandatoryOnly: true });
  for (const section of splitSections(guide)) {
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
        `> Os roteiros saem por \`cloud.mjs passo\`; o índice está em \`${name}-indice.tsv\`. As seções sob demanda saem por \`cloud.mjs secao <chave>\` (sem chave, lista).`,
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

/** Os roteiros (`R<n>`) de um texto de guia, com a seção e as linhas de passo de cada um. */
function roteiroSections(text) {
  const map = new Map();
  for (const section of splitSections(text)) {
    const id = section.level === 3 ? ROTEIRO.exec(section.title)?.[1] : undefined;
    if (id) map.set(id, { section, rows: stepRows(section.lines) });
  }
  return map;
}

/**
 * O Preparo de roteiros inteiros para o `cloud.mjs passo <Rn> --preparo` (etapa #1639, TC1, decisão 4):
 * o trecho do roteiro antes do cabeçalho da tabela do primeiro passo (título, "O que cobre", Preparo,
 * com os blocos de código), com o corte de `EXCERPT_LIMIT`. Item que não é roteiro inteiro lança.
 */
export function guidePreparo(guideText, itens, fallbackText) {
  const sections = roteiroSections(guideText);
  const fallback = fallbackText === undefined ? undefined : roteiroSections(fallbackText);
  const entries = [];
  itens.forEach((raw, n) => {
    if (!/^R\d+$/i.test(raw)) {
      throw new Error(
        `Item inválido com --preparo: ${raw}. Use só roteiros inteiros: cloud.mjs passo R<n> --preparo.`,
      );
    }
    const id = raw.toUpperCase();
    let found = sections.get(id);
    const fora = !found && fallback?.has(id);
    if (fora) found = fallback.get(id);
    if (!found) {
      throw new Error(
        `${id} não está no guia da rodada; o guia tem ${[...sections.keys()].join(', ')}.`,
      );
    }
    const { section, rows } = found;
    let end = rows.length ? rows[0].i : section.lines.length;
    if (rows.length && end > 0 && STEP_HEADER.test(section.lines[end - 2] ?? '')) {
      end -= 2;
    }
    const lines = section.lines.slice(0, end);
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (n > 0) entries.push('---');
    if (fora) entries.push(FORA_DO_GUIA);
    entries.push(...lines);
  });
  const total = entries.reduce((n, e) => n + e.length + 1, -1);
  if (total <= EXCERPT_LIMIT) return entries.join('\n');
  let size = 0;
  let end = 0;
  while (end < entries.length) {
    const next = size + entries[end].length + (end ? 1 : 0);
    if (next > EXCERPT_LIMIT - CUT_RESERVE && end > 0) break;
    size = next;
    end += 1;
  }
  return [
    ...entries.slice(0, end),
    `… corte em 25.000 caracteres: o resto do Preparo está no apoio/guia.md (Read com offset a partir de "${entries[end]?.slice(0, 40)}")`,
  ].join('\n');
}

/**
 * O trecho do guia da rodada para o `cloud.mjs passo`: `R<n>` (o roteiro sem as linhas de passo),
 * `R<n>.<m>` ou `R<n>.<a>-R<n>.<b>` (as linhas dos passos, com o cabeçalho da tabela). Os itens saem
 * na ordem pedida, separados por `---`; erro de item lança `Error` sem imprimir trecho.
 */
export function guideExcerpt(guideText, itens, fallbackText) {
  const rotulos = roteiroSections;
  const sections = rotulos(guideText);
  // Item que o guia da rodada não tem: lido do docs/TESTING.md (`fallbackText`), com a marca (TE3).
  const fallback = fallbackText === undefined ? undefined : rotulos(fallbackText);
  const items = itens.map(parseExcerptItem);
  const entries = [];
  items.forEach((item, n) => {
    let found = sections.get(item.id);
    const fora = !found && fallback?.has(item.id);
    if (fora) found = fallback.get(item.id);
    if (!found) {
      throw new Error(
        `${item.from ?? item.id} não está no guia da rodada; o guia tem ${[...sections.keys()].join(', ')}. Para outro roteiro, gere o guia de novo com round-guide.mjs ou procure o trecho com Grep no docs/TESTING.md.`,
      );
    }
    const part = item.from
      ? stepRange(found.section, found.rows, item, item.id)
      : wholeRoteiro(found.section, found.rows);
    if (n > 0) entries.push({ text: '---', item: n });
    if (fora) entries.push({ text: FORA_DO_GUIA, item: n });
    for (const entry of part) entries.push({ ...entry, item: n });
  });
  return cutExcerpt(entries, items);
}

/** Primeira linha do trecho de um item que veio do `docs/TESTING.md` e não do guia da rodada. */
export const FORA_DO_GUIA = 'fora do guia da rodada (lido do docs/TESTING.md)';

// --- Seções sob demanda (etapa #1533, TE1, decisão 2) ---

/** O texto da seção da `entrada`: o cabeçalho, o corpo e as subseções de nível maior. */
function extractSection(text, entry, origem) {
  const sections = splitSections(text);
  const i = sections.findIndex(
    (s) => s.level === entry.nivel && s.title.startsWith(entry.titulo),
  );
  if (i < 0) {
    throw new Error(`A seção ${entry.chave} (${entry.titulo}) não está em ${origem}.`);
  }
  const lines = [...sections[i].lines];
  for (let j = i + 1; j < sections.length && sections[j].level > entry.nivel; j += 1) {
    lines.push(...sections[j].lines);
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

/** As chaves de `SECOES_SOB_DEMANDA`, para a mensagem de chave desconhecida. */
function keyList() {
  return SECOES_SOB_DEMANDA.map((e) => e.chave).join(', ');
}

/**
 * As seções sob demanda pedidas por chave (`SECOES_SOB_DEMANDA`), na ordem pedida, separadas por
 * `---`. `guideText` é o guia da rodada (`apoio/guia.md`); as chaves `consulta.*` leem `consultaText`
 * (o `docs/TESTING-NUVEM-CONSULTA.md`). Corta em `EXCERPT_LIMIT` na última seção ou linha inteira e diz
 * como continuar; chave desconhecida lança `Error` com a lista das chaves.
 */
export function guideSection(guideText, chaves, consultaText) {
  const entries = chaves.map((chave) => {
    const entry = SECOES_SOB_DEMANDA.find((e) => e.chave === chave);
    if (!entry) throw new Error(`Chave desconhecida: ${chave}. Chaves: ${keyList()}.`);
    if (entry.fonte === 'consulta' && consultaText === undefined) {
      throw new Error(
        `A chave ${chave} lê o docs/TESTING-NUVEM-CONSULTA.md do clone, que não foi lido.`,
      );
    }
    return entry;
  });
  const texts = entries.map((e) =>
    e.fonte === 'consulta'
      ? extractSection(consultaText, e, 'docs/TESTING-NUVEM-CONSULTA.md')
      : extractSection(guideText, e, 'o guia da rodada'),
  );
  const sep = '\n\n---\n\n';
  const budget = EXCERPT_LIMIT - CUT_RESERVE;
  const out = [];
  let size = 0;
  for (let i = 0; i < texts.length; i += 1) {
    const add = (out.length ? sep.length : 0) + texts[i].length;
    if (size + add <= budget) {
      out.push(texts[i]);
      size += add;
      continue;
    }
    if (out.length > 0) {
      const rest = entries.slice(i).map((e) => e.chave);
      out.push(
        `… corte em 25.000 caracteres: continue com cloud.mjs secao ${rest.join(' ')}`,
      );
    } else {
      const kept = [];
      let n = 0;
      for (const line of texts[i].split('\n')) {
        if (n + line.length + 1 > budget) break;
        kept.push(line);
        n += line.length + 1;
      }
      kept.push(
        `… corte em 25.000 caracteres: o resto da seção ${entries[i].chave} está no guia (Grep pelo título "${entries[i].titulo}" no apoio/guia.md)`,
      );
      out.push(kept.join('\n'));
    }
    break;
  }
  return out.join(sep);
}

/** A lista do `cloud.mjs secao` sem chave: uma linha por chave, com o tamanho e o "quando ler". */
export function listSecoes(guideText, consultaText) {
  const lines = ['Chaves do cloud.mjs secao (chave, caracteres, quando ler):'];
  for (const e of SECOES_SOB_DEMANDA) {
    const source = e.fonte === 'consulta' ? consultaText : guideText;
    let size = '?';
    try {
      if (source !== undefined) size = String(extractSection(source, e, '').length);
    } catch {
      size = '?';
    }
    lines.push(`${e.chave}\t${size}\t${e.quando}`);
  }
  return lines.join('\n');
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

// --- Lotes dos subagentes do testador (etapa #1639, TC1, decisão 3) ---

/** Passos por lote de subagente: com a base do subagente (~25 mil), 20 passos ficam abaixo de ~200 mil. */
export const FAIXA_LIMIT = 20;

/** Avança `i` por todos os passos com letra (R12.11a, R12.11b…) do código-base que o `guideExcerpt` junta. */
function extendOverSuffixes(codes, i) {
  const base = codes[i].replace(/[a-z]$/, '');
  while (
    codes[i + 1]?.startsWith(base) &&
    /^[a-z]$/.test(codes[i + 1].slice(base.length))
  ) {
    i += 1;
  }
  return i;
}

/**
 * Parte os códigos de um item em faixas consecutivas de até `limit` passos. O passo que o
 * `guideExcerpt` junta ao anterior (R22.6a com R22.6) fica no mesmo lote.
 */
function chunkCodes(codes, limit) {
  const chunks = [];
  let start = 0;
  while (start < codes.length) {
    let end = Math.min(start + limit, codes.length) - 1;
    end = extendOverSuffixes(codes, end);
    chunks.push(codes.slice(start, end + 1));
    start = end + 1;
  }
  return chunks;
}

/**
 * Os lotes dos subagentes do testador, na ordem do guia, sem o R0 (lote próprio): o roteiro de até
 * `limit` passos é um lote (`R13`); acima disso, faixas consecutivas (`R25.1-R25.20`); uma faixa
 * pedida é respeitada e só se parte acima do limite. Cada lote é `{ token, steps }`.
 */
export function planFaixas(markdown, roteiros, { limit = FAIXA_LIMIT } = {}) {
  const existing = listRoteiros(markdown);
  const byRoteiro = stepsByRoteiro(markdown);
  const { whole, ranges } = parseRequest(roteiros, existing);
  const lotes = [];
  // Um lote só leva o token pedido (`R13`, `R6.3-R6.7`); partido, o de cada faixa de códigos.
  const add = (token, codes) => {
    const chunks = chunkCodes(codes, limit);
    for (const chunk of chunks) {
      lotes.push({
        token: chunks.length === 1 ? token : `${chunk[0]}-${chunk[chunk.length - 1]}`,
        steps: chunk.length,
      });
    }
  };
  for (const id of existing) {
    if (id === 'R0') continue;
    const codes = byRoteiro.get(id) ?? [];
    if (whole.has(id)) {
      add(id, codes);
      continue;
    }
    // Faixas pedidas que se sobrepõem viram uma só: nenhum passo cai em dois lotes.
    const spans = [];
    for (const { from, to } of ranges.get(id) ?? []) {
      const a = codes.indexOf(`${id}.${from}`);
      const b = codes.indexOf(`${id}.${to}`);
      if (a < 0 || b < 0 || b < a) {
        throw new Error(
          `Faixa inválida: ${id}.${from}-${id}.${to}. Passos: ${codes.join(', ')}.`,
        );
      }
      spans.push({ a, b: extendOverSuffixes(codes, b), from, to });
    }
    spans.sort((x, y) => x.a - y.a);
    const merged = [];
    for (const sp of spans) {
      const last = merged[merged.length - 1];
      if (last && sp.a <= last.b + 1) {
        if (sp.b > last.b) {
          last.b = sp.b;
          last.to = sp.to;
        }
      } else merged.push({ ...sp });
    }
    for (const { a, b, from, to } of merged) {
      add(`${id}.${from}-${id}.${to}`, codes.slice(a, b + 1));
    }
  }
  return lotes;
}

/** O texto do `--faixas`: uma linha `lote k de n: <token> (<m> passos)` por lote. */
export function formatFaixas(lotes) {
  return lotes
    .map((l, i) => `lote ${i + 1} de ${lotes.length}: ${l.token} (${l.steps} passos)`)
    .join('\n');
}

function runFaixasCli(roteiros) {
  if (roteiros.length === 0) {
    console.error('Uso: node scripts/testing/round-guide.mjs --faixas <roteiro|faixa…>');
    process.exitCode = 2;
    return;
  }
  try {
    const lotes = planFaixas(fs.readFileSync(GUIDE_FILE, 'utf8'), roteiros);
    process.stdout.write(`${formatFaixas(lotes)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
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
  if (argv.includes('--faixas')) {
    runFaixasCli(argv.filter((a) => a !== '--faixas'));
    return;
  }
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
