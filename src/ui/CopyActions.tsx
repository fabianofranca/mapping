import { t } from '../i18n';
import { selectionWithContents, type ItemRef } from '../model';
import { selectItems } from '../store/ui';
import { SHORTCUT_LABELS, ariaKeys } from '../app/shortcuts';
import {
  canWrapNow,
  currentWrapItems,
  wrapAvailable,
  wrapItemsNow,
} from '../app/wrapSelection';
import {
  canCopyCrop,
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
      {target.kind === 'm' &&
        canCopyCrop(editor.review.derived.shownProject.value, target.id) && (
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

/** "Selecionar com o conteúdo": a marcação e tudo o que ela cobre. Só para marcações. */
export function SelectContentsItem({
  markingId,
  close,
}: {
  readonly markingId: string;
  readonly close: () => void;
}) {
  const { ui, review } = useEditor();
  return (
    <Button
      role="menuitem"
      onClick={() => {
        close();
        const project = review.derived.shownProject.peek();
        if (project && project.markings.some((m) => m.id === markingId)) {
          selectItems(ui, selectionWithContents(project, markingId));
        }
      }}
    >
      {t('multi.selectWithContents')}
    </Button>
  );
}

/**
 * "Envolver": a seleção atual ou, se a linha/alvo do menu está fora dela, só esse item
 * (`currentWrapItems`). Desabilitado, com a dica, quando nada entra (nota, seta); some no
 * somente leitura e na revisão. Mostra o atalho Ctrl/Cmd+G.
 */
export function WrapMenuItem({
  target,
  close,
}: {
  readonly target: CopyTarget;
  readonly close: () => void;
}) {
  const editor = useEditor();
  if (target.kind === 'a' || !wrapAvailable(editor)) return null;
  const row: ItemRef = { kind: target.kind === 'i' ? 'image' : 'marking', id: target.id };
  const enabled = canWrapNow(editor, currentWrapItems(editor, row));
  return (
    <Button
      role="menuitem"
      disabled={!enabled}
      title={enabled ? undefined : t('multi.wrapBlocked')}
      aria-keyshortcuts={ariaKeys(SHORTCUT_LABELS.wrap)}
      onClick={() => {
        close();
        wrapItemsNow(editor, currentWrapItems(editor, row));
      }}
    >
      {t('multi.wrap')}
      <kbd class="kbd menu-shortcut" aria-hidden="true">
        {SHORTCUT_LABELS.wrap}
      </kbd>
    </Button>
  );
}

/** Itens do menu (botões) de um item da imagem ou da marcação; `close` fecha o menu. */
export function CopyMenuItems({
  target,
  close,
  copyable = true,
}: {
  readonly target: CopyTarget;
  readonly close: () => void;
  /** Falso quando não há o que copiar (projeto fora de uma pasta): só as outras entradas. */
  readonly copyable?: boolean;
}) {
  const editor = useEditor();
  const selectable = target.kind === 'm';
  return (
    <div class="menu-items">
      {copyable && (
        <>
          <Button
            role="menuitem"
            onClick={() => {
              close();
              void copyReference(editor, target);
            }}
          >
            {t('copy.reference')}
          </Button>
          {target.kind === 'm' &&
            canCopyCrop(editor.review.derived.shownProject.value, target.id) && (
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
        </>
      )}
      {selectable && <SelectContentsItem markingId={target.id} close={close} />}
      <WrapMenuItem target={target} close={close} />
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
  const copyable = canCopyItems(editor);
  // Fora de uma pasta não há o que copiar, mas o Envolver vale para marcação e container.
  if (!copyable && target.kind === 'a') return null;
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
      {(close) => <CopyMenuItems target={target} close={close} copyable={copyable} />}
    </Popover>
  );
}
