import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { showToast } from '../store/ui';
import { useEditor } from './EditorContext';

// Avisos de troca forçada para a Principal (etapa #659, PE3): a perspectiva aberta sumiu ou a
// revisão de uma proposta abriu a Principal. O aviso sai como o aviso curto do canvas
// (`showToast`) e o signal da store é limpo, para não repetir.

export function PerspectiveNotices() {
  const { session, ui } = useEditor();
  const notice = session.perspective.notice.value;
  useEffect(() => {
    if (notice === null) return;
    showToast(
      ui,
      notice.kind === 'removed'
        ? t('perspective.notice.removed', { name: notice.name })
        : t('perspective.notice.review'),
    );
    session.perspective.notice.value = null;
  }, [notice, session, ui]);
  return null;
}
