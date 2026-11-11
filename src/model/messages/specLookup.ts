import { specMessages } from './spec';

// Acha o código de uma mensagem da especialização pelo texto pt-BR que o `parseSpec` já tem:
// as entradas sem parâmetro pelo texto exato; as com parâmetro por um padrão montado do modelo
// (usado só onde o zod monta o texto, como as funções `error` dos enums). Sem DOM.

export type SpecMessageCode = Exclude<keyof typeof specMessages, `spec.zod.${string}`>;

export interface SpecCodeHit {
  readonly code: SpecMessageCode;
  readonly params?: Readonly<Record<string, string>>;
}

const entries = (Object.entries(specMessages) as [string, string][]).filter(
  ([code]) => !code.startsWith('spec.zod.'),
) as [SpecMessageCode, string][];

const PLACEHOLDER = /\{(\w+)\}/g;
const hasParams = (text: string): boolean => /\{\w+\}/.test(text);

const BY_TEXT = new Map<string, SpecMessageCode>(
  entries.filter(([, text]) => !hasParams(text)).map(([code, text]) => [text, code]),
);

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

/** O modelo com `{nome}` como grupo nomeado; os modelos mais específicos (mais texto fixo) primeiro. */
const PATTERNS = entries
  .filter(([, text]) => hasParams(text))
  .map(([code, text]) => ({
    code,
    fixed: text.replace(PLACEHOLDER, '').length,
    re: patternOf(text),
  }))
  .sort((a, b) => b.fixed - a.fixed);

export function specCodeForText(text: string): SpecCodeHit | undefined {
  const code = BY_TEXT.get(text);
  if (code !== undefined) return { code };
  for (const pattern of PATTERNS) {
    const groups = pattern.re.exec(text)?.groups;
    if (groups !== undefined) return { code: pattern.code, params: { ...groups } };
  }
  return undefined;
}
