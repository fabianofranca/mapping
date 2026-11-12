/**
 * Retângulo sólido sem canto arredondado cujas bordas caem em pixels inteiros do dispositivo.
 *
 * Duas faixas coladas (um `row` de pesos 1:2:1, por exemplo) dividem a mesma borda; com o zoom e o
 * deslocamento do canvas ela cai no meio de um pixel, cada `Rect` cobre metade dele com
 * antialiasing e o fundo transparece pela outra metade (um fio claro de 1 px). Alinhar as bordas
 * ao pixel faz o fim de uma faixa e o começo da seguinte serem a mesma linha, sem mistura.
 * Só vale com a matriz sem giro nem inclinação; fora disso (ou sem a matriz legível, como em
 * jsdom) desenha o retângulo da cena.
 */
import { Rect, type RectConfig } from 'konva/lib/shapes/Rect';
import type { Context } from 'konva/lib/Context';

interface DeviceMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

const AXIS_EPSILON = 1e-9;

function deviceMatrix(context: Context): DeviceMatrix | undefined {
  const native: unknown = (context as unknown as { _context?: unknown })._context;
  const getTransform = (native as { getTransform?: () => DeviceMatrix } | undefined)
    ?.getTransform;
  if (typeof getTransform !== 'function') return undefined;
  const m = getTransform.call(native);
  const straight =
    Math.abs(m.b) < AXIS_EPSILON &&
    Math.abs(m.c) < AXIS_EPSILON &&
    m.a > AXIS_EPSILON &&
    m.d > AXIS_EPSILON;
  return straight ? m : undefined;
}

/** Arredonda `from..to` (no dispositivo) para pixels inteiros, com ao menos 1 pixel se havia área. */
function snap(from: number, to: number): [number, number] {
  const lo = Math.round(from);
  const hi = Math.round(to);
  return hi > lo || to - from <= 0 ? [lo, hi] : [lo, lo + 1];
}

export class PixelRect extends Rect {
  constructor(config?: RectConfig) {
    super(config);
  }

  override _sceneFunc(context: Context): void {
    const m = deviceMatrix(context);
    const width = this.width();
    const height = this.height();
    const radius: number | number[] = this.cornerRadius();
    const square =
      typeof radius === 'number' ? radius === 0 : radius.every((r) => r === 0);
    if (!m || !square) {
      super._sceneFunc(context);
      return;
    }
    const [x0, x1] = snap(m.e, m.a * width + m.e);
    const [y0, y1] = snap(m.f, m.d * height + m.f);
    context.beginPath();
    context.rect((x0 - m.e) / m.a, (y0 - m.f) / m.d, (x1 - x0) / m.a, (y1 - y0) / m.d);
    context.closePath();
    context.fillStrokeShape(this);
  }
}
