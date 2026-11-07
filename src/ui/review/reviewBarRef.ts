import type { PlaceLimit } from '../Popover';

// A barra da revisão (`ReviewBar`) se registra aqui, para o popover das mudanças saber até
// onde pode subir (etapa #676, decisão 5): ele não cobre a barra. Sem consulta global ao DOM.

export const reviewBarRef: { current: HTMLElement | null } = { current: null };

/** A área abaixo da barra da revisão; `null` se a barra não está na tela. */
export function belowReviewBar(): PlaceLimit | null {
  const bar = reviewBarRef.current;
  return bar ? { top: bar.getBoundingClientRect().bottom } : null;
}
