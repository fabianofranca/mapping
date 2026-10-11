import { t } from '../i18n';
import { BREAKPOINTS, NARROW_QUERY } from '../theme/breakpoints';
import { useMediaQuery } from '../ui/useMediaQuery';

/** `true` enquanto a janela estiver abaixo da largura mínima da app (só desktop). */
export function useNarrowWindow(): boolean {
  return useMediaQuery(NARROW_QUERY);
}

/**
 * Aviso no lugar da tela quando a janela fica estreita demais. Quem o mostra só esconde
 * o resto (`hidden`), sem desmontar: o projeto continua aberto e gravando, e ao alargar
 * a janela tudo volta como estava.
 */
export function NarrowWindowNotice() {
  return (
    <div class="narrow-window" role="status">
      <h1 class="narrow-window-title">{t('narrow.title')}</h1>
      <p class="muted">{t('narrow.body', { width: BREAKPOINTS.appMin })}</p>
    </div>
  );
}
