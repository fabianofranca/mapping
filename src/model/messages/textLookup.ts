// Finds a message's code from the pt-BR text that the parser built: entries without parameters
// by the exact text; those with parameters by a pattern built from the template (the fixed text
// escaped and each `{name}` a group). The component and icon parsers (stage #1263, MB4) build the
// text once and the code comes out of here, so the returned text does not change. The
// specialization uses the pattern only for the codes in `SPEC_PATTERN_CODES` (the texts that zod
// builds with the received value) and the origins only the exact text; the rest comes out with
// the code at the emitter. No DOM.

import { componentMessages } from './component';
import { iconsFileMessages } from './icons';
import { originMessages } from './origins';
import { specMessages } from './spec';

export interface CodeHit<C extends string> {
  readonly code: C;
  readonly params?: Readonly<Record<string, string>>;
}

const PLACEHOLDER = /\{(\w+)\}/g;
const hasParams = (text: string): boolean => /\{\w+\}/.test(text);
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The template becomes a regex: the fixed text escaped and each `{name}` a named group. */
function patternOf(text: string): RegExp {
  let source = '';
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    source += `${escape(text.slice(last, m.index))}(?<${m[1]}>.*?)`;
    last = m.index + m[0].length;
  }
  return new RegExp(`^${source}${escape(text.slice(last))}$`, 's');
}

export interface TextLookupOptions<C extends string> {
  /** The only codes found by pattern; without this, every template with a parameter counts. */
  readonly patterns?: readonly C[];
}

/**
 * Builds the lookup of a catalog: the exact text of the templates without parameters and the
 * pattern of those with parameters (all of them, or only those in `patterns`); the more specific
 * templates (more fixed text) win first.
 */
export function textLookup<C extends string>(
  catalog: Readonly<Record<C, string>>,
  options: TextLookupOptions<C> = {},
): (text: string) => CodeHit<C> | undefined {
  const entries = Object.entries(catalog) as [C, string][];
  const allowed = options.patterns === undefined ? null : new Set<C>(options.patterns);
  const byText = new Map<string, C>(
    entries.filter(([, text]) => !hasParams(text)).map(([code, text]) => [text, code]),
  );
  const patterns = entries
    .filter(([code, text]) => hasParams(text) && (allowed === null || allowed.has(code)))
    .map(([code, text]) => ({
      code,
      fixed: text.replace(PLACEHOLDER, '').length,
      re: patternOf(text),
    }))
    .sort((a, b) => b.fixed - a.fixed);
  return (text) => {
    const exact = byText.get(text);
    if (exact !== undefined) return { code: exact };
    for (const pattern of patterns) {
      const groups = pattern.re.exec(text)?.groups;
      if (groups !== undefined) return { code: pattern.code, params: { ...groups } };
    }
    return undefined;
  };
}

export type ComponentMessageCode = keyof typeof componentMessages;
export type IconsFileMessageCode = keyof typeof iconsFileMessages;
export type OriginMessageCode = keyof typeof originMessages;

export const componentCodeForText = textLookup<ComponentMessageCode>(componentMessages);
export const iconsFileCodeForText = textLookup<IconsFileMessageCode>(iconsFileMessages);
/**
 * The origins (`origin.ts`) find the code by the exact text only (`patterns: []`): the text of a
 * problem with a user value (key, anchor, example name, path) comes out with the code at the
 * emitter (`codedProblem`), because a pattern read back from the text can match wrongly when the
 * value carries the template's fixed text (`x: y`, `a; use b`).
 */
export const originCodeForText = textLookup<OriginMessageCode>(originMessages, {
  patterns: [],
});

export type SpecMessageCode = Exclude<keyof typeof specMessages, `spec.zod.${string}`>;

/**
 * The only specialization codes found by pattern: zod builds their text with the received value
 * (the enums' `error` functions). The others come out with the code at the emitter
 * (`specMsg` + `addSpecIssue`) or, if the text is constant, by the exact text (`known` of
 * `issueCoding`). A new message with a parameter in `spec.ts` comes out with the code at the
 * emitter.
 *
 * Contract (enforced by `tests/i18n/specMessages.test.ts`, "SPEC_PATTERN_CODES contract"):
 * each code's pt-BR template has exactly one `{…}`, and the zod text is built by
 * `specMsg(code, { value })`, so a value that carries the template's fixed text comes back whole
 * in `params.value`. A new code in this list goes into the same test.
 */
export const SPEC_PATTERN_CODES: readonly SpecMessageCode[] = [
  'spec.fieldTypeInvalid',
  'spec.noticeKindInvalid',
  'spec.appliesToInvalid',
];

const specCatalog = Object.fromEntries(
  Object.entries(specMessages).filter(([code]) => !code.startsWith('spec.zod.')),
) as Readonly<Record<SpecMessageCode, string>>;

export const specCodeForText = textLookup<SpecMessageCode>(specCatalog, {
  patterns: SPEC_PATTERN_CODES,
});

/** The same for the constant texts of the origins reading that belong to the `spec` catalog (exact text only). */
export const originSpecCodeForText = textLookup<SpecMessageCode>(specCatalog, {
  patterns: [],
});
