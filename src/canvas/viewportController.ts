// Canvas viewport: container size, pan, zoom, fit and center.
// The math lives in `viewport.ts` (pure); the signals and the DOM live here.
import { batch, signal } from '@preact/signals';
import type { Project, Rect } from '../model';
import { ARRIVAL_FIT_EXTRA } from './arrivals';
import { imagesBounds } from './imageGeometry';
import {
  EMPTY_CANVAS_RECT,
  FIT_PADDING,
  centerOn,
  fitRect,
  keepCenter,
  panBy,
  pinch,
  revealRect,
  screenToCanvas,
  zoomAt,
  type Point,
  type Size,
  type Viewport,
} from './viewport';

export class ViewportController {
  readonly viewport = signal<Viewport>({ x: 0, y: 0, scale: 1 });
  readonly size = signal<Size>({ width: 0, height: 0 });
  private readonly container: HTMLElement;
  /** What to fit: the images and markings on the project's canvas (read without subscribing). */
  private readonly content: () =>
    | (Pick<Project, 'containers' | 'markings'> & Partial<Pick<Project, 'arrivals'>>)
    | null;
  /** Already fitted the first time the container had a size. */
  private fitted = false;
  /** Last size with width and height above zero (the 0 of the small-window notice does not count). */
  private lastSize: Size | null = null;
  /** How many times it fitted; the canvas publishes it on the container for the e2e tests. */
  fits = 0;

  constructor(
    container: HTMLElement,
    content: () =>
      | (Pick<Project, 'containers' | 'markings'> & Partial<Pick<Project, 'arrivals'>>)
      | null,
  ) {
    this.container = container;
    this.content = content;
  }

  /** Tracks the container size. Returns the function that stops tracking. */
  observe(): () => void {
    this.measure();
    if (typeof ResizeObserver === 'undefined') return () => undefined;
    const observer = new ResizeObserver(() => this.measure());
    observer.observe(this.container);
    return () => observer.disconnect();
  }

  /** Reads the container size; the first time it has a size, fits everything. */
  measure(): void {
    const { width, height } = this.readSize();
    if (!this.fitted && width > 0 && height > 0) {
      this.fitted = true;
      this.fitAll();
    }
  }

  /**
   * Fits everything on the canvas (images and canvas markings; or a default area, with an
   * empty canvas). Measures the container
   * first: right after a tool window closes, the `ResizeObserver` has not
   * fired yet and the last measured size is the old one.
   */
  fitAll(): void {
    const size = this.readSize();
    if (size.width === 0) return;
    this.fitted = true;
    this.fits += 1;
    const content = this.content();
    this.viewport.value = fitRect(
      imagesBounds(content?.containers ?? [], content?.markings) ?? EMPTY_CANVAS_RECT,
      size,
      content?.arrivals?.length ? FIT_PADDING + ARRIVAL_FIT_EXTRA : FIT_PADDING,
    );
  }

  /** Fits `rect` (canvas) with the `fitAll` margin, without going past the zoom limits. */
  fitTo(rect: Rect): void {
    const size = this.readSize();
    if (size.width === 0) return;
    this.viewport.value = fitRect(rect, size);
  }

  /**
   * Current container size; updates `size` only if it changed. If it changed from one non-zero
   * size to another, after the first fit, the view keeps the center and the scale.
   */
  private readSize(): Size {
    const current = this.size.peek();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === current.width && height === current.height) return current;
    const size = { width, height };
    const previous = this.lastSize;
    const nonZero = width > 0 && height > 0;
    if (nonZero) this.lastSize = size;
    batch(() => {
      this.size.value = size;
      if (this.fitted && nonZero && previous) {
        this.viewport.value = keepCenter(this.viewport.peek(), previous, size);
      }
    });
    return size;
  }

  /** Centers on `rect` (canvas), adjusting the zoom if it is too large or too small. */
  centerOn(rect: Rect): void {
    const size = this.size.peek();
    if (size.width === 0) return;
    this.viewport.value = centerOn(this.viewport.peek(), rect, size);
  }

  /** Minimal pan until `rect` (canvas) is in view; no zoom change, and none if already in view. */
  reveal(rect: Rect): void {
    const size = this.size.peek();
    if (size.width === 0) return;
    this.viewport.value = revealRect(this.viewport.peek(), rect, size);
  }

  /** Centers the view on `point` (canvas), keeping the zoom (minimap click). */
  centerOnPoint(point: Point): void {
    const size = this.size.peek();
    if (size.width === 0) return;
    const { scale } = this.viewport.peek();
    this.viewport.value = {
      x: size.width / 2 - point.x * scale,
      y: size.height / 2 - point.y * scale,
      scale,
    };
  }

  /** Center of the visible area, in canvas units. */
  center(): Point {
    this.measure();
    const size = this.size.peek();
    return this.toCanvas({ x: size.width / 2, y: size.height / 2 });
  }

  /** Page coordinate → screen point relative to the container. */
  screenPoint(e: { readonly clientX: number; readonly clientY: number }): Point {
    const box = this.container.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  /** Screen point (relative to the container) → canvas. */
  toCanvas(p: Point): Point {
    return screenToCanvas(this.viewport.peek(), p);
  }

  /** Screen pixels per canvas unit. */
  get scale(): number {
    return this.viewport.peek().scale;
  }

  panBy(dx: number, dy: number): void {
    this.viewport.value = panBy(this.viewport.peek(), dx, dy);
  }

  zoomAt(p: Point, factor: number): void {
    this.viewport.value = zoomAt(this.viewport.peek(), p, factor);
  }

  /** Pinch: points `a0`/`b0` (screen) moved to `a1`/`b1`. */
  pinch(a0: Point, b0: Point, a1: Point, b1: Point): void {
    this.viewport.value = pinch(this.viewport.peek(), a0, b0, a1, b1);
  }
}
