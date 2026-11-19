import type { EditorDialogs } from '../app/useEditorDialogs';
import { t } from '../i18n';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { pageItemsText } from './pageItemsText';
import { PickerList, PickerOption } from './PickerList';
import { Popover } from './Popover';

// Page menu of the canvas bar (stage #883, PG2, decision 9), beside the perspective picker: the
// button shows the open page and the list has every page, in order, with the count of items of each
// and the open one marked. "New page…" opens Manage pages with the create field focused; "Manage
// pages…" opens it plain. Always visible, even with one page; the review does not lock it. In the
// review's Proposed view it lists the pages of the preview, with the "New in this proposal" tag on a
// page that only the proposal creates (stage #2177, PF3, decision 14).

const STOPS = '[role="option"], .page-action';

interface RowProps {
  readonly name: string;
  readonly count: number;
  /** The page only the proposal creates (the review's Proposed view). */
  readonly created: boolean;
  readonly selected: boolean;
  readonly onPick: () => void;
}

function Row({ name, count, created, selected, onPick }: RowProps) {
  return (
    <PickerOption rowClass="page-row" name={name} selected={selected} onPick={onPick}>
      <span class="page-row-trail">
        {created && <span class="page-row-tag">{t('page.picker.created')}</span>}
        <span class="page-row-count">{pageItemsText(count)}</span>
      </span>
    </PickerOption>
  );
}

interface ListProps {
  readonly dialogs: EditorDialogs;
  readonly close: () => void;
}

function PageList({ dialogs, close }: ListProps) {
  const { session } = useEditor();
  const pages = session.page.pages.value;
  const openId = session.page.id.value;
  const counts = session.page.rootCounts.value;
  const created = session.page.createdByProposal.value;

  const run = (focus?: { readonly kind: 'create' }) => {
    close();
    dialogs.show(focus ? { kind: 'managePages', focus } : { kind: 'managePages' });
  };

  return (
    <PickerList
      class="page-list"
      label={t('page.picker.list')}
      stops={STOPS}
      actionsClass="page-actions"
      actions={
        <>
          <Button class="page-action" onClick={() => run({ kind: 'create' })}>
            {t('page.picker.new')}
          </Button>
          <Button class="page-action" onClick={() => run()}>
            {t('page.picker.manage')}
          </Button>
        </>
      }
    >
      {pages.map((page) => (
        <Row
          key={page.id}
          name={page.name}
          count={counts.get(page.id) ?? 0}
          created={created.has(page.id)}
          selected={page.id === openId}
          onPick={() => {
            close();
            session.page.open(page.id);
          }}
        />
      ))}
    </PickerList>
  );
}

export function PageMenu({ dialogs }: { readonly dialogs: EditorDialogs }) {
  const { session } = useEditor();
  const openId = session.page.id.value;
  const name = session.page.pages.value.find((p) => p.id === openId)?.name ?? '';
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
