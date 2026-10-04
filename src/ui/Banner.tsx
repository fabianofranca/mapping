import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { IconButton } from './controls';

interface BannerProps {
  /** `warning` para avisos permanentes do canal; `info` para novidades. */
  readonly tone: 'warning' | 'info';
  readonly role?: 'note' | 'status';
  readonly class?: string;
  readonly children: ComponentChildren;
  /** Ação ao lado do texto (ex.: "Atualizar"). */
  readonly action?: ComponentChildren;
  /** Com ele, a faixa ganha o botão de dispensar. */
  readonly onDismiss?: () => void;
}

/** Faixa no topo da tela (`mp-banner` do DS 2.0): texto, ação opcional e dispensar. */
export function Banner({
  tone,
  role = 'note',
  class: extra,
  children,
  action,
  onDismiss,
}: BannerProps) {
  return (
    <div class={`banner banner-${tone}${extra ? ` ${extra}` : ''}`} role={role}>
      <span class="banner-text">{children}</span>
      {action}
      {onDismiss && (
        <IconButton icon="close" label={t('editor.dismiss')} onClick={onDismiss} />
      )}
    </div>
  );
}
