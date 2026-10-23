import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { projectIndex, type ReviewTarget, type ReviewTree } from '../model';
import type { ReviewState } from '../store/review';
import { setReviewLayout } from '../store/toolWindows';
import { resolveSelection, type Selection } from '../store/ui';
import { useEditor } from '../ui/EditorContext';

// Liga a revisão ao resto do editor: o layout da janela inferior (altura da revisão), o
// modo Navegar (Desenhar não existe em somente leitura) e a seleção nos dois sentidos —
// escolher um nível na janela Propostas seleciona o item no canvas, e tocar num item do
// canvas (ou da Árvore) seleciona o nível dele na revisão.

/**
 * O item da revisão no canvas: a marcação, ou a seta (v13; os ids dividem o espaço), seja ela
 * do projeto à vista ou criada pela proposta.
 */
function itemSelection(
  review: Pick<ReviewState, 'derived'>,
  id: string,
): NonNullable<Selection> {
  const shown = review.derived.shownProject.peek();
  const isArrow =
    (shown !== null && projectIndex(shown).arrows.has(id)) ||
    review.derived.proposal
      .peek()
      ?.changes.some((c) => c.entity === 'arrow' && c.entityId === id) === true;
  return { kind: isArrow ? 'arrow' : 'marking', id };
}

/** Seleção do canvas que corresponde a um nível da revisão (`undefined`: não muda). */
export function canvasSelectionOf(
  review: Pick<ReviewState, 'derived'>,
  target: ReviewTarget | null,
): Selection | undefined {
  if (!target) return undefined;
  if (target.level === 'item' && target.id) return itemSelection(review, target.id);
  if (target.level === 'image' && target.id) return { kind: 'image', id: target.id };
  if (target.level === 'change' && target.id) {
    const c = review.derived.proposal.peek()?.changes.find((x) => x.id === target.id);
    if (c?.markingId) return itemSelection(review, c.markingId);
    if (c?.imageId) return { kind: 'image', id: c.imageId };
  }
  return undefined;
}

const sameSelection = (a: Selection | undefined, b: Selection | undefined) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

/** Nível da revisão de um item selecionado no canvas (o item ou a imagem com mudanças). */
export function reviewTargetOf(
  tree: ReviewTree | null,
  selection: Selection,
): ReviewTarget | null {
  if (!tree || !selection) return null;
  if (selection.kind === 'image') {
    return tree.nodes.has(`image:${selection.id}`)
      ? { level: 'image', id: selection.id }
      : null;
  }
  return tree.nodes.has(`item:${selection.id}`)
    ? { level: 'item', id: selection.id }
    : null;
}

export function useReviewSync(): void {
  const { review, ui } = useEditor();

  useEffect(
    () =>
      effect(() => {
        const open = review.proposalId.value !== null;
        setReviewLayout(open);
        if (open && ui.mode.peek() === 'draw') ui.mode.value = 'navigate';
      }),
    [review, ui],
  );

  // Revisão → canvas.
  useEffect(
    () =>
      effect(() => {
        const target = review.selected.value;
        if (review.proposalId.value === null) return;
        const next = canvasSelectionOf(review, target);
        if (next !== undefined && !sameSelection(next, ui.selection.peek())) {
          ui.selection.value = next;
        }
      }),
    [review, ui],
  );

  // Canvas (ou Árvore) → revisão. Limpar a seleção (clicar no fundo) tira a revisão do item
  // ou da mudança dele: os Detalhes seguem a seleção e, sem ela, mostram a proposta (a barra
  // de status diz "Nada selecionado"). Só a transição conta, não a seleção vazia de quando a
  // revisão abre num ponto salvo.
  useEffect(() => {
    let before = ui.selection.peek();
    return effect(() => {
      const selection = ui.selection.value;
      const cleared = before !== null && selection === null;
      before = selection;
      if (review.proposalId.peek() === null) return;
      const current = review.selected.peek();
      if (selection === null) {
        if (cleared && canvasSelectionOf(review, current) !== undefined) {
          review.select({ level: 'proposal', id: null });
        }
        return;
      }
      // A seleção do canvas já é a do nível escolhido (ex.: uma mudança do item).
      if (sameSelection(canvasSelectionOf(review, current), selection)) return;
      const target = reviewTargetOf(review.derived.tree.peek(), selection);
      if (target) review.select(target);
    });
  }, [review, ui]);

  // Ao sair da revisão, um item que só existia no "como ficaria" deixa de estar selecionado
  // (fora da revisão o projeto à vista é o confirmado).
  useEffect(
    () =>
      effect(() => {
        if (review.proposalId.value !== null) return;
        const selection = ui.selection.peek();
        const project = review.derived.shownProject.peek();
        if (selection && !resolveSelection(project, selection)) {
          const exists =
            project &&
            (selection.kind === 'image'
              ? projectIndex(project).containers.has(selection.id)
              : selection.kind === 'arrow'
                ? projectIndex(project).arrows.has(selection.id)
                : projectIndex(project).markings.has(selection.id));
          if (!exists) ui.selection.value = null;
        }
      }),
    [review, ui],
  );
}
