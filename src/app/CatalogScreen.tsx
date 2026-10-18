import { t } from '../i18n';
import { CatalogView } from '../ui/catalog/CatalogView';
import { Button } from '../ui/controls';
import { Icon } from '../ui/icons';
import type { LibraryPreview } from '../store/libraryPreview';
import { closeLibrary } from './controller';
import { NarrowWindowNotice, useNarrowWindow } from './NarrowWindow';

// Tela do Catálogo de uma biblioteca aberta pela tela inicial, sem projeto (etapa Biblioteca,
// B5): barra com o Voltar, o nome e a versão, e o catálogo com lista e página lado a lado.
// Sem projeto não há onde adicionar nem repositório para os links de código.

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
          <Button onClick={closeLibrary}>
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
