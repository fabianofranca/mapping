// opentype.js 2 ships no types: only what the server's measurer and rasterizer use.
declare module 'opentype.js' {
  export interface PathCommand {
    readonly type: 'M' | 'L' | 'C' | 'Q' | 'Z';
    readonly x?: number;
    readonly y?: number;
    readonly x1?: number;
    readonly y1?: number;
    readonly x2?: number;
    readonly y2?: number;
  }
  export interface Path {
    readonly commands: readonly PathCommand[];
  }
  export interface GlyphOptions {
    readonly kerning?: boolean;
    readonly letterSpacing?: number;
  }
  export interface Glyph {
    /** 0 = `.notdef` (the font does not have the character). */
    readonly index: number;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  }
  export interface Font {
    readonly unitsPerEm: number;
    readonly ascender: number;
    readonly descender: number;
    /** Tables read; `os2.sCapHeight` only exists in version 2 or later of the table. */
    readonly tables?: { readonly os2?: { readonly sCapHeight?: number } };
    charToGlyph(char: string): Glyph;
    getAdvanceWidth(text: string, fontSize: number, options?: GlyphOptions): number;
    getPath(
      text: string,
      x: number,
      y: number,
      fontSize: number,
      options?: GlyphOptions,
    ): Path;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
