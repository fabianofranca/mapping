import { useEffect, useMemo, useState } from 'preact/hooks';
import { t } from '../../i18n';
import {
  type Catalog,
  type CatalogEntry,
  type FieldValues,
  type JsonValue,
  clampPlaygroundSize,
  drawEntry,
  playgroundSizeRange,
} from '../../model';
import { Button, TextField } from '../controls';
import { TypedForm } from '../TypedForm';
import type { CatalogRenderer } from './renderer';

// Playground do Catálogo: os campos do tipo (TypedForm) ao lado do desenho, que se refaz a
// cada mudança, no máximo uma vez por quadro. O tamanho vai do `minSize` ao dobro do `size`.

interface PlaygroundProps {
  readonly catalog: Catalog;
  readonly entry: CatalogEntry;
  readonly renderer: CatalogRenderer;
  /** Muda quando as fontes terminam de carregar: refaz o desenho. */
  readonly fontsEpoch?: number;
}

interface Drawn {
  readonly url: string | null;
  readonly warnings: readonly string[];
}

export function Playground({ entry, renderer, fontsEpoch = 0 }: PlaygroundProps) {
  const component = entry.component;
  const initial = entry.previewValues ?? {};
  const [values, setValues] = useState<Readonly<Record<string, unknown>>>(initial);
  const [size, setSize] = useState(() =>
    component === null ? { width: 1, height: 1 } : { ...component.size },
  );
  const [drawn, setDrawn] = useState<Drawn>({ url: null, warnings: [] });

  useEffect(() => {
    if (component === null) return;
    const frame = requestAnimationFrame(() => {
      try {
        const drawing = drawEntry(entry, values as FieldValues, renderer.measure, size);
        if (drawing === null) {
          setDrawn({ url: null, warnings: [] });
          return;
        }
        setDrawn({
          url: renderer.rasterize(drawing.root, {}),
          warnings: drawing.warnings,
        });
      } catch {
        setDrawn({ url: null, warnings: [t('catalog.playground.drawFailed')] });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [entry, component, values, size, renderer, fontsEpoch]);

  const range = useMemo(
    () => (component === null ? null : playgroundSizeRange(component)),
    [component],
  );

  if (component === null || range === null) {
    return <p class="muted">{t('catalog.playground.noComponent')}</p>;
  }

  const setDimension = (dimension: 'width' | 'height') => (text: string) => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return false;
    setSize((current) => clampPlaygroundSize(component, { ...current, [dimension]: n }));
    return true;
  };
  const reset = () => {
    setValues(entry.previewValues ?? {});
    setSize({ ...component.size });
  };

  return (
    <div class="catalog-playground">
      <div class="catalog-playground-form">
        <TypedForm
          fields={entry.type.fields}
          values={values}
          onChange={(key: string, value: JsonValue) =>
            setValues((current) => ({ ...current, [key]: value }))
          }
        />
        <div class="catalog-playground-size">
          <TextField
            type="number"
            label={t('catalog.playground.width')}
            value={String(size.width)}
            min={range.min.width}
            max={range.max.width}
            onCommit={setDimension('width')}
          />
          <TextField
            type="number"
            label={t('catalog.playground.height')}
            value={String(size.height)}
            min={range.min.height}
            max={range.max.height}
            onCommit={setDimension('height')}
          />
        </div>
        <p class="muted catalog-playground-range">
          {t('catalog.playground.range', {
            minWidth: range.min.width,
            minHeight: range.min.height,
            maxWidth: range.max.width,
            maxHeight: range.max.height,
          })}
        </p>
        <Button size="sm" onClick={reset}>
          {t('catalog.playground.reset')}
        </Button>
      </div>
      <div class="catalog-playground-stage">
        <div class="catalog-image-frame">
          {drawn.url !== null ? (
            <img
              class="catalog-image"
              src={drawn.url}
              alt={t('catalog.playground.alt', { name: entry.type.name })}
            />
          ) : (
            <span class="muted">{t('catalog.playground.drawing')}</span>
          )}
        </div>
        {drawn.warnings.length > 0 && (
          <ul class="catalog-warnings" aria-label={t('catalog.playground.warnings')}>
            {drawn.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
