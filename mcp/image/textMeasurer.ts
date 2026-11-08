import { parse, type Font } from 'opentype.js';
import monoBold from 'font:mono-bold';
import mono from 'font:mono';
import sansBold from 'font:sans-bold';
import sans from 'font:sans';
import {
  measureLines,
  type MeasureFont,
  type TextMeasurer,
} from '../../src/model/components/instantiate';
import type { LoadedFont } from '../../src/model/components/library';

// Medidor do servidor (decisão 31): mede com o opentype.js e uma fonte livre embutida (Mapping
// Sans/Mono, subconjunto das Liberation, OFL; ver mcp/fonts/LICENSE.txt). As `fonts` da biblioteca
// (com bytes) valem no lugar da embutida quando a família do texto as cita. O desenho (sceneRaster)
// usa as mesmas fontes para os glifos, então medida e desenho andam juntos.

/** Peso a partir do qual a fonte negrito entra. */
const BOLD_FROM = 600;
/** Famílias que pedem a fonte monoespaçada embutida. */
const MONO_FAMILY =
  /^(monospace|ui-monospace|mono|courier|courier new|consolas|menlo|monaco|sf mono|cascadia mono|cascadia code|source code pro|fira code|jetbrains mono|roboto mono|dejavu sans mono|liberation mono)$/i;

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function embedded(bytes: Uint8Array): Font {
  return parse(toBuffer(bytes));
}

let builtin: { sans: Font; sansBold: Font; mono: Font; monoBold: Font } | undefined;

function builtinFonts() {
  builtin ??= {
    sans: embedded(sans),
    sansBold: embedded(sansBold),
    mono: embedded(mono),
    monoBold: embedded(monoBold),
  };
  return builtin;
}

/** Nomes de família de uma pilha CSS (`"Inter", sans-serif`), sem aspas. */
export function familyNames(family: string): string[] {
  return family
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name !== '');
}

interface Candidate {
  readonly family: string;
  readonly low: number;
  readonly high: number;
  readonly italic: boolean;
  readonly font: Font;
}

function weightRange(weight: string): [number, number] {
  const parts = weight
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const low = parts[0] ?? 400;
  return [low, parts[1] ?? low];
}

/** A distância de um peso a um intervalo (0 se estiver dentro). */
const gap = (weight: number, c: Candidate) =>
  weight < c.low ? c.low - weight : weight > c.high ? weight - c.high : 0;

/** Um leitor de fontes: a embutida e as da biblioteca (`fonts` com bytes). */
export interface FontBook {
  /** A fonte que desenha/mede `family` com o peso e o estilo pedidos. */
  fontFor(family: string, weight: number, italic: boolean): Font;
  /** Há alguma fonte da biblioteca (`fonts`) lida; senão tudo é medido com a embutida. */
  readonly hasLibraryFonts: boolean;
}

export function createFontBook(extra: readonly LoadedFont[] = []): FontBook {
  const candidates: Candidate[] = [];
  for (const entry of extra) {
    if (entry.bytes === undefined) continue;
    try {
      const [low, high] = weightRange(entry.weight);
      candidates.push({
        family: entry.family.toLowerCase(),
        low,
        high,
        italic: entry.style === 'italic',
        font: parse(entry.bytes),
      });
    } catch {
      // Fonte ilegível (woff2, por exemplo): vale a embutida.
    }
  }
  const fromLibrary = (name: string, weight: number, italic: boolean): Font | null => {
    const same = candidates.filter((c) => c.family === name.toLowerCase());
    const best = [...same].sort(
      (a, b) =>
        Number(b.italic === italic) - Number(a.italic === italic) ||
        gap(weight, a) - gap(weight, b),
    )[0];
    return best?.font ?? null;
  };
  return {
    hasLibraryFonts: candidates.length > 0,
    fontFor(family, weight, italic) {
      const names = familyNames(family);
      for (const name of names) {
        const hit = fromLibrary(name, weight, italic);
        if (hit !== null) return hit;
        if (MONO_FAMILY.test(name)) {
          const b = builtinFonts();
          return weight >= BOLD_FROM ? b.monoBold : b.mono;
        }
      }
      const b = builtinFonts();
      return weight >= BOLD_FROM ? b.sansBold : b.sans;
    },
  };
}

/** Largura de um texto de uma linha com a fonte e o espaçamento entre letras. */
export function textWidth(
  book: FontBook,
  text: string,
  font: Pick<MeasureFont, 'family' | 'size' | 'weight' | 'italic' | 'letterSpacing'>,
): number {
  const face = book.fontFor(font.family, font.weight, font.italic);
  const advance = face.getAdvanceWidth(text, font.size, { kerning: true });
  return Math.max(0, advance + font.letterSpacing * [...text].length);
}

const measurers = new WeakMap<FontBook, TextMeasurer>();

/** O `TextMeasurer` do servidor, sobre um leitor de fontes (o mesmo para o mesmo leitor). */
export function measurerFor(book: FontBook): TextMeasurer {
  let measure = measurers.get(book);
  if (measure === undefined) {
    measure = (text, font, maxWidth) =>
      measureLines(text, font, maxWidth, (value) => textWidth(book, value, font));
    measurers.set(book, measure);
  }
  return measure;
}

/** Medidor com a fonte embutida e, se houver, as `fonts` da biblioteca. */
export function createMeasurer(extra: readonly LoadedFont[] = []): TextMeasurer {
  return measurerFor(createFontBook(extra));
}

let shared: FontBook | undefined;

/** O leitor só com as fontes embutidas (projetos sem `fonts`). */
export function builtinFontBook(): FontBook {
  shared ??= createFontBook();
  return shared;
}
