import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VIEW_SHOW_START,
  attachViewShowPersistence,
  hideViewDrawingLayer,
  onlyScreens,
  setViewShow,
  showEverything,
  toggleViewDrawingLayer,
} from '../../src/store/viewMode';
import { createEditorUi, setViewMode } from '../../src/store/ui';

const KEY = 'mapping.viewShow';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('modo visualização: estado', () => {
  it('nasce desligado, com tudo marcado menos o contorno', () => {
    const ui = createEditorUi();
    expect(ui.viewMode.value).toBe(false);
    expect(ui.viewShow.value).toEqual({
      containers: true,
      images: true,
      outline: false,
      names: true,
      arrows: true,
      hiddenDrawingLayers: new Set(),
    });
    expect(ui.viewShow.value).toBe(VIEW_SHOW_START);
  });

  it('ligar volta ao Navegar; desligar não mexe no modo', () => {
    const ui = createEditorUi();
    ui.mode.value = 'draw';
    setViewMode(ui, true);
    expect(ui.viewMode.value).toBe(true);
    expect(ui.mode.value).toBe('navigate');
    ui.mode.value = 'draw';
    setViewMode(ui, false);
    expect(ui.viewMode.value).toBe(false);
    expect(ui.mode.value).toBe('draw');
  });

  it('cada item do painel liga e desliga só o que diz', () => {
    const ui = createEditorUi();
    for (const key of ['containers', 'images', 'outline', 'names', 'arrows'] as const) {
      const before = ui.viewShow.value;
      setViewShow(ui, { [key]: !before[key] });
      expect(ui.viewShow.value[key]).toBe(!before[key]);
      for (const other of [
        'containers',
        'images',
        'outline',
        'names',
        'arrows',
      ] as const) {
        if (other !== key) expect(ui.viewShow.value[other]).toBe(before[other]);
      }
      setViewShow(ui, { [key]: before[key] });
    }
  });

  it('uma camada com desenho desmarcada entra no conjunto; marcar de novo tira', () => {
    const ui = createEditorUi();
    toggleViewDrawingLayer(ui, 'L1');
    expect(ui.viewShow.value.hiddenDrawingLayers).toEqual(new Set(['L1']));
    toggleViewDrawingLayer(ui, 'L1');
    expect(ui.viewShow.value.hiddenDrawingLayers.size).toBe(0);
    hideViewDrawingLayer(ui, 'L2');
    expect(ui.viewShow.value.hiddenDrawingLayers).toEqual(new Set(['L2']));
  });

  it('Mostrar tudo marca tudo; Só as telas deixa só containers, imagens e os desenhos', () => {
    const ui = createEditorUi();
    toggleViewDrawingLayer(ui, 'L1');
    setViewShow(ui, { images: false });
    showEverything(ui);
    expect(ui.viewShow.value).toEqual({
      containers: true,
      images: true,
      outline: true,
      names: true,
      arrows: true,
      hiddenDrawingLayers: new Set(),
    });
    toggleViewDrawingLayer(ui, 'L1');
    onlyScreens(ui);
    expect(ui.viewShow.value).toEqual({
      containers: true,
      images: true,
      outline: false,
      names: false,
      arrows: false,
      hiddenDrawingLayers: new Set(),
    });
  });
});

describe('modo visualização: a escolha por cópia do projeto', () => {
  const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;

  it('volta para a mesma cópia e cada cópia tem a dela', () => {
    const first = createEditorUi();
    const stop = attachViewShowPersistence(first, 'copia-1');
    setViewShow(first, { arrows: false, outline: true });
    toggleViewDrawingLayer(first, 'L1');
    stop();

    const again = createEditorUi();
    attachViewShowPersistence(again, 'copia-1')();
    expect(again.viewShow.value).toEqual({
      containers: true,
      images: true,
      outline: true,
      names: true,
      arrows: false,
      hiddenDrawingLayers: new Set(['L1']),
    });

    const other = createEditorUi();
    attachViewShowPersistence(other, 'copia-2')();
    expect(other.viewShow.value).toEqual(VIEW_SHOW_START);
  });

  it('o modo em si nunca é guardado: reabrir nasce desligado', () => {
    const first = createEditorUi();
    const stop = attachViewShowPersistence(first, 'copia-1');
    setViewMode(first, true);
    setViewShow(first, { names: false });
    stop();
    const again = createEditorUi();
    attachViewShowPersistence(again, 'copia-1')();
    expect(again.viewMode.value).toBe(false);
    expect(again.viewShow.value.names).toBe(false);
  });

  it('sem copyId vale só para a sessão: nada é lido nem gravado', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, copies: { '': { outline: true } } }),
    );
    const ui = createEditorUi();
    const stop = attachViewShowPersistence(ui, undefined);
    expect(ui.viewShow.value).toEqual(VIEW_SHOW_START);
    setViewShow(ui, { arrows: false });
    stop();
    expect(stored()).toEqual({ v: 1, copies: { '': { outline: true } } });
  });

  it('blob corrompido ou de outra versão vira vazio', () => {
    for (const text of ['{não é json', JSON.stringify({ v: 9, copies: {} }), '[]']) {
      localStorage.setItem(KEY, text);
      const ui = createEditorUi();
      attachViewShowPersistence(ui, 'copia-1')();
      expect(ui.viewShow.value).toEqual(VIEW_SHOW_START);
    }
  });

  it('uma cópia com campo inválido é descartada, sem estragar as outras', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        copies: {
          ruim: { containers: 'sim' },
          boa: {
            containers: true,
            images: true,
            outline: true,
            names: true,
            arrows: true,
            hiddenLayers: [],
          },
        },
      }),
    );
    const bad = createEditorUi();
    attachViewShowPersistence(bad, 'ruim')();
    expect(bad.viewShow.value).toEqual(VIEW_SHOW_START);
    const good = createEditorUi();
    attachViewShowPersistence(good, 'boa')();
    expect(good.viewShow.value.outline).toBe(true);
  });

  it('guarda só as cópias mais recentes', () => {
    for (let i = 0; i < 30; i++) {
      const ui = createEditorUi();
      const stop = attachViewShowPersistence(ui, `c${i}`);
      setViewShow(ui, { arrows: false });
      stop();
    }
    const copies = Object.keys((stored() as { copies: object }).copies);
    expect(copies.length).toBeLessThanOrEqual(20);
    expect(copies).toContain('c29');
    expect(copies).not.toContain('c0');
  });

  it('localStorage que falha não quebra nada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio');
    });
    const ui = createEditorUi();
    const stop = attachViewShowPersistence(ui, 'copia-1');
    expect(() => setViewShow(ui, { arrows: false })).not.toThrow();
    expect(ui.viewShow.value.arrows).toBe(false);
    expect(stop).not.toThrow();
  });
});

describe('modo visualização: ligado ao editor', () => {
  it('o contexto do editor restaura e guarda a escolha da cópia do projeto', async () => {
    const { createHarness } = await import('../components/harness');
    const { sampleProject } = await import('../model/fixtures');
    // O harness abre a cópia `harness`: o que se escolhe numa abertura volta na seguinte.
    const first = createHarness(sampleProject());
    setViewShow(first.ui, { arrows: false });
    toggleViewDrawingLayer(first.ui, 'L1');
    first.context.stopViewShow();
    const again = createHarness(sampleProject());
    expect(again.ui.viewShow.value.arrows).toBe(false);
    expect(again.ui.viewShow.value.hiddenDrawingLayers).toEqual(new Set(['L1']));
    expect(again.ui.viewMode.value).toBe(false);
    again.context.stopViewShow();
  });
});
