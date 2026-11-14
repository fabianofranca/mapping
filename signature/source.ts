import { CliError } from './errors';

// A source file that was read: the name (as it came on the command line, for the messages) and the text,
// with the table of line starts to convert a position into line and column.

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

/** Line and column (1 onwards) of an offset in the text. */
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

/** The syntax error in the format `<file>:<line>:<column>: <message>`. */
export function syntaxError(src: SourceFile, offset: number, message: string): CliError {
  const { line, column } = positionOf(src, offset);
  return new CliError(`${src.name}:${line}:${column}: ${message}`, 1);
}
