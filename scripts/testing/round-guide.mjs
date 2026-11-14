// Round guide (stage #421, decision 7): generates docs/TESTING.md with only the requested test scripts.
//
// Usage:
//   node scripts/testing/round-guide.mjs <script…> [--out <folder>/<name>.md]   (e.g. R0 R2 R4 R11; `all` = every script)
//   node scripts/testing/round-guide.mjs --grupos <script…>            (splits the directed round into groups; see below)
//   node scripts/testing/round-guide.mjs --faixas <script|range…>      (batches of up to 20 steps for the tester's subagents)
//
// With `--out`, it writes three files (stage #1232, GL1): `<name>.md` (the round guide), `<name>-base.md`
// (the same guide without the `### R<n>` sections, which become a line with the command) and
// `<name>-indice.tsv` (section, script and step → lines of `<name>.md`). The script and its steps are
// printed on demand with `node scripts/testing/cloud.mjs passo <item…>` (`guideExcerpt`, below).
//
// A script can be requested by a range of steps (`R6.3-R6.7`): the guide then carries only the script's
// table rows in that range (plus the header and the setup text). Two ranges of the same script are
// added together; the whole script (`R6`) wins over the range.
//
// Marked passages (stage #841, RB1): in docs/TESTING.md, a passage that only some scripts use sits
// between `<!-- roteiros: R12 R22 -->` and `<!-- /roteiros -->` (each marker on its own line, not
// nested). The passage only enters the guide if one of those scripts is requested; a passage without
// a marker goes in every guide. The marker is an HTML comment: it does not show in the guide read by
// people.
//
// Mandatory base (stage #1533, TE1): `<name>-base.md` carries only what the tester needs before
// starting (see `SECOES_SOB_DEMANDA`); the other sections of the guide become a line with the
// command `cloud.mjs secao <key>`, which `guideSection` serves.
//
// It drops from the guide the scripts not requested, the "On-demand scripts (manual)", section 9 and
// the "Real-use milestone record"; in the "Start here" table only the rows of the requested scripts
// stay (MF3, #1025: the whole table weighs about 5 thousand characters in every block guide); it
// keeps the rest in the guide's order ("Start here", sections 1 to 7, the introduction of section 8,
// the report template and appendices A and B). The granularity is the whole script. Nonexistent
// script: error listing the ones that exist (exit code 2).
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

/** Splits the Markdown into sections by `##`/`###` heading, outside code blocks. */
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

const SCRIPT_ID = /^(R\d+)\b/;

/** Ids of the scripts (`R0`, `R1`, …) the guide has, in the order they appear. */
export function listRoteiros(markdown) {
  return splitSections(markdown)
    .filter((section) => section.level === 3 && SCRIPT_ID.test(section.title))
    .map((section) => SCRIPT_ID.exec(section.title)[1]);
}

const MARK_OPEN = /^<!-- roteiros: ([^>]*?) -->$/;
const MARK_CLOSE = '<!-- /roteiros -->';
const STEP_ROW = /^\|\s*(?:\*\*)?(R\d+\.\d+[a-z]?)(?:\*\*)?[^|]*\|/;
const STEP_ITEM = /^(R\d+)\.(\d+[a-z]?)$/i;
const RANGE = /^(R\d+)\.(\d+[a-z]?)-(R\d+)\.(\d+[a-z]?)$/i;

/** Strips the passage markers: the passage stays if one of the scripts it cites is requested. */
function applyMarks(text, wanted, existing) {
  const out = [];
  let open = null;
  for (const line of text.split('\n')) {
    const mark = MARK_OPEN.exec(line);
    if (mark) {
      if (open) throw new Error('Nested <!-- roteiros --> marker in the guide.');
      const ids = mark[1].trim().split(/\s+/).filter(Boolean);
      for (const id of ids) {
        if (!existing.includes(id)) {
          throw new Error(
            `Marker cites a nonexistent script: ${id}. Existing: ${existing.join(', ')}.`,
          );
        }
      }
      open = { keep: ids.some((id) => wanted.has(id)) };
    } else if (line === MARK_CLOSE) {
      if (!open)
        throw new Error('Marker <!-- /roteiros --> without an opening in the guide.');
      open = null;
    } else if (!open || open.keep) {
      out.push(line);
    }
  }
  if (open)
    throw new Error('Marker <!-- roteiros --> without the closing <!-- /roteiros -->.');
  return out.join('\n');
}

/** Codes of the steps (`R6.3`, `R6.8a`…) in the table of a script section, in order. */
function stepCodes(lines) {
  return lines.map((line) => STEP_ROW.exec(line)?.[1]).filter(Boolean);
}

/** The script section with only the step rows inside the ranges (`from`/`to` without the script). */
function cutRanges(lines, ranges, id) {
  const codes = stepCodes(lines);
  const allowed = new Set();
  for (const { from, to } of ranges) {
    const a = codes.indexOf(`${id}.${from}`);
    const b = codes.indexOf(`${id}.${to}`);
    if (a < 0 || b < 0 || b < a) {
      throw new Error(
        `Invalid range: ${id}.${from}-${id}.${to}. Steps: ${codes.join(', ')}.`,
      );
    }
    for (const code of codes.slice(a, b + 1)) allowed.add(code);
  }
  return lines.filter((line) => {
    const code = STEP_ROW.exec(line)?.[1];
    return !code || allowed.has(code);
  });
}

/** Splits the arguments into whole scripts and ranges per script. */
function parseRequest(requested, existing) {
  const whole = new Set();
  const ranges = new Map();
  for (const raw of requested) {
    if (raw.toLowerCase() === 'all') {
      for (const id of existing) whole.add(id);
      continue;
    }
    const range = RANGE.exec(raw);
    if (range) {
      const id = range[1].toUpperCase();
      if (id !== range[3].toUpperCase()) {
        throw new Error(`Step range across different scripts: ${raw}.`);
      }
      const list = ranges.get(id) ?? [];
      list.push({ from: range[2], to: range[4] });
      ranges.set(id, list);
    } else if (STEP_ITEM.test(raw)) {
      // Single step (`R0.1`): a range of one step.
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
      throw new Error(`Nonexistent script: ${id}. Existing: ${existing.join(', ')}.`);
    }
  }
  return { whole, ranges };
}

const OVERVIEW_ROW = /^\|\s*(?:\d+|on[- ]demand)\s*\|\s*(R\d+|R[A-Z])\b/;

/**
 * The rows of the "Start here" table without the rows of the scripts the guide does not carry (and
 * of the on-demand ones, which also go): what remains is the row of each requested script, the one
 * for section 6 and the rest of the text. The table lists the 27 scripts and weighs about 5
 * thousand characters in every block guide.
 */
function trimOverview(lines, wanted) {
  return lines.filter((line) => {
    const id = OVERVIEW_ROW.exec(line)?.[1];
    return id === undefined || wanted.has(id);
  });
}

/**
 * Sections the tester reads on demand (stage #1533, TE1, decisions 1 and 4): the key of `cloud.mjs
 * secao` (`chave`), the start of the heading (`titulo`), the heading level (`nivel`), the source
 * (`fonte`; `guia`: the `apoio/guia.md`; `consulta`: the clone's `docs/TESTING-NUVEM-CONSULTA.md`;
 * `consulta.regras` holds the rules for R21 and for the step that needs the owner) and when to
 * read it (`quando`).
 */
export const SECOES_SOB_DEMANDA = [
  {
    chave: '1',
    titulo: '1. Where to get the app',
    nivel: 2,
    fonte: 'guia',
    quando: 'if the app URL or the channel (stable or preview) is in doubt',
  },
  {
    chave: '2',
    titulo: '2. Requirements',
    nivel: 2,
    fonte: 'guia',
    quando:
      'if the working folder or the test image is missing, or if an extension gets in the way of typing',
  },
  {
    chave: '3',
    titulo: '3. Check which version is open',
    nivel: 2,
    fonte: 'guia',
    quando: 'before R0.1, to find the build id in the status bar or in Settings › About',
  },
  {
    chave: '5',
    titulo: '5. Interface map',
    nivel: 2,
    fonte: 'guia',
    quando:
      'when a step cites an interface name, icon, window or notation you cannot find',
  },
  {
    chave: '6',
    titulo: '6. Install the MCP server',
    nivel: 2,
    fonte: 'guia',
    quando:
      'before section 6 of the round (test repository and MCP), in the block or group that has it',
  },
  {
    chave: '7',
    titulo: '7. How to report a problem',
    nivel: 2,
    fonte: 'guia',
    quando:
      'before the first finding and before writing the report (severity and Diagnostic)',
  },
  {
    chave: 'A.seletores',
    titulo: 'Misleading selectors and names',
    nivel: 3,
    fonte: 'guia',
    quando: 'when a locator fails by timeout, by strict mode or by a repeated name',
  },
  {
    chave: 'B',
    titulo: 'Appendix B',
    nivel: 2,
    fonte: 'guia',
    quando: 'in disk operations (move, copy, remove write permission): R6.8b and R6.11',
  },
  {
    chave: 'consulta.subagente',
    titulo: 'Subagent per batch',
    nivel: 2,
    fonte: 'consulta',
    quando: 'before the first batch (R0)',
  },
  {
    chave: 'consulta.grupos',
    titulo: 'Directed round in groups',
    nivel: 2,
    fonte: 'consulta',
    quando: 'if the message says "grupo k de n" or if you have to split a directed round',
  },
  {
    chave: 'consulta.passada',
    titulo: 'Visual pass',
    nivel: 2,
    fonte: 'consulta',
    quando:
      'before the visual pass (block 4, or the directed round that asks for it) and in the window retest',
  },
  {
    chave: 'consulta.regras',
    titulo: 'Exception rules',
    nivel: 2,
    fonte: 'consulta',
    quando: 'before R21 (release tag) or a step that only the person would do',
  },
  {
    chave: 'consulta.historico',
    titulo: 'Block history',
    nivel: 2,
    fonte: 'consulta',
    quando: 'only to compare times and counts with the previous rounds',
  },
];

/** The `SECOES_SOB_DEMANDA` entry of the guide (`fonte: 'guia'`) that this section is, if any. */
function onDemandEntry(section) {
  if (section.level < 2) return undefined;
  return SECOES_SOB_DEMANDA.find(
    (e) =>
      e.fonte === 'guia' &&
      e.nivel === section.level &&
      section.title.startsWith(e.titulo),
  );
}

/** The command line that, in place of the on-demand section, says how to read it. */
function onDemandPointer(section, entry) {
  return [
    `${'#'.repeat(section.level)} ${section.title}: \`node scripts/testing/cloud.mjs secao ${entry.chave}\``,
    '',
    `When to read: ${entry.quando}.`,
    '',
  ];
}

/**
 * The guide without the scripts not requested, the on-demand ones, section 9 and the Real-use
 * record. With `mandatoryOnly`, also without the `SECOES_SOB_DEMANDA` sections, each replaced by a
 * line with the `cloud.mjs secao` command (what the tester reads before the scripts; it is the
 * measure of the block limit).
 */
export function buildRoundGuide(
  markdown,
  scripts,
  { commit = 'unknown', mandatoryOnly = false } = {},
) {
  const existing = listRoteiros(markdown);
  const { whole, ranges } = parseRequest(scripts, existing);
  const wanted = new Set([...whole, ...ranges.keys()]);
  let dropParent = false;
  let pointedLevel2 = false;
  const kept = [];
  for (const section of splitSections(markdown)) {
    if (section.level === 2) {
      dropParent = /^9\./.test(section.title);
      pointedLevel2 = false;
      if (/^Start here/.test(section.title))
        section.lines = trimOverview(section.lines, wanted);
    }
    const script = section.level === 3 ? SCRIPT_ID.exec(section.title)?.[1] : undefined;
    const drop =
      (section.level === 2 && dropParent) ||
      (section.level === 3 &&
        (dropParent ||
          (script && !wanted.has(script)) ||
          /^On-demand scripts/.test(section.title) ||
          /^Real-use milestone record/.test(section.title)));
    if (drop) continue;
    const entry = mandatoryOnly ? onDemandEntry(section) : undefined;
    if (entry) {
      pointedLevel2 = section.level === 2;
      kept.push(onDemandPointer(section, entry).join('\n'));
      continue;
    }
    if (pointedLevel2 && section.level === 3) continue;
    const cut = script && !whole.has(script) && ranges.has(script);
    kept.push(
      (cut ? cutRanges(section.lines, ranges.get(script), script) : section.lines).join(
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
  const note = `> Round guide (commit ${commit}): scripts ${ids.join(', ')}. The whole guide is docs/TESTING.md; look things up there by section (Grep) for anything missing here.`;
  return `${note}\n\n${applyMarks(kept.join('\n'), wanted, existing)}`;
}

// --- On-demand round guide (stage #1232, GL1) ---

/** Step rows of a section (outside code blocks): the code and the line index. */
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
 * The base of the round guide: `buildRoundGuide` with `mandatoryOnly` (the mandatory base), without
 * the `### R<n>` sections, each replaced by a line with the command that prints it (`cloud.mjs passo
 * R<n>`). `name` is the name of the index file (`<name>-indice.tsv`).
 */
export function buildGuideBase(
  markdown,
  scripts,
  { commit = 'unknown', name = 'guia' } = {},
) {
  const out = [];
  const guide = buildRoundGuide(markdown, scripts, { commit, mandatoryOnly: true });
  for (const section of splitSections(guide)) {
    const id = section.level === 3 ? SCRIPT_ID.exec(section.title)?.[1] : undefined;
    if (id) {
      out.push(
        `### ${section.title}: \`node scripts/testing/cloud.mjs passo ${id}\``,
        '',
      );
    } else if (section.level === 0) {
      const [note = '', ...rest] = section.lines;
      out.push(
        note,
        `> The scripts are printed by \`cloud.mjs passo\`; the index is in \`${name}-indice.tsv\`. The on-demand sections are printed by \`cloud.mjs secao <key>\` (without a key, it lists them).`,
        ...rest,
      );
    } else {
      out.push(...section.lines);
    }
  }
  return out.join('\n');
}

/**
 * The index of the round guide, as TSV (`tipo`, `chave`, `ini`, `fim`, `título`; the header row is
 * read by cloud.mjs, so it stays as is), with 1-based lines of the guide itself: one `secao` per
 * heading that is not a script, one `roteiro` per `### R<n>` and one `passo` per step row.
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
    const id = section.level === 3 ? SCRIPT_ID.exec(section.title)?.[1] : undefined;
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

/** Character limit of what `cloud.mjs passo` prints (below Bash's 30 thousand). */
export const EXCERPT_LIMIT = 25000;
const CUT_RESERVE = 200;
const STEP_HEADER = /^\|\s*Step\b/;

/** Parses an item of `passo`: `R12`, `R12.4` or `R12.4-R12.9`. */
function parseExcerptItem(raw) {
  const range = RANGE.exec(raw);
  if (range) {
    const id = range[1].toUpperCase();
    if (id !== range[3].toUpperCase()) {
      throw new Error(`Step range across different scripts: ${raw}.`);
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
  throw new Error(`Invalid item: ${raw}. Use R<n>, R<n>.<m> or R<n>.<a>-R<n>.<b>.`);
}

/** The whole script without the step rows: each run of them becomes `Steps (k): a, b, …, z`. */
function wholeScript(section, rows) {
  const stepAt = new Map(rows.map((r) => [r.i, r.code]));
  const entries = [];
  let run = [];
  const flush = () => {
    if (run.length === 0) return;
    const shown = run.length <= 3 ? run : [run[0], run[1], '…', run[run.length - 1]];
    entries.push({ text: `Steps (${run.length}): ${shown.join(', ')}` });
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

/** The lines from the first to the last requested step, with the table header of the first. */
function stepRange(section, rows, item, guideId) {
  const codes = rows.map((r) => r.code);
  const absent = (code) => {
    const span = codes.length
      ? `has ${codes[0]} to ${codes[codes.length - 1]} (${codes.length} steps)`
      : 'has no steps';
    return new Error(`${code} is not in the round guide; ${guideId} ${span}`);
  };
  const a = codes.indexOf(item.from);
  let b = codes.indexOf(item.to);
  if (a < 0) throw absent(item.from);
  if (b < 0) throw absent(item.to);
  if (b < a)
    throw new Error(
      `Invalid range: ${item.from}-${item.to}. Steps: ${codes.join(', ')}.`,
    );
  // The last requested step brings along the ones that depend on it (R22.6 brings R22.6a).
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

/** Cuts the lines at `EXCERPT_LIMIT` characters, at the last whole line, and says how to continue. */
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
  const tail = later.length ? `; then, the items ${later.join(' ')}` : '';
  const message = `… cut at 25,000 characters: continue with cloud.mjs passo ${target}${tail}`;
  return [...entries.slice(0, end).map((e) => e.text), message].join('\n');
}

/** The scripts (`R<n>`) of a guide text, with the section and step rows of each. */
function scriptSections(text) {
  const map = new Map();
  for (const section of splitSections(text)) {
    const id = section.level === 3 ? SCRIPT_ID.exec(section.title)?.[1] : undefined;
    if (id) map.set(id, { section, rows: stepRows(section.lines) });
  }
  return map;
}

/**
 * The setup text of whole scripts for `cloud.mjs passo <Rn> --preparo` (stage #1639, TC1, decision
 * 4): the part of the script before the table header of the first step (title, "What it covers",
 * setup, with the code blocks), cut at `EXCERPT_LIMIT`. An item that is not a whole script throws.
 */
export function guidePreparo(guideText, requested, fallbackText) {
  const sections = scriptSections(guideText);
  const fallback = fallbackText === undefined ? undefined : scriptSections(fallbackText);
  const entries = [];
  requested.forEach((raw, n) => {
    if (!/^R\d+$/i.test(raw)) {
      throw new Error(
        `Invalid item with --preparo: ${raw}. Use only whole scripts: cloud.mjs passo R<n> --preparo.`,
      );
    }
    const id = raw.toUpperCase();
    let found = sections.get(id);
    const external = !found && fallback?.has(id);
    if (external) found = fallback.get(id);
    if (!found) {
      throw new Error(
        `${id} is not in the round guide; the guide has ${[...sections.keys()].join(', ')}.`,
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
    if (external) entries.push(FORA_DO_GUIA);
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
    `… cut at 25,000 characters: the rest of the setup text is in apoio/guia.md (Read with an offset starting at "${entries[end]?.slice(0, 40)}")`,
  ].join('\n');
}

/**
 * The part of the round guide for `cloud.mjs passo`: `R<n>` (the script without the step rows),
 * `R<n>.<m>` or `R<n>.<a>-R<n>.<b>` (the step rows, with the table header). The items come out in
 * the requested order, separated by `---`; an item error throws `Error` without printing a section.
 */
export function guideExcerpt(guideText, requested, fallbackText) {
  const sections = scriptSections(guideText);
  // Item the round guide does not have: read from docs/TESTING.md (`fallbackText`), with the mark (TE3).
  const fallback = fallbackText === undefined ? undefined : scriptSections(fallbackText);
  const items = requested.map(parseExcerptItem);
  const entries = [];
  items.forEach((item, n) => {
    let found = sections.get(item.id);
    const external = !found && fallback?.has(item.id);
    if (external) found = fallback.get(item.id);
    if (!found) {
      throw new Error(
        `${item.from ?? item.id} is not in the round guide; the guide has ${[...sections.keys()].join(', ')}. For another script, generate the guide again with round-guide.mjs or look for the section with Grep in docs/TESTING.md.`,
      );
    }
    const part = item.from
      ? stepRange(found.section, found.rows, item, item.id)
      : wholeScript(found.section, found.rows);
    if (n > 0) entries.push({ text: '---', item: n });
    if (external) entries.push({ text: FORA_DO_GUIA, item: n });
    for (const entry of part) entries.push({ ...entry, item: n });
  });
  return cutExcerpt(entries, items);
}

/** First line of the section of an item that came from `docs/TESTING.md` and not from the round guide. */
export const FORA_DO_GUIA = 'outside the round guide (read from docs/TESTING.md)';

// --- On-demand sections (stage #1533, TE1, decision 2) ---

/** The text of the `entry` section: the heading, the body and the subsections of a deeper level. */
function extractSection(text, entry, origin) {
  const sections = splitSections(text);
  const i = sections.findIndex(
    (s) => s.level === entry.nivel && s.title.startsWith(entry.titulo),
  );
  if (i < 0) {
    throw new Error(`Section ${entry.chave} (${entry.titulo}) is not in ${origin}.`);
  }
  const lines = [...sections[i].lines];
  for (let j = i + 1; j < sections.length && sections[j].level > entry.nivel; j += 1) {
    lines.push(...sections[j].lines);
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

/** The keys of `SECOES_SOB_DEMANDA`, for the unknown-key message. */
function keyList() {
  return SECOES_SOB_DEMANDA.map((e) => e.chave).join(', ');
}

/**
 * The on-demand sections requested by key (`SECOES_SOB_DEMANDA`), in the requested order, separated
 * by `---`. `guideText` is the round guide (`apoio/guia.md`); the `consulta.*` keys read
 * `consultaText` (`docs/TESTING-NUVEM-CONSULTA.md`). Cuts at `EXCERPT_LIMIT` at the last whole
 * section or line and says how to continue; an unknown key throws `Error` with the list of keys.
 */
export function guideSection(guideText, keys, consultaText) {
  const entries = keys.map((key) => {
    const entry = SECOES_SOB_DEMANDA.find((e) => e.chave === key);
    if (!entry) throw new Error(`Unknown key: ${key}. Keys: ${keyList()}.`);
    if (entry.fonte === 'consulta' && consultaText === undefined) {
      throw new Error(
        `Key ${key} reads the clone's docs/TESTING-NUVEM-CONSULTA.md, which was not read.`,
      );
    }
    return entry;
  });
  const texts = entries.map((e) =>
    e.fonte === 'consulta'
      ? extractSection(consultaText, e, 'docs/TESTING-NUVEM-CONSULTA.md')
      : extractSection(guideText, e, 'the round guide'),
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
        `… cut at 25,000 characters: continue with cloud.mjs secao ${rest.join(' ')}`,
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
        `… cut at 25,000 characters: the rest of section ${entries[i].chave} is in the guide (Grep for the heading "${entries[i].titulo}" in apoio/guia.md)`,
      );
      out.push(kept.join('\n'));
    }
    break;
  }
  return out.join(sep);
}

/** The list of `cloud.mjs secao` without a key: one line per key, with the size and the "when to read". */
export function listSecoes(guideText, consultaText) {
  const lines = ['Keys of cloud.mjs secao (key, characters, when to read):'];
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

// --- Directed round in parallel groups (stage #1148, TR4, decisions 15 to 17) ---

/** Steps per group: above this (without R0), the directed round is split into parallel sessions. */
export const GROUP_LIMIT = 40;
/** At most 5 sessions per round. */
export const MAX_GROUPS = 5;

/**
 * Dependency chains that are never split between groups (decision 16; docs/TESTING-NUVEM.md,
 * "Directed round in groups"). Each item is a script (`R1`) or a range (`R6.3-R6.7`).
 */
export const CHAINS = [
  {
    name: 'main',
    items: ['R1', 'R3', 'R5', 'R6.3-R6.7', 'R6.12-R6.14', 'R7', 'R8'],
  },
  { name: 'store', items: ['R4', 'R6.8a-R6.11'] },
  { name: 'screens', items: ['R9', 'R10'] },
];

/** Step codes of each script (outside code blocks), in the guide's order. */
function stepsByScript(markdown) {
  const map = new Map();
  for (const section of splitSections(markdown)) {
    const id = section.level === 3 ? SCRIPT_ID.exec(section.title)?.[1] : undefined;
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

/** The codes of an item (`R12` or `R6.3-R6.7`). */
function itemCodes(token, byScript) {
  const range = RANGE.exec(token);
  if (!range) return byScript.get(token.toUpperCase()) ?? [];
  const id = range[1].toUpperCase();
  const codes = byScript.get(id) ?? [];
  const a = codes.indexOf(`${id}.${range[2]}`);
  const b = codes.indexOf(`${id}.${range[4]}`);
  if (a < 0 || b < 0 || b < a) {
    throw new Error(`Invalid range: ${token}. Steps: ${codes.join(', ')}.`);
  }
  return codes.slice(a, b + 1);
}

/**
 * Splits the requested scripts into groups of up to `limit` steps (without R0), at most 5, without
 * splitting a chain or a script. Returns the steps of each item, the total and the proposed groups.
 */
export function planGroups(markdown, scripts, { limit = GROUP_LIMIT } = {}) {
  const existing = listRoteiros(markdown);
  const byScript = stepsByScript(markdown);
  const { whole, ranges } = parseRequest(scripts, existing);
  const order = (code) => existing.indexOf(code.split('.')[0]);
  // One token per whole script or requested range; the whole script wins over the range; R0 stays out.
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
      for (const code of itemCodes(item, byScript)) chainOf.set(code, chain.name);
    }
  }
  const items = tokens.map((token) => ({ token, codes: itemCodes(token, byScript) }));
  // Union of the keys (chain, or the script itself) that a single item touches.
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
  // Largest first; each unit goes to the fullest group where it still fits, otherwise it opens a group.
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
      // Past 5 groups: the excess goes to the lightest group (it exceeds ~40, never 5 sessions).
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

/** The text that `--grupos` prints: steps per item, total and one `grupo k de n` line per group. */
export function formatGroupPlan(plan, { limit = GROUP_LIMIT } = {}) {
  const lines = ['Steps per item (without R0):'];
  for (const i of plan.items) lines.push(`  ${i.token}: ${i.steps}`);
  lines.push(`Total: ${plan.total} (limit per group: ${limit})`, '');
  if (plan.single) {
    lines.push('uma sessão');
  } else {
    for (const g of plan.groups) lines.push(`# group ${g.n}: ${g.steps} steps`);
    for (const g of plan.groups) {
      lines.push(`grupo ${g.n} de ${plan.groups.length}: ${g.tokens.join(' ')}`);
    }
  }
  return lines.join('\n');
}

// --- Batches of the tester's subagents (stage #1639, TC1, decision 3) ---

/** Steps per subagent batch: with the subagent's base (~25 thousand), 20 steps stay below ~200 thousand. */
export const FAIXA_LIMIT = 20;

/** Advances `i` over all the lettered steps (R12.11a, R12.11b…) of the base code that `guideExcerpt` joins. */
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
 * Splits the codes of an item into consecutive ranges of up to `limit` steps. The step that
 * `guideExcerpt` joins to the previous one (R22.6a with R22.6) stays in the same batch.
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
 * The batches of the tester's subagents, in the guide's order, without R0 (a batch of its own): a
 * script of up to `limit` steps is one batch (`R13`); above that, consecutive ranges
 * (`R25.1-R25.20`); a requested range is respected and only split above the limit. Each batch is
 * `{ token, steps }`.
 */
export function planFaixas(markdown, scripts, { limit = FAIXA_LIMIT } = {}) {
  const existing = listRoteiros(markdown);
  const byScript = stepsByScript(markdown);
  const { whole, ranges } = parseRequest(scripts, existing);
  const batches = [];
  // A single batch carries the requested token (`R13`, `R6.3-R6.7`); when split, that of each code range.
  const add = (token, codes) => {
    const chunks = chunkCodes(codes, limit);
    for (const chunk of chunks) {
      batches.push({
        token: chunks.length === 1 ? token : `${chunk[0]}-${chunk[chunk.length - 1]}`,
        steps: chunk.length,
      });
    }
  };
  for (const id of existing) {
    if (id === 'R0') continue;
    const codes = byScript.get(id) ?? [];
    if (whole.has(id)) {
      add(id, codes);
      continue;
    }
    // Requested ranges that overlap become one: no step falls in two batches.
    const spans = [];
    for (const { from, to } of ranges.get(id) ?? []) {
      const a = codes.indexOf(`${id}.${from}`);
      const b = codes.indexOf(`${id}.${to}`);
      if (a < 0 || b < 0 || b < a) {
        throw new Error(
          `Invalid range: ${id}.${from}-${id}.${to}. Steps: ${codes.join(', ')}.`,
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
  return batches;
}

/** The text of `--faixas`: one line `batch k of n: <token> (<m> steps)` per batch. */
export function formatFaixas(batches) {
  return batches
    .map((l, i) => `batch ${i + 1} of ${batches.length}: ${l.token} (${l.steps} steps)`)
    .join('\n');
}

function runFaixasCli(scripts) {
  if (scripts.length === 0) {
    console.error('Usage: node scripts/testing/round-guide.mjs --faixas <script|range…>');
    process.exitCode = 2;
    return;
  }
  try {
    const batches = planFaixas(fs.readFileSync(GUIDE_FILE, 'utf8'), scripts);
    process.stdout.write(`${formatFaixas(batches)}\n`);
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
    return 'unknown';
  }
}

function runGroupsCli(scripts) {
  if (scripts.length === 0) {
    console.error('Usage: node scripts/testing/round-guide.mjs --grupos <script|range…>');
    process.exitCode = 2;
    return;
  }
  try {
    const plan = planGroups(fs.readFileSync(GUIDE_FILE, 'utf8'), scripts);
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
  const scripts = [];
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      out = argv[(i += 1)];
    } else {
      scripts.push(argv[i]);
    }
  }
  if (scripts.length === 0 || (argv.includes('--out') && !out)) {
    console.error(
      'Usage: node scripts/testing/round-guide.mjs <script|range…|all> [--out <file>]',
    );
    process.exitCode = 2;
    return;
  }
  const markdown = fs.readFileSync(GUIDE_FILE, 'utf8');
  const commit = currentCommit();
  let guide;
  try {
    guide = buildRoundGuide(markdown, scripts, { commit });
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
        buildGuideBase(markdown, scripts, { commit, name: path.basename(stem) }),
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
        `${file}: ${Buffer.byteLength(text)} bytes (${percent}% of docs/TESTING.md)`,
      );
    }
  } else {
    process.stdout.write(`${guide}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
