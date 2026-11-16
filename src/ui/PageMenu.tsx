import { useLayoutEffect, useRef } from 'preact/hooks';
import type { EditorDialogs } from '../app/useEditorDialogs';
import { t } from '../i18n';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { pageItemsText } from './pageItemsText';
import { cycleStops } from './pickerKeys';
import { Popover } from './Popover';

// Page menu of the canvas bar (stage #883, PG2, decision 9), beside the perspective picker: the
// button shows the open page and the list has every page, in order, with the count of items of each
// and the open one marked. "New page…" opens Manage pages with the create field focused; "Manage
// pages…" opens it plain. Always visible, even with one page; the review does not lock it.

const STOPS = '[role="option"], .page-action';

interface RowProps {
  readonly name: string;
  readonly count: number;
  readonly selected: boolean;
  readonly onPick: () => void;
}

function Row({ name, count, selected, onPick }: RowProps) {
  return (
    /* Exception to Button: list option (role="option") (docs/DESIGN-SYSTEM.md, "Loose buttons") */
    <button
      type="button"
      role="option"
      class="page-row"
      aria-selected={selected}
      data-name={name}
      onClick={onPick}
    >
      <span class="page-row-check" aria-hidden="true">
        {selected && <Icon name="check" />}
      </span>
      <span class="page-row-name">{name}</span>
      <span class="page-row-count">{pageItemsText(count)}</span>
    </button>
  );
}

interface ListProps {
  readonly dialogs: EditorDialogs;
  readonly close: () => void;
}

function PageList({ dialogs, close }: ListProps) {
  const { session, store } = useEditor();
  const root = useRef<HTMLDivElement>(null);
  const pages = store.committed.value?.pages ?? [];
  const openId = session.page.id.value;
  const counts = session.page.rootCounts.value;

  // Focus enters the open row, in the same commit that opens the list.
  useLayoutEffect(() => {
    root.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
  }, []);

  const run = (focus?: { readonly kind: 'create' }) => {
    close();
    dialogs.show(focus ? { kind: 'managePages', focus } : { kind: 'managePages' });
  };

  return (
    <div
      class="page-list"
      ref={root}
      onKeyDown={(e) => cycleStops(root.current, e, STOPS)}
    >
      <div role="listbox" aria-label={t('page.picker.list')}>
        {pages.map((page) => (
          <Row
            key={page.id}
            name={page.name}
            count={counts.get(page.id) ?? 0}
            selected={page.id === openId}
            onPick={() => {
              close();
              session.page.open(page.id);
            }}
          />
        ))}
      </div>
      <div class="page-actions">
        <Button class="page-action" onClick={() => run({ kind: 'create' })}>
          {t('page.picker.new')}
        </Button>
        <Button class="page-action" onClick={() => run()}>
          {t('page.picker.manage')}
        </Button>
      </div>
    </div>
  );
}

export function PageMenu({ dialogs }: { readonly dialogs: EditorDialogs }) {
  const { session, store } = useEditor();
  const openId = session.page.id.value;
  const name = store.committed.value?.pages.find((p) => p.id === openId)?.name ?? '';
  return (
    <Popover
      class="page-picker"
      label={t('page.picker.list')}
      trigger={({ open, toggle }) => (
        /* Exception to Button: select-like trigger (menu-trigger) (docs/DESIGN-SYSTEM.md, "Loose buttons") */
        <button
          type="button"
          class="menu-trigger page-trigger"
          aria-label={t('page.picker.label', { name })}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={toggle}
        >
          <Icon name="file" />
          <span class="page-trigger-name">{name}</span>
          <Icon name="chevronDown" />
        </button>
      )}
    >
      {(close) => <PageList dialogs={dialogs} close={close} />}
    </Popover>
  );
}
