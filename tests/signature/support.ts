import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, type CliIo } from '../../signature/cli';

export const ROOT = process.cwd();
export const FIXTURES = join(ROOT, 'tests/fixtures/signature/kotlin');
export const BUNDLE_CJS = join(ROOT, 'dist-mcp/mapping-signature.js');
export const BUNDLE_ESM = join(ROOT, 'dist-mcp/mapping-signature.mjs');

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  /** What was written by `--out`, by path. */
  readonly written: Readonly<Record<string, string>>;
}

/** Runs the CLI in-process, with in-memory files (path -> text). */
export function run(
  argv: readonly string[],
  files: Readonly<Record<string, string>> = {},
): RunResult {
  let stdout = '';
  let stderr = '';
  const written: Record<string, string> = {};
  const io: CliIo = {
    readFile(path) {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
    writeFile(path, text) {
      written[path] = text;
    },
    stdout(text) {
      stdout += text;
    },
    stderr(text) {
      stderr += text;
    },
  };
  const code = runCli(argv, io);
  return { code, stdout, stderr, written };
}

/** Extracts the `symbol` from an in-memory `A.kt`; `flags` go after `--symbol`. */
export function extract(
  source: string,
  symbol: string,
  flags: readonly string[] = [],
  extra: Readonly<Record<string, string>> = {},
): RunResult {
  return run(['kotlin', '--file', 'A.kt', '--symbol', symbol, ...flags], {
    'A.kt': source,
    ...extra,
  });
}

/** The printed signature, already parsed (fails the test if the run did not succeed). */
export function extractJson(
  source: string,
  symbol: string,
  flags: readonly string[] = [],
  extra: Readonly<Record<string, string>> = {},
): Sig {
  const result = extract(source, symbol, flags, extra);
  if (result.code !== 0) throw new Error(`exit ${result.code}: ${result.stderr}`);
  return JSON.parse(result.stdout) as Sig;
}

export interface SigParam {
  name: string;
  label?: string;
  id?: string;
  role: string;
  type: string;
  default?: string;
  required?: boolean;
  value?: { kind: string; default?: string | number | boolean; options?: string[] };
  factory?: { call: string; params: SigParam[] };
}
export interface Sig {
  source: Record<string, unknown> & { init?: number };
  params: SigParam[];
  doc?: Record<string, string>;
}

/** A minimal `A.kt`: the `package` and a composable function. */
export function composable(params: string, name = 'Foo'): string {
  return `package demo.ui\n\n@Composable\nfun ${name}(${params}) {}\n`;
}

/** The signature parameters of a function with the given list, by name. */
export function paramsOf(params: string): Record<string, SigParam> {
  const sig = extractJson(composable(params), 'Foo');
  return Object.fromEntries(sig.params.map((p) => [p.name, p]));
}

/** Runs the bundle (`.js` or `.mjs`) in a real process. */
export function spawnBundle(
  bundle: string,
  args: readonly string[],
  cwd: string = ROOT,
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [bundle, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

export function fixtureText(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

/** The expected signature, in the exact output format (2 spaces, `\n` at the end). */
export function canonical(name: string): string {
  return `${JSON.stringify(JSON.parse(fixtureText(name)), null, 2)}\n`;
}

export const BUTTON_PATH =
  'compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt';
export const SWITCH_PATH = BUTTON_PATH.replace('Button.kt', 'Switch.kt');
export const APPBAR_PATH = BUTTON_PATH.replace('Button.kt', 'AppBar.kt');
export const REF = '5113b82a4ed6416d6344efa50e41db8cb65928ff';

/** Runs the Kotlin reader on a real fixture (androidx excerpt), with the commit's `--path` and `--ref`. */
export function runReal(
  file: string,
  symbol: string,
  path: string,
  flags: readonly string[] = [],
): RunResult {
  const rel = `tests/fixtures/signature/kotlin/${file}`;
  return run(
    ['kotlin', '--file', rel, '--symbol', symbol, '--path', path, '--ref', REF, ...flags],
    { [rel]: fixtureText(file) },
  );
}
