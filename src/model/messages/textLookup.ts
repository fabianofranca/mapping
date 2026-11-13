// Acha o código de uma mensagem pelo texto pt-BR que o parser montou: as entradas sem parâmetro
// pelo texto exato; as com parâmetro por um padrão montado do modelo (o texto fixo escapado e
// cada `{nome}` um grupo). Os parsers do componente e dos ícones (etapa #1263, MB4) montam o texto
// uma vez e o código sai daqui, então o texto devolvido não muda. A especialização usa o padrão só
// nos códigos de `SPEC_PATTERN_CODES` (os textos que o zod monta com o valor recebido) e as origens
// só o texto exato; o resto sai com o código no emissor. Sem DOM.

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

/** O modelo vira um regex: o texto fixo escapado e cada `{nome}` um grupo nomeado. */
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
  /** Os únicos códigos achados por padrão; sem isso, todo modelo com parâmetro vale. */
  readonly patterns?: readonly C[];
}

/**
 * Monta a busca de um catálogo: o texto exato dos modelos sem parâmetro e o padrão dos com
 * parâmetro (todos, ou só os de `patterns`); os modelos mais específicos (mais texto fixo) valem
 * primeiro.
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
 * As origens (`origin.ts`) acham o código só pelo texto exato (`patterns: []`): o texto de um
 * problema com valor do usuário (chave, âncora, nome de exemplo, caminho) sai com o código no
 * emissor (`codedProblem`), porque um padrão lido de volta no texto pode casar errado quando o
 * valor traz o texto fixo do modelo (`x: y`, `a; use b`).
 */
export const originCodeForText = textLookup<OriginMessageCode>(originMessages, {
  patterns: [],
});

export type SpecMessageCode = Exclude<keyof typeof specMessages, `spec.zod.${string}`>;

/**
 * Os únicos códigos da especialização achados por padrão: o zod monta o texto deles com o valor
 * recebido (as funções `error` dos enums). Os outros saem com o código no emissor
 * (`specMsg` + `addSpecIssue`) ou, se o texto é constante, pelo texto exato (`known` de
 * `issueCoding`). Mensagem nova com parâmetro em `spec.ts` sai com o código no emissor.
 *
 * Contrato (imposto por `tests/i18n/specMessages.test.ts`, "contrato de SPEC_PATTERN_CODES"):
 * o modelo pt-BR de cada código tem exatamente um `{…}`, e o texto do zod é montado por
 * `specMsg(código, { value })`, então um valor que traz o texto fixo do modelo volta inteiro em
 * `params.value`. Código novo nesta lista entra no mesmo teste.
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

/** O mesmo para os textos constantes da leitura das origens que são do catálogo `spec` (só o texto exato). */
export const originSpecCodeForText = textLookup<SpecMessageCode>(specCatalog, {
  patterns: [],
});
