import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { classes } from './controls/classes';
import { IconButton, Tooltip } from './controls';
import { Icon, type IconName } from './icons';

// Aviso em caixa (Notice do DS 2.0), com as variantes da revisão de propostas
// (HANDOFF-PROPOSALS 2.2): `info` (fundo `color-selection`, ícone no acento) para a
// proposta nova e as dependências, e `sm` para os avisos compactos dentro das janelas
// (item trancado, aplicar bloqueado), e `line` para o aviso de uma linha só (ícone, texto
// curto com reticências e a frase completa na dica, ação e X). O texto curto `.notice` das
// sobreposições do canvas continua como está.

export type NoticeTone = 'info' | 'warning' | 'error' | 'success';

const ICONS: Readonly<Record<NoticeTone, IconName>> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  success: 'check',
};

interface NoticeProps {
  readonly tone: NoticeTone;
  /** Compacto (dentro das janelas): padding e texto menores. */
  readonly size?: 'md' | 'sm' | 'line';
  /**
   * Só em `line`: a frase completa. Vai na dica do texto curto e, escondida, no aviso,
   * para o leitor de tela.
   */
  readonly hint?: string;
  readonly title?: string;
  readonly icon?: IconName;
  readonly children?: ComponentChildren;
  /** Botões de ação, à direita (ou embaixo, no compacto). */
  readonly actions?: ComponentChildren;
  /** Mostra o "fechar" do aviso. */
  readonly onDismiss?: () => void;
  readonly role?: 'status' | 'alert';
  readonly class?: string;
}

function LineBody({ hint, children }: Pick<NoticeProps, 'hint' | 'children'>) {
  const text = <span class="notice-box-text">{children}</span>;
  return (
    <>
      {hint ? <Tooltip label={hint}>{text}</Tooltip> : text}
      {hint && <span class="visually-hidden">{hint}</span>}
    </>
  );
}

export function Notice({
  tone,
  size = 'md',
  hint,
  title,
  icon,
  children,
  actions,
  onDismiss,
  role = tone === 'error' ? 'alert' : 'status',
  class: extra,
}: NoticeProps) {
  const line = size === 'line';
  return (
    <div
      class={classes(
        'notice-box',
        `notice-box-${tone}`,
        size === 'sm' && 'notice-box-sm',
        line && 'notice-box-line',
        extra,
      )}
      role={role}
    >
      <span class="notice-box-icon" aria-hidden="true">
        <Icon name={icon ?? ICONS[tone]} />
      </span>
      {line ? (
        <LineBody hint={hint}>{children}</LineBody>
      ) : (
        <div class="notice-box-body">
          {title && <span class="notice-box-title">{title}</span>}
          {children}
          {actions && size === 'sm' && <div class="notice-box-actions">{actions}</div>}
        </div>
      )}
      {actions && size !== 'sm' && <div class="notice-box-actions">{actions}</div>}
      {onDismiss && (
        <IconButton
          icon="close"
          size="sm"
          label={t('editor.dismiss')}
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
