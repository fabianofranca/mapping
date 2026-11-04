import type { ComponentChildren } from 'preact';
import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { HelpTip } from './controls';

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
  /**
   * Explicação do campo: um `HelpTip` ao lado do rótulo (nome "Sobre {rótulo}") e, com
   * `for`, a descrição acessível do controle (`aria-describedby`). Pede `label` em texto.
   */
  readonly hint?: string;
  /** O assunto do `HelpTip` quando o rótulo não é texto simples ("Sobre {hintName}"). */
  readonly hintName?: string;
  /** Erro de uma edição recusada, abaixo do controle (anunciado). */
  readonly error?: string | null;
  /** Pendência do valor gravado (ex.: obrigatório vazio), abaixo do controle. */
  readonly issue?: string | null;
  /** Aviso de estado abaixo do controle (ex.: lista sem opção): fica sempre visível. */
  readonly status?: ComponentChildren;
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

/** Acrescenta (ou tira) um `id` em `aria-describedby` do controle, sem pisar no que já há. */
function describeControl(
  root: HTMLElement | null,
  controlId: string,
  descriptionId: string,
): () => void {
  const control = [...(root?.querySelectorAll<HTMLElement>('[id]') ?? [])].find(
    (el) => el.id === controlId,
  );
  if (!control) return () => undefined;
  const ids = (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.includes(descriptionId)) {
    control.setAttribute('aria-describedby', [...ids, descriptionId].join(' '));
  }
  return () => {
    const rest = (control.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== descriptionId);
    if (rest.length > 0) control.setAttribute('aria-describedby', rest.join(' '));
    else control.removeAttribute('aria-describedby');
  };
}

/** Texto do rótulo (como texto simples, para o nome do `HelpTip`). */
function plainLabel(label: ComponentChildren): string {
  return typeof label === 'string' || typeof label === 'number' ? String(label) : '';
}

interface LabelProps {
  readonly label: ComponentChildren;
  readonly htmlFor?: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly hintName?: string;
  readonly descriptionId: string;
  readonly mark?: ComponentChildren;
}

/** A célula do rótulo: o texto, o `HelpTip` da explicação e o marcador da revisão. */
function LabelCell({
  label,
  htmlFor,
  required,
  hint,
  hintName,
  descriptionId,
  mark,
}: LabelProps) {
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
    <label class="props-label" for={htmlFor}>
      {text}
    </label>
  ) : (
    <span class="props-label">{text}</span>
  );
  const marked = mark !== undefined && mark !== null && mark !== false;
  if (!hint && !marked) return labelCell;
  return (
    <div class="props-label-cell">
      {labelCell}
      {hint && (
        <HelpTip
          name={hintName ?? plainLabel(label)}
          text={hint}
          descriptionId={descriptionId}
        />
      )}
      {mark}
    </div>
  );
}

/** Uma linha da grade: rótulo e controle (com erro e aviso embaixo). */
export function Property({
  label,
  for: htmlFor,
  required,
  hint,
  hintName,
  error,
  issue,
  status,
  focusKey,
  mark,
  below,
  children,
}: PropertyProps) {
  const descriptionId = useId();
  const valueRef = useRef<HTMLDivElement>(null);
  const described = htmlFor !== undefined && hint !== undefined && hint !== '';
  // O controle (de qualquer tipo) ganha a explicação como descrição acessível, sem que
  // cada chamador repita o `aria-describedby`.
  useLayoutEffect(() => {
    if (!described) return undefined;
    return describeControl(valueRef.current, htmlFor, descriptionId);
  });
  return (
    <>
      <LabelCell
        label={label}
        htmlFor={htmlFor}
        required={required}
        hint={hint || undefined}
        hintName={hintName}
        descriptionId={descriptionId}
        mark={mark}
      />
      <div class="props-value" data-focus={focusKey} ref={valueRef}>
        {children}
        {error && (
          <p class="field-error" role="alert">
            {error}
          </p>
        )}
        {issue && !error && <p class="field-error">{issue}</p>}
        {status && <small class="props-status">{status}</small>}
        {below}
      </div>
    </>
  );
}
