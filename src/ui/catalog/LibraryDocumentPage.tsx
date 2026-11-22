import { t } from '../../i18n';
import type { CatalogDocument } from '../../model';
import { docFolderAccess, type DocFolderAccess } from '../../storage/docRepoFolders';
import { DocumentBody } from './CatalogPage';

// Page of a library document (Catalog, Documents group): name, id and text. Presentation only.

export interface LibraryDocumentPageProps {
  readonly document: CatalogDocument;
  readonly onLink?: (href: string) => void;
  /** Access to the folders of the documents repositories (tests inject a fake). */
  readonly docAccess?: DocFolderAccess;
}

export function LibraryDocumentPage({
  document,
  onLink,
  docAccess = docFolderAccess,
}: LibraryDocumentPageProps) {
  return (
    <article class="catalog-page" aria-label={document.name}>
      <header class="catalog-page-header">
        <h2 class="catalog-page-name">{document.name}</h2>
        <p class="muted catalog-page-meta">
          <code title={t('catalog.documentId')}>{document.id}</code>
        </p>
      </header>
      <section class="catalog-section">
        <DocumentBody
          external={document.docExternal}
          text={document.docText}
          emptyKey="catalog.documentPage.noText"
          access={docAccess}
          {...(onLink === undefined ? {} : { onLink })}
        />
      </section>
    </article>
  );
}
