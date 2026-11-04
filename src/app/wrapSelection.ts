// "O que envolver agora" e o Envolver em si, num ponto só: o botão do resumo da seleção
// múltipla, o atalho Ctrl/Cmd+G e os menus (canvas e Árvore) chamam estas funções. A regra
// de como envolver é só `wrapItems` do modelo (docs/ARCHITECTURE.md, "Marcação pai").
import { t } from '../i18n';
import { canWrapItems, type ItemRef, type Project } from '../model';
import {
  existingItems,
  isItemSelected,
  selectItems,
  selectedItems,
  showToast,
} from '../store/ui';
import type { EditorContextValue } from '../ui/EditorContext';

type WrapEditor = Pick<EditorContextValue, 'ui' | 'store' | 'review' | 'actions'>;

/**
 * Itens que o Envolver pegaria agora: a seleção atual; ou, num menu aberto sobre uma linha
 * (`row`) fora da seleção, só esse item. Só os que existem no projeto.
 */
export function itemsToWrap(
  project: Project | null,
  selection: readonly ItemRef[],
  row?: ItemRef,
): readonly ItemRef[] {
  const items = row && !isItemSelected(selection, row) ? [row] : selection;
  return existingItems(project, items);
}

/** O Envolver existe (não é somente leitura nem a revisão de propostas). */
export function wrapAvailable(editor: Pick<WrapEditor, 'store' | 'review'>): boolean {
  return !editor.store.locked.value && editor.review.proposalId.value === null;
}

/** Os itens de `itemsToWrap` pelo estado atual do editor (assina os sinais, se lido num render). */
export function currentWrapItems(editor: WrapEditor, row?: ItemRef): readonly ItemRef[] {
  const project = editor.review.derived.shownProject.value;
  return itemsToWrap(project, selectedItems(editor.ui), row);
}

/** Algum item de `items` entra numa marcação pai (notas e setas não entram). */
export function canWrapNow(editor: WrapEditor, items: readonly ItemRef[]): boolean {
  const project = editor.review.derived.shownProject.value;
  return wrapAvailable(editor) && project !== null && canWrapItems(project, items);
}

/**
 * Envolve `items` (uma entrada de desfazer), deixa a marcação nova selecionada e, se o modelo
 * recusar, avisa por `multi.wrapFailed`. Devolve se envolveu.
 */
export function wrapItemsNow(editor: WrapEditor, items: readonly ItemRef[]): boolean {
  const result = editor.actions.wrapItems(items);
  if (result.ok) {
    selectItems(editor.ui, [{ kind: 'marking', id: result.value }]);
    return true;
  }
  showToast(editor.ui, t('multi.wrapFailed'));
  return false;
}
