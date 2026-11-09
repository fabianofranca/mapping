import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { Button, TextField } from '../ui/controls';
import { Dialog } from '../ui/Dialog';

interface ProjectNameDialogProps {
  readonly title: string;
  /** `id` do formulário: o botão "Criar" fica nas ações do diálogo e o envia por ele. */
  readonly formId: string;
  readonly busy: boolean;
  readonly name: string;
  /** Vazio usa o `placeholder` como nome (ver controller). */
  readonly placeholder: string;
  readonly onName: (name: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
  /** Texto antes do campo (a pasta escolhida e quantas imagens ela já tem). */
  readonly children?: ComponentChildren;
}

/** Diálogo "novo projeto" e "configurar pasta": um campo de nome, Cancelar e Criar. */
export function ProjectNameDialog({
  title,
  formId,
  busy,
  name,
  placeholder,
  onName,
  onCancel,
  onSubmit,
  children,
}: ProjectNameDialogProps) {
  return (
    <Dialog
      title={title}
      onCancel={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" disabled={busy}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
        {/* Sem foco próprio: o diálogo dá o foco inicial ao primeiro controle do corpo (F9). */}
        <TextField
          label={t('project.name')}
          type="text"
          value={name}
          placeholder={placeholder}
          onInput={(e) => onName(e.currentTarget.value)}
        />
      </form>
    </Dialog>
  );
}
