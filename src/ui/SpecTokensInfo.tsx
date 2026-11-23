import { t } from '../i18n';
import { drawingAxesOf, type Spec } from '../model';

// The library's design in the Specializations window (decision 16 of the "faithful components"
// stage): the modes, the tokens (with the value of each mode) and the icon set file. Read-only.

type Obj = Readonly<Record<string, unknown>>;

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** One scalar or per-axis value in the default selection: a literal, `→ target` for an alias, the default entry of an axis. */
function scalarText(
  value: unknown,
  axes: ReadonlyMap<string, readonly string[]>,
): string {
  if (!isObj(value)) return String(value);
  if (typeof value.$token === 'string') return `→ ${value.$token}`;
  if (typeof value.$axis === 'string') {
    const entry = axes.get(value.$axis)?.[0];
    return entry !== undefined && value[entry] !== undefined
      ? scalarText(value[entry], axes)
      : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

/** "light #1a73e8 · dark #8ab4f8" for a legacy per-mode value; fields for a composite; else the scalar. */
function valueText(
  value: unknown,
  modes: readonly string[],
  axes: ReadonlyMap<string, readonly string[]>,
): string {
  if (
    !isObj(value) ||
    typeof value.$token === 'string' ||
    typeof value.$axis === 'string'
  ) {
    return scalarText(value, axes);
  }
  const perMode = modes.filter((mode) => value[mode] !== undefined);
  if (perMode.length > 0) {
    return perMode.map((mode) => `${mode} ${scalarText(value[mode], axes)}`).join(' · ');
  }
  return Object.entries(value)
    .map(([field, v]) => `${field} ${scalarText(v, axes)}`)
    .join(' · ');
}

/** A token entry split into its value and metadata (`$value`, `$description`, `$group`, `$notices`). */
function splitEntry(entry: unknown): {
  value: unknown;
  description?: string;
  group?: string;
  notices: readonly string[];
} {
  if (!isObj(entry) || !('$value' in entry)) return { value: entry, notices: [] };
  const notices = Array.isArray(entry.$notices)
    ? entry.$notices.flatMap((n: unknown) =>
        isObj(n) && typeof n.kind === 'string' ? [n.kind] : [],
      )
    : [];
  return {
    value: entry.$value,
    description: typeof entry.$description === 'string' ? entry.$description : undefined,
    group: typeof entry.$group === 'string' ? entry.$group : undefined,
    notices,
  };
}

export function SpecTokensInfo({ spec }: { readonly spec: Spec }) {
  const { tokens, icons } = spec;
  if (tokens === undefined && icons === undefined) return null;
  const axes = drawingAxesOf([tokens]);
  const entries = tokens ? Object.entries(tokens.values) : [];
  return (
    <div class="spec-design" role="group" aria-label={t('spec.designTokens')}>
      {tokens && (
        <>
          <small class="muted">{t('spec.designModes')}</small>
          {[...axes].map(([axis, list]) => (
            <span key={axis}>
              {tokens.axes ? `${axis}: ${list.join(', ')}` : list.join(', ')}
            </span>
          ))}
          {entries.length > 0 && (
            <dl class="spec-design-tokens">
              {entries.map(([name, entry]) => {
                const { value, description, group, notices } = splitEntry(entry);
                return (
                  <div key={name}>
                    <dt>
                      {name}
                      {notices.map((kind) => (
                        <span key={kind} class="badge">
                          {kind}
                        </span>
                      ))}
                    </dt>
                    <dd class="muted">{valueText(value, tokens.modes ?? [], axes)}</dd>
                    {description !== undefined && <dd class="muted">{description}</dd>}
                    {group !== undefined && <dd class="muted">{group}</dd>}
                  </div>
                );
              })}
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
