import type { ComponentChildren } from 'preact';
import { t } from '../i18n';

// PropertyGrid do DS 2.0: rótulo à esquerda (coluna `--size-label-col`) e controle à
// direita; no celular o rótulo fica acima do campo. Os estados vêm dos controles.

export function PropertyGrid({ children }: { readonly children: ComponentChildren }) {
  return <div class="props">{children}</div>;
}

interface PropertyProps {
  readonly label: ComponentChildren;
  /** `id` do controle: o rótulo vira `<label for>` (clicar nele foca o campo). */
  readonly for?: string;
  readonly required?: boolean;
  /** Descrição do campo, no `title` do rótulo. */
  readonly hint?: string;
  /** Erro de uma edição recusada, abaixo do controle (anunciado). */
  readonly error?: string | null;
  /** Pendência do valor gravado (ex.: obrigatório vazio), abaixo do controle. */
  readonly issue?: string | null;
  /** Texto de apoio abaixo do controle. */
  readonly note?: ComponentChildren;
  /** Alvo do link de uma pendência (`data-focus`). */
  readonly focusKey?: string;
  readonly children: ComponentChildren;
}

/** Uma linha da grade: rótulo e controle (com erro e nota embaixo). */
export function Property({
  label,
  for: htmlFor,
  required,
  hint,
  error,
  issue,
  note,
  focusKey,
  children,
}: PropertyProps) {
  const text = (
    <>
      {label}
      {required && (
        <span
          class="required"
          title={t('typed.required')}
          aria-label={t('typed.required')}
        >
          {' *'}
        </span>
      )}
    </>
  );
  return (
    <>
      {htmlFor ? (
        <label class="props-label" for={htmlFor} title={hint}>
          {text}
        </label>
      ) : (
        <span class="props-label" title={hint}>
          {text}
        </span>
      )}
      <div class="props-value" data-focus={focusKey}>
        {children}
        {error && (
          <p class="field-error" role="alert">
            {error}
          </p>
        )}
        {issue && !error && <p class="field-error">{issue}</p>}
        {note && <small class="muted props-note">{note}</small>}
      </div>
    </>
  );
}
