/**
 * Pinça com dois dedos no palco Konva (zoom em torno do centro dos dedos e pan), para dar uma
 * olhada no laboratório pelo celular. O Konva só traz arrastar com um dedo; durante a pinça
 * o arrasto do palco é interrompido. `onStart`/`onEnd` delimitam o gesto (o palco congela o
 * conteúdo como bitmap nesse intervalo).
 */
import Konva from 'konva';

export interface PinchCallbacks {
  readonly onZoom?: (scale: number) => void;
  readonly onStart?: () => void;
  readonly onEnd?: () => void;
}

export function attachPinchZoom(
  stage: Konva.Stage,
  limits: { readonly min: number; readonly max: number },
  callbacks: PinchCallbacks = {},
): void {
  let lastCenter: { x: number; y: number } | undefined;
  let lastDist = 0;

  stage.on('touchmove', (e) => {
    const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
    if (!t1 || !t2) return;
    e.evt.preventDefault();
    if (stage.isDragging()) stage.stopDrag();
    const rect = stage.container().getBoundingClientRect();
    const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
    const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!lastCenter) {
      lastCenter = center;
      lastDist = dist;
      callbacks.onStart?.();
      return;
    }
    const oldScale = stage.scaleX();
    const scale = Math.min(
      limits.max,
      Math.max(limits.min, oldScale * (dist / lastDist)),
    );
    const local = {
      x: (lastCenter.x - stage.x()) / oldScale,
      y: (lastCenter.y - stage.y()) / oldScale,
    };
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: center.x - local.x * scale,
      y: center.y - local.y * scale,
    });
    lastCenter = center;
    lastDist = dist;
    callbacks.onZoom?.(scale);
    stage.batchDraw();
  });
  stage.on('touchend touchcancel', () => {
    if (lastCenter) callbacks.onEnd?.();
    lastCenter = undefined;
    lastDist = 0;
  });
}

/**
 * Congela um grupo como bitmap durante pan/zoom/arrasto (o Konva redesenha só a imagem) e o
 * descongela no fim do gesto. A resolução segue a escala atual, com um teto para o bitmap não
 * estourar a memória em zoom alto.
 */
export function freezeGroup(
  group: Konva.Group,
  stageScale: number,
  maxSide = 4096,
): void {
  if (group.isCached() || !group.hasChildren()) return;
  const rect = group.getClientRect({ skipTransform: true });
  if (rect.width <= 0 || rect.height <= 0) return;
  const pixelRatio = Math.min(
    (Konva.pixelRatio || 1) * stageScale,
    maxSide / Math.max(rect.width, rect.height),
  );
  group.cache({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    pixelRatio: Math.max(0.25, pixelRatio),
  });
}

export function thawGroup(group: Konva.Group): void {
  if (group.isCached()) group.clearCache();
}

/** Teto do pixel ratio do Konva: telas 3× redesenham 2,25× mais pixels que 2× por nada visível no laboratório. */
export function capPixelRatio(konva: { pixelRatio: number }, max = 2): void {
  const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  konva.pixelRatio = Math.min(device, max);
}
