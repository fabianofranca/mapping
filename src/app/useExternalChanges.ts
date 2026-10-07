import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { resolveSelection, showToast } from '../store/ui';
import { useEditor } from '../ui/EditorContext';
import { reportError } from '../utils/report';

/** Intervalo entre as conferências do `mapping.json` (só com a janela visível). */
export const EXTERNAL_POLL_MS = 3000;

/**
 * Percebe mudanças feitas por fora (o servidor MCP, um editor de texto, o git) em projetos
 * de pasta: confere o `mapping.json` a cada ~3 s enquanto a janela está visível e, ao voltar
 * o foco, confere também os arquivos de imagem. Sem alterações locais pendentes o projeto é
 * recarregado sozinho, com um aviso discreto. Seleção, camadas visíveis e viewport ficam como
 * estão (são estado da UI); a seleção só é limpa se o item deixou de existir.
 */
export function useExternalChanges(interval = EXTERNAL_POLL_MS): void {
  const { session, store, ui } = useEditor();

  useEffect(() => {
    if (!session.watchable) return;
    const check = (images: boolean) => {
      if (document.visibilityState !== 'visible') return;
      session.sync({ images }).then(
        (result) => {
          if (result === 'reloaded') showToast(ui, t('editor.externalUpdated'));
        },
        (e: unknown) => reportError('session.sync', e),
      );
    };
    const onFocus = () => check(true);
    const timer = setInterval(() => check(false), interval);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [session, ui, interval]);

  // Depois de recarregar (sozinho ou pelo diálogo), a seleção que sumiu do arquivo é limpa.
  useEffect(
    () =>
      effect(() => {
        void session.reloads.value;
        if (!resolveSelection(store.project.peek(), ui.selection.peek())) {
          ui.selection.value = null;
        }
      }),
    [session, store, ui],
  );
}
