import { useComputed } from '@preact/signals';
import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { useEditor } from './EditorContext';
import { addLabel, componentTarget } from './componentTarget';
import { libraryErrorMessage } from './labels';

// "Adicionar" de um componente da biblioteca, comum à paleta e ao Catálogo: o alvo é
// o de `componentTarget` (seleção primeiro, senão o container à vista, senão o canvas), a criação é a action
// `addComponent` e a marcação criada fica selecionada.

export interface AddComponent {
  /** Adiciona o tipo; devolve `true` se criou. O erro traduzido fica em `error`. */
  readonly add: (specId: string, typeId: string) => boolean;
  /** Rótulo do botão com o destino: "Adicionar dentro de X", "Adicionar na tela X", "Adicionar no canvas". */
  readonly label: string;
  /** O rótulo para um tipo: um tipo flutuante é sempre "Adicionar no canvas". */
  readonly labelFor: (type: { readonly floating: boolean }) => string;
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
  const label = useComputed(() => {
    const target = componentTarget(editor);
    return target ? addLabel(target) : null;
  }).value;
  const hasTarget = label !== null;

  const add = (specId: string, typeId: string): boolean => {
    const floating = editor.derived.componentTypes
      .peek()
      .some((c) => c.specId === specId && c.typeId === typeId && c.floating);
    const target = componentTarget(editor, { floating });
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
  const generic = label ?? t('library.add');
  const labelFor = (type: { readonly floating: boolean }) =>
    type.floating ? t('library.addToCanvas') : generic;
  return { add, label: generic, labelFor, disabledReason, error };
}
