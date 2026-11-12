import { readFileSync, writeFileSync } from 'node:fs';
import { parseSignature, type Signature } from '../src/model/signatures';
import { parseArgs, USAGE, type CodeArgs, type DesignArgs, type RunArgs } from './args';
import { CliError, usageError } from './errors';
import { READERS } from './readers';

// A CLI do extrator: lê os arquivos, chama o leitor, valida a ficha com `parseSignature` e a
// imprime (ou grava em `--out`). É o único módulo que grava no disco, e só o `--out`.

export interface CliIo {
  readFile(path: string): string;
  writeFile(path: string, text: string): void;
  stdout(text: string): void;
  stderr(text: string): void;
}

const nodeIo: CliIo = {
  readFile: (path) => readFileSync(path, 'utf8'),
  // `w` cria o arquivo e não cria pastas.
  writeFile: (path, text) => writeFileSync(path, text, { encoding: 'utf8', flag: 'w' }),
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
};

const ABSOLUTE = /^(?:\/|[A-Za-z]:[\\/])/;

/** O `source.path`: o `--path` como veio, ou o `--file` relativo (com `/` e sem `./` na frente). */
function sourcePath(args: CodeArgs): string {
  if (args.path !== undefined) return args.path;
  if (ABSOLUTE.test(args.file)) {
    throw usageError('--file absoluto: informe --path, relativo à raiz do repositório');
  }
  return args.file.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

function readText(io: CliIo, path: string): string {
  try {
    return io.readFile(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`não foi possível ler ${path}: ${reason}`);
  }
}

/** A ficha em texto (2 espaços, `\n` no fim), conferida pelo `parseSignature` antes de sair. */
function serialize(signature: Signature): string {
  const text = `${JSON.stringify(signature, null, 2)}\n`;
  const checked = parseSignature(JSON.parse(text));
  if (!checked.ok) {
    const lines = checked.issues.map(
      (i) => `  ${i.path === '' ? '(raiz)' : i.path}: ${i.message}`,
    );
    throw new CliError(
      `erro interno: a ficha gerada não passa na validação:\n${lines.join('\n')}`,
    );
  }
  return text;
}

/** Lê os arquivos e roda o leitor: o de código recebe o arquivo e os `--also`; o de design, o JSON. */
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
    throw new CliError(`não foi possível gravar ${args.out}: ${reason}`);
  }
  return 0;
}

/** Roda a CLI; devolve o código de saída (0 ok, 1 erro de extração, 2 erro de uso). */
export function runCli(argv: readonly string[], io: CliIo = nodeIo): number {
  try {
    return execute(argv, io);
  } catch (error) {
    if (error instanceof CliError) {
      io.stderr(`${error.message}\n`);
      return error.exitCode;
    }
    io.stderr(
      `erro interno: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
