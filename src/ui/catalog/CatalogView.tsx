import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { type Catalog, type CatalogEntry, type Project, findEntry } from '../../model';
import { Button, TextField } from '../controls';
import { Dialog } from '../Dialog';
import { LibraryIssueList } from '../LibraryIssueList';
import { CatalogPage } from './CatalogPage';
import { type CatalogRenderer, defaultCatalogRenderer } from './renderer';

// Catálogo de uma biblioteca: validação no topo, lista dos componentes por camada (com busca)
// e a página do componente. `split`: lista e página lado a lado (tela inicial); `list`: só a
// lista, e a página abre num diálogo (janela estreita do editor). Só apresentação.

export interface CatalogViewProps {
  readonly catalog: Catalog;
  /** Id da especialização (chave do cache de imagens e do destino `mapping://<specId>/<typeId>`). */
  readonly specId: string;
  readonly version: number;
  readonly fontsEpoch?: number;
  /** Projeto aberto: com ele o `path` do código vira link do repositório. */
  readonly project?: Project | null;
  readonly layout: 'split' | 'list';
  readonly onAddToScreen?: (typeId: string) => void;
  /** Motivo de o Adicionar estar desabilitado (vira o `title`). */
  readonly addDisabledReason?: string;
  readonly initialTypeId?: string;
  /** Medidor, rasterizador e cache; o padrão usa o Konva (testes injetam um falso). */
  readonly renderer?: CatalogRenderer;
}

const ISSUES_COLLAPSE_AT = 6;

/** Resolve `mapping://<specId>/<typeId>` (ou `mapping://<typeId>`); `null` se não bate. */
export function resolveCatalogLink(
  catalog: Catalog,
  specId: string,
  href: string,
): string | null {
  const match = /^mapping:\/\/([^?#]*)/.exec(href);
  if (match?.[1] === undefined) return null;
  let parts: string[];
  try {
    parts = match[1]
      .split('/')
      .filter((p) => p !== '')
      .map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }
  if (parts.length === 0 || parts.length > 2) return null;
  if (parts.length === 2 && parts[0] !== specId) return null;
  const typeId = parts[parts.length - 1];
  return typeId !== undefined && findEntry(catalog, typeId) !== undefined ? typeId : null;
}

function matches(entry: CatalogEntry, query: string): boolean {
  if (query === '') return true;
  const haystack = `${entry.type.name} ${entry.type.id} ${entry.type.description ?? ''}`;
  return haystack.toLowerCase().includes(query);
}

export function CatalogView({
  catalog,
  specId,
  version,
  fontsEpoch = 0,
  project = null,
  layout,
  onAddToScreen,
  addDisabledReason,
  initialTypeId,
  renderer,
}: CatalogViewProps) {
  const engine = renderer ?? defaultCatalogRenderer();
  const initial =
    initialTypeId !== undefined && findEntry(catalog, initialTypeId) !== undefined
      ? initialTypeId
      : null;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [dialogOpen, setDialogOpen] = useState(layout === 'list' && initial !== null);
  const [issuesOpen, setIssuesOpen] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const [navigation, setNavigation] = useState(0);

  const needle = query.trim().toLowerCase();
  const layers = useMemo(
    () =>
      catalog.layers
        .map((layer) => ({
          ...layer,
          entries: layer.entries.filter((entry) => matches(entry, needle)),
        }))
        .filter((layer) => layer.entries.length > 0),
    [catalog, needle],
  );
  const firstEntry = catalog.layers.flatMap((l) => l.entries)[0];
  const selected =
    (selectedId === null ? undefined : findEntry(catalog, selectedId)) ??
    (layout === 'split' ? firstEntry : undefined);

  const { errors, warnings } = catalog.report;
  const issueCount = errors.length + warnings.length;
  const issuesShown = issuesOpen ?? issueCount < ISSUES_COLLAPSE_AT;

  const select = (typeId: string) => {
    setNotice(null);
    setSelectedId(typeId);
    setNavigation((n) => n + 1);
    if (layout === 'list') {
      openerRef.current = document.activeElement as HTMLElement | null;
      setDialogOpen(true);
    }
  };

  // Navegar para um componente abre a página no topo (tela cheia e diálogo).
  useEffect(() => {
    if (navigation === 0) return;
    if (detailRef.current !== null) detailRef.current.scrollTop = 0;
    // No diálogo, quem rola é um ancestral do conteúdo: zera todos até o próprio diálogo.
    for (
      let el = dialogContentRef.current?.parentElement;
      el && el.getAttribute('role') !== 'dialog';
      el = el.parentElement
    ) {
      el.scrollTop = 0;
    }
  }, [navigation]);

  const onLink = (href: string) => {
    const typeId = resolveCatalogLink(catalog, specId, href);
    if (typeId === null) {
      setNotice(t('catalog.view.unknownLink', { link: href }));
      return;
    }
    select(typeId);
  };

  // Setas movem o foco entre os itens da lista (Enter/Espaço ativam o botão).
  const onListKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-type-id]') ??
        []),
    ];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const next = items[at + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next === undefined) return;
    e.preventDefault();
    next.focus();
  };

  const page = selected !== undefined && (
    <CatalogPage
      catalog={catalog}
      entry={selected}
      specId={specId}
      version={version}
      renderer={engine}
      fontsEpoch={fontsEpoch}
      project={project}
      onLink={onLink}
      {...(onAddToScreen === undefined ? {} : { onAddToScreen })}
      {...(addDisabledReason === undefined ? {} : { addDisabledReason })}
    />
  );

  return (
    <div class={layout === 'list' ? 'catalog catalog-list-layout' : 'catalog'}>
      <section class="catalog-validation" aria-label={t('catalog.view.validation')}>
        <p
          class={errors.length > 0 ? 'catalog-validation-bad' : 'muted'}
          role={errors.length > 0 ? 'alert' : undefined}
        >
          {issueCount === 0
            ? t('catalog.view.valid')
            : t('catalog.view.summary', {
                errors: errors.length,
                warnings: warnings.length,
              })}
          {issueCount > 0 && (
            <>
              {' '}
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={issuesShown}
                onClick={() => setIssuesOpen(!issuesShown)}
              >
                {issuesShown
                  ? t('catalog.view.hideIssues')
                  : t('catalog.view.showIssues')}
              </Button>
            </>
          )}
        </p>
        {errors.length > 0 && <p class="muted">{t('catalog.view.hasErrors')}</p>}
        {issuesShown && <LibraryIssueList issues={catalog.report.issues} />}
      </section>

      <div class="catalog-body">
        <nav class="catalog-list" aria-label={t('catalog.view.components')}>
          <TextField
            type="search"
            aria-label={t('catalog.view.search')}
            placeholder={t('catalog.view.search')}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <div class="catalog-list-scroll" ref={listRef} onKeyDown={onListKeyDown}>
            {layers.length === 0 ? (
              <p class="muted">
                {catalog.layers.length === 0
                  ? t('catalog.view.empty')
                  : t('catalog.view.noMatch')}
              </p>
            ) : (
              layers.map((layer) => (
                <section key={layer.id} class="catalog-layer" aria-label={layer.name}>
                  <h3 class="catalog-layer-name">{layer.name}</h3>
                  <ul class="catalog-entries">
                    {layer.entries.map((entry) => {
                      const component = entry.component;
                      return (
                        <li key={entry.type.id}>
                          <button
                            type="button"
                            class="catalog-entry"
                            data-type-id={entry.type.id}
                            aria-current={
                              selected?.type.id === entry.type.id ? 'true' : undefined
                            }
                            onClick={() => select(entry.type.id)}
                          >
                            <span class="catalog-entry-name">{entry.type.name}</span>
                            {entry.container && (
                              <span class="badge">{t('library.container')}</span>
                            )}
                            {component !== null && (
                              <span class="muted catalog-entry-size">
                                {t('library.typeSize', component.size)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </nav>

        {layout === 'split' && (
          <div class="catalog-detail" ref={detailRef}>
            {notice !== null && (
              <p class="catalog-notice muted" role="status">
                {notice}
              </p>
            )}
            {page || <p class="muted">{t('catalog.view.pick')}</p>}
          </div>
        )}
      </div>

      {layout === 'list' && dialogOpen && selected !== undefined && (
        <Dialog
          title={selected.type.name}
          size="lg"
          returnFocus={() => openerRef.current}
          onCancel={() => setDialogOpen(false)}
          actions={
            <Button onClick={() => setDialogOpen(false)}>
              {t('catalog.view.close')}
            </Button>
          }
        >
          <div class="catalog-dialog-content" ref={dialogContentRef}>
            {notice !== null && (
              <p class="catalog-notice muted" role="status">
                {notice}
              </p>
            )}
            {page}
          </div>
        </Dialog>
      )}
    </div>
  );
}
