import { useEffect, useMemo, useState } from 'preact/hooks';
import { t } from '../../i18n';
import {
  type Catalog,
  type CatalogFormat,
  type CatalogFormatExample,
  type FormatExampleView,
  type FormatFunctions,
  type FormatRunner,
  definedFormatFunctions,
  drawFormatExample,
} from '../../model';
import { Button } from '../controls';
import {
  type CatalogImages,
  type CatalogRenderer,
  packageImageOptions,
} from './renderer';

// The Catalog's "File formats" page (stage #2035, AF5, decision 14): each format of the library with its
// name, extension, scope, description and the functions its plugin defines, and each example drawn as the
// screens `parse` builds from it, with the example text in a collapsible block. Opening the page is the
// explicit action that runs the plugins (decision 10): the sandbox's runner arrives as `run`.

export interface FormatsPageProps {
  readonly catalog: Catalog;
  readonly specId: string;
  readonly version: number;
  readonly renderer: CatalogRenderer;
  readonly fontsEpoch: number;
  readonly images?: CatalogImages | undefined;
  /** The executor of the plugins; without it the examples are not drawn. */
  readonly run?: FormatRunner | undefined;
}

interface FormatResult {
  /** What the plugin defines, or why it does not load. */
  readonly functions: FormatFunctions | string;
  readonly examples: readonly FormatExampleView[];
}

type Results = ReadonlyMap<string, FormatResult>;

async function resultOf(
  catalog: Catalog,
  format: CatalogFormat,
  deps: { run: FormatRunner; measure: CatalogRenderer['measure'] },
): Promise<FormatResult> {
  const examples = await Promise.all(
    format.examples.map((example) => drawFormatExample(catalog, format, example, deps)),
  );
  return { functions: await functionsOf(catalog, format, deps), examples };
}

async function functionsOf(
  catalog: Catalog,
  format: CatalogFormat,
  deps: { run: FormatRunner; measure: CatalogRenderer['measure'] },
): Promise<FormatFunctions | string> {
  const { spec } = catalog;
  const declared = spec?.fileFormats?.find((f) => f.id === format.id);
  if (spec === null || declared === undefined || format.pluginText === null) {
    return t('catalog.formats.pluginMissing');
  }
  const byType = new Map(
    catalog.layers.flatMap((layer) =>
      layer.entries.flatMap((entry) =>
        entry.component === null ? [] : [[entry.type.id, entry.component] as const],
      ),
    ),
  );
  return definedFormatFunctions(
    {
      spec,
      specPath: 'library.spec.json',
      format: declared,
      pluginText: format.pluginText,
      components: {
        specId: spec.id,
        version: spec.version,
        byType,
        problems: [],
        problemMessages: [],
      },
    },
    deps,
  );
}

/** Runs the plugins of the library's formats once per catalog (and runner); `undefined` while it runs. */
function useFormatResults(
  catalog: Catalog,
  run: FormatRunner | undefined,
  measure: CatalogRenderer['measure'],
): Results | undefined {
  const [results, setResults] = useState<Results | undefined>(undefined);
  useEffect(() => {
    setResults(undefined);
    if (run === undefined) return undefined;
    let current = true;
    void (async () => {
      const done = new Map<string, FormatResult>();
      for (const format of catalog.formats) {
        done.set(format.id, await resultOf(catalog, format, { run, measure }));
      }
      if (current) setResults(done);
    })();
    return () => {
      current = false;
    };
  }, [catalog, run, measure]);
  return results;
}

function definedText(functions: FormatFunctions): string {
  const names = [
    ...(functions.generate ? [t('catalog.formats.generate')] : []),
    ...(functions.parse ? [t('catalog.formats.parse')] : []),
  ];
  return names.length === 0
    ? t('catalog.formats.noFunctions')
    : t('catalog.formats.defines', { functions: names.join(', ') });
}

function ExampleText({ text }: { readonly text: string | null }) {
  const [shown, setShown] = useState(false);
  if (text === null) return null;
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={shown}
        onClick={() => setShown(!shown)}
      >
        {shown ? t('catalog.formats.hideText') : t('catalog.formats.showText')}
      </Button>
      {shown && <pre class="catalog-format-text">{text}</pre>}
    </div>
  );
}

function ExampleView({
  view,
  urls,
  idle,
}: {
  readonly view: FormatExampleView | undefined;
  /** No runner: nothing is running, so nothing is awaited. */
  readonly idle: boolean;
  readonly urls: readonly { readonly name: string; readonly url: string | null }[];
}) {
  if (view === undefined) {
    return idle ? null : <p class="muted">{t('catalog.formats.running')}</p>;
  }
  switch (view.kind) {
    case 'drawing':
      return (
        <ul class="catalog-format-screens">
          {urls.map((screen, i) => (
            <li key={i} class="catalog-image-frame">
              {screen.url === null ? (
                <span class="muted">{t('catalog.gallery.unavailable')}</span>
              ) : (
                <img class="catalog-image" src={screen.url} alt={screen.name} />
              )}
            </li>
          ))}
        </ul>
      );
    case 'nothing':
      return <p class="muted">{t('catalog.formats.nothing')}</p>;
    case 'failed':
      return (
        <p class="catalog-validation-bad" role="alert">
          {t('catalog.formats.failed', { code: view.code, message: view.message })}
        </p>
      );
    case 'generate':
      return <p class="muted">{t('catalog.formats.generateOnly')}</p>;
    case 'unavailable':
      return <p class="muted">{t('catalog.formats.unavailable')}</p>;
  }
}

interface ExampleProps {
  readonly format: CatalogFormat;
  readonly example: CatalogFormatExample;
  readonly view: FormatExampleView | undefined;
  readonly specId: string;
  readonly version: number;
  readonly renderer: CatalogRenderer;
  readonly fontsEpoch: number;
  readonly images: CatalogImages | undefined;
  readonly idle: boolean;
}

function Example(props: ExampleProps) {
  const { format, example, view, specId, version, renderer, fontsEpoch, images, idle } =
    props;
  const imagesEpoch = renderer.imagesEpoch.value + (images?.epoch ?? 0);
  const imageSource = images?.source;
  const urls = useMemo(() => {
    if (view?.kind !== 'drawing') return [];
    return view.containers.map((container, i) => {
      const key = {
        specId,
        version,
        typeId: `format:${format.id}`,
        example: `${example.name}#${i}`,
        width: container.drawing.root.width,
        height: container.drawing.root.height,
        fontsEpoch,
        imagesEpoch,
      };
      let url: string | null;
      try {
        url = renderer.cache.get(
          key,
          () => container.drawing.root,
          packageImageOptions(specId, imageSource),
        );
      } catch {
        url = null;
      }
      return { name: container.name, url };
    });
  }, [
    view,
    format.id,
    example.name,
    specId,
    version,
    renderer,
    fontsEpoch,
    imagesEpoch,
    imageSource,
  ]);
  return (
    <li class="catalog-format-example">
      <p class="catalog-gallery-name">{example.name}</p>
      <ExampleView view={view} urls={urls} idle={idle} />
      <ExampleText text={example.text} />
    </li>
  );
}

function FormatSection({
  format,
  result,
  waiting,
  ...rest
}: Omit<ExampleProps, 'example' | 'view' | 'idle'> & {
  readonly result: FormatResult | undefined;
  /** The plugin cannot run (no runner): the status line says so. */
  readonly waiting: boolean;
}) {
  const functions = result?.functions;
  return (
    <li class="catalog-section" aria-label={format.name}>
      <h3>{format.name}</h3>
      <p class="muted catalog-format-meta">
        <span>
          {t('catalog.formats.extension')}: <code>.{format.extension}</code>
        </span>
        <span>{t(`catalog.formats.scope.${format.scope}`)}</span>
        {typeof functions === 'object' && <span>{definedText(functions)}</span>}
      </p>
      {format.description !== undefined && <p>{format.description}</p>}
      {typeof functions === 'string' && (
        <p class="catalog-validation-bad" role="alert">
          {t('catalog.formats.pluginFailed', { problem: functions })}
        </p>
      )}
      {waiting && <p class="muted">{t('catalog.formats.noRunner')}</p>}
      {format.examples.length === 0 ? (
        <p class="muted">{t('catalog.formats.noExamples')}</p>
      ) : (
        <ul class="catalog-format-examples" aria-label={t('catalog.formats.examples')}>
          {format.examples.map((example, i) => (
            <Example
              key={example.name}
              {...rest}
              idle={waiting}
              format={format}
              example={example}
              view={result?.examples[i]}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FormatsPage({
  catalog,
  specId,
  version,
  renderer,
  fontsEpoch,
  images,
  run,
}: FormatsPageProps) {
  const results = useFormatResults(catalog, run, renderer.measure);
  return (
    <article class="catalog-page" aria-label={t('catalog.formats.page')}>
      <header class="catalog-page-header">
        <h2 class="catalog-page-name">{t('catalog.formats')}</h2>
      </header>
      {catalog.formats.length === 0 ? (
        <p class="muted">{t('catalog.formats.empty')}</p>
      ) : (
        <ul class="catalog-formats">
          {catalog.formats.map((format) => (
            <FormatSection
              key={format.id}
              format={format}
              result={results?.get(format.id)}
              waiting={run === undefined}
              specId={specId}
              version={version}
              renderer={renderer}
              fontsEpoch={fontsEpoch}
              images={images}
            />
          ))}
        </ul>
      )}
    </article>
  );
}
