/** @jsxImportSource react */
/**
 * Laboratório "Visualizador React": hospedeiro React de verdade (`react-dom/client`, sem
 * preact/compat) para o `<MappingViewer/>` embutível (fase L1). Experimento fora do produto:
 * textos em pt-BR direto no código, sem i18n e sem store.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'virtual:tokens.css';
import './react.css';

function App() {
  return (
    <div className="react-lab">
      <aside className="react-lab-side">
        <h1>Visualizador React</h1>
        <p>A demonstração usa a fonte do sistema (o hospedeiro é quem fornece fontes).</p>
        <div className="react-lab-controls">
          <button type="button">Exemplos</button>
          <button type="button">Material 3</button>
          <button type="button">Desmontar</button>
          <label className="toggle">
            <input type="checkbox" defaultChecked /> StrictMode
          </label>
        </div>
        <textarea aria-label="Tela (JSON)" spellCheck={false} />
      </aside>
      <main className="react-lab-main">
        <div className="react-lab-viewer">{/* TODO(L1): <MappingViewer/> */}</div>
        <div className="react-lab-status" />
      </main>
    </div>
  );
}

const host = document.getElementById('lab');
if (!host) throw new Error('#lab não encontrado');
createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
