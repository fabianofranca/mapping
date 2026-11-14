import { useComputed } from '@preact/signals';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { EditorDialogs } from '../app/useEditorDialogs';
import { t } from '../i18n';
import { Button, Tooltip } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { Popover } from './Popover';
import { perspectiveContentText } from './perspectiveContentText';

// Perspective picker of the main bar (stage #659, PE3): the button shows the open one and
// who sees it; the list has the "For everyone" group (Main first) and "Only mine".

const STOPS = '[role="option"], .perspective-action';

interface RowProps {
  readonly name: string;
  readonly note: string;
  readonly selected: boolean;
  readonly onPick: () => void;
}

function Row({ name, note, selected, onPick }: RowProps) {
  return (
    /* Exception to Button: list option (role="option") (docs/DESIGN-SYSTEM.md, "Loose buttons") */
    <button
      type="button"
      role="option"
      class="perspective-row"
      aria-selected={selected}
      data-name={name}
      onClick={onPick}
    >
      <span class="perspective-row-check" aria-hidden="true">
        {selected && <Icon name="check" />}
      </span>
      <span class="perspective-row-name">{name}</span>
      <span class="perspective-row-note">{note}</span>
    </button>
  );
}

/** ↑/↓ cycle among the rows and the list's buttons. */
function moveKeys(root: HTMLElement | null, e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const stops = [...(root?.querySelectorAll<HTMLElement>(STOPS) ?? [])];
  const at = stops.indexOf(document.activeElement as HTMLElement);
  const step = e.key === 'ArrowDown' ? 1 : -1;
  stops[(at + step + stops.length) % stops.length]?.focus();
}

interface ListProps {
  readonly dialogs: EditorDialogs;
  readonly close: () => void;
}

function PickerList({ dialogs, close }: ListProps) {
  const { session, store } = useEditor();
  const root = useRef<HTMLDivElement>(null);
  const project = store.committed.value;
  const openId = session.perspective.id.value;
  const localIds = session.perspective.localIds.value;

  // Focus enters the open row, in the same commit that opens the list.
  useLayoutEffect(() => {
    root.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
  }, []);

  if (project === null) return null;
  const shared = project.perspectives.filter((p) => !localIds.has(p.id));
  const mine = project.perspectives.filter((p) => localIds.has(p.id));
  const pick = (id: string | null) => {
    close();
    session.perspective.open(id);
  };
  const run = (kind: 'newPerspective' | 'managePerspectives') => {
    close();
    dialogs.show({ kind });
  };

  return (
    <div class="perspective-list" ref={root} onKeyDown={(e) => moveKeys(root.current, e)}>
      <div role="listbox" aria-label={t('perspective.picker.list')}>
        <div role="group" aria-label={t('perspective.picker.shared')}>
          <div class="perspective-group" aria-hidden="true">
            {t('perspective.picker.shared')}
          </div>
          <Row
            name={t('perspective.principal')}
            note={t('perspective.principalNote')}
            selected={openId === null}
            onPick={() => pick(null)}
          />
          {shared.map((p) => (
            <Row
              key={p.id}
              name={p.name}
              note={perspectiveContentText(project, p)}
              selected={openId === p.id}
              onPick={() => pick(p.id)}
            />
          ))}
        </div>
        {mine.length > 0 && (
          <div role="group" aria-label={t('perspective.picker.mine')}>
            <div class="perspective-group" aria-hidden="true">
              {t('perspective.picker.mine')}
            </div>
            {mine.map((p) => (
              <Row
                key={p.id}
                name={p.name}
                note={t('perspective.noteMine', {
                  content: perspectiveContentText(project, p),
                })}
                selected={openId === p.id}
                onPick={() => pick(p.id)}
              />
            ))}
          </div>
        )}
      </div>
      <div class="perspective-actions">
        <Button class="perspective-action" onClick={() => run('newPerspective')}>
          {t('perspective.picker.new')}
        </Button>
        <Button class="perspective-action" onClick={() => run('managePerspectives')}>
          {t('perspective.picker.manage')}
        </Button>
      </div>
    </div>
  );
}

export function PerspectivePicker({ dialogs }: { readonly dialogs: EditorDialogs }) {
  const { session, store } = useEditor();
  const shown = useComputed(() => {
    const id = session.perspective.id.value;
    const name =
      id === null
        ? t('perspective.principal')
        : (store.committed.value?.perspectives.find((p) => p.id === id)?.name ??
          t('perspective.principal'));
    const who =
      id === null
        ? t('perspective.whoAll')
        : session.perspective.localIds.value.has(id)
          ? t('perspective.whoMine')
          : t('perspective.whoShared');
    return { name, who };
  });
  const locked = session.perspective.locked.value;
  const { name, who } = shown.value;
  return (
    <Popover
      class="perspective-picker"
      label={t('perspective.picker.list')}
      trigger={({ open, toggle }) => {
        const button = (
          /* Exception to Button: select-like trigger (menu-trigger) (docs/DESIGN-SYSTEM.md, "Loose buttons") */
          <button
            type="button"
            class="menu-trigger perspective-trigger"
            aria-label={t('perspective.picker.label', { name, who })}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={locked}
            onClick={toggle}
          >
            <Icon name="perspective" />
            <span class="perspective-trigger-name">{name}</span>
            <span class="perspective-trigger-who">{who}</span>
            <Icon name="chevronDown" />
          </button>
        );
        return locked ? (
          <Tooltip label={t('perspective.picker.locked')}>{button}</Tooltip>
        ) : (
          button
        );
      }}
    >
      {(close) => <PickerList dialogs={dialogs} close={close} />}
    </Popover>
  );
}
