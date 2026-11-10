// Acha o código de uma mensagem pelo texto pt-BR que o parser montou: as entradas sem parâmetro
// pelo texto exato; as com parâmetro por um padrão montado do modelo (o texto fixo escapado e
// cada `{nome}` um grupo). Os parsers do componente, dos ícones e das origens (etapa #1263, MB4)
// montam o texto uma vez e o código sai daqui, então o texto devolvido não muda. Sem DOM.

import { componentMessages } from './component';
import { iconsFileMessages } from './icons';
import { originMessages } from './origins';

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

/** Monta a busca de um catálogo; os modelos mais específicos (mais texto fixo) valem primeiro. */
export function textLookup<C extends string>(
  catalog: Readonly<Record<C, string>>,
): (text: string) => CodeHit<C> | undefined {
  const entries = Object.entries(catalog) as [C, string][];
  const byText = new Map<string, C>(
    entries.filter(([, text]) => !hasParams(text)).map(([code, text]) => [text, code]),
  );
  const patterns = entries
    .filter(([, text]) => hasParams(text))
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
export const originCodeForText = textLookup<OriginMessageCode>(originMessages);
