// Viewport do canvas: tamanho do container, pan, zoom, enquadrar e centralizar.
// As contas ficam em `viewport.ts` (puras); aqui ficam os signals e o DOM.
import { signal } from '@preact/signals';
import type { ProjectImage, Rect } from '../model';
import { imagesBounds } from './imageGeometry';
import {
  EMPTY_CANVAS_RECT,
  centerOn,
  fitRect,
  panBy,
  pinch,
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
  /** Imagens a enquadrar (lidas sem assinar). */
  private readonly images: () => readonly ProjectImage[];
  /** Já enquadrou na primeira vez que o container teve tamanho. */
  private fitted = false;

  constructor(container: HTMLElement, images: () => readonly ProjectImage[]) {
    this.container = container;
    this.images = images;
  }

  /** Acompanha o tamanho do container. Devolve a função que para de acompanhar. */
  observe(): () => void {
    this.measure();
    if (typeof ResizeObserver === 'undefined') return () => undefined;
    const observer = new ResizeObserver(() => this.measure());
    observer.observe(this.container);
    return () => observer.disconnect();
  }

  /** Lê o tamanho do container; na primeira vez com tamanho, enquadra tudo. */
  measure(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.size.value = { width, height };
    if (!this.fitted && width > 0 && height > 0) {
      this.fitted = true;
      this.fitAll();
    }
  }

  /** Enquadra todas as imagens (ou uma área padrão, com o canvas vazio). */
  fitAll(): void {
    const size = this.size.peek();
    if (size.width === 0) return;
    this.viewport.value = fitRect(imagesBounds(this.images()) ?? EMPTY_CANVAS_RECT, size);
  }

  /** Centraliza em `rect` (canvas), ajustando o zoom se ele for grande ou pequeno demais. */
  centerOn(rect: Rect): void {
    const size = this.size.peek();
    if (size.width === 0) return;
    this.viewport.value = centerOn(this.viewport.peek(), rect, size);
  }

  /** Centraliza a vista em `point` (canvas), mantendo o zoom (clique no minimapa). */
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

  /** Centro da área visível, em unidades do canvas. */
  center(): Point {
    this.measure();
    const size = this.size.peek();
    return this.toCanvas({ x: size.width / 2, y: size.height / 2 });
  }

  /** Coordenada da página → ponto da tela relativo ao container. */
  screenPoint(e: { readonly clientX: number; readonly clientY: number }): Point {
    const box = this.container.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  /** Ponto da tela (relativo ao container) → canvas. */
  toCanvas(p: Point): Point {
    return screenToCanvas(this.viewport.peek(), p);
  }

  /** Pixels de tela por unidade do canvas. */
  get scale(): number {
    return this.viewport.peek().scale;
  }

  panBy(dx: number, dy: number): void {
    this.viewport.value = panBy(this.viewport.peek(), dx, dy);
  }

  zoomAt(p: Point, factor: number): void {
    this.viewport.value = zoomAt(this.viewport.peek(), p, factor);
  }

  /** Pinça: os pontos `a0`/`b0` (tela) foram para `a1`/`b1`. */
  pinch(a0: Point, b0: Point, a1: Point, b1: Point): void {
    this.viewport.value = pinch(this.viewport.peek(), a0, b0, a1, b1);
  }
}
