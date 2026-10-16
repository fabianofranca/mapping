/** @jsxImportSource react */
/**
 * Prova de que o projeto `viewer-react` do Vitest usa o React de verdade (e não
 * preact/compat): é nele que o invólucro `<MappingViewer/>` é testado.
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Hello({ name }: { name: string }) {
  const [n] = React.useState(1);
  return (
    <p>
      Olá, {name} {n}
    </p>
  );
}

describe('ambiente React do visualizador', () => {
  it('usa React 19 de verdade', () => {
    expect(React.version.startsWith('19')).toBe(true);
  });

  it('renderiza com createRoot dentro de act', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <React.StrictMode>
          <Hello name="mundo" />
        </React.StrictMode>,
      );
    });
    expect(host.textContent).toBe('Olá, mundo 1');
    await act(async () => root.unmount());
    host.remove();
  });
});
