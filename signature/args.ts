import { usageError } from './errors';
import { READER_NAMES } from './readers';

// A linha de comando: `mapping-signature <leitor> --file <arquivo> --symbol <nome> [opções]`.

export interface RunArgs {
  readonly reader: string;
  readonly file: string;
  readonly symbol: string;
  readonly path?: string;
  readonly ref?: string;
  readonly also: readonly string[];
  readonly overload?: number;
  readonly out?: string;
}

export type Parsed =
  { readonly help: true } | { readonly help: false; readonly args: RunArgs };

const VALUE_OPTIONS = [
  '--file',
  '--symbol',
  '--path',
  '--ref',
  '--overload',
  '--out',
] as const;
type ValueOption = (typeof VALUE_OPTIONS)[number];

export const USAGE = `Uso:
  mapping-signature kotlin --file <arquivo.kt> --symbol <nome> [--path <relativo ao repositório>]
                           [--ref <commit>] [--also <arquivo.kt>]... [--overload <n>] [--out <ficha.json>]
  mapping-signature --help

Lê o código-fonte e imprime a ficha de assinatura (mapping-signature, formatVersion 1) da função
@Composable pedida: o formato está em docs/SIGNATURE-FORMAT.md.

Leitores: ${READER_NAMES.join(', ')}

Opções:
  --file <arquivo>      o arquivo que define a função
  --symbol <nome>       o nome da função, simples (Button) ou completo (androidx.compose.material3.Button)
  --path <caminho>      o caminho do arquivo relativo à raiz do repositório (vai em source.path);
                        sem ele vale o --file, se for relativo
  --ref <commit>        o commit, a tag ou o branch lido (vai em source.ref)
  --also <arquivo>      outro arquivo onde procurar fábricas (object …Defaults) e enum class; repetível
  --overload <n>        a sobrecarga a usar (0 em diante, na ordem do arquivo, contando as @Deprecated)
  --out <arquivo>       grava a ficha neste arquivo em vez de imprimir (não cria pastas)
  --help                mostra este texto

Códigos de saída: 0 ok; 1 erro de extração; 2 erro de uso.
`;

function takeValue(argv: readonly string[], index: number): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw usageError(`${argv[index]} precisa de um valor`);
  }
  return value;
}

function parseOverload(text: string): number {
  if (!/^\d+$/.test(text))
    throw usageError('--overload deve ser um inteiro de 0 em diante');
  return Number(text);
}

function isValueOption(arg: string): arg is ValueOption {
  return (VALUE_OPTIONS as readonly string[]).includes(arg);
}

function readerFrom(argv: readonly string[]): string {
  const reader = argv[0];
  if (reader === undefined || reader.startsWith('--')) {
    throw usageError('informe o leitor (kotlin); use --help para ver o uso');
  }
  if (!READER_NAMES.includes(reader)) {
    throw usageError(
      `leitor desconhecido: ${reader}; disponíveis: ${READER_NAMES.join(', ')}`,
    );
  }
  return reader;
}

/** As opções (depois do leitor): cada uma com o seu valor; `--also` pode repetir. */
function readOptions(argv: readonly string[]): {
  values: Map<ValueOption, string>;
  also: string[];
} {
  const values = new Map<ValueOption, string>();
  const also: string[] = [];
  for (let i = 1; i < argv.length; i += 2) {
    const arg = argv[i]!;
    if (arg !== '--also' && !isValueOption(arg))
      throw usageError(`argumento desconhecido: ${arg}`);
    const value = takeValue(argv, i);
    if (arg === '--also') also.push(value);
    else if (values.has(arg)) throw usageError(`${arg} foi informado mais de uma vez`);
    else values.set(arg, value);
  }
  return { values, also };
}

/** Lê a linha de comando; erro de uso vira `CliError` com código 2. */
export function parseArgs(argv: readonly string[]): Parsed {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const reader = readerFrom(argv);
  const { values, also } = readOptions(argv);
  return { help: false, args: buildArgs(reader, values, also) };
}

function buildArgs(
  reader: string,
  values: Map<ValueOption, string>,
  also: string[],
): RunArgs {
  const file = values.get('--file');
  const symbol = values.get('--symbol');
  if (file === undefined) throw usageError('falta --file <arquivo>');
  if (symbol === undefined) throw usageError('falta --symbol <nome>');
  const path = values.get('--path');
  const ref = values.get('--ref');
  const overload = values.get('--overload');
  const out = values.get('--out');
  return {
    reader,
    file,
    symbol,
    also,
    ...(path === undefined ? {} : { path }),
    ...(ref === undefined ? {} : { ref }),
    ...(overload === undefined ? {} : { overload: parseOverload(overload) }),
    ...(out === undefined ? {} : { out }),
  };
}
