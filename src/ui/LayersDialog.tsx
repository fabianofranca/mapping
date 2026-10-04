import { t } from '../i18n';
import type { Project } from '../model';
import { Dialog } from './Dialog';
import { LayerActions, LayersPanel } from './LayersPanel';
import { Button } from './controls';

interface LayersDialogProps {
  readonly project: Project;
  readonly readOnly: boolean;
  readonly onClose: () => void;
}

/**
 * Camadas em diálogo: só no celular, até a R8 trazer as telas cheias. No desktop as
 * camadas são a janela `LayersWindow`; o conteúdo é o mesmo (`LayersPanel`).
 */
export function LayersDialog({ project, readOnly, onClose }: LayersDialogProps) {
  return (
    <Dialog
      title={t('layer.title')}
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <p class="muted">{t('layer.hint')}</p>
      <LayerActions project={project} readOnly={readOnly} variant="buttons" />
      <LayersPanel project={project} readOnly={readOnly} />
    </Dialog>
  );
}
