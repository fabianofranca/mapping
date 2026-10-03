import { t } from '../i18n';
import { useEditor } from '../ui/EditorContext';
import { buildExport, closeProject } from './controller';
import type { EditorDialogs } from './useEditorDialogs';
import type { EditorNotices } from './useEditorNotices';

export interface ProjectCommands {
  /** Gera o zip e abre o diálogo de exportação. */
  exportProject(): Promise<void>;
  /** Grava o que falta e fecha o projeto (com confirmação se o salvamento falhou). */
  closeProject(): Promise<void>;
}

export function useProjectCommands(
  dialogs: EditorDialogs,
  notices: EditorNotices,
): ProjectCommands {
  const { session } = useEditor();
  return {
    exportProject: async () => {
      dialogs.close();
      notices.setMessage(null);
      notices.setProgress(t('editor.exporting'));
      const result = await buildExport();
      notices.setProgress(null);
      if (result.ok) dialogs.show({ kind: 'export', file: result.value });
      else notices.setMessage(t(`error.${result.error}`));
    },
    closeProject: async () => {
      dialogs.close();
      await session.flush();
      if (session.saveStatus.value === 'error') dialogs.show({ kind: 'confirmClose' });
      else await closeProject();
    },
  };
}
