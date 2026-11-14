import { readFileSync, writeFileSync } from 'node:fs';
import { parseSignature, type Signature } from '../src/model/signatures';
import { parseArgs, USAGE, type CodeArgs, type DesignArgs, type RunArgs } from './args';
import { CliError, usageError } from './errors';
import { READERS } from './readers';

// The extractor CLI: reads the files, calls the reader, validates the sheet with `parseSignature`
// and prints it (or writes it to `--out`). It is the only module that writes to disk, and only `--out`.

export interface CliIo {
  readFile(path: string): string;
  writeFile(path: string, text: string): void;
  stdout(text: string): void;
  stderr(text: string): void;
}

const nodeIo: CliIo = {
  readFile: (path) => readFileSync(path, 'utf8'),
  // `w` creates the file and does not create folders.
  writeFile: (path, text) => writeFileSync(path, text, { encoding: 'utf8', flag: 'w' }),
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
};

const ABSOLUTE = /^(?:\/|[A-Za-z]:[\\/])/;

/** The `source.path`: the `--path` as given, or the relative `--file` (with `/` and no leading `./`). */
function sourcePath(args: CodeArgs): string {
  if (args.path !== undefined) return args.path;
  if (ABSOLUTE.test(args.file)) {
    throw usageError('absolute --file: give --path, relative to the repository root');
  }
  return args.file.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

function readText(io: CliIo, path: string): string {
  try {
    return io.readFile(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`could not read ${path}: ${reason}`);
  }
}

/** The sheet as text (2 spaces, `\n` at the end), checked by `parseSignature` before it goes out. */
function serialize(signature: Signature): string {
  const text = `${JSON.stringify(signature, null, 2)}\n`;
  const checked = parseSignature(JSON.parse(text));
  if (!checked.ok) {
    const lines = checked.issues.map(
      (i) => `  ${i.path === '' ? '(root)' : i.path}: ${i.message}`,
    );
    throw new CliError(
      `internal error: the generated sheet fails validation:\n${lines.join('\n')}`,
    );
  }
  return text;
}

/** Reads the files and runs the reader: the code one gets the file and the `--also`; the design one, the JSON. */
function read(args: RunArgs, io: CliIo): Signature {
  const def = READERS[args.reader]!;
  if (def.kind === 'design') {
    const { file, node } = args as DesignArgs;
    return def.read({ file: { name: file, text: readText(io, file) }, node });
  }
  const code = args as CodeArgs;
  const path = sourcePath(code);
  return def.read({
    file: { name: code.file, text: readText(io, code.file) },
    also: code.also.map((name) => ({ name, text: readText(io, name) })),
    symbol: code.symbol,
    path,
    ...(code.ref === undefined ? {} : { ref: code.ref }),
    ...(code.overload === undefined ? {} : { overload: code.overload }),
    ...(code.init === undefined ? {} : { init: code.init }),
  });
}

function execute(argv: readonly string[], io: CliIo): number {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    io.stdout(USAGE);
    return 0;
  }
  const { args } = parsed;
  const text = serialize(read(args, io));
  if (args.out === undefined) {
    io.stdout(text);
    return 0;
  }
  try {
    io.writeFile(args.out, text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`could not write ${args.out}: ${reason}`);
  }
  return 0;
}

/** Runs the CLI; returns the exit code (0 ok, 1 extraction error, 2 usage error). */
export function runCli(argv: readonly string[], io: CliIo = nodeIo): number {
  try {
    return execute(argv, io);
  } catch (error) {
    if (error instanceof CliError) {
      io.stderr(`${error.message}\n`);
      return error.exitCode;
    }
    io.stderr(
      `internal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
