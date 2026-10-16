/**
 * Pinça com dois dedos no palco Konva (zoom em torno do centro dos dedos e pan), para dar uma
 * olhada no laboratório pelo celular. O Konva só traz arrastar com um dedo; durante a pinça
 * o arrasto do palco é interrompido.
 */
import type Konva from 'konva';

export function attachPinchZoom(
  stage: Konva.Stage,
  limits: { readonly min: number; readonly max: number },
  onZoom?: (scale: number) => void,
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
    onZoom?.(scale);
    stage.batchDraw();
  });
  stage.on('touchend', () => {
    lastCenter = undefined;
    lastDist = 0;
  });
}
