/** @jsxImportSource react */
/**
 * Laboratório "Visualizador React": hospedeiro React de verdade (`react-dom/client`, sem
 * preact/compat) para o `<MappingViewer/>` embutível (fase L1). Experimento fora do produto:
 * textos em pt-BR direto no código, sem i18n e sem store.
 *
 * O JSON da tela à esquerda é a fonte de verdade da demonstração: cada edição válida vira a
 * `screen` do visualizador (atualização em tempo real); uma edição inválida mostra o erro e
 * mantém a última tela válida. O StrictMode é um toggle que recria o root.
 *
 * A seleção tem duas fontes: o clique no canvas (quando "Seleção pelo canvas" está ligada) e a
 * árvore das instâncias à direita, que também mostra as propriedades (só leitura) da selecionada.
 * O hover idem: o ponteiro no canvas ou o ponteiro sobre a linha da árvore; vence a última fonte.
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
import 'virtual:tokens.css';
import './react.css';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../components/samples';
import { M3_FILES, M3_SCREEN } from '../components/samplesMaterial3';
import {
  type FieldValue,
  type Instance,
  type InstanceWarnings,
  type Library,
  type Screen,
  type TypeDef,
  MappingViewer,
  instanceLabel,
  loadLibrary,
  parseScreen,
  renderOrder,
  serializeScreen,
} from '../viewer/react';

type Dataset = 'samples' | 'm3';

const DATASETS: Record<Dataset, { library: Library; screen: Screen }> = {
  samples: { library: loadLibrary(SAMPLE_FILES), screen: SAMPLE_SCREEN },
  m3: { library: loadLibrary(M3_FILES), screen: M3_SCREEN },
};

interface Click {
  readonly id: string | undefined;
  readonly x: number;
  readonly y: number;
}

/** Linha da árvore selecionada: mantém-na visível quando a seleção veio do canvas. */
function revealRow(el: HTMLElement | null): void {
  if (el && typeof el.scrollIntoView === 'function')
    el.scrollIntoView({ block: 'nearest' });
}

function valueText(value: FieldValue): string {
  return value === null || value === undefined || String(value).trim() === ''
    ? '(vazio)'
    : String(value);
}

interface TreeRow {
  readonly instance: Instance;
  readonly type: TypeDef | undefined;
  readonly depth: number;
}

/** As instâncias em hierarquia (pré-ordem de `renderOrder`), com a profundidade de cada uma. */
function treeRows(screen: Screen, library: Library): TreeRow[] {
  const types = new Map(library.types.map((t) => [t.id, t]));
  const depths = new Map<string, number>();
  return renderOrder(screen).map((instance) => {
    const parentDepth =
      instance.parentId === undefined ? undefined : depths.get(instance.parentId);
    const depth = parentDepth === undefined ? 0 : parentDepth + 1;
    depths.set(instance.id, depth);
    return { instance, type: types.get(instance.typeId), depth };
  });
}

function InstanceTree({
  rows,
  selected,
  onSelect,
  onHover,
}: {
  rows: readonly TreeRow[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  onHover: (id: string | undefined) => void;
}) {
  if (rows.length === 0) return <p className="react-lab-empty">Nenhuma instância.</p>;
  return (
    <ul className="react-lab-tree">
      {rows.map(({ instance, type, depth }) => {
        const isSelected = instance.id === selected;
        return (
          <li key={instance.id}>
            <button
              type="button"
              ref={isSelected ? revealRow : undefined}
              aria-current={isSelected ? 'true' : undefined}
              style={{
                paddingLeft: `calc(var(--space-2) + ${depth} * var(--space-3))`,
              }}
              onClick={() => onSelect(instance.id)}
              onMouseEnter={() => onHover(instance.id)}
              onMouseLeave={() => onHover(undefined)}
            >
              <span className="react-lab-tree-label">
                {type ? instanceLabel(type, instance.values) : instance.typeId}
              </span>
              <span className="react-lab-tree-type">
                {type ? type.name : 'tipo desconhecido'}
              </span>
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
      <p className="react-lab-empty">Clique numa instância na árvore ou no canvas.</p>
    );
  const { box } = instance;
  return (
    <div className="react-lab-props">
      <div className="react-lab-props-title">{type ? type.name : instance.typeId}</div>
      {type ? null : (
        <p className="react-lab-empty">
          Tipo desconhecido: a biblioteca não tem o tipo “{instance.typeId}”.
        </p>
      )}
      <dl>
        <dt>Id</dt>
        <dd>{instance.id}</dd>
        <dt>Caixa</dt>
        <dd>
          x {box.x}, y {box.y}, L {box.width}, A {box.height}
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
  const [warnings, setWarnings] = useState<InstanceWarnings>(new Map());
  const [updateMs, setUpdateMs] = useState<number | undefined>();
  /** Instante em que a edição entrou (handler); lido depois do commit e do efeito do viewer. */
  const startedAt = useRef<number | undefined>(undefined);
  const library = DATASETS[dataset].library;

  // Efeito do PAI: o React roda os efeitos dos filhos antes dos do pai, então este roda depois
  // do `update` do `<MappingViewer/>`. O desenho do Konva (requestAnimationFrame) fica de fora.
  useEffect(() => {
    if (startedAt.current === undefined) return;
    setUpdateMs(performance.now() - startedAt.current);
    startedAt.current = undefined;
  }, [screen, library]);

  const edit = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const started = performance.now();
    const value = event.target.value;
    setText(value);
    try {
      const parsed = parseScreen(JSON.parse(value));
      startedAt.current = started;
      setScreen(parsed);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const choose = (next: Dataset): void => {
    startedAt.current = performance.now();
    setDataset(next);
    setScreen(DATASETS[next].screen);
    setText(serializeScreen(DATASETS[next].screen));
    setError(undefined);
    setSelection([]);
    setHover(undefined);
  };

  // Callbacks novos a cada render de propósito: o invólucro lê por ref e não recria o viewer.
  const onClick = (id: string | undefined, point: { x: number; y: number }): void => {
    setClick({ id, x: Math.round(point.x), y: Math.round(point.y) });
    setSelection((current) => (id === undefined ? [] : current.includes(id) ? [] : [id]));
  };

  const selectOne = (id: string): void =>
    setSelection((current) => (current.includes(id) ? [] : [id]));

  const rows = useMemo(() => treeRows(screen, library), [screen, library]);
  const selectedId = selection[0];
  const selected = rows.find((row) => row.instance.id === selectedId);

  const warned = [...warnings].filter(([, list]) => list.length > 0);

  return (
    <div className="react-lab">
      <aside className="react-lab-side">
        <h1>Visualizador React</h1>
        <p>
          A demonstração usa a fonte do sistema: as fontes são do hospedeiro (CSS
          @font-face ou FontFace + <code>fontsVersion</code>).
        </p>
        <div className="react-lab-controls">
          <button
            type="button"
            aria-pressed={dataset === 'samples'}
            onClick={() => choose('samples')}
          >
            Exemplos
          </button>
          <button
            type="button"
            aria-pressed={dataset === 'm3'}
            onClick={() => choose('m3')}
          >
            Material 3
          </button>
          <button type="button" onClick={() => setMounted((m) => !m)}>
            {mounted ? 'Desmontar' : 'Montar'}
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
            Seleção pelo canvas
          </label>
        </div>
        <textarea
          aria-label="Tela (JSON)"
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
            Tela: {screen.name} ({screen.width} × {screen.height}),{' '}
            {screen.instances.length} instâncias
          </div>
          <div>Hover: {hover ?? '—'}</div>
          <div>
            Último clique:{' '}
            {click ? `${click.id ?? 'fundo'} em (${click.x}, ${click.y})` : '—'}
          </div>
          <div>Seleção: {selection.length > 0 ? selection.join(', ') : '—'}</div>
          <div>
            Avisos:{' '}
            {warned.length === 0
              ? 'nenhum'
              : warned.map(([id, list]) => `${id}: ${list.join('; ')}`).join(' | ')}
          </div>
          <div>
            Última atualização:{' '}
            {updateMs === undefined ? '—' : `${updateMs.toFixed(1)} ms`}{' '}
            <span className="react-lab-hint">
              (aproximado: da edição até o efeito do invólucro, sem o desenho do Konva)
            </span>
          </div>
        </div>
      </main>
      <aside className="react-lab-right">
        <section className="react-lab-section react-lab-section-tree">
          <h2>Árvore</h2>
          <InstanceTree
            rows={rows}
            selected={selectedId}
            onSelect={selectOne}
            onHover={setHover}
          />
        </section>
        <section className="react-lab-section">
          <h2>Propriedades</h2>
          <Properties instance={selected?.instance} type={selected?.type} />
        </section>
      </aside>
    </div>
  );
}

/** Dono do toggle StrictMode: trocar o invólucro remonta toda a árvore (como recriar o root). */
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
if (!host) throw new Error('#lab não encontrado');
createRoot(host).render(<Shell />);
