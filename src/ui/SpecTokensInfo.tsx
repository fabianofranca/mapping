import { t } from '../i18n';
import type { Spec } from '../model';
import type { TokenValue } from '../model/components/tokens';

// O desenho da biblioteca na janela Especializações (decisão 16 da etapa "componentes fiéis"):
// os modos, os tokens (com o valor de cada modo) e o arquivo do conjunto de ícones. Só leitura.

type TokenEntry = readonly [string, TokenValue | Readonly<Record<string, TokenValue>>];

/** "light #1a73e8 · dark #8ab4f8" para um valor por modo; o próprio valor quando vale em todos. */
function valueText(value: TokenEntry[1], modes: readonly string[]): string {
  if (typeof value !== 'object') return String(value);
  return modes
    .filter((mode) => value[mode] !== undefined)
    .map((mode) => `${mode} ${String(value[mode])}`)
    .join(' · ');
}

export function SpecTokensInfo({ spec }: { readonly spec: Spec }) {
  const { tokens, icons } = spec;
  if (tokens === undefined && icons === undefined) return null;
  const entries: TokenEntry[] = tokens ? Object.entries(tokens.values) : [];
  return (
    <div class="spec-design" role="group" aria-label={t('spec.designTokens')}>
      {tokens && (
        <>
          <small class="muted">{t('spec.designModes')}</small>
          <span>{tokens.modes.join(', ')}</span>
          {entries.length > 0 && (
            <dl class="spec-design-tokens">
              {entries.map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd class="muted">{valueText(value, tokens.modes)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
      {icons !== undefined && (
        <>
          <small class="muted">{t('spec.designIcons')}</small>
          <span>{icons}</span>
        </>
      )}
    </div>
  );
}
