// Viewport do canvas: tamanho do container, pan, zoom, enquadrar e centralizar.
// As contas ficam em `viewport.ts` (puras); aqui ficam os signals e o DOM.
import { signal } from '@preact/signals';
import type { Project, Rect } from '../model';
import { imagesBounds } from './imageGeometry';
import {
  EMPTY_CANVAS_RECT,
  centerOn,
  fitRect,
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
  /** O que enquadrar: as imagens e as marcações do canvas do projeto (lido sem assinar). */
  private readonly content: () => Pick<Project, 'containers' | 'markings'> | null;
  /** Já enquadrou na primeira vez que o container teve tamanho. */
  private fitted = false;
  /** Quantas vezes enquadrou; o canvas publica no container para os testes e2e. */
  fits = 0;

  constructor(
    container: HTMLElement,
    content: () => Pick<Project, 'containers' | 'markings'> | null,
  ) {
    this.container = container;
    this.content = content;
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

  /**
   * Enquadra tudo o que está no canvas (imagens e marcações do canvas; ou uma área padrão, com o
   * canvas vazio). Mede o container
   * antes: logo depois de uma janela de ferramenta fechar, o `ResizeObserver` ainda não
   * disparou e o último tamanho medido é o antigo.
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
    );
  }

  /** Tamanho atual do container; atualiza `size` só se ele mudou. */
  private readSize(): Size {
    const current = this.size.peek();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === current.width && height === current.height) return current;
    const size = { width, height };
    this.size.value = size;
    return size;
  }

  /** Centraliza em `rect` (canvas), ajustando o zoom se ele for grande ou pequeno demais. */
  centerOn(rect: Rect): void {
    const size = this.size.peek();
    if (size.width === 0) return;
    this.viewport.value = centerOn(this.viewport.peek(), rect, size);
  }

  /** Pan mínimo até `rect` (canvas) ficar à vista; sem mudar o zoom nem se já está à vista. */
  reveal(rect: Rect): void {
    const size = this.size.peek();
    if (size.width === 0) return;
    this.viewport.value = revealRect(this.viewport.peek(), rect, size);
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
