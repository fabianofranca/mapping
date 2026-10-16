/** @jsxImportSource react */
/**
 * Laboratório "Visualizador React": hospedeiro React de verdade (`react-dom/client`, sem
 * preact/compat) para o `<MappingViewer/>` embutível (fase L1). Experimento fora do produto:
 * textos em pt-BR direto no código, sem i18n e sem store.
 *
 * O JSON da tela à esquerda é a fonte de verdade da demonstração: cada edição válida vira a
 * `screen` do visualizador (atualização em tempo real); uma edição inválida mostra o erro e
 * mantém a última tela válida. O StrictMode é um toggle que recria o root.
 */
import { Fragment, StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import 'virtual:tokens.css';
import './react.css';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../components/samples';
import { M3_FILES, M3_SCREEN } from '../components/samplesMaterial3';
import {
  type InstanceWarnings,
  type Library,
  type Screen,
  MappingViewer,
  loadLibrary,
  parseScreen,
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

function App({ strict, onStrict }: { strict: boolean; onStrict: (on: boolean) => void }) {
  const [dataset, setDataset] = useState<Dataset>('m3');
  const [screen, setScreen] = useState<Screen>(DATASETS.m3.screen);
  const [text, setText] = useState(() => serializeScreen(DATASETS.m3.screen));
  const [error, setError] = useState<string | undefined>();
  const [mounted, setMounted] = useState(true);
  const [hover, setHover] = useState<string | undefined>();
  const [click, setClick] = useState<Click | undefined>();
  const [selection, setSelection] = useState<readonly string[]>([]);
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
