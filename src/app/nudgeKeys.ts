import type { ItemRef } from '../model';
import type { ActionResult } from '../store/history';

/** O que o passo das setas pede às actions do store (um gesto: prévias e um fim com assentar). */
export interface NudgeActions {
  beginGesture(): ActionResult;
  previewItemsNudge(items: readonly ItemRef[], dx: number, dy: number): ActionResult;
  finishItemsNudge(items: readonly ItemRef[], dx: number, dy: number): ActionResult;
  commitGesture(): void;
}

interface Active {
  readonly key: string;
  readonly items: readonly ItemRef[];
  /** Deslocamento pedido até agora e o último que a prévia aceitou (tudo ou nada). */
  total: { dx: number; dy: number };
  valid: { dx: number; dy: number };
}

/**
 * A seta que está sendo apertada: apertar e soltar é um gesto de um passo, segurar (a repetição
 * do teclado) soma passos no mesmo gesto. `end` fecha o gesto (no `keyup`, na perda de foco ou
 * em outra tecla) com uma entrada no desfazer.
 */
export class NudgeSession {
  private active: Active | null = null;

  constructor(
    private readonly actions: NudgeActions,
    private readonly selectedItems: () => readonly ItemRef[],
  ) {}

  /** Um `keydown` de seta: começa o gesto ou soma um passo ao que está aberto. */
  step(key: string, dx: number, dy: number): void {
    const a = this.active;
    if (a && a.key === key) {
      this.add(a, dx, dy);
      return;
    }
    this.end();
    this.start(key, dx, dy);
  }

  /** Fecha o gesto aberto (se houver): repete a operação final, assenta e grava uma entrada. */
  end(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.actions.finishItemsNudge(a.items, a.valid.dx, a.valid.dy);
    this.actions.commitGesture();
  }

  private start(key: string, dx: number, dy: number): void {
    const items = this.selectedItems();
    if (items.length === 0 || !this.actions.beginGesture().ok) return;
    const a: Active = {
      key,
      items,
      total: { dx: 0, dy: 0 },
      valid: { dx: 0, dy: 0 },
    };
    this.active = a;
    this.add(a, dx, dy);
  }

  private add(a: Active, dx: number, dy: number): void {
    a.total = { dx: a.total.dx + dx, dy: a.total.dy + dy };
    if (this.actions.previewItemsNudge(a.items, a.total.dx, a.total.dy).ok) {
      a.valid = a.total;
    }
  }
}
