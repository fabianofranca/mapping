// What the value of `code.<platform>.params` can say (formatVersion 16; stage #1079): a parameter
// name (`text`), a path (`colors.containerColor`: the `containerColor` argument of the factory of
// `calls.colors`) or a positional one (`#0`: the first unnamed argument). In a specialization
// older than 16 the value is opaque text (parameter name, JSON field name...): whoever interprets
// it checks the version first (`interpretsParamTargets`). Pure function, no browser.

/** The specialization version from which the value of `params` is interpreted. */
export const PARAM_TARGETS_FORMAT_VERSION = 16;

export type ParamTarget =
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'path'; readonly call: string; readonly name: string }
  | { readonly kind: 'position'; readonly position: number };

const POSITION_RE = /^#(\d+)$/;

/** Interprets the value of a `params` (only valid in `formatVersion` 16 or later). */
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

/** Does the specialization of this version interpret path and positional in `params`? */
export function interpretsParamTargets(formatVersion: number): boolean {
  return formatVersion >= PARAM_TARGETS_FORMAT_VERSION;
}

/** The template (`{value}.dp`) with the value filled in; the value goes in as text. */
export const FORMAT_PLACEHOLDER = '{value}';

export function applyFormat(template: string, value: string | number | boolean): string {
  return template.split(FORMAT_PLACEHOLDER).join(String(value));
}
