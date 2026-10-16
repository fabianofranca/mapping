/**
 * Laboratório "Figma somente leitura": cole um SVG copiado do Figma (ou o JSON da API REST)
 * e veja o desenho feito pelo Konva, com a árvore de nós, hover, seleção e comparação com o
 * SVG rasterizado pelo navegador. Experimento fora do produto: textos em pt-BR direto no
 * código, sem i18n, sem store e sem service worker.
 */
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal, useSignal } from '@preact/signals';
import 'virtual:tokens.css';
import './lab.css';
import { detectInput, toScene, type InputKind } from './detectInput';
import { SAMPLE_JSON, SAMPLE_SVG } from './samples';
import { type Scene, type SceneNode, countNodes, hasChildren, walk } from './scene';
import { LabViewer } from './viewer';

interface Loaded {
  readonly kind: InputKind;
  readonly text: string;
  readonly scene: Scene;
  readonly parseMs: number;
  readonly bytes: number;
}

const loaded = signal<Loaded | undefined>(undefined);
const error = signal<string | undefined>(undefined);
const hoverId = signal<string | undefined>(undefined);
const selectedId = signal<string | undefined>(undefined);
const renderWarnings = signal<readonly string[]>([]);
const zoom = signal(1);

let viewer: LabViewer | undefined;

function load(kind: InputKind, text: string): void {
  try {
    const started = performance.now();
    const scene = toScene(kind, text);
    const parseMs = performance.now() - started;
    loaded.value = { kind, text, scene, parseMs, bytes: new Blob([text]).size };
    error.value = undefined;
    selectedId.value = undefined;
    hoverId.value = undefined;
    viewer?.setScene(scene);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function loadDetected(data: { text?: string; html?: string }): void {
  const detected = detectInput(data);
  load(detected.kind, detected.payload);
}

async function loadFile(file: File): Promise<void> {
  const text = await file.text();
  const kind = file.name.toLowerCase().endsWith('.svg')
    ? 'svg'
    : file.name.toLowerCase().endsWith('.json')
      ? 'json'
      : detectInput({ text }).kind;
  load(kind, text);
}

function clear(): void {
  loaded.value = undefined;
  error.value = undefined;
  selectedId.value = undefined;
  hoverId.value = undefined;
  viewer?.setScene(undefined);
}

function nodeById(
  scene: Scene | undefined,
  id: string | undefined,
): SceneNode | undefined {
  if (!scene || !id) return undefined;
  for (const node of walk(scene.root)) if (node.id === id) return node;
  return undefined;
}

function Toolbar() {
  const outlines = useSignal(false);
  const reference = useSignal(false);
  const refOpacity = useSignal(0.5);
  const current = loaded.value;

  useEffect(() => {
    if (!viewer) return;
    if (!reference.value || current?.kind !== 'svg') {
      viewer.setReference(undefined, refOpacity.value);
      return;
    }
    // O navegador rasteriza o SVG original: a referência de fidelidade do desenho nativo.
    const image = new Image();
    image.onload = () => viewer?.setReference(image, refOpacity.value);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(current.text)}`;
  }, [reference.value, current]);

  return (
    <div class="lab-toolbar" role="toolbar" aria-label="Ações do laboratório">
      <button type="button" onClick={() => load('svg', SAMPLE_SVG)}>
        Exemplo SVG
      </button>
      <button type="button" onClick={() => load('json', SAMPLE_JSON)}>
        Exemplo JSON
      </button>
      <label class="file">
        Abrir arquivo…
        <input
          type="file"
          accept=".svg,.json,image/svg+xml,application/json"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void loadFile(file);
            e.currentTarget.value = '';
          }}
        />
      </label>
      <button type="button" onClick={clear} disabled={!current}>
        Limpar
      </button>
      <span class="sep" />
      <button
        type="button"
        aria-pressed={outlines.value}
        onClick={() => {
          outlines.value = !outlines.value;
          viewer?.setOutlines(outlines.value);
        }}
      >
        Contornos
      </button>
      <button
        type="button"
        aria-pressed={reference.value}
        disabled={current?.kind !== 'svg'}
        title="Sobrepõe o SVG original rasterizado pelo navegador (só para entrada SVG)"
        onClick={() => {
          reference.value = !reference.value;
        }}
      >
        Referência SVG
      </button>
      <label class="check" hidden={!reference.value}>
        opacidade
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={refOpacity.value}
          onInput={(e) => {
            refOpacity.value = Number(e.currentTarget.value);
            viewer?.setReferenceOpacity(refOpacity.value);
          }}
        />
      </label>
      <span class="sep" />
      <button type="button" onClick={() => viewer?.zoomTo(viewer.scale() / 1.25)}>
        −
      </button>
      <span aria-live="polite">{Math.round(zoom.value * 100)}%</span>
      <button type="button" onClick={() => viewer?.zoomTo(viewer.scale() * 1.25)}>
        +
      </button>
      <button type="button" onClick={() => viewer?.zoomTo(1)}>
        100%
      </button>
      <button type="button" onClick={() => viewer?.fit()}>
        Ajustar
      </button>
    </div>
  );
}

function CanvasArea() {
  const host = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    viewer = new LabViewer(element, {
      onHover: (id) => (hoverId.value = id),
      onSelect: (id) => (selectedId.value = id),
      onZoom: (scale) => (zoom.value = scale),
      onRenderWarnings: (warnings) => (renderWarnings.value = warnings),
    });
    if (loaded.value) viewer.setScene(loaded.value.scene);
    return () => {
      viewer?.dispose();
      viewer = undefined;
    };
  }, []);

  return (
    <div
      class={`lab-canvas${dragging ? ' drop' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) void loadFile(file);
        else {
          loadDetected({
            text: e.dataTransfer?.getData('text/plain'),
            html: e.dataTransfer?.getData('text/html'),
          });
        }
      }}
    >
      <div class="stage" ref={host} data-testid="stage" />
      {!loaded.value && (
        <div class="lab-empty">
          <div>
            <p>
              No Figma, selecione um componente e use{' '}
              <b>botão direito › Copy/Paste as › Copy as SVG</b>; depois <kbd>Ctrl</kbd>+
              <kbd>V</kbd> aqui.
            </p>
            <p>
              Também aceita o JSON de{' '}
              <code>GET /v1/files/:key/nodes?ids=…&geometry=paths</code>, colado ou solto
              como arquivo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeItem({ node, depth }: { node: SceneNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const children = hasChildren(node) ? node.children : [];
  const classes = [
    node.id === selectedId.value ? 'selected' : '',
    node.id === hoverId.value ? 'hover' : '',
    node.visible ? '' : 'hidden',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li>
      <div
        class={classes}
        style={{ paddingLeft: `calc(var(--space-1) + ${depth} * var(--space-3))` }}
        onMouseEnter={() => viewer?.setHover(node.id)}
        onMouseLeave={() => viewer?.setHover(undefined)}
        onClick={() => viewer?.select(node.id)}
        data-node-id={node.id}
      >
        <button
          type="button"
          class={`toggle${children.length === 0 ? ' leaf' : ''}`}
          aria-label={open ? 'Recolher' : 'Expandir'}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        <span class="type">{node.type}</span>
        <span>{node.name}</span>
      </div>
      {open && children.length > 0 && (
        <ul>
          {children.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function describePaint(paint: SceneNode['fills'][number]): string {
  switch (paint.type) {
    case 'solid':
      return (
        paint.color +
        (paint.opacity !== undefined && paint.opacity < 1 ? ` ×${paint.opacity}` : '')
      );
    case 'linear':
      return `linear ${paint.stops.map((s) => s.color).join(' → ')}`;
    case 'radial':
      return `radial ${paint.stops.map((s) => s.color).join(' → ')}`;
    case 'image':
      return paint.src ? 'imagem embutida' : 'imagem (sem pixels)';
  }
}

function Details() {
  const scene = loaded.value?.scene;
  const node = nodeById(scene, selectedId.value) ?? nodeById(scene, hoverId.value);
  if (!node) {
    return (
      <div class="lab-details">
        <h2>Nó</h2>
        <p class="ok">Passe o mouse ou clique num nó.</p>
      </div>
    );
  }
  const box = viewer?.boxOf(node.id);
  const fmt = (n: number) => Math.round(n * 100) / 100;
  const [a, b, c, d, e, f] = node.transform;
  return (
    <div class="lab-details">
      <h2>{selectedId.value === node.id ? 'Seleção' : 'Sob o mouse'}</h2>
      <dl>
        <dt>nome</dt>
        <dd>{node.name}</dd>
        <dt>id</dt>
        <dd>{node.id}</dd>
        <dt>tipo</dt>
        <dd>{node.type === 'unknown' ? `unknown (${node.sourceType})` : node.type}</dd>
        <dt>tamanho</dt>
        <dd>
          {fmt(node.width)} × {fmt(node.height)}
        </dd>
        {box && (
          <>
            <dt>caixa</dt>
            <dd>
              x {fmt(box.x)} y {fmt(box.y)} · {fmt(box.width)} × {fmt(box.height)}
            </dd>
          </>
        )}
        <dt>transform</dt>
        <dd>[{[a, b, c, d, e, f].map(fmt).join(', ')}]</dd>
        <dt>opacidade</dt>
        <dd>{node.opacity}</dd>
        {node.fills.length > 0 && (
          <>
            <dt>fills</dt>
            <dd>{node.fills.map(describePaint).join('; ')}</dd>
          </>
        )}
        {node.stroke && (
          <>
            <dt>stroke</dt>
            <dd>
              {node.stroke.width}px {node.stroke.align}{' '}
              {node.stroke.paints.map(describePaint).join('; ')}
            </dd>
          </>
        )}
        {node.effects.length > 0 && (
          <>
            <dt>efeitos</dt>
            <dd>
              {node.effects
                .map(
                  (s) =>
                    `${s.inner ? 'inner ' : ''}sombra ${s.color} (${s.offset.x}, ${s.offset.y}) blur ${s.blur}`,
                )
                .join('; ')}
            </dd>
          </>
        )}
        {node.type === 'text' && (
          <>
            <dt>texto</dt>
            <dd>{node.text}</dd>
            <dt>fonte</dt>
            <dd>
              {node.style.fontFamily} {node.style.fontWeight}
              {node.style.italic ? ' italic' : ''} {node.style.fontSize}px
              {node.style.lineHeight ? ` / ${fmt(node.style.lineHeight)}` : ''} ·{' '}
              {node.style.align}/{node.style.verticalAlign}
            </dd>
          </>
        )}
        {node.type === 'path' && (
          <>
            <dt>d</dt>
            <dd>{node.d.length > 120 ? `${node.d.slice(0, 120)}…` : node.d}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function Warnings() {
  const scene = loaded.value?.scene;
  const all = [...(scene?.warnings ?? []), ...renderWarnings.value];
  return (
    <div class="lab-warnings">
      <h2>Avisos ({all.length})</h2>
      {all.length === 0 ? (
        <p class="ok">{scene ? 'Nada ficou de fora.' : 'Nenhum conteúdo carregado.'}</p>
      ) : (
        <ul>
          {all.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Status() {
  const current = loaded.value;
  return (
    <div class="lab-status" data-testid="status">
      {error.value && <span class="error">{error.value}</span>}
      {current && (
        <>
          <span>
            origem <span class="kind">{current.scene.source}</span>
          </span>
          <span>{countNodes(current.scene.root)} nós</span>
          <span>
            {Math.round(current.scene.root.width)} ×{' '}
            {Math.round(current.scene.root.height)} px
          </span>
          <span>{(current.bytes / 1024).toFixed(1)} KiB</span>
          <span>conversão {current.parseMs.toFixed(1)} ms</span>
        </>
      )}
      {!current && !error.value && <span>Aguardando um SVG ou JSON.</span>}
    </div>
  );
}

function Lab() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data) return;
      const file = [...data.files][0];
      if (file) {
        e.preventDefault();
        void loadFile(file);
        return;
      }
      loadDetected({ text: data.getData('text/plain'), html: data.getData('text/html') });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div class="lab">
      <header class="lab-header">
        <h1>Figma somente leitura (Konva)</h1>
        <p>
          Experimento: componentes copiados do Figma desenhados nativamente no canvas.
        </p>
      </header>
      <Toolbar />
      <div class="lab-main">
        <CanvasArea />
        <aside class="lab-side">
          <div class="lab-tree">
            <h2>Nós</h2>
            {loaded.value ? (
              <ul>
                <TreeItem node={loaded.value.scene.root} depth={0} />
              </ul>
            ) : (
              <p class="ok" />
            )}
          </div>
          <Details />
          <Warnings />
        </aside>
      </div>
      <Status />
    </div>
  );
}

const root = document.getElementById('lab');
if (root) render(<Lab />, root);
