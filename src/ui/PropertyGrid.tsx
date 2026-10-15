import type { ComponentChildren } from 'preact';
import { t } from '../i18n';

// PropertyGrid do DS 2.0: rótulo à esquerda (coluna `--size-label-col`) e controle à
// direita. Os estados vêm dos controles.

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
  /**
   * Peça no fim da coluna do rótulo (o marcador da revisão, pelo ponto de extensão dos
   * Detalhes). Com ela o rótulo fica numa célula própria: um botão não pode ir dentro do
   * `<label>`.
   */
  readonly mark?: ComponentChildren;
  /** Linha embaixo do controle (a nota da mudança, na revisão), pelo ponto de extensão. */
  readonly below?: ComponentChildren;
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
  mark,
  below,
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
  const labelCell = htmlFor ? (
    <label class="props-label" for={htmlFor} title={hint}>
      {text}
    </label>
  ) : (
    <span class="props-label" title={hint}>
      {text}
    </span>
  );
  const marked = mark !== undefined && mark !== null && mark !== false;
  return (
    <>
      {marked ? (
        <div class="props-label-cell">
          {labelCell}
          {mark}
        </div>
      ) : (
        labelCell
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
        {below}
      </div>
    </>
  );
}
