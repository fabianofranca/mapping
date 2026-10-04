import { useComputed } from '@preact/signals';
import { t } from '../i18n';
import { useEditor } from '../ui/EditorContext';
import { SaveStatus } from '../ui/SaveStatus';
import { Button, IconButton } from '../ui/controls';
import type { EditorDialogs } from './useEditorDialogs';

/**
 * Barra de cima do celular: título, camada ativa, estado do salvamento e o Menu.
 * No desktop quem manda é a `EditorMainBar` (a barra do celular é redesenhada na R8).
 */
export function EditorTopBar({ dialogs }: { readonly dialogs: EditorDialogs }) {
  const { store, derived } = useEditor();
  const projectName = useComputed(() => store.committed.value?.project.name);
  const activeLayer = derived.activeLayer.value;
  return (
    <header class="topbar editor-bar">
      <h1 class="project-title">{projectName.value}</h1>
      {activeLayer && (
        <Button
          class="layer-chip"
          style={{ '--layer-color': activeLayer.color }}
          aria-label={t('layer.chipLabel', { name: activeLayer.name })}
          title={t('layer.chipLabel', { name: activeLayer.name })}
          onClick={() => dialogs.show({ kind: 'layers' })}
        >
          <span class="layer-dot" aria-hidden="true" />
          <span class="layer-chip-name">{activeLayer.name}</span>
        </Button>
      )}
      <SaveStatus />
      <IconButton
        icon="menu"
        label={t('editor.menu')}
        onClick={() => dialogs.show({ kind: 'menu' })}
      />
    </header>
  );
}
