// O opentype.js 2 não traz tipos: só o que o medidor e o rasterizador do servidor usam.
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
  export interface Font {
    readonly unitsPerEm: number;
    readonly ascender: number;
    readonly descender: number;
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
