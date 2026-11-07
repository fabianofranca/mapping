import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { projectIndex, type Perspective, type Project } from '../model';
import { principalOnly, type PrincipalOnlyCommand } from '../store/perspectiveGestures';
import { showToast } from '../store/ui';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';

// Itens do menu do botão direito ligados às perspectivas (etapa #659, PE3): Enviar para
// perspectiva (submenu de caixas), Tirar desta perspectiva e a dica dos comandos que só valem na
// Principal. O alvo é sempre a RAIZ do item sob o cursor (ou de cada item da seleção).

/** As raízes distintas dos itens (`ids`), na ordem em que aparecem; ids sem raiz somem. */
export function rootsOf(project: Project, ids: readonly string[]): readonly string[] {
  const { rootOf } = projectIndex(project);
  const roots = new Set<string>();
  for (const id of ids) {
    const root = rootOf.get(id);
    if (root !== undefined) roots.add(root);
  }
  return [...roots];
}

/**
 * O comando só vale na Principal e há uma perspectiva aberta? A interface o desabilita e mostra
 * `PrincipalOnlyHint` (decisão 5).
 */
export function blockedOutsideMain(
  project: Project,
  openId: string | null,
  command: PrincipalOnlyCommand,
  targets: readonly string[] = [],
): boolean {
  return principalOnly(project, openId, command, targets);
}

/** A dica "só na Principal" sob o item desabilitado; o item a cita por `aria-describedby`. */
export function PrincipalOnlyHint({ id }: { readonly id: string }) {
  return (
    <span id={id} class="menu-hint">
      {t('perspective.principalOnly')}
    </span>
  );
}

/** Um item de menu que pode estar bloqueado fora da Principal (com a dica sob ele). */
export function PrincipalOnlyItem({
  blocked,
  disabled = false,
  variant,
  onClick,
  children,
}: {
  readonly blocked: boolean;
  readonly disabled?: boolean;
  readonly variant?: 'danger';
  readonly onClick: () => void;
  readonly children: string;
}) {
  const hintId = useId();
  return (
    <>
      <Button
        role="menuitem"
        variant={variant}
        disabled={blocked || disabled}
        aria-describedby={blocked ? hintId : undefined}
        onClick={onClick}
      >
        {children}
      </Button>
      {blocked && <PrincipalOnlyHint id={hintId} />}
    </>
  );
}

interface Row {
  readonly perspective: Perspective | null;
  readonly checked: boolean;
  readonly locked: boolean;
  readonly note: string | null;
}

/** As linhas do submenu: a Principal, a aberta e as demais, cada uma marcada ou não. */
function rowsOf(
  project: Project,
  openId: string | null,
  localIds: ReadonlySet<string>,
  roots: readonly string[],
): readonly Row[] {
  const rows: Row[] = [
    {
      perspective: null,
      checked: true,
      locked: true,
      note: t('perspective.menu.always'),
    },
  ];
  for (const perspective of project.perspectives) {
    const open = perspective.id === openId;
    const has = new Set(perspective.items.map((i) => i.root));
    const note = open
      ? t('perspective.menu.current')
      : localIds.has(perspective.id)
        ? t('perspective.menu.mine')
        : null;
    rows.push({
      perspective,
      checked: open || (roots.length > 0 && roots.every((r) => has.has(r))),
      locked: open,
      note,
    });
  }
  return rows;
}

/**
 * "Enviar para perspectiva ›" e "Tirar desta perspectiva". `ids` são os itens (container ou
 * marcação) do alvo do menu; as ações usam a raiz de cada um. Marcar uma caixa envia, desmarcar
 * tira; a Principal e a aberta ficam marcadas e travadas. → abre o submenu e ← o fecha.
 */
export function PerspectiveMenuItems({
  ids,
  close,
}: {
  readonly ids: readonly string[];
  readonly close: () => void;
}) {
  const { store, session, ui } = useEditor();
  const [expanded, setExpanded] = useState(false);
  const parent = useRef<HTMLButtonElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const project = store.committed.value;
  const openId = session.perspective.id.value;
  const localIds = session.perspective.localIds.value;
  const wasExpanded = useRef(false);
  // Aberto pelo ponteiro: o foco fica onde está (abrir por hover não rouba o foco).
  const byPointer = useRef(false);
  const [flip, setFlip] = useState(false);
  // Aberto só pelo hover: o primeiro clique no item pai confirma (não fecha).
  const openedByHover = useRef(false);

  // Sem espaço à direita, o submenu abre à esquerda do item pai (e fica dentro da janela).
  useLayoutEffect(() => {
    if (!expanded) {
      setFlip(false);
      return;
    }
    const box = sub.current?.getBoundingClientRect();
    const width = globalThis.innerWidth || document.documentElement.clientWidth;
    if (box && box.right > width) setFlip(true);
  }, [expanded]);

  // Abrir leva o foco à primeira caixa habilitada; fechar devolve-o ao item pai.
  useEffect(() => {
    if (byPointer.current) {
      byPointer.current = false;
    } else if (expanded) {
      sub.current
        ?.querySelector<HTMLElement>('button:not(:disabled)')
        ?.focus({ preventScroll: true });
    } else if (wasExpanded.current) {
      parent.current?.focus();
    }
    wasExpanded.current = expanded;
  }, [expanded]);

  // Sem nenhuma perspectiva, não há para onde enviar nem de onde tirar.
  if (!project || project.perspectives.length === 0) return null;
  const roots = rootsOf(project, ids);
  if (roots.length === 0) return null;
  const locked = store.locked.value;
  const actions = session.perspectiveActions;
  const fail = () => showToast(ui, t('perspective.error'));
  const toggle = (row: Row) => {
    if (!row.perspective) return;
    const result = row.checked
      ? actions.removeRootsFromPerspective(row.perspective.id, roots)
      : actions.sendRootsToPerspective(row.perspective.id, roots);
    if (!result.ok) fail();
  };
  const hoverOpen = () => {
    if (locked || expanded) return;
    byPointer.current = true;
    openedByHover.current = true;
    setExpanded(true);
  };
  const onParentClick = () => {
    if (openedByHover.current) {
      openedByHover.current = false;
      return;
    }
    setExpanded((open) => !open);
  };
  const hoverClose = () => {
    if (!expanded) return;
    byPointer.current = true;
    openedByHover.current = false;
    setExpanded(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const inSub = sub.current?.contains(e.target as Node) ?? false;
    if (e.key === 'ArrowRight' && e.target === parent.current && !locked) {
      e.preventDefault();
      setExpanded(true);
    } else if (e.key === 'ArrowLeft' && inSub) {
      e.preventDefault();
      setExpanded(false);
    }
  };

  return (
    <div class="menu-items menu-items-group" onKeyDown={onKeyDown}>
      <div class="menu-sub-host" onPointerEnter={hoverOpen}>
        <Button
          role="menuitem"
          buttonRef={parent}
          aria-haspopup="menu"
          aria-expanded={expanded}
          disabled={locked}
          onClick={onParentClick}
        >
          {t('perspective.menu.send')}
          <Icon name="chevronRight" />
        </Button>
        {expanded && !locked && (
          <div
            class={
              flip ? 'popover menu-submenu menu-submenu-left' : 'popover menu-submenu'
            }
            data-submenu
            role="menu"
            aria-label={t('perspective.menu.send')}
            ref={sub}
          >
            <div class="menu-items">
              <div class="menu-heading">{t('perspective.menu.sendHeading')}</div>
              {rowsOf(project, openId, localIds, roots).map((row) => (
                <Button
                  key={row.perspective?.id ?? 'main'}
                  role="menuitemcheckbox"
                  aria-checked={row.checked}
                  disabled={row.locked}
                  onClick={() => toggle(row)}
                >
                  {row.checked ? <Icon name="check" /> : <span class="menu-check-slot" />}
                  {row.perspective?.name ?? t('perspective.principal')}
                  {row.note !== null && <span class="menu-note">{row.note}</span>}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      {openId !== null && (
        <Button
          role="menuitem"
          disabled={locked}
          onPointerEnter={hoverClose}
          onClick={() => {
            close();
            if (!actions.removeRootsFromPerspective(openId, roots).ok) fail();
          }}
        >
          {t('perspective.menu.remove')}
        </Button>
      )}
    </div>
  );
}
