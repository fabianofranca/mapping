import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { CatalogView } from './catalog/CatalogView';
import { Button, Select, Tabs, type TabItem } from './controls';
import { useEditor } from './EditorContext';
import { LibraryPalette } from './LibraryPalette';
import { ToolWindow } from './ToolWindow';
import { useAddComponent } from './useAddComponent';

// Catalog window (stage Library, B5), on the left: the Components tab shows the catalog
// of the packages applied to the project (list; the component page opens in a dialog) and the
// Palette tab is the B3 palette. The catalogs are only read and built when the window is open.

type CatalogTab = 'components' | 'palette';

interface CatalogWindowProps {
  /** Opens the Specializations dialog (shortcut from the empty state). */
  readonly onOpenSpecs: () => void;
}

export function CatalogWindow({ onOpenSpecs }: CatalogWindowProps) {
  const [tab, setTab] = useState<CatalogTab>('components');
  const tabs: readonly TabItem<CatalogTab>[] = [
    { id: 'components', label: t('catalog.window.components') },
    { id: 'palette', label: t('catalog.window.palette') },
  ];
  return (
    <ToolWindow id="catalog">
      <div class="catalog-window">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          label={t('catalog.window.tabs')}
        />
        <div role="tabpanel">
          {tab === 'components' ? (
            <CatalogComponents onOpenSpecs={onOpenSpecs} />
          ) : (
            <LibraryPalette onOpenSpecs={onOpenSpecs} />
          )}
        </div>
      </div>
    </ToolWindow>
  );
}

function CatalogComponents({ onOpenSpecs }: CatalogWindowProps) {
  const { session, review } = useEditor();
  const { add, disabledReason, error } = useAddComponent();
  const [specId, setSpecId] = useState<string | null>(null);
  // The key changes with the applied versions; the stamp, when the files may have changed.
  const key = session.catalogs.key.value;
  const stamp = session.catalogs.stamp.value;
  useEffect(() => {
    session.catalogs.request();
  }, [session, key, stamp]);

  const entries = session.catalogs.entries.value;
  const project = review.derived.shownProject.value;
  if (key === '' || (entries !== null && entries.length === 0)) {
    return (
      <div class="library-empty">
        <p class="muted">{t('library.empty')}</p>
        <Button onClick={onOpenSpecs}>{t('library.openSpecs')}</Button>
      </div>
    );
  }
  if (entries === null) return <p class="muted">{t('catalog.window.loading')}</p>;

  const current = entries.find((e) => e.specId === specId) ?? entries[0];
  if (!current) return null;
  return (
    <>
      {entries.length > 1 && (
        <Select
          label={t('catalog.window.spec')}
          value={current.specId}
          onChange={(e) => setSpecId(e.currentTarget.value)}
        >
          {entries.map((e) => (
            <option key={e.specId} value={e.specId}>
              {e.name}
            </option>
          ))}
        </Select>
      )}
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
      <CatalogView
        key={`${current.specId}@${current.version}`}
        catalog={current.catalog}
        specId={current.specId}
        version={current.version}
        fontsEpoch={session.components.fontsEpoch.value}
        project={project}
        layout="list"
        onAddToScreen={(typeId) => add(current.specId, typeId)}
        {...(disabledReason === undefined ? {} : { addDisabledReason: disabledReason })}
      />
    </>
  );
}
