import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { DisplayImage } from '../../store/displayImages';
import { Segmented } from '../controls';
import { Icon } from '../icons';

// Before/after comparison of a replaced image (HANDOFF-PROPOSALS 2.1, ImageCompare): side by side,
// slide (default) and overlay. The handle is a `role="slider"` (← → move it; in Slide mode the
// handle measures the crop of the before, so Home shows only the after and End only the before; in
// Overlay it measures the after, so Home shows only the before and End only the after). The bitmaps
// are the display ones, drawn in `<canvas>` (no URL or request: works on `file://` and with the
// CSP).

export type CompareMode = 'side' | 'slide' | 'overlay';

/** Step of the arrow keys on the handle (percentage). */
const STEP = 5;

/** The handle follows the divider but stays fully inside the area, also at 0% and 100%. */
function gripLeft(value: number): string {
  const half = 'calc(var(--control-height) / 2)';
  return `clamp(${half}, ${value}%, calc(100% - ${half}))`;
}

function BitmapCanvas({
  image,
  label,
}: {
  readonly image: DisplayImage<ImageBitmap> | undefined;
  readonly label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bitmap = image?.status === 'ready' ? image.bitmap : null;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !bitmap) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      // No 2D canvas (test environment): the reserved space stays.
    }
    ctx?.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  if (!bitmap) {
    return (
      <div class="image-compare-missing" role="img" aria-label={label}>
        {image?.status === 'loading' ? t('app.loading') : t('review.compare.unavailable')}
      </div>
    );
  }
  return <canvas ref={ref} class="image-compare-canvas" role="img" aria-label={label} />;
}

interface ImageCompareProps {
  readonly before: DisplayImage<ImageBitmap> | undefined;
  readonly after: DisplayImage<ImageBitmap> | undefined;
  /** File name of each side (always in view). */
  readonly beforeName: string;
  readonly afterName: string;
  readonly initialMode?: CompareMode;
}

export function ImageCompare({
  before,
  after,
  beforeName,
  afterName,
  initialMode = 'slide',
}: ImageCompareProps) {
  const [mode, setMode] = useState<CompareMode>(initialMode);
  const [value, setValue] = useState(50);
  const stage = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  const onKeyDown = (e: KeyboardEvent) => {
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - STEP;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + STEP;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    setValue(clamp(next));
  };

  /** Dragging the handle (or tapping the image) moves the divider to the pointer. */
  const onPointerDown = (e: PointerEvent) => {
    const el = stage.current;
    if (!el || mode === 'side') return;
    const box = el.getBoundingClientRect();
    const at = (x: number) => clamp(((x - box.left) / Math.max(1, box.width)) * 100);
    setValue(at(e.clientX));
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // No capture: the drag ends on leaving the image.
    }
    const move = (m: PointerEvent) => setValue(at(m.clientX));
    const stop = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointercancel', stop);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
  };

  const beforeLabel = t('review.compare.before', { name: beforeName });
  const afterLabel = t('review.compare.after', { name: afterName });

  return (
    <div class="image-compare">
      <Segmented
        label={t('review.compare.mode')}
        value={mode}
        onSelect={setMode}
        items={[
          { id: 'side', label: t('review.compare.side') },
          { id: 'slide', label: t('review.compare.slide') },
          { id: 'overlay', label: t('review.compare.overlay') },
        ]}
      />
      {mode === 'side' ? (
        <div class="image-compare-side">
          <figure>
            <BitmapCanvas image={before} label={beforeLabel} />
            <figcaption>
              <span class="image-compare-tag">{t('review.compare.beforeTag')}</span>
              {beforeName}
            </figcaption>
          </figure>
          <figure>
            <BitmapCanvas image={after} label={afterLabel} />
            <figcaption>
              <span class="image-compare-tag">{t('review.compare.afterTag')}</span>
              {afterName}
            </figcaption>
          </figure>
        </div>
      ) : (
        <div ref={stage} class="image-compare-stage" onPointerDown={onPointerDown}>
          <div class="image-compare-layer">
            <BitmapCanvas image={after} label={afterLabel} />
          </div>
          <div
            class="image-compare-layer image-compare-before"
            style={
              mode === 'slide'
                ? { clipPath: `inset(0 ${100 - value}% 0 0)` }
                : { opacity: String(1 - value / 100) }
            }
          >
            <BitmapCanvas image={before} label={beforeLabel} />
          </div>
          <span class="image-compare-tag image-compare-tag-start">
            {t('review.compare.beforeTag')}
          </span>
          <span class="image-compare-tag image-compare-tag-end">
            {t('review.compare.afterTag')}
          </span>
          {mode === 'slide' && (
            <span class="image-compare-line" style={{ left: `${value}%` }} />
          )}
          <span
            class="image-compare-grip"
            style={{ left: mode === 'slide' ? gripLeft(value) : '50%' }}
            role="slider"
            tabIndex={0}
            aria-label={t(
              mode === 'slide' ? 'review.compare.handle' : 'review.compare.blend',
            )}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-valuetext={t(
              mode === 'slide'
                ? 'review.compare.valueTextBefore'
                : 'review.compare.valueText',
              { value },
            )}
            onKeyDown={onKeyDown}
          >
            <Icon name="compare" />
          </span>
        </div>
      )}
      {mode !== 'side' && (
        <p class="muted image-compare-names">
          {t('review.compare.names', { before: beforeName, after: afterName })}
        </p>
      )}
    </div>
  );
}
