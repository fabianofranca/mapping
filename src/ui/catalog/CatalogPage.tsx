import { useId, useMemo } from 'preact/hooks';
import { t } from '../../i18n';
import {
  type Catalog,
  type CatalogEntry,
  type CatalogField,
  type Project,
  codeLink,
  exampleDrawing,
} from '../../model';
import { Button } from '../controls';
import { Markdown } from '../markdown/Markdown';
import { Playground } from './Playground';
import type { CatalogRenderer } from './renderer';

// Página de um componente do Catálogo: cabeçalho, documento, propriedades, código por
// plataforma, origens, galeria e playground. Só apresentação: nada aqui grava ou lê disco.

export interface CatalogPageProps {
  readonly catalog: Catalog;
  readonly entry: CatalogEntry;
  readonly specId: string;
  readonly version: number;
  readonly renderer: CatalogRenderer;
  readonly fontsEpoch?: number;
  readonly project?: Project | null;
  readonly onLink?: (href: string) => void;
  readonly onAddToScreen?: (typeId: string) => void;
  readonly addDisabledReason?: string;
}

const TYPE_LABEL = {
  string: 'catalog.page.type.string',
  number: 'catalog.page.type.number',
  date: 'catalog.page.type.date',
  enum: 'catalog.page.type.enum',
  table: 'catalog.page.type.table',
  ref: 'catalog.page.type.ref',
} as const;

interface FieldRow {
  readonly field: CatalogField;
  readonly depth: number;
}

function flatten(fields: readonly CatalogField[], depth = 0): FieldRow[] {
  return fields.flatMap((field) => [
    { field, depth },
    ...flatten(field.columns ?? [], depth + 1),
  ]);
}

function PropertiesTable({ fields }: { readonly fields: readonly CatalogField[] }) {
  const rows = flatten(fields);
  if (rows.length === 0) return <p class="muted">{t('catalog.page.noFields')}</p>;
  return (
    <div class="catalog-table-wrap">
      <table class="catalog-table">
        <thead>
          <tr>
            <th scope="col">{t('catalog.page.col.key')}</th>
            <th scope="col">{t('catalog.page.col.label')}</th>
            <th scope="col">{t('catalog.page.col.type')}</th>
            <th scope="col">{t('catalog.page.col.required')}</th>
            <th scope="col">{t('catalog.page.col.options')}</th>
            <th scope="col">{t('catalog.page.col.default')}</th>
            <th scope="col">{t('catalog.page.col.description')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ field, depth }, i) => (
            <tr key={i} data-depth={depth}>
              <th scope="row" class="catalog-prop-key">
                <code style={{ paddingInlineStart: `calc(var(--space-3) * ${depth})` }}>
                  {field.key}
                </code>
              </th>
              <td>{field.label}</td>
              <td>{t(TYPE_LABEL[field.type])}</td>
              <td>{field.required ? t('catalog.page.yes') : ''}</td>
              <td>
                {field.options?.join(', ')}
                {field.accepts?.tags !== undefined && field.accepts.tags.join(', ')}
                {field.accepts?.free === true && t('catalog.page.refFree')}
              </td>
              <td>{field.default === undefined ? '' : String(field.default)}</td>
              <td>{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeSection({
  entry,
  specId,
  project,
}: {
  readonly entry: CatalogEntry;
  readonly specId: string;
  readonly project: Project | null;
}) {
  if (entry.code.length === 0) return <p class="muted">{t('catalog.page.noCode')}</p>;
  return (
    <ul class="catalog-code-list">
      {entry.code.map((code) => {
        const href =
          project !== null && code.path !== undefined
            ? codeLink(project, {
                specId,
                platform: code.platform.id,
                path: code.path,
              })
            : null;
        return (
          <li key={code.platform.id} class="catalog-code">
            <h4 class="catalog-code-platform">
              {code.platform.name}
              {code.platform.language !== undefined && (
                <span class="muted"> ({code.platform.language})</span>
              )}
            </h4>
            <p>
              <code>{code.symbol}</code>
              {code.path !== undefined && (
                <>
                  {' '}
                  {href !== null ? (
                    <a href={href} target="_blank" rel="noreferrer noopener">
                      <code>{code.path}</code>
                    </a>
                  ) : (
                    <code class="muted">{code.path}</code>
                  )}
                </>
              )}
            </p>
            {code.params !== undefined && (
              <dl class="catalog-kv" aria-label={t('catalog.page.codeParams')}>
                {Object.entries(code.params).map(([key, value]) => (
                  <div key={key}>
                    <dt>
                      <code>{key}</code>
                    </dt>
                    <dd>
                      <code>{value}</code>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {code.values !== undefined && (
              <dl class="catalog-kv" aria-label={t('catalog.page.codeValues')}>
                {Object.entries(code.values).map(([field, map]) => (
                  <div key={field}>
                    <dt>
                      <code>{field}</code>
                    </dt>
                    <dd>
                      {Object.entries(map).map(([from, to]) => (
                        <span key={from} class="catalog-value-pair">
                          <code>{from}</code> → <code>{to}</code>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {code.notes !== undefined && <p class="muted">{code.notes}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function SourcesSection({ entry }: { readonly entry: CatalogEntry }) {
  if (entry.sources.length === 0)
    return <p class="muted">{t('catalog.page.noSources')}</p>;
  return (
    <ul class="catalog-sources">
      {entry.sources.map((group) => (
        <li key={group.system}>
          <h4 class="catalog-code-platform">{group.system}</h4>
          <ul>
            {group.items.map((item, i) => (
              <li key={i}>
                {item.name ?? item.id ?? group.system}
                {item.id !== undefined && item.name !== undefined && (
                  <>
                    {' '}
                    <code>{item.id}</code>
                  </>
                )}
                {item.slot !== undefined && (
                  <span class="muted">
                    {' '}
                    {t('catalog.page.sourceSlot', { slot: item.slot })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

interface GalleryItem {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly url: string | null;
  readonly warnings: readonly string[];
}

function Gallery({
  catalog,
  entry,
  specId,
  version,
  renderer,
  fontsEpoch,
}: {
  readonly catalog: Catalog;
  readonly entry: CatalogEntry;
  readonly specId: string;
  readonly version: number;
  readonly renderer: CatalogRenderer;
  readonly fontsEpoch: number;
}) {
  const items = useMemo((): GalleryItem[] => {
    const make = (
      key: string,
      name: string,
      description: string | undefined,
      example: (typeof entry.examples)[number] | undefined,
    ): GalleryItem => {
      const drawing = exampleDrawing(catalog, entry, example, renderer.measure);
      const base = { key, name, ...(description === undefined ? {} : { description }) };
      if (drawing === null) return { ...base, url: null, warnings: [] };
      let url: string | null;
      try {
        url = renderer.cache.get(
          {
            specId,
            version,
            typeId: entry.type.id,
            example: example?.name ?? 'preview',
            width: drawing.root.width,
            height: drawing.root.height,
            fontsEpoch,
          },
          () => drawing.root,
        );
      } catch {
        url = null;
      }
      return { ...base, url, warnings: drawing.warnings };
    };
    const list: GalleryItem[] = [];
    if (entry.component !== null) {
      list.push(make('preview', t('catalog.gallery.preview'), undefined, undefined));
    }
    entry.examples.forEach((example, i) => {
      list.push(make(`ex-${i}`, example.name, example.description, example));
    });
    return list;
  }, [catalog, entry, specId, version, renderer, fontsEpoch]);

  if (items.length === 0) return <p class="muted">{t('catalog.gallery.empty')}</p>;
  return (
    <ul class="catalog-gallery">
      {items.map((item) => (
        <li key={item.key} class="catalog-gallery-item">
          <div class="catalog-image-frame">
            {item.url !== null ? (
              <img class="catalog-image" src={item.url} alt={item.name} />
            ) : (
              <span class="muted catalog-gallery-missing">
                {t('catalog.gallery.unavailable')}
              </span>
            )}
          </div>
          <p class="catalog-gallery-name">{item.name}</p>
          {item.description !== undefined && <p class="muted">{item.description}</p>}
          {item.warnings.length > 0 && (
            <ul class="catalog-warnings">
              {item.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CatalogPage({
  catalog,
  entry,
  specId,
  version,
  renderer,
  fontsEpoch = 0,
  project = null,
  onLink,
  onAddToScreen,
  addDisabledReason,
}: CatalogPageProps) {
  const uid = useId();
  const layer = catalog.layers.find((l) => l.id === entry.layerId);
  const section = (name: string) => `${uid}-${name}`;
  return (
    <article class="catalog-page" aria-label={entry.type.name}>
      <header class="catalog-page-header">
        <div class="catalog-page-title">
          <h2 class="catalog-page-name">{entry.type.name}</h2>
          {entry.container && <span class="badge">{t('library.container')}</span>}
          {onAddToScreen !== undefined && (
            <Button
              variant="primary"
              disabled={addDisabledReason !== undefined || entry.component === null}
              title={addDisabledReason}
              onClick={() => onAddToScreen(entry.type.id)}
            >
              {t('catalog.page.addToScreen')}
            </Button>
          )}
        </div>
        <p class="muted catalog-page-meta">
          <code>{entry.type.id}</code>
          {layer !== undefined && <> · {layer.name}</>}
        </p>
        {entry.type.description !== undefined && <p>{entry.type.description}</p>}
        {entry.componentProblem !== undefined && (
          <p class="field-error" role="alert">
            {t('catalog.page.componentProblem', { problem: entry.componentProblem })}
          </p>
        )}
      </header>

      <section aria-labelledby={section('doc')} class="catalog-section">
        <h3 id={section('doc')}>{t('catalog.page.document')}</h3>
        {entry.docText !== null ? (
          <Markdown text={entry.docText} onLink={onLink} />
        ) : (
          <p class="muted">{t('catalog.page.noDoc')}</p>
        )}
      </section>

      <section aria-labelledby={section('props')} class="catalog-section">
        <h3 id={section('props')}>{t('catalog.page.properties')}</h3>
        <PropertiesTable fields={entry.fields} />
      </section>

      <section aria-labelledby={section('code')} class="catalog-section">
        <h3 id={section('code')}>{t('catalog.page.code')}</h3>
        <CodeSection entry={entry} specId={specId} project={project} />
      </section>

      <section aria-labelledby={section('sources')} class="catalog-section">
        <h3 id={section('sources')}>{t('catalog.page.sources')}</h3>
        <SourcesSection entry={entry} />
      </section>

      <section aria-labelledby={section('gallery')} class="catalog-section">
        <h3 id={section('gallery')}>{t('catalog.gallery.title')}</h3>
        <Gallery
          catalog={catalog}
          entry={entry}
          specId={specId}
          version={version}
          renderer={renderer}
          fontsEpoch={fontsEpoch}
        />
      </section>

      <section aria-labelledby={section('playground')} class="catalog-section">
        <h3 id={section('playground')}>{t('catalog.playground.title')}</h3>
        <Playground
          key={entry.type.id}
          catalog={catalog}
          entry={entry}
          renderer={renderer}
          fontsEpoch={fontsEpoch}
        />
      </section>
    </article>
  );
}
