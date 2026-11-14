/** @jsxImportSource react */
/**
 * Proof that the Vitest `viewer-react` project uses real React (and not preact/compat): it is
 * where the `<MappingViewer/>` wrapper is tested. It also mounts the demo page
 * (`viewer/demo/main.tsx`) for the Material 3 (SDUI) set.
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../canvas/harness';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { loadLibrary } from '../../src/model/components/library';
import { screenFromSource } from '../../src/model/components/origin';
import { M3_FILES } from '../../viewer/samples/samplesMaterial3';
import settings from '../../viewer/samples/settings.sdui.json';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Hello({ name }: { name: string }) {
  const [n] = React.useState(1);
  return (
    <p>
      Hello, {name} {n}
    </p>
  );
}

describe('ambiente React do visualizador', () => {
  it('uses real React 19', () => {
    expect(React.version.startsWith('19')).toBe(true);
  });

  it('renders with createRoot inside act', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <React.StrictMode>
          <Hello name="world" />
        </React.StrictMode>,
      );
    });
    expect(host.textContent).toBe('Hello, world 1');
    await act(async () => root.unmount());
    host.remove();
  });
});

describe('demo page: Material 3 (SDUI)', () => {
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
      await import('../../viewer/demo/main');
    });
  });

  const button = (name: string): HTMLButtonElement => {
    const found = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === name,
    );
    if (!found) throw new Error(`button ${name} not found`);
    return found;
  };
  const treeRows = (): number => document.querySelectorAll('.react-lab-tree li').length;
  const status = (): string =>
    document.querySelector('.react-lab-status')?.textContent ?? '';
  const textarea = (): HTMLTextAreaElement => {
    const el = document.querySelector('textarea');
    if (!el) throw new Error('textarea not found');
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

  it('the button shows the SDUI JSON and the tree has the computed instances', async () => {
    expect(total).toBeGreaterThan(10);
    await act(async () => button('Material 3 (SDUI)').click());
    expect(button('Material 3 (SDUI)').getAttribute('aria-pressed')).toBe('true');
    expect(textarea().getAttribute('aria-label')).toBe('SDUI (JSON)');
    expect(JSON.parse(textarea().value)).toEqual(settings);
    expect(treeRows()).toBe(total);
    expect(status()).toContain('Settings (412 × 917)');
    expect(status()).toContain('Source warnings: none');
  });

  it('editing the JSON changes the screen', async () => {
    const edited = structuredClone(settings) as unknown as {
      content: { children: { children?: unknown[] }[] };
    };
    edited.content.children[1]!.children!.shift();
    await type(JSON.stringify(edited));
    expect(treeRows()).toBe(total - 1);
    expect(document.querySelector('.react-lab-error')).toBeNull();
  });

  it('invalid JSON shows the error and keeps the last screen', async () => {
    const rows = treeRows();
    await type('{ broken');
    expect(document.querySelector('.react-lab-error')?.textContent).toBeTruthy();
    expect(treeRows()).toBe(rows);
  });

  it('JSON without a screen (source error) shows the error and keeps the last screen', async () => {
    await type(JSON.stringify(settings));
    expect(treeRows()).toBe(total);
    expect(document.querySelector('.react-lab-error')).toBeNull();
    await type('{}');
    expect(document.querySelector('.react-lab-error')?.textContent).toBeTruthy();
    expect(treeRows()).toBe(total);
    expect(status()).toContain('Settings (412 × 917)');
  });

  it('source warnings show up when there is an unknown property', async () => {
    const edited = structuredClone(settings) as unknown as {
      content: { children: { props: Record<string, unknown> }[] };
    };
    edited.content.children[0]!.props.madeUpProp = 1;
    await type(JSON.stringify(edited));
    expect(document.querySelector('.react-lab-error')).toBeNull();
    expect(status()).toContain('Source warnings:');
    expect(status()).toContain('madeUpProp');
    expect(status()).not.toContain('Source warnings: none');
  });
});
