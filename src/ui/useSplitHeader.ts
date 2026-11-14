import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

// Annotation header on two lines (stage #552, decision 2): when the name field does not fit
// on the line with the rest, it drops whole to the 2nd line and the buttons stay together, on the right,
// on the 1st. The measurement is done here (CSS alone does not separate the field from the buttons that come after it
// when the line wraps) and becomes just the `is-split` class.

let probe: CanvasRenderingContext2D | null | undefined;

/** Width of the text in the field's font, or 0 if the browser does not measure (component tests). */
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

/** Does the header fail to fit, on a single line, the rest of the items and the name field with its whole placeholder? */
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

/** Header ref and whether it is on two lines (`is-split`). Re-measures on every render and every resize. */
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
