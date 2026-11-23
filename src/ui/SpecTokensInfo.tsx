import { t } from '../i18n';
import type { Spec } from '../model';

// The library's design in the Specializations window (decision 16 of the "faithful components"
// stage): the modes, the tokens (with the value of each mode) and the icon set file. Read-only.

type TokenEntry = readonly [string, unknown];

/** "light #1a73e8 · dark #8ab4f8" for a per-mode value; the value itself when it holds in all. */
function valueText(value: unknown, modes: readonly string[]): string {
  if (typeof value !== 'object' || value === null) return String(value);
  const record = value as Readonly<Record<string, unknown>>;
  const perMode = modes.filter((mode) => record[mode] !== undefined);
  if (perMode.length === 0) return JSON.stringify(value);
  return perMode.map((mode) => `${mode} ${String(record[mode])}`).join(' · ');
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
          <span>{(tokens.modes ?? []).join(', ')}</span>
          {entries.length > 0 && (
            <dl class="spec-design-tokens">
              {entries.map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd class="muted">{valueText(value, tokens.modes ?? [])}</dd>
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
