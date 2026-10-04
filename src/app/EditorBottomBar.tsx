import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import { IconButton } from '../ui/controls';
import { AddImagesButton, FitButton, HistoryButtons, ModeButtons } from './EditorTools';

interface EditorBottomBarProps {
  readonly busy: boolean;
  readonly onAdd: () => void;
  /** Abre o menu Painéis (as janelas e as ações do projeto). */
  readonly onPanels: () => void;
}

/** Celular (60px): modo, adicionar, desfazer, refazer, enquadrar e Painéis (B6). */
export function EditorBottomBar({ busy, onAdd, onPanels }: EditorBottomBarProps) {
  // Erro novo no Diagnóstico: o ponto de alerta aparece em Painéis (B4).
  const alert = diagnosticsUnseen.value;
  const label = t('panels.open');
  return (
    <nav class="bottombar" aria-label={t('mobile.toolbar')}>
      <ModeButtons />
      <AddImagesButton desktop={false} busy={busy} onAdd={onAdd} />
      <HistoryButtons />
      <FitButton />
      <IconButton
        icon="panelLeft"
        label={alert ? `${label} (${t('diagnostics.unseen')})` : label}
        alert={alert}
        onClick={onPanels}
      />
    </nav>
  );
}
