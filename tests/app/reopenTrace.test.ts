// Devolução do portão da 8.4 (achado 1): o rastro de um Abrir de pasta dos recentes no
// Diagnóstico (`folders.reopen`), para separar as hipóteses numa reprodução do dono.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REOPEN_CONTEXT, ReopenTrace } from '../../src/app/reopenTrace';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';

let clock = 0;
const now = () => clock;
const lines = () =>
  reportedErrors.value.filter((e) => e.context === REOPEN_CONTEXT).map((e) => e.message);
const unavailable = {
  ok: true,
  value: { kind: 'unavailable', reason: 'missing' },
} as const;
const opened = { ok: true, value: { kind: 'opened' } } as const;

/** Um `<dialog>` aberto na página, como o aviso depois do `showModal`. */
function openDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  return dialog;
}

/** O caminho do relato: pedido concedido e a pasta sem `mapping.json`. */
function promptedMissing(trace: ReopenTrace): void {
  clock = 4;
  trace.step('handle=idb');
  clock = 6;
  trace.step('query=prompt');
  clock = 3810;
  trace.step('request=granted');
  clock = 3815;
  trace.step('branch=no-mapping');
}

beforeEach(() => {
  clock = 0;
  clearReportedErrors();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ReopenTrace', () => {
  it('pedido concedido e aviso: uma linha com o caminho, o que a Home fez e o aviso na tela', () => {
    const trace = new ReopenTrace(now);
    promptedMissing(trace);
    clock = 3816;
    trace.settle(unavailable, true);
    expect(lines()).toEqual([]);
    clock = 3818;
    trace.shown(openDialog());
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatch(
      /^handle=idb@4 query=prompt@6 request=granted@3810 branch=no-mapping@3815 home=dialog:missing@3816 shown=open,\S+@3818$/,
    );
    trace.end();
  });

  it('o fechamento do aviso vira a segunda linha, com a causa e quanto tempo ficou aberto', () => {
    const trace = new ReopenTrace(now);
    promptedMissing(trace);
    trace.settle(unavailable, true);
    clock = 4000;
    trace.shown(openDialog());
    clock = 4120;
    trace.closed('backdrop');
    expect(lines()[1]).toBe('aviso fechado: backdrop após 120ms');
    // Fechado, o rastro acabou: nada mais grava.
    trace.closed('cancel');
    expect(lines()).toHaveLength(2);
  });

  it('pedido e projeto aberto: não grava (o editor acenderia "há erros novos")', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=prompt');
    trace.step('request=granted');
    trace.step('branch=opened');
    trace.settle(opened, true);
    expect(lines()).toEqual([]);
  });

  it('aviso sem pedido (o caminho que funciona): não grava, nem ao fechar', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.step('branch=no-mapping');
    trace.settle(unavailable, true);
    trace.shown(openDialog());
    trace.closed('cancel-button');
    expect(lines()).toEqual([]);
  });

  it('erro mostrado como mensagem: grava sempre, com o código', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle({ ok: false, error: 'storage-failed' }, true);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain('home=message:storage-failed');
  });

  it('projeto inconsistente: grava', () => {
    const trace = new ReopenTrace(now);
    trace.settle(
      {
        ok: false,
        error: 'invariant-violation',
        inconsistent: { issues: [], repaired: [], unrepaired: [], repair: null },
      },
      true,
    );
    expect(lines()[0]).toContain('home=inconsistent');
  });

  it('a Home saiu antes do resultado: grava', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle(unavailable, false);
    expect(lines()[0]).toContain('home=unmounted');
  });

  it('aviso que não está aberto na tela: grava, mesmo sem pedido', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle(unavailable, true);
    const dialog = openDialog();
    dialog.removeAttribute('open');
    trace.shown(dialog);
    expect(lines()[0]).toMatch(/shown=closed,/);
  });

  it('aviso que nunca montou: grava ao acabar o rastro', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle(unavailable, true);
    trace.end();
    expect(lines()[0]).toContain('shown=never');
  });

  it('os eventos da janela entram com o tempo, no máximo 8', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=prompt');
    clock = 40;
    window.dispatchEvent(new Event('blur'));
    clock = 3805;
    window.dispatchEvent(new Event('focus'));
    trace.step('request=granted');
    trace.settle(unavailable, true);
    trace.shown(openDialog());
    expect(lines()[0]).toMatch(/ window=blur@40,focus@3805$/);
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('blur'));
    trace.closed('cancel');
    const second = new ReopenTrace(now);
    second.step('request=granted');
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('focus'));
    second.settle({ ok: false, error: 'storage-failed' }, true);
    expect(
      lines()
        .at(-1)
        ?.match(/focus@/g),
    ).toHaveLength(8);
  });

  it('depois de acabar, o rastro não ouve mais a janela', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle(opened, true);
    window.dispatchEvent(new Event('pagehide'));
    expect(lines()).toEqual([]);
  });

  it('pagehide com o Abrir em curso grava o que já se sabe (vai ao console)', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=prompt');
    clock = 50;
    window.dispatchEvent(new Event('pagehide'));
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatch(/^pagehide com o Abrir em curso: query=prompt@0/);
    trace.end();
  });

  it('pagehide com o aviso de um rastro gravado aberto também grava', () => {
    const trace = new ReopenTrace(now);
    promptedMissing(trace);
    trace.settle(unavailable, true);
    trace.shown(openDialog());
    window.dispatchEvent(new Event('pagehide'));
    expect(lines()).toHaveLength(2);
    expect(lines()[1]).toMatch(/^pagehide com o aviso aberto/);
    trace.end();
  });
});
