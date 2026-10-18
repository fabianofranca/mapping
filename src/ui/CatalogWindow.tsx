import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { packageDirOf } from '../model';
import { CatalogView } from './catalog/CatalogView';
import { Button, Select, Tabs, type TabItem } from './controls';
import { useEditor } from './EditorContext';
import { LibraryPalette } from './LibraryPalette';
import { ToolWindow } from './ToolWindow';
import { useAddComponent } from './useAddComponent';

// Janela Catálogo (etapa Biblioteca, B5), à esquerda: a aba Componentes mostra o catálogo
// dos pacotes aplicados ao projeto (lista; a página do componente abre num diálogo) e a aba
// Paleta é a paleta da B3. Os catálogos só são lidos e montados quando a janela está aberta.

type CatalogTab = 'components' | 'palette';

interface CatalogWindowProps {
  /** Abre o diálogo de Especializações (atalho do estado vazio). */
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
  const committed = session.store.committed.value;
  // A chave muda com as versões aplicadas; o carimbo, quando os arquivos podem ter mudado.
  const key = (committed?.specializations ?? [])
    .map((s) => `${s.id}@${s.version}`)
    .join('|');
  const stamp = session.catalogs.stamp.value;
  useEffect(() => {
    session.catalogs.request();
  }, [session, key, stamp]);

  const entries = session.catalogs.entries.value;
  const project = review.derived.shownProject.value;
  const hasPackage = (committed?.specializations ?? []).some(
    (s) => s.spec !== null && packageDirOf(s.file) !== null,
  );
  if (!hasPackage || (entries !== null && entries.length === 0)) {
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
