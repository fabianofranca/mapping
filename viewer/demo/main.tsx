/** @jsxImportSource react */
/**
 * React viewer demo: a real React host (`react-dom/client`, no preact/compat) for the
 * embeddable `<MappingViewer/>`. Outside the product:
 * English text straight in the code, no i18n and no store.
 *
 * The JSON on the left is the demo's source of truth: each valid edit becomes the viewer's
 * `screen` (real-time update); an invalid edit shows the error and keeps the last valid
 * screen. In the "Material 3 (SDUI)" set the JSON is that of an SDUI backend: it becomes
 * the viewer's `source`, the origin declared in the specialization translates it and the computed
 * screen comes back through `onSource` (it feeds the tree and the properties); the origin's
 * warnings go in the status panel, and an `error` in the result goes back to the last `source`
 * that worked. In the "File format (SDUI)" set the text is a file of the `sdui-backend` package
 * (`home.sdui.json`), read through the specialization's format plugin: each edit calls
 * `screenFromFormat` of `mapping-viewer/formats` (the plugin runs in the sandbox of this page, which
 * needs the `viewer` CSP profile: `worker-src 'self' blob:` and the bootstrap hash), the last call
 * wins and its screen feeds the viewer; the plugin's warnings and error (code and message) go in
 * the panel, and an error keeps the last screen. StrictMode is a toggle that recreates the root.
 *
 * Selection has two sources: a click on the canvas (when "Canvas selection" is on) and the
 * instance tree on the right, which also shows the selected one's (read-only) properties.
 * Hover is the same: the pointer on the canvas or on the tree row; the last source wins.
 */
import {
  Fragment,
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './react.css';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../samples/samples';
import { M3_FILES, M3_SCREEN } from '../samples/samplesMaterial3';
import settingsSdui from '../samples/settings.sdui.json';
import { screenFromFormat, type FormatScreenError } from '../formats';
import {
  type FieldValue,
  type Instance,
  type InstanceWarnings,
  type Library,
  type Screen,
  type SourceResult,
  type TreeNode,
  type TypeDef,
  MappingViewer,
  flattenTree,
  konvaMeasurer,
  loadLibrary,
  parseScreen,
  screenTree,
  serializeScreen,
} from '../react';

type Dataset = 'samples' | 'm3' | 'sdui' | 'format';

/** The `sdui-backend` package (specialization, components, format plugin and example), read by Vite as text. */
const PACKAGE_PREFIX = '../../examples/libraries/sdui-backend/';
const PACKAGE_FILES = import.meta.glob<string>(
  '../../examples/libraries/sdui-backend/**/*.{json,js}',
  { query: '?raw', import: 'default', eager: true },
);
const FORMAT_LIBRARY = loadLibrary(
  Object.entries(PACKAGE_FILES).map(([path, text]) => ({
    path: path.slice(PACKAGE_PREFIX.length),
    text,
  })),
);
const FORMAT_ID = `${FORMAT_LIBRARY.specId}/sdui`;
const FORMAT_TEXT = (
  PACKAGE_FILES[`${PACKAGE_PREFIX}examples/home.sdui.json`] ?? ''
).trimEnd();
/** The screen before the plugin answers for the first time. */
const FORMAT_START: Screen = {
  id: 'format-start',
  name: 'File format',
  width: 412,
  height: 917,
  background: '#ffffff',
  instances: [],
};

const DATASETS: Record<Dataset, { library: Library; screen: Screen }> = {
  samples: { library: loadLibrary(SAMPLE_FILES), screen: SAMPLE_SCREEN },
  m3: { library: loadLibrary(M3_FILES), screen: M3_SCREEN },
  // The SDUI screen is born from the `source` (it arrives through `onSource`); the `screen` is only the starting point.
  sdui: { library: loadLibrary(M3_FILES), screen: M3_SCREEN },
  // The screen comes from the format plugin (`screenFromFormat`); this one is only the starting point.
  format: { library: FORMAT_LIBRARY, screen: FORMAT_START },
};
const SDUI_TEXT = JSON.stringify(settingsSdui, null, 2);

interface Click {
  readonly id: string | undefined;
  readonly x: number;
  readonly y: number;
}

/** The selected tree row: keeps it visible when the selection came from the canvas. */
function revealRow(el: HTMLElement | null): void {
  if (el && typeof el.scrollIntoView === 'function')
    el.scrollIntoView({ block: 'nearest' });
}

/** The error of `screenFromFormat` as one line: code, message and, when the plugin says, `line:column`. */
function formatErrorText(error: FormatScreenError): string {
  const place =
    error.column === undefined ? `${error.line}` : `${error.line}:${error.column}`;
  const where =
    error.line === undefined || error.message.includes(place) ? '' : ` (${place})`;
  return `${error.code}: ${error.message}${where}`;
}

function valueText(value: FieldValue): string {
  return value === null || value === undefined || String(value).trim() === ''
    ? '(empty)'
    : String(value);
}

function InstanceTree({
  rows,
  selected,
  onSelect,
  onHover,
}: {
  rows: readonly TreeNode[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  onHover: (id: string | undefined) => void;
}) {
  if (rows.length === 0) return <p className="react-lab-empty">No instances.</p>;
  return (
    <ul className="react-lab-tree">
      {rows.map(({ instance, label, typeName, depth }) => {
        const isSelected = instance.id === selected;
        return (
          <li key={instance.id}>
            <button
              type="button"
              ref={isSelected ? revealRow : undefined}
              aria-current={isSelected ? 'true' : undefined}
              style={{
                paddingLeft: `calc(var(--demo-space-2) + ${depth} * var(--demo-space-3))`,
              }}
              onClick={() => onSelect(instance.id)}
              onMouseEnter={() => onHover(instance.id)}
              onMouseLeave={() => onHover(undefined)}
            >
              <span className="react-lab-tree-label">{label}</span>
              <span className="react-lab-tree-type">{typeName ?? 'unknown type'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Properties({
  instance,
  type,
}: {
  instance: Instance | undefined;
  type: TypeDef | undefined;
}) {
  if (!instance)
    return (
      <p className="react-lab-empty">Click an instance in the tree or on the canvas.</p>
    );
  const { box } = instance;
  return (
    <div className="react-lab-props">
      <div className="react-lab-props-title">{type ? type.name : instance.typeId}</div>
      {type ? null : (
        <p className="react-lab-empty">
          Unknown type: the library has no type “{instance.typeId}”.
        </p>
      )}
      <dl>
        <dt>Id</dt>
        <dd>{instance.id}</dd>
        <dt>Box</dt>
        <dd>
          x {box.x}, y {box.y}, W {box.width}, H {box.height}
        </dd>
        {(type?.fields ?? []).map((field) => (
          <Fragment key={field.key}>
            <dt>{field.label}</dt>
            <dd>{valueText(instance.values[field.key])}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

function App({ strict, onStrict }: { strict: boolean; onStrict: (on: boolean) => void }) {
  const [dataset, setDataset] = useState<Dataset>('m3');
  const [screen, setScreen] = useState<Screen>(DATASETS.m3.screen);
  const [text, setText] = useState(() => serializeScreen(DATASETS.m3.screen));
  const [error, setError] = useState<string | undefined>();
  const [mounted, setMounted] = useState(true);
  const [hover, setHover] = useState<string | undefined>();
  const [click, setClick] = useState<Click | undefined>();
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [canvasSelect, setCanvasSelect] = useState(true);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  /** The SDUI JSON handed to the viewer (only applies in the SDUI set). */
  const [source, setSource] = useState<unknown>(settingsSdui);
  const [sourceWarnings, setSourceWarnings] = useState<readonly string[]>([]);
  /** The most recent `source` handed over, and the last one whose computation produced a screen (to go back on error). */
  const shownSource = useRef<unknown>(settingsSdui);
  const goodSource = useRef<unknown>(undefined);
  /** Going back to the last good `source`: the result of that return does not clear the error that caused it. */
  const restoring = useRef(false);
  const [warnings, setWarnings] = useState<InstanceWarnings>(new Map());
  /** The plugin's warnings for the last text read in the format set. */
  const [formatWarnings, setFormatWarnings] = useState<readonly string[]>([]);
  /** The most recent `screenFromFormat` call: an older one that returns late is ignored (the last call wins). */
  const formatCall = useRef(0);
  const [updateMs, setUpdateMs] = useState<number | undefined>();
  /** Moment the edit came in (handler); read after the commit and the viewer's effect. */
  const startedAt = useRef<number | undefined>(undefined);
  const library = DATASETS[dataset].library;

  // PARENT effect: React runs the children's effects before the parent's, so this one runs after
  // the `<MappingViewer/>` `update`. Konva's drawing (requestAnimationFrame) is left out.
  useEffect(() => {
    if (startedAt.current === undefined) return;
    setUpdateMs(performance.now() - startedAt.current);
    startedAt.current = undefined;
  }, [screen, library, source]);

  // The format set: each text (and entering the set) is read through the plugin; the last call wins.
  useEffect(() => {
    formatCall.current += 1;
    if (dataset !== 'format') return;
    const call = formatCall.current;
    void screenFromFormat(FORMAT_LIBRARY, text, {
      format: FORMAT_ID,
      measure: konvaMeasurer,
    })
      .then((result) => {
        if (call !== formatCall.current) return;
        setFormatWarnings(result.warnings);
        if (result.error || !result.screen) {
          setError(
            result.error
              ? formatErrorText(result.error)
              : 'The format produced no screen.',
          );
          // No new screen: the "Last update" effect will not run for this edit.
          startedAt.current = undefined;
          return;
        }
        setScreen(result.screen);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (call !== formatCall.current) return;
        setError(e instanceof Error ? e.message : String(e));
        startedAt.current = undefined;
      });
  }, [dataset, text]);

  const edit = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const started = performance.now();
      const value = event.target.value;
      setText(value);
      if (dataset === 'format') {
        // The plugin reads the text (whatever it is): the effect above calls it and shows its error.
        startedAt.current = started;
        return;
      }
      try {
        const json: unknown = JSON.parse(value);
        startedAt.current = started;
        if (dataset === 'sdui') {
          // Validating the content is up to the origin: the result (or the error) comes back through `onSource`.
          shownSource.current = json;
          setSource(json);
          return;
        }
        setScreen(parseScreen(json));
        setError(undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [dataset],
  );

  const choose = (next: Dataset): void => {
    // The format set is filled by the effect on its text: choosing it again would blank the screen with nothing to refill it.
    if (next === 'format' && dataset === 'format') return;
    startedAt.current = performance.now();
    setDataset(next);
    setScreen(DATASETS[next].screen);
    setText(
      next === 'sdui'
        ? SDUI_TEXT
        : next === 'format'
          ? FORMAT_TEXT
          : serializeScreen(DATASETS[next].screen),
    );
    setError(undefined);
    setFormatWarnings([]);
    if (next === 'sdui') {
      goodSource.current = undefined;
      restoring.current = false;
      shownSource.current = settingsSdui;
      setSource(settingsSdui);
      setSourceWarnings([]);
    }
    setSelection([]);
    setHover(undefined);
  };

  // New callbacks on every render on purpose: the wrapper reads them by ref and does not recreate the viewer.
  const onClick = (id: string | undefined, point: { x: number; y: number }): void => {
    setClick({ id, x: Math.round(point.x), y: Math.round(point.y) });
    setSelection((current) => (id === undefined ? [] : current.includes(id) ? [] : [id]));
  };

  /** The screen computed from the `source`: it becomes the page's screen; an error or JSON with no screen goes back to the last good `source`. */
  const onSource = (result: SourceResult): void => {
    if (result.error !== undefined || !result.screen) {
      setError(result.error ?? 'The SDUI did not produce a screen.');
      if (
        goodSource.current !== undefined &&
        goodSource.current !== shownSource.current
      ) {
        restoring.current = true;
        shownSource.current = goodSource.current;
        setSource(goodSource.current);
      }
      return;
    }
    goodSource.current = shownSource.current;
    setScreen(result.screen);
    setSourceWarnings(result.warnings);
    if (restoring.current) restoring.current = false;
    else setError(undefined);
  };

  const selectOne = (id: string): void =>
    setSelection((current) => (current.includes(id) ? [] : [id]));

  const rows = useMemo(() => flattenTree(screenTree(screen, library)), [screen, library]);
  const selectedId = selection[0];
  const selected = rows.find((row) => row.id === selectedId);
  const selectedType = library.types.find((type) => type.id === selected?.typeId);

  const warned = [...warnings].filter(([, list]) => list.length > 0);

  return (
    <div className="react-lab">
      <aside className="react-lab-side">
        <h1>React viewer</h1>
        <p>
          The demo uses the system font: fonts belong to the host (CSS @font-face or
          FontFace + <code>fontsVersion</code>).
        </p>
        <div className="react-lab-controls">
          <button
            type="button"
            aria-pressed={dataset === 'samples'}
            onClick={() => choose('samples')}
          >
            Examples
          </button>
          <button
            type="button"
            aria-pressed={dataset === 'm3'}
            onClick={() => choose('m3')}
          >
            Material 3
          </button>
          <button
            type="button"
            aria-pressed={dataset === 'sdui'}
            onClick={() => choose('sdui')}
          >
            Material 3 (SDUI)
          </button>
          <button
            type="button"
            aria-pressed={dataset === 'format'}
            onClick={() => choose('format')}
          >
            File format (SDUI)
          </button>
          <button type="button" onClick={() => setMounted((m) => !m)}>
            {mounted ? 'Unmount' : 'Mount'}
          </button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => onStrict(e.target.checked)}
            />{' '}
            StrictMode
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={canvasSelect}
              onChange={(e) => setCanvasSelect(e.target.checked)}
            />{' '}
            Canvas selection
          </label>
          <label className="toggle">
            Direction{' '}
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value === 'rtl' ? 'rtl' : 'ltr')}
            >
              <option value="ltr">Left to right (ltr)</option>
              <option value="rtl">Right to left (rtl)</option>
            </select>
          </label>
        </div>
        <textarea
          aria-label={
            dataset === 'sdui'
              ? 'SDUI (JSON)'
              : dataset === 'format'
                ? 'File (SDUI format)'
                : 'Screen (JSON)'
          }
          spellCheck={false}
          value={text}
          onChange={edit}
        />
        {error ? (
          <p className="react-lab-error" role="alert">
            {error}
          </p>
        ) : null}
      </aside>
      <main className="react-lab-main">
        <div className="react-lab-viewer">
          {mounted ? (
            <MappingViewer
              library={library}
              screen={screen}
              source={dataset === 'sdui' ? source : undefined}
              direction={direction}
              onSource={onSource}
              selection={selection}
              hover={hover}
              interactive={canvasSelect}
              onHover={setHover}
              onClick={onClick}
              onWarnings={setWarnings}
            />
          ) : null}
        </div>
        <div className="react-lab-status">
          <div>
            Screen: {screen.name} ({screen.width} × {screen.height}),{' '}
            {screen.instances.length} instances
          </div>
          <div>Hover: {hover ?? '—'}</div>
          <div>
            Last click:{' '}
            {click ? `${click.id ?? 'background'} at (${click.x}, ${click.y})` : '—'}
          </div>
          <div>Selection: {selection.length > 0 ? selection.join(', ') : '—'}</div>
          <div>
            Warnings:{' '}
            {warned.length === 0
              ? 'none'
              : warned.map(([id, list]) => `${id}: ${list.join('; ')}`).join(' | ')}
          </div>
          {dataset === 'sdui' ? (
            <div>
              Source warnings:{' '}
              {sourceWarnings.length === 0 ? 'none' : sourceWarnings.join(' | ')}
            </div>
          ) : null}
          {dataset === 'format' ? (
            <div>
              Format warnings:{' '}
              {formatWarnings.length === 0 ? 'none' : formatWarnings.join(' | ')}
            </div>
          ) : null}
          <div>
            Last update: {updateMs === undefined ? '—' : `${updateMs.toFixed(1)} ms`}{' '}
            <span className="react-lab-hint">
              (approximate: from the edit to the wrapper's effect, without Konva drawing)
            </span>
          </div>
        </div>
      </main>
      <aside className="react-lab-right">
        <section className="react-lab-section react-lab-section-tree">
          <h2>Tree</h2>
          <InstanceTree
            rows={rows}
            selected={selectedId}
            onSelect={selectOne}
            onHover={setHover}
          />
        </section>
        <section className="react-lab-section">
          <h2>Properties</h2>
          <Properties instance={selected?.instance} type={selectedType} />
        </section>
      </aside>
    </div>
  );
}

/** Owner of the StrictMode toggle: swapping the wrapper remounts the whole tree (like recreating the root). */
function Shell() {
  const [strict, setStrict] = useState(true);
  const app = <App strict={strict} onStrict={setStrict} />;
  return strict ? (
    <StrictMode key="strict">{app}</StrictMode>
  ) : (
    <Fragment key="plain">{app}</Fragment>
  );
}

const host = document.getElementById('lab');
if (!host) throw new Error('#lab not found');
createRoot(host).render(<Shell />);
