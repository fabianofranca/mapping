// @vitest-environment node
// Guard against Portuguese (decision 10 of #741, phase ID10): the repository and GitHub are in
// English; Brazilian Portuguese is allowed only where decision 2 says so. This test walks the
// versioned text files and fails on a line that has a typical Portuguese character or a common
// Portuguese word, unless the file, the block or the line is in the exception list
// (`tests/tooling/portugueseAllowlist.ts`) or the text is a `PROTOCOL_TERMS` term between
// backticks or quotes (decision 16).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GUARD_SKIPPED_PATHS,
  PORTUGUESE_BLOCK_MARKERS,
  PORTUGUESE_BLOCK_ONLY,
  PORTUGUESE_LINES,
  PORTUGUESE_PATHS,
  PROTOCOL_TERMS,
  type LineException,
  type PathException,
} from './portugueseAllowlist';

const ROOT = resolve(__dirname, '../..');

/** The text files of the decision 10 list, plus the other text kinds the repository versions. */
const TEXT_FILE =
  /\.(ts|tsx|mts|cts|js|mjs|cjs|md|json|html|yml|yaml|sh|py|css|txt|kt|swift|svg|toml)$/;

/** Typical Portuguese letters (lower and upper case). */
const PT_CHARS = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/;
/** A short, conservative list of common Portuguese words that have no accent. */
const PT_WORDS =
  /(?<![\w-])(não|para|uma|quando|também|pelo|pela|isso|cada|dos|das)(?![\w-])/u;

const FIX =
  'translate it to English, or, if decision 2 of #741 allows it, add the file, the block or ' +
  'the line to the exception list in tests/tooling/portugueseAllowlist.ts, with the reason';

export interface GuardFile {
  readonly path: string;
  readonly content: string;
}

export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

export interface ScanResult {
  readonly findings: readonly Finding[];
  /** Problems with the exception mechanism itself (unclosed block, marker without reason). */
  readonly errors: readonly string[];
  /** Exception entries (by index) that exempted at least one thing. */
  readonly usedPaths: ReadonlySet<PathException>;
  readonly usedLines: ReadonlySet<LineException>;
}

export interface ScanOptions {
  readonly paths: readonly PathException[];
  readonly lines: readonly LineException[];
  readonly blockOnly: typeof PORTUGUESE_BLOCK_ONLY;
}

function looksPortuguese(line: string): boolean {
  return PT_CHARS.test(line) || PT_WORDS.test(line);
}

const QUOTES: readonly (readonly [string, string])[] = [
  ['`', '`'],
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['«', '»'],
];

/** True when `[start, end)` of the line is inside a pair of backticks or quotes. */
export function insideQuotes(line: string, start: number, end: number): boolean {
  const before = line.slice(0, start);
  const after = line.slice(end);
  for (const [open, close] of QUOTES) {
    if (open === close) {
      const opens = before.split(open).length - 1;
      if (opens % 2 === 1 && after.includes(close)) return true;
    } else if (
      before.lastIndexOf(open) > before.lastIndexOf(close) &&
      after.includes(close)
    ) {
      return true;
    }
  }
  return false;
}

const TERMS_BY_LENGTH = [...PROTOCOL_TERMS].sort((a, b) => b.term.length - a.term.length);

const RECORD_FILES = ['changelog/', 'docs/design-system/'];

/** Blanks out the protocol terms that the line carries in an accepted place. */
export function maskProtocolTerms(line: string, path: string): string {
  let out = line;
  const isRecord = RECORD_FILES.some((p) => path.startsWith(p));
  for (const { term, group } of TERMS_BY_LENGTH) {
    let from = 0;
    for (;;) {
      const at = out.indexOf(term, from);
      if (at < 0) break;
      const end = at + term.length;
      const quoted = insideQuotes(out, at, end);
      const recordTitle =
        isRecord &&
        group === 'record-titles' &&
        (/^(?:[-*]\s+)?(?:\*\*)?(?:#+\s+)?$/.test(out.slice(0, at)) || /^#\s/.test(out));
      if (quoted || recordTitle) {
        out = out.slice(0, at) + ' '.repeat(term.length) + out.slice(end);
      }
      from = end;
    }
  }
  return out;
}

function pathException(
  path: string,
  paths: readonly PathException[],
): PathException | undefined {
  return paths.find(
    (e) =>
      (e.path.endsWith('/') ? path.startsWith(e.path) : path === e.path) &&
      !(e.except ?? []).includes(path),
  );
}

/** Scans one file; pushes into the shared collections. */
function scanFile(
  file: GuardFile,
  options: ScanOptions,
  findings: Finding[],
  errors: string[],
  usedPaths: Set<PathException>,
  usedLines: Set<LineException>,
): void {
  const whole = pathException(file.path, options.paths);
  if (whole) {
    usedPaths.add(whole);
    return;
  }
  const blockOnly = options.blockOnly.find((b) => b.path === file.path);
  const lineRules = options.lines.filter((l) =>
    l.path.endsWith('/') ? file.path.startsWith(l.path) : file.path === l.path,
  );
  const lines = file.content.split('\n');
  let inGuardBlock = false;
  let blockStart = 0;
  let inOnlyBlock = false;
  lines.forEach((text, i) => {
    const n = i + 1;
    if (blockOnly) {
      if (text.includes(blockOnly.begin)) inOnlyBlock = true;
      const scanned = inOnlyBlock;
      if (text.includes(blockOnly.end)) inOnlyBlock = false;
      if (!scanned) return;
    }
    if (text.includes(PORTUGUESE_BLOCK_MARKERS.begin)) {
      const reason = text
        .split(PORTUGUESE_BLOCK_MARKERS.begin)[1]!
        .replace(/[\s*/#<>!-]+$/, '')
        .trim();
      if (inGuardBlock)
        errors.push(`${file.path}:${n}: nested ${PORTUGUESE_BLOCK_MARKERS.begin}`);
      if (reason.length < 5) {
        errors.push(
          `${file.path}:${n}: ${PORTUGUESE_BLOCK_MARKERS.begin} needs a reason after it`,
        );
      }
      inGuardBlock = true;
      blockStart = n;
      return;
    }
    if (text.includes(PORTUGUESE_BLOCK_MARKERS.end)) {
      if (!inGuardBlock)
        errors.push(`${file.path}:${n}: ${PORTUGUESE_BLOCK_MARKERS.end} with no begin`);
      inGuardBlock = false;
      return;
    }
    if (inGuardBlock || !looksPortuguese(text)) return;
    const masked = maskProtocolTerms(text, file.path);
    if (!looksPortuguese(masked)) return;
    const rule = lineRules.find((l) => l.pattern.test(text));
    if (rule) {
      usedLines.add(rule);
      return;
    }
    findings.push({ path: file.path, line: n, text: text.trim().slice(0, 120) });
  });
  if (inGuardBlock) {
    errors.push(
      `${file.path}:${blockStart}: ${PORTUGUESE_BLOCK_MARKERS.begin} without ${PORTUGUESE_BLOCK_MARKERS.end}`,
    );
  }
}

export function scanPortuguese(
  files: readonly GuardFile[],
  options: ScanOptions,
): ScanResult {
  const findings: Finding[] = [];
  const errors: string[] = [];
  const usedPaths = new Set<PathException>();
  const usedLines = new Set<LineException>();
  for (const file of files)
    scanFile(file, options, findings, errors, usedPaths, usedLines);
  return { findings, errors, usedPaths, usedLines };
}

const REAL_OPTIONS: ScanOptions = {
  paths: PORTUGUESE_PATHS,
  lines: PORTUGUESE_LINES,
  blockOnly: PORTUGUESE_BLOCK_ONLY,
};

function trackedFiles(): string[] {
  const out = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 28 });
  return out.stdout
    .toString('utf8')
    .split('\0')
    .filter((p) => p !== '' && TEXT_FILE.test(p))
    .filter(
      (p) =>
        !GUARD_SKIPPED_PATHS.some(
          (s) => p === s.path || (s.path.endsWith('/') && p.startsWith(s.path)),
        ),
    );
}

function readTracked(): GuardFile[] {
  const files: GuardFile[] = [];
  for (const path of trackedFiles()) {
    try {
      files.push({ path, content: readFileSync(resolve(ROOT, path), 'utf8') });
    } catch {
      // a tracked file deleted in the working tree: nothing to scan
    }
  }
  return files;
}

/** `PORTUGUESE_GUARD_ONLY=a/,b/c.ts` narrows the report to those prefixes (for working on one area). */
function onlyRequested(findings: readonly Finding[]): readonly Finding[] {
  const only = (process.env.PORTUGUESE_GUARD_ONLY ?? '').split(',').filter(Boolean);
  if (only.length === 0) return findings;
  return findings.filter((f) => only.some((prefix) => f.path.startsWith(prefix)));
}

function describeFindings(findings: readonly Finding[]): string {
  const byFolder = new Map<string, number>();
  for (const f of findings) {
    const folder = f.path.split('/').slice(0, 2).join('/');
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
  }
  const summary = [...byFolder.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([folder, n]) => `  ${n}\t${folder}`)
    .join('\n');
  const first = findings
    .slice(0, Number(process.env.PORTUGUESE_GUARD_LIMIT ?? 40))
    .map((f) => `${f.path}:${f.line}: ${f.text}`)
    .join('\n');
  return `${findings.length} line(s) with Portuguese text; ${FIX}.\n${first}\n\nBy folder:\n${summary}`;
}

describe('Portuguese guard (decision 10 of #741)', () => {
  const files = readTracked();
  const result = scanPortuguese(files, REAL_OPTIONS);

  it('no versioned text file has Portuguese outside the exception list', () => {
    const shown = onlyRequested(result.findings);
    expect(shown.length === 0 ? '' : describeFindings(shown)).toBe('');
  });

  it('the portuguese-guard blocks are well formed', () => {
    expect(result.errors).toEqual([]);
  });

  it('every exception has a reason, a real path and does exempt something', () => {
    const tracked = new Set(files.map((f) => f.path));
    const allTracked = new Set(trackedFiles());
    const problems: string[] = [];
    for (const e of PORTUGUESE_PATHS) {
      if (e.reason.trim().length < 15) problems.push(`path ${e.path}: reason too short`);
      const exists = [...allTracked].some((p) =>
        e.path.endsWith('/') ? p.startsWith(e.path) : p === e.path,
      );
      if (
        !exists &&
        !spawnSync('git', ['ls-files', '--', e.path], { cwd: ROOT }).stdout.length
      ) {
        problems.push(`path ${e.path}: no versioned file`);
      }
      for (const x of e.except ?? [])
        if (!tracked.has(x))
          problems.push(`path ${e.path}: except ${x} is not a scanned file`);
    }
    for (const e of PORTUGUESE_LINES) {
      if (e.reason.trim().length < 15)
        problems.push(`line rule ${e.path} ${e.pattern}: reason too short`);
      if (!result.usedLines.has(e))
        problems.push(`line rule ${e.path} ${e.pattern}: matches no line (stale)`);
    }
    for (const e of PORTUGUESE_BLOCK_ONLY) {
      if (e.reason.trim().length < 15)
        problems.push(`block-only ${e.path}: reason too short`);
      if (!tracked.has(e.path)) problems.push(`block-only ${e.path}: not a scanned file`);
    }
    for (const e of PORTUGUESE_PATHS) {
      if (!result.usedPaths.has(e))
        problems.push(`path ${e.path}: exempts no file (stale)`);
    }
    expect(problems).toEqual([]);
  });

  it('every protocol term has a source file that exists', () => {
    const missing = PROTOCOL_TERMS.filter((t) => !tracked(t.source)).map(
      (t) => `${t.term} → ${t.source}`,
    );
    expect(missing).toEqual([]);

    function tracked(source: string): boolean {
      return (
        spawnSync('git', ['ls-files', '--', source], { cwd: ROOT }).stdout.length > 0
      );
    }
  });
});

describe('the guard itself', () => {
  const none: ScanOptions = { paths: [], lines: [], blockOnly: [] };
  const run = (path: string, content: string, options: ScanOptions = none) =>
    scanPortuguese([{ path, content }], options);

  it('fails on a line with "não" in a comment of src/', () => {
    const r = run(
      'src/model/x.ts',
      '// this does not work\n// isto não funciona\nconst a = 1;\n',
    );
    expect(r.findings).toEqual([
      { path: 'src/model/x.ts', line: 2, text: '// isto não funciona' },
    ]);
  });

  it('fails on typical Portuguese characters and on common words without accent', () => {
    expect(run('a.ts', '// ação').findings).toHaveLength(1);
    expect(run('a.ts', '// uma lista para cada item').findings).toHaveLength(1);
    expect(
      run('a.ts', '// a list for each item, for English only').findings,
    ).toHaveLength(0);
  });

  it('accepts a protocol term between backticks or quotes and rejects it outside them', () => {
    expect(
      run('docs/X.md', 'The notice `Troca de sessão da fase` goes first.').findings,
    ).toEqual([]);
    expect(run('a.mjs', "const m = 'Troca de sessão da fase';").findings).toEqual([]);
    expect(
      run('docs/X.md', 'The notice Troca de sessão da fase goes first.').findings,
    ).toHaveLength(1);
    expect(
      run('docs/X.md', 'The notice `Troca de sessão da fase não` goes first.').findings,
    ).toHaveLength(1);
  });

  it('accepts the record titles on the heading lines of a record, and nowhere else', () => {
    expect(run('changelog/x.md', '## Pendências\n').findings).toEqual([]);
    expect(
      run('docs/design-system/x.md', '# Title — [Não lançado] (épico `epic/x`)').findings,
    ).toEqual([]);
    expect(run('docs/X.md', '## Pendências\n').findings).toHaveLength(1);
  });

  it('exempts a whole file or folder, except the listed files', () => {
    const paths: PathException[] = [
      { path: 'a/', except: ['a/keep.ts'], reason: 'a reason long enough for the test' },
    ];
    const options = { ...none, paths };
    expect(run('a/x.ts', '// não', options).findings).toEqual([]);
    expect(run('a/keep.ts', '// não', options).findings).toHaveLength(1);
  });

  it('exempts a marked block and reports a block without a reason or without an end', () => {
    const b = PORTUGUESE_BLOCK_MARKERS;
    const ok = `x\n// ${b.begin} pt-BR dictionary\n// não\n// ${b.end}\n// não\n`;
    expect(run('a.ts', ok).findings.map((f) => f.line)).toEqual([5]);
    expect(run('a.ts', `// ${b.begin}\n// não\n// ${b.end}\n`).errors).toHaveLength(1);
    expect(run('a.ts', `// ${b.begin} pt-BR dictionary\n// não\n`).errors).toHaveLength(
      1,
    );
    expect(run('a.ts', `// ${b.end}\n`).errors).toHaveLength(1);
  });

  it('scans only the managed block of a block-only file', () => {
    const blockOnly = [
      {
        path: 'W.md',
        begin: 'mapping:begin',
        end: 'mapping:end',
        reason: 'a reason long enough',
      },
    ];
    const content =
      'não aqui fora\n<!-- mapping:begin -->\nnão dentro\n<!-- mapping:end -->\nnão fora\n';
    const r = run('W.md', content, { ...none, blockOnly });
    expect(r.findings.map((f) => f.line)).toEqual([3]);
  });

  it('exempts a line by pattern, with a reason', () => {
    const lines: LineException[] = [
      {
        path: 'a.ts',
        pattern: /Português \(Brasil\)/,
        reason: 'the autonym of the pt-BR language',
      },
    ];
    const r = run('a.ts', "'language.pt-BR': 'Português (Brasil)',\n// não\n", {
      ...none,
      lines,
    });
    expect(r.findings.map((f) => f.line)).toEqual([2]);
    expect(r.usedLines.size).toBe(1);
  });
});
