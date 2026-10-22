import { useComputed } from '@preact/signals';
import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { useEditor } from './EditorContext';
import { componentTarget } from './componentTarget';
import { libraryErrorMessage } from './labels';

// "Adicionar à tela" de um componente da biblioteca, comum à paleta e ao Catálogo: o alvo é
// o de `componentTarget` (seleção primeiro, senão a tela à vista), a criação é a action
// `addComponent` e a marcação criada fica selecionada.

export interface AddComponent {
  /** Adiciona o tipo; devolve `true` se criou. O erro traduzido fica em `error`. */
  readonly add: (specId: string, typeId: string) => boolean;
  /** Por que Adicionar está desabilitado; `undefined` se pode. */
  readonly disabledReason: string | undefined;
  readonly error: string | null;
}

export function useAddComponent(): AddComponent {
  const editor = useEditor();
  const { actions, store, ui } = editor;
  const [error, setError] = useState<string | null>(null);
  const readOnly = store.locked.value;
  // Só o "há uma tela possível" importa: o componente não renderiza a cada pan.
  const hasTarget = useComputed(() => componentTarget(editor) !== null).value;

  const add = (specId: string, typeId: string): boolean => {
    const target = componentTarget(editor);
    if (!target) return false;
    const result = actions.addComponent({
      containerId: target.containerId,
      parentId: target.parentId,
      specId,
      typeId,
      ...(target.center ? { center: target.center } : {}),
    });
    if (!result.ok) {
      setError(libraryErrorMessage(result.error));
      return false;
    }
    setError(null);
    ui.selection.value = { kind: 'marking', id: result.value };
    // Marcação nova fora da área visível: pan mínimo até ela (já à vista, a vista não se mexe).
    editor.canvas.current?.revealSelection();
    return true;
  };

  const disabledReason = readOnly
    ? t('library.readOnly')
    : hasTarget
      ? undefined
      : t('library.noScreen');
  return { add, disabledReason, error };
}
