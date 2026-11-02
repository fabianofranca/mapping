/** @jsxImportSource react */
/**
 * Prova de que o projeto `viewer-react` do Vitest usa o React de verdade (e não
 * preact/compat): é nele que o invólucro `<MappingViewer/>` é testado. Também monta a página de
 * demonstração (`lab/react/main.tsx`) para o conjunto Material 3 (SDUI).
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../canvas/harness';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import { screenFromSource } from '../../../src/model/components/origin';
import { M3_FILES } from '../../../lab/components/samplesMaterial3';
import settings from '../../../lab/components/sdui/settings.sdui.json';

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

describe('página de demonstração: Material 3 (SDUI)', () => {
  const expected = screenFromSource(loadLibrary(M3_FILES), settings, {
    measure: approximateMeasurer,
  });
  const total = expected.screen?.instances.length ?? 0;

  beforeAll(async () => {
    installFakeCanvas();
    const lab = document.createElement('div');
    lab.id = 'lab';
    document.body.append(lab);
    await act(async () => {
      await import('../../../lab/react/main');
    });
  });

  const button = (name: string): HTMLButtonElement => {
    const found = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === name,
    );
    if (!found) throw new Error(`botão ${name} não encontrado`);
    return found;
  };
  const treeRows = (): number => document.querySelectorAll('.react-lab-tree li').length;
  const status = (): string =>
    document.querySelector('.react-lab-status')?.textContent ?? '';
  const textarea = (): HTMLTextAreaElement => {
    const el = document.querySelector('textarea');
    if (!el) throw new Error('textarea não encontrada');
    return el;
  };
  const type = async (value: string): Promise<void> => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(textarea(), value);
      textarea().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('o botão mostra o JSON do SDUI e a árvore tem as instâncias calculadas', async () => {
    expect(total).toBeGreaterThan(10);
    await act(async () => button('Material 3 (SDUI)').click());
    expect(button('Material 3 (SDUI)').getAttribute('aria-pressed')).toBe('true');
    expect(textarea().getAttribute('aria-label')).toBe('SDUI (JSON)');
    expect(JSON.parse(textarea().value)).toEqual(settings);
    expect(treeRows()).toBe(total);
    expect(status()).toContain('Settings (412 × 917)');
    expect(status()).toContain('Avisos da origem: nenhum');
  });

  it('editar o JSON muda a tela', async () => {
    const edited = structuredClone(settings) as unknown as {
      content: { children: { children?: unknown[] }[] };
    };
    edited.content.children[1]!.children!.shift();
    await type(JSON.stringify(edited));
    expect(treeRows()).toBe(total - 1);
    expect(document.querySelector('.react-lab-error')).toBeNull();
  });

  it('JSON inválido mostra o erro e mantém a última tela', async () => {
    const rows = treeRows();
    await type('{ quebrado');
    expect(document.querySelector('.react-lab-error')?.textContent).toBeTruthy();
    expect(treeRows()).toBe(rows);
  });

  it('JSON sem tela (error da origem) mostra o erro e mantém a última tela', async () => {
    await type(JSON.stringify(settings));
    expect(treeRows()).toBe(total);
    expect(document.querySelector('.react-lab-error')).toBeNull();
    await type('{}');
    expect(document.querySelector('.react-lab-error')?.textContent).toBeTruthy();
    expect(treeRows()).toBe(total);
    expect(status()).toContain('Settings (412 × 917)');
  });

  it('avisos da origem aparecem quando há propriedade desconhecida', async () => {
    const edited = structuredClone(settings) as unknown as {
      content: { children: { props: Record<string, unknown> }[] };
    };
    edited.content.children[0]!.props.propInventada = 1;
    await type(JSON.stringify(edited));
    expect(document.querySelector('.react-lab-error')).toBeNull();
    expect(status()).toContain('Avisos da origem:');
    expect(status()).toContain('propInventada');
    expect(status()).not.toContain('Avisos da origem: nenhum');
  });
});
