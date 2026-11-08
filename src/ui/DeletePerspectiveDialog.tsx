import { t } from '../i18n';
import { Button } from './controls';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { perspectiveContentText } from './perspectiveContentText';
import { useState } from 'preact/hooks';

/**
 * Apagar perspectiva: confirmação que diz o que continua no projeto (tudo, na Principal) e o
 * que some. "Cancelar" tem o foco inicial (é o primeiro botão do rodapé).
 */
export function DeletePerspectiveDialog({
  id,
  onClose,
  onDeleted,
}: {
  readonly id: string;
  /** Cancelar, Esc ou o X: nada foi apagado. */
  readonly onClose: () => void;
  /**
   * Depois de apagar. `next` é a perspectiva que ficou no lugar da apagada (a de baixo; sem ela,
   * a de cima), ou `null` se não sobrou nenhuma. Sem este callback vale `onClose`.
   */
  readonly onDeleted?: (next: string | null) => void;
}) {
  const { session, store } = useEditor();
  const [failed, setFailed] = useState(false);
  const project = store.project.value;
  const perspective = project?.perspectives.find((x) => x.id === id);
  if (!project || !perspective) return null;

  const confirm = () => {
    const list = project.perspectives;
    const at = list.findIndex((x) => x.id === id);
    const next = list[at + 1] ?? list[at - 1] ?? null;
    if (!session.perspectiveActions.removePerspective(id).ok) {
      setFailed(true);
      return;
    }
    (onDeleted ?? onClose)(next?.id ?? null);
  };

  return (
    <Dialog
      title={t('perspective.delete.title', { name: perspective.name })}
      alert
      onCancel={onClose}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={confirm}>
            {t('perspective.delete.confirm')}
          </Button>
        </>
      }
    >
      <div class="perspective-delete-block">
        <strong>{t('perspective.delete.stays')}</strong>
        <p>
          {t('perspective.delete.staysBody', {
            content: perspectiveContentText(project, perspective),
          })}
        </p>
      </div>
      <div class="perspective-delete-block">
        <strong>{t('perspective.delete.goes')}</strong>
        <p>{t('perspective.delete.goesBody')}</p>
      </div>
      <p class="muted">{t('perspective.delete.note')}</p>
      {failed && (
        <p class="field-error" role="alert">
          {t('perspective.error')}
        </p>
      )}
    </Dialog>
  );
}
