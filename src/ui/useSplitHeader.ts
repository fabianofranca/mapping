import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

// Cabeçalho da anotação em duas linhas (etapa #552, decisão 2): quando o campo do nome não cabe
// na linha com o resto, ele desce inteiro para a 2ª linha e os botões ficam juntos, à direita,
// na 1ª. A medida é feita aqui (o CSS sozinho não separa o campo dos botões que vêm depois dele
// ao quebrar a linha) e vira só a classe `is-split`.

let probe: CanvasRenderingContext2D | null | undefined;

/** Largura do texto na fonte do campo, ou 0 se o navegador não mede (testes de componente). */
function textWidth(text: string, font: string): number {
  if (probe === undefined) {
    try {
      probe = document.createElement('canvas').getContext('2d');
    } catch {
      probe = null;
    }
  }
  if (!probe) return 0;
  probe.font = font;
  return probe.measureText(text).width;
}

function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

/** O cabeçalho não comporta, numa linha só, o resto dos itens e o campo do nome com o placeholder inteiro? */
export function headerNeedsSplit(header: HTMLElement): boolean {
  const name = header.querySelector<HTMLInputElement>(':scope > input');
  if (!name) return false;
  const style = getComputedStyle(header);
  const nameStyle = getComputedStyle(name);
  const items = [...header.children]
    .flatMap((c) =>
      c.classList.contains('annotation-header-actions') ? [...c.children] : [c],
    )
    .filter((c) => c !== name && c.getClientRects().length > 0);
  const gap = px(style.columnGap);
  const used = items.reduce((sum, c) => sum + c.getBoundingClientRect().width + gap, 0);
  const chrome =
    px(nameStyle.paddingLeft) +
    px(nameStyle.paddingRight) +
    px(nameStyle.borderLeftWidth) +
    px(nameStyle.borderRightWidth);
  const wanted = Math.max(
    px(style.getPropertyValue('--size-grid-col-min')),
    textWidth(name.placeholder, nameStyle.font) + chrome,
  );
  return used + wanted > header.clientWidth + 0.5;
}

/** Ref do cabeçalho e se ele está em duas linhas (`is-split`). Re-mede a cada render e a cada redimensionamento. */
export function useSplitHeader(): {
  readonly ref: RefObject<HTMLDivElement>;
  readonly split: boolean;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);
  const measure = useRef(() => {});
  measure.current = () => {
    const el = ref.current;
    if (el) setSplit(headerNeedsSplit(el));
  };
  useLayoutEffect(() => measure.current());
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure.current());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, split };
}
