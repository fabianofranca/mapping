/**
 * Laboratório "Componentes": telas montadas só com instâncias de componentes genéricos
 * (sem imagem), com as propriedades da anotação refletidas no desenho ao vivo.
 * Experimento fora do produto: textos em pt-BR direto no código, sem i18n e sem store.
 */
import JSZip from 'jszip';
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import 'virtual:tokens.css';
import './components.css';
import { downloadBlob, downloadText } from '../shared/download';
import type { FieldValue } from './componentFormat';
import { ScreenEditor } from './editor';
import {
  type FieldDef,
  type Library,
  type TextFile,
  type TypeDef,
  initialValues,
  instanceLabel,
  loadLibrary,
  pickDirectory,
  readFileList,
} from './library';
import { SAMPLE_FILES, SAMPLE_SCREEN } from './samples';
import { M3_FILES, M3_SCREEN } from './samplesMaterial3';
import {
  type Instance,
  type Screen,
  addInstance,
  bringToFront,
  newScreen,
  parseScreen,
  removeInstance,
  resize,
  serializeScreen,
  setValue,
  updateBox,
} from './screen';

const library = signal<Library | undefined>(undefined);
const screen = signal<Screen>(newScreen('Tela', 390, 844));
const selectedId = signal<string | undefined>(undefined);
const hoverId = signal<string | undefined>(undefined);
const warnings = signal<ReadonlyMap<string, readonly string[]>>(new Map());
const zoom = signal(1);
const error = signal<string | undefined>(undefined);
const notice = signal<string | undefined>(undefined);
const historyPast: Screen[] = [];

let editor: ScreenEditor | undefined;

/** Toda mudança da tela passa aqui (como uma action do store), com desfazer simples. */
function commit(next: Screen, undoable = true): void {
  if (next === screen.value) return;
  if (undoable) {
    historyPast.push(screen.value);
    if (historyPast.length > 100) historyPast.shift();
  }
  screen.value = next;
  editor?.setScreen(next);
}

function undo(): void {
  const previous = historyPast.pop();
  if (!previous) return;
  screen.value = previous;
  editor?.setScreen(previous);
}

function say(message: string): void {
  notice.value = message;
  error.value = undefined;
}

function fail(e: unknown): void {
  error.value = e instanceof Error ? e.message : String(e);
  notice.value = undefined;
}

function loadFiles(files: readonly TextFile[], origin: string): void {
  try {
    const loaded = loadLibrary(files);
    library.value = loaded;
    editor?.setLibrary(loaded);
    const withComponent = loaded.types.filter((t) => t.component).length;
    say(
      `${origin}: ${loaded.specName}, ${loaded.types.length} tipo(s), ${withComponent} com componente` +
        (loaded.problems.length > 0 ? `, ${loaded.problems.length} problema(s)` : ''),
    );
  } catch (e) {
    fail(e);
  }
}

function loadSamples(): void {
  loadFiles(SAMPLE_FILES, 'Exemplos');
  commit(SAMPLE_SCREEN);
  editor?.fit();
}

/** Material Design 3 (baseline) escrito no formato do laboratório: um design system de verdade. */
function loadMaterial3(): void {
  loadFiles(M3_FILES, 'Material 3');
  commit(M3_SCREEN);
  editor?.fit();
}

async function openFolder(): Promise<void> {
  try {
    const files = await pickDirectory();
    if (files) loadFiles(files, 'Pasta');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    fail(e);
  }
}

async function openFiles(list: FileList | null): Promise<void> {
  if (!list || list.length === 0) return;
  try {
    const files = await readFileList(list);
    const screenFile = files.find((f) => f.text.includes('"mapping-lab-screen"'));
    if (screenFile && files.length === 1) {
      commit(parseScreen(JSON.parse(screenFile.text)));
      editor?.fit();
      say(`Tela importada: ${screenFile.path}`);
      return;
    }
    loadFiles(files, `${files.length} arquivo(s)`);
  } catch (e) {
    fail(e);
  }
}

async function downloadSamples(): Promise<void> {
  const zip = new JSZip();
  for (const file of SAMPLE_FILES) zip.file(`lab-components/${file.path}`, file.text);
  zip.file('lab-components/telas/entrar.screen.json', serializeScreen(SAMPLE_SCREEN));
  for (const file of M3_FILES) zip.file(`material3/${file.path}`, file.text);
  zip.file('material3/telas/settings.screen.json', serializeScreen(M3_SCREEN));
  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'lab-components.zip');
}

function addFromType(type: TypeDef): void {
  const n = screen.value.instances.length;
  const size = type.component?.size ?? { width: 160, height: 48 };
  const offset = 24 + (n % 8) * 16;
  commit(
    addInstance(screen.value, {
      typeId: type.id,
      box: { x: offset, y: offset, width: size.width, height: size.height },
      values: initialValues(type),
    }),
  );
  const added = screen.value.instances[screen.value.instances.length - 1];
  if (added) editor?.select(added.id);
}

function typeOf(instance: Instance | undefined): TypeDef | undefined {
  return instance
    ? library.value?.types.find((t) => t.id === instance.typeId)
    : undefined;
}

// ---------------------------------------------------------------------------------------

function Toolbar() {
  const current = screen.value;
  const canPick = typeof Reflect.get(globalThis, 'showDirectoryPicker') === 'function';
  return (
    <div class="lab-toolbar" role="toolbar" aria-label="Ações do laboratório">
      <button type="button" onClick={loadSamples}>
        Exemplos
      </button>
      <button
        type="button"
        onClick={loadMaterial3}
        title="Material Design 3 (baseline, tema claro)"
      >
        Material 3
      </button>
      {canPick && (
        <button type="button" onClick={() => void openFolder()}>
          Abrir pasta…
        </button>
      )}
      <label class="file">
        Abrir arquivos…
        <input
          type="file"
          multiple
          accept=".json,application/json"
          onChange={(e) => {
            void openFiles(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />
      </label>
      <button type="button" onClick={() => void downloadSamples()}>
        Baixar exemplos (zip)
      </button>
      <span class="sep" />
      <select
        aria-label="Tamanho da tela"
        value={`${current.width}x${current.height}`}
        onChange={(e) => {
          const [w, h] = e.currentTarget.value.split('x').map(Number);
          if (w && h) {
            commit(resize(current, w, h));
            editor?.fit();
          }
        }}
      >
        {[
          ['390x844', 'Celular 390 × 844'],
          ['768x1024', 'Tablet 768 × 1024'],
          ['1280x800', 'Desktop 1280 × 800'],
          ['1440x900', 'Desktop 1440 × 900'],
        ].map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
        {!['390x844', '768x1024', '1280x800', '1440x900'].includes(
          `${current.width}x${current.height}`,
        ) && (
          <option value={`${current.width}x${current.height}`}>
            {current.width} × {current.height}
          </option>
        )}
      </select>
      <button
        type="button"
        onClick={() => {
          commit(newScreen('Tela', current.width, current.height));
          editor?.fit();
        }}
      >
        Nova tela
      </button>
      <button type="button" onClick={undo} title="Ctrl+Z">
        Desfazer
      </button>
      <span class="sep" />
      <button
        type="button"
        onClick={() =>
          downloadText(serializeScreen(current), `${current.name}.screen.json`)
        }
      >
        Exportar tela
      </button>
      <button
        type="button"
        onClick={() => {
          const url = editor?.toDataURL();
          if (!url) return;
          const link = document.createElement('a');
          link.href = url;
          link.download = `${current.name}.png`;
          link.click();
        }}
      >
        PNG
      </button>
      <span class="sep" />
      <button type="button" onClick={() => editor?.zoomTo(editor.scale() / 1.25)}>
        −
      </button>
      <span aria-live="polite">{Math.round(zoom.value * 100)}%</span>
      <button type="button" onClick={() => editor?.zoomTo(editor.scale() * 1.25)}>
        +
      </button>
      <button type="button" onClick={() => editor?.zoomTo(1)}>
        100%
      </button>
      <button type="button" onClick={() => editor?.fit()}>
        Ajustar
      </button>
    </div>
  );
}

function LibraryPanel() {
  const lib = library.value;
  return (
    <aside class="lab-library">
      <h2>Componentes</h2>
      {!lib && (
        <p class="hint">
          Carregue os <b>Exemplos</b> ou abra uma pasta com a especialização (
          <code>mapping-spec</code>) e os arquivos de componente que ela referencia.
        </p>
      )}
      {lib && (
        <ul>
          {lib.types.map((type) => (
            <li key={type.id} data-type-id={type.id}>
              <span class="name" title={type.component?.description ?? type.name}>
                {type.name}
              </span>
              {!type.component && <span class="missing">sem componente</span>}
              <button
                type="button"
                onClick={() => addFromType(type)}
                disabled={!type.component}
              >
                Adicionar
              </button>
            </li>
          ))}
        </ul>
      )}
      {lib && (
        <p class="hint">
          {lib.specName} · {lib.specPath}
        </p>
      )}
    </aside>
  );
}

function CanvasArea() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    editor = new ScreenEditor(element, {
      onSelect: (id) => (selectedId.value = id),
      onHover: (id) => (hoverId.value = id),
      onZoom: (scale) => (zoom.value = scale),
      onWarnings: (map) => (warnings.value = map),
      onBoxChange: (id, box) => commit(updateBox(screen.value, id, box)),
    });
    editor.setLibrary(library.value);
    editor.setScreen(screen.value);
    return () => {
      editor?.dispose();
      editor = undefined;
    };
  }, []);
  return (
    <div class="lab-canvas">
      <div class="stage" ref={host} data-testid="stage" />
      {screen.value.instances.length === 0 && (
        <div class="lab-empty">
          <p>
            Tela em branco. Clique em <b>Adicionar</b> num componente da biblioteca, ou
            carregue os <b>Exemplos</b>.
          </p>
        </div>
      )}
    </div>
  );
}

function FieldEditor({ field, instance }: { field: FieldDef; instance: Instance }) {
  const value = instance.values[field.key];
  const text = value === null || value === undefined ? '' : String(value);
  const set = (next: FieldValue) =>
    commit(setValue(screen.value, instance.id, field.key, next));
  const id = `field-${instance.id}-${field.key}`;
  let control;
  switch (field.type) {
    case 'enum':
      control = (
        <select id={id} value={text} onChange={(e) => set(e.currentTarget.value || null)}>
          {!field.required && <option value="">(vazio)</option>}
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
      control = (
        <input
          id={id}
          type="number"
          value={text}
          onInput={(e) => {
            const v = e.currentTarget.value;
            set(v === '' ? null : Number(v));
          }}
        />
      );
      break;
    case 'date':
      control = (
        <input
          id={id}
          type="date"
          value={text}
          onInput={(e) => set(e.currentTarget.value || null)}
        />
      );
      break;
    case 'string':
      control = (
        <input
          id={id}
          type="text"
          value={text}
          onInput={(e) => set(e.currentTarget.value)}
        />
      );
      break;
    default:
      control = <span class="hint">({field.type}: não suportado no laboratório)</span>;
  }
  return (
    <div class="row">
      <label for={id} title={field.description ?? field.key}>
        {field.label}
        {field.required ? ' *' : ''}
      </label>
      {control}
    </div>
  );
}

function Properties() {
  const current = screen.value;
  const instance = current.instances.find((i) => i.id === selectedId.value);
  const type = typeOf(instance);
  if (!instance) {
    return (
      <div>
        <h2>Instância</h2>
        <p class="hint">Clique numa instância na tela para editar as propriedades.</p>
      </div>
    );
  }
  const { box } = instance;
  const setBox = (patch: Partial<typeof box>) =>
    commit(updateBox(current, instance.id, { ...box, ...patch }));
  return (
    <div>
      <h2>
        {type
          ? `${type.name} · ${instanceLabel(type, instance.values)}`
          : instance.typeId}
      </h2>
      <div class="lab-props" data-testid="properties">
        <div class="box">
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <label key={key}>
              {key === 'width' ? 'L' : key === 'height' ? 'A' : key}
              <input
                type="number"
                value={box[key]}
                onChange={(e) => setBox({ [key]: Number(e.currentTarget.value) })}
              />
            </label>
          ))}
        </div>
        {type?.fields.map((field) => (
          <FieldEditor key={field.key} field={field} instance={instance} />
        ))}
        <div class="actions">
          <button
            type="button"
            onClick={() => commit(bringToFront(current, instance.id))}
          >
            Trazer para frente
          </button>
          <button
            type="button"
            class="danger"
            onClick={() => {
              commit(removeInstance(current, instance.id));
              editor?.select(undefined);
            }}
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

function Warnings() {
  const problems = library.value?.problems ?? [];
  const own = selectedId.value ? (warnings.value.get(selectedId.value) ?? []) : [];
  const total = [...warnings.value.values()].reduce((n, list) => n + list.length, 0);
  return (
    <div class="lab-warnings">
      <h2>
        Avisos ({problems.length + total}
        {selectedId.value ? `, ${own.length} nesta instância` : ''})
      </h2>
      {problems.length + total === 0 ? (
        <p class="hint">Nada ficou de fora.</p>
      ) : (
        <ul>
          {problems.map((p) => (
            <li key={p} class="problem">
              {p}
            </li>
          ))}
          {(selectedId.value
            ? own
            : [...new Set([...warnings.value.values()].flat())]
          ).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Status() {
  const current = screen.value;
  const hovered = current.instances.find((i) => i.id === hoverId.value);
  const hoveredType = typeOf(hovered);
  return (
    <div class="lab-status" data-testid="status">
      {error.value && <span class="error">{error.value}</span>}
      {!error.value && notice.value && <span>{notice.value}</span>}
      <span>
        {current.name}: {current.width} × {current.height} px, {current.instances.length}{' '}
        instância(s)
      </span>
      {hovered && hoveredType && (
        <span>
          sob o mouse: {hoveredType.name} ({instanceLabel(hoveredType, hovered.values)})
        </span>
      )}
    </div>
  );
}

function Lab() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selectedId.value) {
        commit(removeInstance(screen.value, selectedId.value));
        editor?.select(undefined);
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        undo();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="lab">
      <header class="lab-header">
        <h1>Componentes por template</h1>
        <p>
          Experimento: telas sem imagem, montadas com componentes genéricos cujo desenho
          segue as propriedades da anotação.
        </p>
        <a href="../figma/">Figma somente leitura →</a>
      </header>
      <Toolbar />
      <div class="lab-main">
        <LibraryPanel />
        <CanvasArea />
        <aside class="lab-side">
          <Properties />
          <Warnings />
        </aside>
      </div>
      <Status />
    </div>
  );
}

const root = document.getElementById('lab');
if (root) render(<Lab />, root);
