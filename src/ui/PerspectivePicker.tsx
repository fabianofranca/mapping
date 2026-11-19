import { useComputed } from '@preact/signals';
import type { EditorDialogs } from '../app/useEditorDialogs';
import { t } from '../i18n';
import { Button, Tooltip } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { PickerList, PickerOption } from './PickerList';
import { Popover } from './Popover';
import { perspectiveContentText } from './perspectiveContentText';

// Perspective picker of the main bar (stage #659, PE3): the button shows the open one and
// who sees it; the list has the "For everyone" group (Main first) and "Only mine".

const STOPS = '[role="option"], .perspective-action';

interface RowProps {
  readonly name: string;
  readonly note: string;
  /** Items the perspective shows on the open page (stage #883, decision 7). */
  readonly pageCount: number;
  readonly selected: boolean;
  readonly onPick: () => void;
}

/** "N items on this page", "1 item on this page" or "nothing on this page". */
const pageCountText = (count: number): string =>
  count === 0
    ? t('page.perspectiveCount.none')
    : count === 1
      ? t('page.perspectiveCount.one')
      : t('page.perspectiveCount.many', { count });

function Row({ name, note, pageCount, selected, onPick }: RowProps) {
  return (
    <PickerOption
      rowClass="perspective-row"
      name={name}
      selected={selected}
      onPick={onPick}
    >
      <span class="perspective-row-page">{pageCountText(pageCount)}</span>
      <span class="perspective-row-note">{note}</span>
    </PickerOption>
  );
}

interface ListProps {
  readonly dialogs: EditorDialogs;
  readonly close: () => void;
}

function PerspectiveList({ dialogs, close }: ListProps) {
  const { session, store } = useEditor();
  const project = store.committed.value;
  const openId = session.perspective.id.value;
  const localIds = session.perspective.localIds.value;
  const openPage = session.page.id.value;
  const pageCounts = session.page.perspectiveCounts.value;
  const completeCount = session.page.rootCounts.value.get(openPage) ?? 0;

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
    <PickerList
      class="perspective-list"
      label={t('perspective.picker.list')}
      stops={STOPS}
      actionsClass="perspective-actions"
      actions={
        <>
          <Button class="perspective-action" onClick={() => run('newPerspective')}>
            {t('perspective.picker.new')}
          </Button>
          <Button class="perspective-action" onClick={() => run('managePerspectives')}>
            {t('perspective.picker.manage')}
          </Button>
        </>
      }
    >
      <div role="group" aria-label={t('perspective.picker.shared')}>
        <div class="perspective-group" aria-hidden="true">
          {t('perspective.picker.shared')}
        </div>
        <Row
          name={t('perspective.principal')}
          note={t('perspective.principalNote')}
          pageCount={completeCount}
          selected={openId === null}
          onPick={() => pick(null)}
        />
        {shared.map((p) => (
          <Row
            key={p.id}
            name={p.name}
            note={perspectiveContentText(project, p)}
            pageCount={pageCounts.get(p.id) ?? 0}
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
              pageCount={pageCounts.get(p.id) ?? 0}
              selected={openId === p.id}
              onPick={() => pick(p.id)}
            />
          ))}
        </div>
      )}
    </PickerList>
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
      {(close) => <PerspectiveList dialogs={dialogs} close={close} />}
    </Popover>
  );
}
