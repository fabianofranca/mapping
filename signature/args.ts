import { usageError } from './errors';
import { READER_NAMES, READERS } from './readers';

// The command line: `mapping-signature <reader> --file <file> --symbol <name> [options]`.

export interface CodeArgs {
  readonly kind: 'code';
  readonly reader: string;
  readonly file: string;
  readonly symbol: string;
  readonly path?: string;
  readonly ref?: string;
  readonly also: readonly string[];
  readonly overload?: number;
  readonly init?: number;
  readonly out?: string;
}

export interface DesignArgs {
  readonly kind: 'design';
  readonly reader: string;
  readonly file: string;
  readonly node: string;
  readonly out?: string;
}

export type RunArgs = CodeArgs | DesignArgs;

export type Parsed =
  { readonly help: true } | { readonly help: false; readonly args: RunArgs };

const VALUE_OPTIONS = [
  '--file',
  '--symbol',
  '--node',
  '--path',
  '--ref',
  '--overload',
  '--init',
  '--out',
] as const;
type ValueOption = (typeof VALUE_OPTIONS)[number];

export const USAGE = `Usage:
  mapping-signature kotlin --file <file.kt> --symbol <name> [--path <relative to the repository>]
                           [--ref <commit>] [--also <file.kt>]... [--overload <n>] [--out <sheet.json>]
  mapping-signature swift --file <file.swift> --symbol <name> [--path <relative to the repository>]
                          [--ref <commit>] [--also <file.swift>]... [--init <n>] [--out <sheet.json>]
  mapping-signature figma --file <nodes.json> --node <id> [--out <sheet.json>]
  mapping-signature --help

Reads the source code (the @Composable function in kotlin, the SwiftUI struct in swift) or the JSON of a
Figma node (the componentPropertyDefinitions of a COMPONENT_SET or COMPONENT) and prints the signature
sheet (mapping-signature, formatVersion 1): the format is in docs/SIGNATURE-FORMAT.md.

Readers: ${READER_NAMES.join(', ')}

Options:
  --file <file>         the file that defines the function or the struct (kotlin, swift) or the Figma JSON
  --symbol <name>       the name of the function or struct, simple (Button) or full (androidx.compose.material3.Button,
                        DS.ProfileCard); in swift the prefix is kept as it came (module or type that wraps the struct)
  --node <id>           the id of the Figma node (12:34; 12-34, as in the URL, also works)
  --path <path>         the file path relative to the repository root (goes in source.path);
                        without it the --file is used, if relative
  --ref <commit>        the commit, tag or branch read (goes in source.ref)
  --also <file>         another file to look for enum in (and, in kotlin, object …Defaults with the factories); repeatable
  --overload <n>        kotlin: the overload to use (0 onwards, in file order, counting the @Deprecated ones)
  --init <n>            swift: the init to use (0 onwards, in struct order, counting the deprecated ones);
                        with no written init, 0 is the memberwise one
  --out <file>          writes the sheet to this file instead of printing it (does not create folders)
  --help                shows this text

Exit codes: 0 ok; 1 extraction error; 2 usage error.
`;

function takeValue(argv: readonly string[], index: number): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw usageError(`${argv[index]} needs a value`);
  }
  return value;
}

function parseIndex(option: string, text: string): number {
  if (!/^\d+$/.test(text))
    throw usageError(`${option} must be an integer from 0 onwards`);
  return Number(text);
}

function isValueOption(arg: string): arg is ValueOption {
  return (VALUE_OPTIONS as readonly string[]).includes(arg);
}

function readerFrom(argv: readonly string[]): string {
  const reader = argv[0];
  if (reader === undefined || reader.startsWith('--')) {
    throw usageError(
      `give the reader (${READER_NAMES.join(', ')}); use --help to see the usage`,
    );
  }
  if (!READER_NAMES.includes(reader)) {
    throw usageError(`unknown reader: ${reader}; available: ${READER_NAMES.join(', ')}`);
  }
  return reader;
}

/** The options (after the reader): each with its value; `--also` may repeat. */
function readOptions(argv: readonly string[]): {
  values: Map<ValueOption, string>;
  also: string[];
} {
  const values = new Map<ValueOption, string>();
  const also: string[] = [];
  for (let i = 1; i < argv.length; i += 2) {
    const arg = argv[i]!;
    if (arg !== '--also' && !isValueOption(arg))
      throw usageError(`unknown argument: ${arg}`);
    const value = takeValue(argv, i);
    if (arg === '--also') also.push(value);
    else if (values.has(arg)) throw usageError(`${arg} was given more than once`);
    else values.set(arg, value);
  }
  return { values, also };
}

/** Rejects the option the reader does not accept (`--init` in kotlin, `--symbol` in figma…). */
function checkAllowed(
  reader: string,
  values: Map<ValueOption, string>,
  also: readonly string[],
): void {
  const allowed = READERS[reader]!.options;
  const given = [...values.keys(), ...(also.length > 0 ? ['--also'] : [])];
  for (const option of given) {
    if (allowed.includes(option)) continue;
    const owners = READER_NAMES.filter((name) => READERS[name]!.options.includes(option));
    throw usageError(
      `the option ${option} does not apply to ${reader} (it applies to ${owners.join(', ')})`,
    );
  }
}

/** Reads the command line; a usage error becomes a `CliError` with code 2. */
export function parseArgs(argv: readonly string[]): Parsed {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const reader = readerFrom(argv);
  const { values, also } = readOptions(argv);
  checkAllowed(reader, values, also);
  return { help: false, args: buildArgs(reader, values, also) };
}

function buildArgs(
  reader: string,
  values: Map<ValueOption, string>,
  also: string[],
): RunArgs {
  const file = values.get('--file');
  if (file === undefined) throw usageError('missing --file <file>');
  const out = values.get('--out');
  const outPart = out === undefined ? {} : { out };
  if (READERS[reader]!.kind === 'design') {
    const node = values.get('--node');
    if (node === undefined) throw usageError('missing --node <id>');
    return { kind: 'design', reader, file, node, ...outPart };
  }
  const symbol = values.get('--symbol');
  if (symbol === undefined) throw usageError('missing --symbol <name>');
  const path = values.get('--path');
  const ref = values.get('--ref');
  const overload = values.get('--overload');
  const init = values.get('--init');
  return {
    kind: 'code',
    reader,
    file,
    symbol,
    also,
    ...(path === undefined ? {} : { path }),
    ...(ref === undefined ? {} : { ref }),
    ...(overload === undefined ? {} : { overload: parseIndex('--overload', overload) }),
    ...(init === undefined ? {} : { init: parseIndex('--init', init) }),
    ...outPart,
  };
}
