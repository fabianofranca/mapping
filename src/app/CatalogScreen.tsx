import { t } from '../i18n';
import { CatalogView } from '../ui/catalog/CatalogView';
import { Button } from '../ui/controls';
import { Icon } from '../ui/icons';
import type { LibraryPreview } from '../store/libraryPreview';
import { closeLibrary } from './controller';
import { requestHomeFocus } from './homeFocus';
import { NarrowWindowNotice, useNarrowWindow } from './NarrowWindow';

// Catalog screen of a library opened from the home screen, without a project (Library stage,
// B5): a bar with Back, the name and the version, and the catalog with list and page side by
// side. Without a project there is nowhere to add to nor a repository for the code links.

interface CatalogScreenProps {
  readonly library: LibraryPreview;
}

export function CatalogScreen({ library }: CatalogScreenProps) {
  const narrow = useNarrowWindow();
  const name = library.name || t('catalog.home.untitled');
  return (
    <>
      <main class="catalog-screen" aria-label={t('catalog.home.screen')} hidden={narrow}>
        <header class="catalog-screen-bar">
          <Button
            onClick={() => {
              requestHomeFocus();
              closeLibrary();
            }}
          >
            <Icon name="arrowLeft" />
            {t('catalog.home.back')}
          </Button>
          <h1 class="catalog-screen-title">{name}</h1>
          {library.version > 0 && (
            <span class="muted">
              {t('catalog.home.version', { version: library.version })}
            </span>
          )}
        </header>
        <div class="catalog-screen-body">
          <CatalogView
            catalog={library.catalog}
            specId={library.specId}
            version={library.version}
            fontsEpoch={library.fontsEpoch.value}
            project={null}
            layout="split"
          />
        </div>
      </main>
      {narrow && <NarrowWindowNotice />}
    </>
  );
}
