import { positionOf, syntaxError, type SourceFile } from './source';
import type { Token, TokenKind, TokenStream } from './tokens';

// Tokenizador comum das listas de parâmetros (só o que os leitores precisam, não uma gramática):
// identificadores, números, strings (`"…"` com escape, `"""…"""`, `${…}` aninhado), caracteres,
// comentários (o KDoc e o `///` do Swift são guardados para o `doc`) e pontuação. Os delimitadores
// `()`, `[]` e `{}` são conferidos no arquivo inteiro; `<>` não (é genérico ou comparação).

/** O que muda de uma linguagem para outra no que o tokenizador lê. */
export interface Dialect {
  /** `///` colado numa declaração é documentação (Swift); no Kotlin é um comentário comum. */
  readonly lineDocs: boolean;
  /** O que abre uma interpolação dentro de uma string: `${` (Kotlin) ou `\(` (Swift). */
  readonly interpolation: '${' | '\\(';
  /** `'x'` é um caractere (Kotlin); no Swift o apóstrofo não é nada. */
  readonly chars: boolean;
}

export const KOTLIN_DIALECT: Dialect = {
  lineDocs: false,
  interpolation: '${',
  chars: true,
};
export const SWIFT_DIALECT: Dialect = {
  lineDocs: true,
  interpolation: '\\(',
  chars: false,
};

const IDENT = /[\p{L}_][\p{L}\p{N}_]*/uy;
const NUMBER =
  /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[fFlLuU]*/y;
const OPEN_FOR: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

/** Casa o regex sticky em `pos` e devolve o fim, ou `pos` se não casar. */
function endOf(regex: RegExp, text: string, pos: number): number {
  regex.lastIndex = pos;
  return regex.test(text) ? regex.lastIndex : pos;
}

/** Fim da string `"…"` ou `"""…"""` que abre em `start` (índice depois do fechamento). */
function scanString(src: SourceFile, start: number, dialect: Dialect): number {
  return src.text.startsWith('"""', start)
    ? scanRaw(src, start, dialect)
    : scanPlain(src, start, dialect);
}

/** O tamanho do que abre uma interpolação em `i` (`${` ou `\(`), ou 0 se não abre. */
function interpolationAt(text: string, i: number, dialect: Dialect): number {
  return text.startsWith(dialect.interpolation, i) ? 2 : 0;
}

function scanPlain(src: SourceFile, start: number, dialect: Dialect): number {
  const text = src.text;
  let i = start + 1;
  while (i < text.length && text[i] !== '\n') {
    const c = text[i]!;
    if (c === '"') return i + 1;
    const open = interpolationAt(text, i, dialect);
    if (open > 0) i = scanTemplate(src, i + open, start, dialect);
    else if (c === '\\') i += 2;
    else i++;
  }
  throw syntaxError(src, start, 'string não terminada');
}

function scanRaw(src: SourceFile, start: number, dialect: Dialect): number {
  const text = src.text;
  let i = start + 3;
  while (i < text.length) {
    if (text.startsWith('"""', i)) {
      i += 3;
      while (text[i] === '"') i++;
      return i;
    }
    const open = interpolationAt(text, i, dialect);
    if (open > 0) i = scanTemplate(src, i + open, start, dialect);
    else i++;
  }
  throw syntaxError(src, start, 'string não terminada');
}

/** Fim da interpolação (`${…}` ou `\(…)`; índice depois do fechamento), a partir do que vem depois da abertura. */
function scanTemplate(
  src: SourceFile,
  from: number,
  stringStart: number,
  dialect: Dialect,
): number {
  const text = src.text;
  const opener = dialect.interpolation.endsWith('{') ? '{' : '(';
  const closer = opener === '{' ? '}' : ')';
  let depth = 1;
  let i = from;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') i = scanString(src, i, dialect);
    else if (c === "'" && dialect.chars) i = scanChar(src, i);
    else {
      i++;
      if (c === opener) depth++;
      else if (c === closer && --depth === 0) return i;
    }
  }
  throw syntaxError(src, stringStart, 'string não terminada');
}

/** Fim do caractere `'x'` que abre em `start`. */
function scanChar(src: SourceFile, start: number): number {
  const text = src.text;
  let i = start + 1;
  while (i < text.length && text[i] !== '\n') {
    if (text[i] === '\\') i += 2;
    else if (text[i] === "'") return i + 1;
    else i++;
  }
  throw syntaxError(src, start, 'caractere não terminado');
}

/** Fim do comentário de bloco (que aninha, como no Kotlin) que abre em `start`. */
function scanBlockComment(src: SourceFile, start: number): number {
  const text = src.text;
  let depth = 0;
  let i = start;
  while (i < text.length) {
    if (text.startsWith('/*', i)) {
      depth++;
      i += 2;
    } else if (text.startsWith('*/', i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else i++;
  }
  throw syntaxError(src, start, 'comentário não terminado');
}

class Lexer {
  private pos = 0;
  private pendingDoc: string | undefined;
  private readonly tokens: Token[] = [];
  private readonly match: number[] = [];
  private readonly opened: number[] = [];

  constructor(
    private readonly src: SourceFile,
    private readonly dialect: Dialect,
  ) {}

  run(): TokenStream {
    while (this.pos < this.src.text.length) this.step();
    const unclosed = this.opened[this.opened.length - 1];
    if (unclosed !== undefined) {
      const token = this.tokens[unclosed]!;
      throw syntaxError(this.src, token.start, `"${token.text}" não fechado`);
    }
    return { src: this.src, tokens: this.tokens, match: this.match };
  }

  private at(prefix: string): boolean {
    return this.src.text.startsWith(prefix, this.pos);
  }

  private step(): void {
    const c = this.src.text[this.pos]!;
    if (/\s/.test(c)) this.pos++;
    else if (this.at('//')) this.readLineComment();
    else if (this.at('/*')) this.readBlockComment();
    else if (c === '"') this.push('string', scanString(this.src, this.pos, this.dialect));
    else if (c === "'" && this.dialect.chars)
      this.push('char', scanChar(this.src, this.pos));
    else if (c === '`') this.push('ident', this.scanBacktick());
    else if (/\d/.test(c)) this.push('number', endOf(NUMBER, this.src.text, this.pos));
    else if (/[\p{L}_]/u.test(c))
      this.push('ident', endOf(IDENT, this.src.text, this.pos));
    else this.readPunct(c);
  }

  /** Pula o comentário de linha; no Swift, `///` (e não `////`) soma ao `doc` que vai no próximo token. */
  private readLineComment(): void {
    const end = this.src.text.indexOf('\n', this.pos);
    const stop = end < 0 ? this.src.text.length : end;
    if (this.dialect.lineDocs && this.at('///') && !this.at('////')) {
      const line = this.src.text.slice(this.pos, stop).replace(/\r$/, '');
      this.pendingDoc =
        this.pendingDoc === undefined ? line : `${this.pendingDoc}\n${line}`;
    }
    this.pos = stop;
  }

  private readBlockComment(): void {
    const end = scanBlockComment(this.src, this.pos);
    const raw = this.src.text.slice(this.pos, end);
    if (raw.startsWith('/**') && raw !== '/**/') this.pendingDoc = raw;
    this.pos = end;
  }

  private scanBacktick(): number {
    const end = this.src.text.indexOf('`', this.pos + 1);
    if (end < 0 || this.src.text.slice(this.pos, end).includes('\n')) {
      throw syntaxError(this.src, this.pos, 'identificador entre crases não terminado');
    }
    return end + 1;
  }

  private readPunct(c: string): void {
    if (this.at('->')) {
      this.push('punct', this.pos + 2);
      return;
    }
    this.push('punct', this.pos + 1);
    if (c === '(' || c === '[' || c === '{') this.opened.push(this.tokens.length - 1);
    else if (c === ')' || c === ']' || c === '}') this.close(c);
  }

  private close(c: string): void {
    const index = this.tokens.length - 1;
    const token = this.tokens[index]!;
    const open = this.opened.pop();
    const expected = OPEN_FOR[c]!;
    if (open === undefined)
      throw syntaxError(this.src, token.start, `"${c}" sem abertura`);
    if (this.tokens[open]!.text !== expected) {
      throw syntaxError(
        this.src,
        token.start,
        `"${c}" não combina com o "${this.tokens[open]!.text}" aberto na linha ${this.lineOf(open)}`,
      );
    }
    this.match[open] = index;
    this.match[index] = open;
  }

  private lineOf(tokenIndex: number): number {
    return positionOf(this.src, this.tokens[tokenIndex]!.start).line;
  }

  private push(kind: TokenKind, end: number): void {
    const index = this.tokens.length;
    const text = this.src.text.slice(this.pos, end);
    const doc = this.pendingDoc;
    this.tokens.push(
      doc === undefined
        ? { kind, text, start: this.pos, end }
        : { kind, text, start: this.pos, end, doc },
    );
    this.match[index] = -1;
    this.pendingDoc = undefined;
    this.pos = end;
  }
}

/** Tokeniza o arquivo; um delimitador, string ou comentário não fechado vira erro com linha e coluna. */
export function tokenize(
  src: SourceFile,
  dialect: Dialect = KOTLIN_DIALECT,
): TokenStream {
  return new Lexer(src, dialect).run();
}
