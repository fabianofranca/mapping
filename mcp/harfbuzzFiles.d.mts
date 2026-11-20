export declare const harfbuzzSourceFilter: RegExp;
export declare function patchHarfBuzzWrapper(source: string): string;
export declare function patchHarfBuzzGlue(source: string): string;
export declare function patchHarfBuzzSource(
  path: string,
  source: string,
  options: { readonly cjs: boolean },
): string | null;
