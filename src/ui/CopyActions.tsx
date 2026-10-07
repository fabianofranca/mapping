import { t } from '../i18n';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import {
  canCopyItems,
  copyCrop,
  copyReference,
  type CopyTarget,
} from '../app/itemClipboard';
import { useEditor } from './EditorContext';
import { Button, IconButton } from './controls';
import { Popover } from './Popover';

// "Copiar referência" e "Copiar recorte" na interface: botões em Detalhes e no cartão da
// anotação (`CopyButtons`), menu ⋯ da linha da Árvore (`ItemMenu`) e o menu do canvas
// (`CanvasContextMenu`). Só aparecem em projetos abertos de uma pasta, o que o MCP alcança.

/** Botões ao lado do ID: copiar a referência e, em marcações, o recorte. */
export function CopyButtons({ target }: { readonly target: CopyTarget }) {
  const editor = useEditor();
  if (!canCopyItems(editor)) return null;
  return (
    <>
      <IconButton
        icon="link"
        label={t('copy.reference')}
        shortcut={target.kind === 'a' ? undefined : SHORTCUT_LABELS.copyReference}
        onClick={() => void copyReference(editor, target)}
      />
      {target.kind === 'm' && (
        <IconButton
          icon="crop"
          label={t('copy.crop')}
          shortcut={SHORTCUT_LABELS.copyCrop}
          onClick={() => void copyCrop(editor, target.id)}
        />
      )}
    </>
  );
}

/** Itens do menu (botões) de um item da imagem ou da marcação; `close` fecha o menu. */
export function CopyMenuItems({
  target,
  close,
}: {
  readonly target: CopyTarget;
  readonly close: () => void;
}) {
  const editor = useEditor();
  return (
    <div class="menu-items">
      <Button
        role="menuitem"
        onClick={() => {
          close();
          void copyReference(editor, target);
        }}
      >
        {t('copy.reference')}
      </Button>
      {target.kind === 'm' && (
        <Button
          role="menuitem"
          onClick={() => {
            close();
            void copyCrop(editor, target.id);
          }}
        >
          {t('copy.crop')}
        </Button>
      )}
    </div>
  );
}

/** Menu ⋯ de uma linha da Árvore (popover fixo: a rolagem da janela não o corta). */
export function ItemMenu({
  target,
  name,
}: {
  readonly target: CopyTarget;
  readonly name: string;
}) {
  const editor = useEditor();
  if (!canCopyItems(editor)) return null;
  const label = t('copy.itemActions', { name });
  return (
    <Popover
      class="tree-menu"
      role="menu"
      align="end"
      label={label}
      trigger={({ open, toggle }) => (
        <IconButton
          icon="moreVertical"
          label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
        />
      )}
    >
      {(close) => <CopyMenuItems target={target} close={close} />}
    </Popover>
  );
}
