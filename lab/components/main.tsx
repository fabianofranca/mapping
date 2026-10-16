/**
 * Laboratório "Componentes": telas montadas só com instâncias de componentes genéricos
 * (sem imagem), com as propriedades da anotação refletidas no desenho ao vivo.
 * Experimento fora do produto: textos em pt-BR direto no código, sem i18n e sem store.
 */
import JSZip from 'jszip';
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import 'virtual:tokens.css';
import './components.css';
import { downloadBlob, downloadText } from '../shared/download';
import { arrange, dropIndex, findSlot, isContainer, resolveSlotLayout } from './arrange';
import {
  type Board,
  type PlacedScreen,
  addScreen,
  cloneScreen,
  duplicateScreen,
  findScreen,
  moveScreen,
  newBoard,
  removeScreen,
  replaceScreen,
  screenOfInstance,
} from './board';
import type { FieldValue } from './componentFormat';
import { ScreenEditor, konvaMeasurer } from './editor';
import { type FontStatus, describeFont, registerFonts } from './fonts';
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
  ancestorsOf,
  bringToFront,
  childrenOf,
  moveSibling,
  newScreen,
  parseScreen,
  removeInstance,
  removeSubtree,
  resize,
  serializeScreen,
  setParent,
  setValue,
  updateBox,
} from './screen';

const library = signal<Library | undefined>(undefined);
const board = signal<Board>(newBoard(newScreen('Tela', 390, 844)));
/** Tela ativa: a do último clique no canvas (ou da última ação da barra). Painel e ações agem nela. */
const activeScreenId = signal<string>(board.value.screens[0]?.screen.id ?? '');
const selectedId = signal<string | undefined>(undefined);
const hoverId = signal<string | undefined>(undefined);
const warnings = signal<ReadonlyMap<string, readonly string[]>>(new Map());
const zoom = signal(1);
/** Modo "posições fixas": só as propriedades mudam; nada se arrasta nem redimensiona. */
const fixed = signal(false);
const fontStatus = signal<readonly FontStatus[]>([]);
const error = signal<string | undefined>(undefined);
const notice = signal<string | undefined>(undefined);
const historyPast: Board[] = [];

let editor: ScreenEditor | undefined;

/** A tela ativa com a posição dela no quadro (a primeira, se o id não existir mais). */
function activePlaced(): PlacedScreen {
  const found = findScreen(board.value, activeScreenId.value) ?? board.value.screens[0];
  if (!found) throw new Error('quadro sem telas');
  return found;
}

function activeScreen(): Screen {
  return activePlaced().screen;
}

/** Toda mudança do quadro passa aqui (como uma action do store), com desfazer simples. */
function commit(next: Board, undoable = true): void {
  // Containers com layout (Row/Column) recalculam e gravam os retângulos dos filhos, por tela.
  const lib = library.value;
  let arranged = next;
  if (lib) {
    for (const placed of next.screens) {
      const result = arrange(placed.screen, lib, konvaMeasurer);
      if (result !== placed.screen) arranged = replaceScreen(arranged, result);
    }
  }
  if (arranged === board.value) return;
  if (undoable) {
    historyPast.push(board.value);
    if (historyPast.length > 100) historyPast.shift();
  }
  board.value = arranged;
  editor?.setBoard(arranged);
}

/** Muda uma tela do quadro (a posição dela fica). */
function commitScreen(next: Screen, undoable = true): void {
  commit(replaceScreen(board.value, next), undoable);
}

/** Fim de um arrasto: entra (ou sai) de um container e assume a posição entre os irmãos. */
function dropped(
  id: string,
  box: { x: number; y: number; width: number; height: number },
  parentId: string | undefined,
  center: { x: number; y: number },
): void {
  const placed = screenOfInstance(board.value, id);
  if (!placed) return;
  let next = updateBox(placed.screen, id, box);
  const parent = parentId ? next.instances.find((i) => i.id === parentId) : undefined;
  const parentType = typeOf(parent);
  const slot = parentType?.component ? findSlot(parentType.component) : undefined;
  if (parent && slot) {
    const layout = resolveSlotLayout(slot, parent.values);
    const index = dropIndex(next, parent.id, layout, center, id);
    next = setParent(next, id, parent.id, index);
  } else if (!parentId) {
    next = setParent(next, id, undefined);
  }
  commitScreen(next);
}

function undo(): void {
  const previous = historyPast.pop();
  if (!previous) return;
  board.value = previous;
  if (!findScreen(previous, activeScreenId.value)) {
    const first = previous.screens[0]?.screen.id;
    if (first) activeScreenId.value = first;
  }
  editor?.setBoard(previous);
}

function say(message: string): void {
  notice.value = message;
  error.value = undefined;
}

function fail(e: unknown): void {
  error.value = e instanceof Error ? e.message : String(e);
  notice.value = undefined;
}

/** Depois de as fontes carregarem, os textos medem diferente: redesenha e re-arranja. */
async function applyFonts(loaded: Library): Promise<void> {
  fontStatus.value = await registerFonts(loaded.fonts);
  if (library.value !== loaded) return;
  editor?.setLibrary(loaded);
  commit(board.value, false);
}

/** Arquivos da biblioteca atual, para juntar fontes escolhidas depois. */
let currentFiles: readonly TextFile[] = [];

function loadFiles(files: readonly TextFile[], origin: string): void {
  try {
    const loaded = loadLibrary(files);
    currentFiles = files;
    library.value = loaded;
    editor?.setLibrary(loaded);
    void applyFonts(loaded);
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
  editor?.select(undefined);
  commit(newBoard(SAMPLE_SCREEN));
  activeScreenId.value = SAMPLE_SCREEN.id;
  editor?.fit();
}

/** Material Design 3 (baseline) escrito no formato do laboratório: um design system de verdade. */
function loadMaterial3(): void {
  loadFiles(M3_FILES, 'Material 3');
  editor?.select(undefined);
  commit(newBoard(M3_SCREEN));
  activeScreenId.value = M3_SCREEN.id;
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
    // Só fontes (sem especialização) e uma biblioteca já aberta: junta as fontes a ela.
    const hasSpec = files.some((f) => f.text?.includes('"mapping-spec"'));
    if (!hasSpec && files.some((f) => f.bytes) && library.value) {
      loadFiles(
        [...currentFiles.filter((f) => !f.bytes), ...files.filter((f) => f.bytes)],
        'Fontes',
      );
      return;
    }
    const screenFile = files.find((f) => f.text?.includes('"mapping-lab-screen"'));
    if (screenFile && files.length === 1) {
      const parsed = parseScreen(JSON.parse(screenFile.text ?? ''));
      // Importar a mesma tela duas vezes: ids repetidos viram ids novos.
      const taken = board.value.screens.some(
        (p) =>
          p.screen.id === parsed.id ||
          p.screen.instances.some((i) => parsed.instances.some((j) => j.id === i.id)),
      );
      const imported = taken ? cloneScreen(parsed, parsed.name) : parsed;
      commit(addScreen(board.value, imported));
      activeScreenId.value = imported.id;
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
  for (const file of SAMPLE_FILES)
    zip.file(`lab-components/${file.path}`, file.text ?? '');
  zip.file('lab-components/telas/entrar.screen.json', serializeScreen(SAMPLE_SCREEN));
  for (const file of M3_FILES) zip.file(`material3/${file.path}`, file.text ?? '');
  zip.file('material3/telas/settings.screen.json', serializeScreen(M3_SCREEN));
  zip.file(
    'material3/fonts/LEIA-ME.txt',
    [
      'Ponha aqui os arquivos da Roboto (Apache 2.0), baixados de https://fonts.google.com/specimen/Roboto:',
      '  Roboto-Regular.ttf  (peso 400)',
      '  Roboto-Medium.ttf   (peso 500)',
      'Depois reabra a pasta material3/ no laboratório (Abrir pasta… ou Abrir arquivos… com tudo selecionado).',
      'A especialização (material3.spec.json, chave "fonts") diz qual arquivo é qual peso; uma fonte',
      'variável (um arquivo só) serve com "weight": "100 900".',
      '',
    ].join('\n'),
  );
  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'lab-components.zip');
}

function addFromType(type: TypeDef): void {
  const current = activeScreen();
  const n = current.instances.length;
  const size = type.component?.size ?? { width: 160, height: 48 };
  const offset = 24 + (n % 8) * 16;
  // Com um container selecionado que aceite o tipo, a instância nova entra nele.
  const selected = current.instances.find((i) => i.id === selectedId.value);
  const selectedType = typeOf(selected);
  const intoContainer =
    selected &&
    isContainer(selectedType) &&
    (!selectedType?.allowedChildren || selectedType.allowedChildren.includes(type.id));
  const box = intoContainer
    ? {
        x: selected.box.x + 8,
        y: selected.box.y + 8,
        width: size.width,
        height: size.height,
      }
    : { x: offset, y: offset, width: size.width, height: size.height };
  const withNew = addInstance(current, {
    typeId: type.id,
    box,
    values: initialValues(type),
    ...(intoContainer ? { parentId: selected.id } : {}),
  });
  const added = withNew.instances[withNew.instances.length - 1];
  commitScreen(withNew);
  if (added) editor?.select(added.id);
}

function typeOf(instance: Instance | undefined): TypeDef | undefined {
  return instance
    ? library.value?.types.find((t) => t.id === instance.typeId)
    : undefined;
}

// ---------------------------------------------------------------------------------------

function Toolbar() {
  const current = activeScreen();
  const count = board.value.screens.length;
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
          accept=".json,.ttf,.otf,.woff,.woff2,application/json,font/ttf,font/otf,font/woff,font/woff2"
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
      <input
        type="text"
        class="screen-name"
        aria-label="Nome da tela"
        value={current.name}
        onChange={(e) => commitScreen({ ...current, name: e.currentTarget.value })}
      />
      <select
        aria-label="Tamanho da tela"
        value={`${current.width}x${current.height}`}
        onChange={(e) => {
          const [w, h] = e.currentTarget.value.split('x').map(Number);
          if (w && h) {
            commitScreen(resize(current, w, h));
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
          const next = duplicateScreen(board.value, current.id);
          const copy = next.screens[next.screens.length - 1];
          editor?.select(undefined);
          commit(next);
          if (copy) activeScreenId.value = copy.screen.id;
          editor?.fit();
        }}
      >
        Duplicar tela
      </button>
      <button
        type="button"
        disabled={count <= 1}
        onClick={() => {
          const next = removeScreen(board.value, current.id);
          const first = next.screens[0]?.screen.id;
          editor?.select(undefined);
          commit(next);
          if (first) activeScreenId.value = first;
          editor?.fit();
        }}
      >
        Excluir tela
      </button>
      <button type="button" onClick={undo} title="Ctrl+Z">
        Desfazer
      </button>
      <label
        class="toggle"
        title="A tela inteira continua arrastável; os componentes dentro dela não se arrastam nem redimensionam, só as propriedades mudam"
      >
        <input
          type="checkbox"
          checked={fixed.value}
          onChange={(e) => {
            const value = e.currentTarget.checked;
            fixed.value = value;
            editor?.setFixed(value);
          }}
        />
        Posições fixas
      </label>
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
          const url = editor?.toDataURL(current.id);
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
                {isContainer(type) ? ' ▣' : ''}
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
      {lib && lib.fonts.length > 0 && (
        <>
          <h2>Fontes</h2>
          <ul data-testid="fonts">
            {lib.fonts.map((font) => {
              const status = fontStatus.value.find((f) => f.font === font);
              const label =
                status?.status === 'loaded'
                  ? 'carregada'
                  : status?.status === 'failed'
                    ? `falhou: ${status.detail ?? ''}`
                    : font.bytes
                      ? 'carregando…'
                      : 'ausente';
              return (
                <li key={`${font.family}-${font.weight}-${font.style}`} title={font.path}>
                  <span class="name">{describeFont(font)}</span>
                  <span class={status?.status === 'loaded' ? 'hint' : 'missing'}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
          {fontStatus.value.some((f) => f.status === 'missing') && (
            <p class="hint">
              Fonte ausente: o texto usa a fonte do sistema. Ponha os arquivos (ex.:{' '}
              <code>fonts/Roboto-Regular.ttf</code>) na pasta e reabra; o zip dos exemplos
              traz um LEIA-ME.
            </p>
          )}
        </>
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
      onActiveScreen: (id) => {
        if (id) activeScreenId.value = id;
      },
      onScreenMove: (id, x, y) => commit(moveScreen(board.value, id, x, y)),
      onBoxChange: (id, box) => {
        const placed = screenOfInstance(board.value, id);
        if (placed) commitScreen(updateBox(placed.screen, id, box));
      },
      onDrop: dropped,
    });
    editor.setLibrary(library.value);
    editor.setBoard(board.value);
    editor.setActiveScreen(activeScreenId.value);
    editor.setFixed(fixed.value);
    // Mudar a tela ativa fora do canvas (barra, desfazer) reflete no realce do palco.
    const stop = effect(() => editor?.setActiveScreen(activeScreenId.value));
    return () => {
      stop();
      editor?.dispose();
      editor = undefined;
    };
  }, []);
  return (
    <div class="lab-canvas">
      <div class="stage" ref={host} data-testid="stage" />
      {board.value.screens.every((p) => p.screen.instances.length === 0) && (
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
    commitScreen(setValue(activeScreen(), instance.id, field.key, next));
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

/** Pai (container) e posição entre os irmãos da instância selecionada. */
function ParentRow({ instance, disabled }: { instance: Instance; disabled: boolean }) {
  const current = activeScreen();
  const lib = library.value;
  const blocked = new Set([
    instance.id,
    ...ancestorsOf(current, instance.id).filter(() => false),
  ]);
  const containers = current.instances.filter((i) => {
    if (i.id === instance.id || blocked.has(i.id)) return false;
    const type = lib?.types.find((t) => t.id === i.typeId);
    if (!isContainer(type)) return false;
    if (type?.allowedChildren && !type.allowedChildren.includes(instance.typeId))
      return false;
    // Um ancestral não pode virar filho do descendente.
    return !ancestorsOf(current, i.id).includes(instance.id);
  });
  const siblings = childrenOf(current, instance.parentId ?? undefined);
  const index = siblings.findIndex((i) => i.id === instance.id);
  const label = (i: Instance) => {
    const type = lib?.types.find((t) => t.id === i.typeId);
    return type ? `${type.name} · ${instanceLabel(type, i.values)}` : i.typeId;
  };
  return (
    <>
      <div class="row">
        <label for={`parent-${instance.id}`}>Pai</label>
        <select
          id={`parent-${instance.id}`}
          value={instance.parentId ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const value = e.currentTarget.value;
            commitScreen(
              setParent(current, instance.id, value === '' ? undefined : value),
            );
          }}
        >
          <option value="">(tela)</option>
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c)}
            </option>
          ))}
        </select>
      </div>
      <div class="row">
        <span>Ordem</span>
        <span class="actions">
          <button
            type="button"
            disabled={disabled || index <= 0}
            onClick={() => commitScreen(moveSibling(current, instance.id, -1))}
            title="Antes do irmão anterior"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={disabled || index < 0 || index >= siblings.length - 1}
            onClick={() => commitScreen(moveSibling(current, instance.id, 1))}
            title="Depois do próximo irmão"
          >
            ↓
          </button>
          <span class="hint">
            {index + 1} de {siblings.length}
          </span>
        </span>
      </div>
    </>
  );
}

function Properties() {
  const current = activeScreen();
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
    commitScreen(updateBox(current, instance.id, { ...box, ...patch }));
  return (
    <div>
      <h2>
        {type
          ? `${type.name} · ${instanceLabel(type, instance.values)}`
          : instance.typeId}
      </h2>
      <div class="lab-props" data-testid="properties">
        {fixed.value && <p class="hint">Posições fixas: só as propriedades mudam.</p>}
        <div class="box">
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <label key={key}>
              {key === 'width' ? 'L' : key === 'height' ? 'A' : key}
              <input
                type="number"
                value={box[key]}
                disabled={fixed.value}
                onChange={(e) => setBox({ [key]: Number(e.currentTarget.value) })}
              />
            </label>
          ))}
        </div>
        {type?.fields.map((field) => (
          <FieldEditor key={field.key} field={field} instance={instance} />
        ))}
        <ParentRow instance={instance} disabled={fixed.value} />
        <div class="actions">
          <button
            type="button"
            onClick={() => commitScreen(bringToFront(current, instance.id))}
            disabled={fixed.value || Boolean(instance.parentId)}
            title="Só no nível da tela; dentro de um container, use a ordem entre irmãos"
          >
            Trazer para frente
          </button>
          <button
            type="button"
            class="danger"
            onClick={() => {
              commitScreen(removeInstance(current, instance.id));
              editor?.select(undefined);
            }}
            title="Os filhos sobem para o pai"
          >
            Excluir
          </button>
          {childrenOf(current, instance.id).length > 0 && (
            <button
              type="button"
              class="danger"
              onClick={() => {
                commitScreen(removeSubtree(current, instance.id));
                editor?.select(undefined);
              }}
            >
              Excluir com filhos
            </button>
          )}
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
  const placed = activePlaced();
  const current = placed.screen;
  const hovered = board.value.screens
    .flatMap((p) => p.screen.instances)
    .find((i) => i.id === hoverId.value);
  const hoveredType = typeOf(hovered);
  return (
    <div class="lab-status" data-testid="status">
      {error.value && <span class="error">{error.value}</span>}
      {!error.value && notice.value && <span>{notice.value}</span>}
      <span>
        {board.value.screens.length} tela(s) · {current.name}: {current.width} ×{' '}
        {current.height} px em ({placed.x}, {placed.y}), {current.instances.length}{' '}
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
        const owner = screenOfInstance(board.value, selectedId.value);
        if (owner) commitScreen(removeInstance(owner.screen, selectedId.value));
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
          Experimento: telas sem imagem, várias no mesmo canvas e reorganizáveis, montadas
          com componentes genéricos cujo desenho segue as propriedades da anotação.
        </p>
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
