import { useEffect, useRef } from 'preact/hooks';

const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 72;

/** Miniatura desenhada a partir do bitmap de exibição. */
export function ImageThumb({ bitmap }: { readonly bitmap: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = globalThis.devicePixelRatio || 1;
    canvas.width = THUMB_WIDTH * ratio;
    canvas.height = THUMB_HEIGHT * ratio;
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }, [bitmap]);

  return <canvas ref={ref} class="thumb" aria-hidden="true" />;
}
