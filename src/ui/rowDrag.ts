import { useRef, useState } from 'preact/hooks';

// Reordenar linhas por arrasto (P6): pares da anotação livre e linhas das tabelas
// tipadas. A alça usa eventos de ponteiro (mouse, caneta e toque); a lista só muda ao
// soltar, com uma única action do store, então o gesto gera uma entrada de desfazer.

/**
 * Posição final da linha arrastada (`from`) ao soltar em `y`: quantas das outras
 * linhas têm o centro acima do ponteiro. `mids` são os centros verticais das linhas,
 * na ordem atual. Função pura: `tests/ui/rowDrag.test.ts`.
 */
export function dropIndex(mids: readonly number[], y: number, from: number): number {
  let slot = 0;
  mids.forEach((mid, i) => {
    if (i !== from && mid < y) slot++;
  });
  return slot;
}

/**
 * Linha (na ordem atual) antes da qual a arrastada vai entrar; `count` = depois da
 * última. Serve para desenhar a linha de destino.
 */
export function dropBefore(from: number, to: number): number {
  return to < from ? to : to + 1;
}

export interface RowDrag {
  /** Arrasto em andamento: linha pega e posição final prevista. */
  readonly state: { readonly from: number; readonly to: number } | null;
  /** Atributos da alça da linha `index`. */
  handle(index: number): {
    onPointerDown: (e: PointerEvent) => void;
  };
  /** Atributo de destino da linha `index` (`before`/`after`) durante o arrasto. */
  drop(index: number, count: number): 'before' | 'after' | undefined;
}

/**
 * Arrasto pela alça. As linhas são os elementos com `data-drag-row` dentro de
 * `container`; ao soltar numa posição diferente, chama `onMove(from, to)`.
 */
export function useRowDrag(
  container: { readonly current: HTMLElement | null },
  onMove: (from: number, to: number) => void,
): RowDrag {
  const [state, setState] = useState<RowDrag['state']>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  return {
    state,
    handle: (index) => ({
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0 || !container.current) return;
        e.preventDefault();
        const grip = e.currentTarget as HTMLElement;
        const rows = [...container.current.querySelectorAll('[data-drag-row]')];
        const mids = rows.map((row) => {
          const box = row.getBoundingClientRect();
          return box.top + box.height / 2;
        });
        let to = index;
        setState({ from: index, to });
        try {
          grip.setPointerCapture(e.pointerId);
        } catch {
          // Sem captura (ex.: ponteiro já solto): o arrasto termina no próximo evento.
        }
        const move = (ev: PointerEvent) => {
          const next = dropIndex(mids, ev.clientY, index);
          if (next === to) return;
          to = next;
          setState({ from: index, to });
        };
        const end = (commit: boolean) => () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', cancel);
          setState(null);
          if (commit && to !== index) onMoveRef.current(index, to);
        };
        const up = end(true);
        const cancel = end(false);
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', cancel);
      },
    }),
    drop: (index, count) => {
      if (!state || state.from === state.to) return undefined;
      const before = dropBefore(state.from, state.to);
      if (before === index) return 'before';
      if (before === count && index === count - 1) return 'after';
      return undefined;
    },
  };
}

/** Alt+Shift+↑/↓ (e ↑/↓ na alça): deslocamento pedido pela tecla, ou 0. */
export function moveKeyDelta(e: KeyboardEvent, onGrip: boolean): -1 | 0 | 1 {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return 0;
  const chord = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
  const plain = onGrip && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
  if (!chord && !plain) return 0;
  return e.key === 'ArrowUp' ? -1 : 1;
}
