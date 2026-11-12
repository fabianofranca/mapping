// O que o valor de `code.<plataforma>.params` pode dizer (formatVersion 16; etapa #1079): um nome
// de parâmetro (`text`), um caminho (`colors.containerColor`: o argumento `containerColor` da
// fábrica de `calls.colors`) ou um posicional (`#0`: o primeiro argumento sem nome). Numa
// especialização anterior à 16 o valor é um texto opaco (nome de parâmetro, de campo JSON…): quem
// interpreta confere a versão antes (`interpretsParamTargets`). Função pura, sem navegador.

/** A versão da especialização a partir da qual o valor de `params` é interpretado. */
export const PARAM_TARGETS_FORMAT_VERSION = 16;

export type ParamTarget =
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'path'; readonly call: string; readonly name: string }
  | { readonly kind: 'position'; readonly position: number };

const POSITION_RE = /^#(\d+)$/;

/** Interpreta o valor de um `params` (só vale em `formatVersion` 16 ou mais). */
export function paramTarget(value: string): ParamTarget {
  const position = POSITION_RE.exec(value);
  if (position?.[1] !== undefined)
    return { kind: 'position', position: Number(position[1]) };
  const dot = value.indexOf('.');
  if (dot > 0 && dot < value.length - 1) {
    return { kind: 'path', call: value.slice(0, dot), name: value.slice(dot + 1) };
  }
  return { kind: 'name', name: value };
}

/** A especialização desta versão interpreta caminho e posicional nos `params`? */
export function interpretsParamTargets(formatVersion: number): boolean {
  return formatVersion >= PARAM_TARGETS_FORMAT_VERSION;
}

/** O molde (`{value}.dp`) com o valor posto; o valor entra como texto. */
export const FORMAT_PLACEHOLDER = '{value}';

export function applyFormat(template: string, value: string | number | boolean): string {
  return template.split(FORMAT_PLACEHOLDER).join(String(value));
}
