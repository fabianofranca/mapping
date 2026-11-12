import { CliError } from './errors';

// Um arquivo de código lido: o nome (como veio na linha de comando, para as mensagens) e o texto,
// com a tabela de começos de linha para converter posição em linha e coluna.

export interface SourceFile {
  readonly name: string;
  readonly text: string;
  readonly lineStarts: readonly number[];
}

export function makeSource(name: string, rawText: string): SourceFile {
  const text = rawText.startsWith('﻿') ? rawText.slice(1) : rawText;
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  return { name, text, lineStarts };
}

export interface Position {
  readonly line: number;
  readonly column: number;
}

/** Linha e coluna (1 em diante) de um deslocamento do texto. */
export function positionOf(src: SourceFile, offset: number): Position {
  let low = 0;
  let high = src.lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (src.lineStarts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - src.lineStarts[low]! + 1 };
}

/** O erro de sintaxe no formato `<arquivo>:<linha>:<coluna>: <mensagem>`. */
export function syntaxError(src: SourceFile, offset: number, message: string): CliError {
  const { line, column } = positionOf(src, offset);
  return new CliError(`${src.name}:${line}:${column}: ${message}`, 1);
}
