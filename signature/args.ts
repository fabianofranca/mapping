import { usageError } from './errors';
import { READER_NAMES, READERS } from './readers';

// A linha de comando: `mapping-signature <leitor> --file <arquivo> --symbol <nome> [opções]`.

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

export const USAGE = `Uso:
  mapping-signature kotlin --file <arquivo.kt> --symbol <nome> [--path <relativo ao repositório>]
                           [--ref <commit>] [--also <arquivo.kt>]... [--overload <n>] [--out <ficha.json>]
  mapping-signature swift --file <arquivo.swift> --symbol <nome> [--path <relativo ao repositório>]
                          [--ref <commit>] [--also <arquivo.swift>]... [--init <n>] [--out <ficha.json>]
  mapping-signature figma --file <nós.json> --node <id> [--out <ficha.json>]
  mapping-signature --help

Lê o código-fonte (a função @Composable do kotlin, a struct SwiftUI do swift) ou o JSON de um nó do
Figma (as componentPropertyDefinitions de um COMPONENT_SET ou COMPONENT) e imprime a ficha de
assinatura (mapping-signature, formatVersion 1): o formato está em docs/SIGNATURE-FORMAT.md.

Leitores: ${READER_NAMES.join(', ')}

Opções:
  --file <arquivo>      o arquivo que define a função ou a struct (kotlin, swift) ou o JSON do Figma
  --symbol <nome>       o nome da função ou da struct, simples (Button) ou completo (androidx.compose.material3.Button,
                        DS.ProfileCard); no swift o prefixo é guardado como veio (módulo ou tipo que envolve a struct)
  --node <id>           o id do nó do Figma (12:34; 12-34, como na URL, também vale)
  --path <caminho>      o caminho do arquivo relativo à raiz do repositório (vai em source.path);
                        sem ele vale o --file, se for relativo
  --ref <commit>        o commit, a tag ou o branch lido (vai em source.ref)
  --also <arquivo>      outro arquivo onde procurar enum (e, no kotlin, object …Defaults com as fábricas); repetível
  --overload <n>        kotlin: a sobrecarga a usar (0 em diante, na ordem do arquivo, contando as @Deprecated)
  --init <n>            swift: o init a usar (0 em diante, na ordem da struct, contando os deprecated);
                        sem init escrito, 0 é o memberwise
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

function parseIndex(option: string, text: string): number {
  if (!/^\d+$/.test(text))
    throw usageError(`${option} deve ser um inteiro de 0 em diante`);
  return Number(text);
}

function isValueOption(arg: string): arg is ValueOption {
  return (VALUE_OPTIONS as readonly string[]).includes(arg);
}

function readerFrom(argv: readonly string[]): string {
  const reader = argv[0];
  if (reader === undefined || reader.startsWith('--')) {
    throw usageError(
      `informe o leitor (${READER_NAMES.join(', ')}); use --help para ver o uso`,
    );
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

/** Recusa a opção que o leitor não aceita (`--init` no kotlin, `--symbol` no figma…). */
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
      `a opção ${option} não vale para ${reader} (vale para ${owners.join(', ')})`,
    );
  }
}

/** Lê a linha de comando; erro de uso vira `CliError` com código 2. */
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
  if (file === undefined) throw usageError('falta --file <arquivo>');
  const out = values.get('--out');
  const outPart = out === undefined ? {} : { out };
  if (READERS[reader]!.kind === 'design') {
    const node = values.get('--node');
    if (node === undefined) throw usageError('falta --node <id>');
    return { kind: 'design', reader, file, node, ...outPart };
  }
  const symbol = values.get('--symbol');
  if (symbol === undefined) throw usageError('falta --symbol <nome>');
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
