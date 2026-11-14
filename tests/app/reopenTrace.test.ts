// Return from the 8.4 gate (finding 1): the trace of an Open of a recent folder in
// Diagnostics (`folders.reopen`), to separate the hypotheses in a reproduction by the owner.
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

/** An open `<dialog>` on the page, like the notice after `showModal`. */
function openDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  return dialog;
}

/** The reported path: request granted and the folder without `mapping.json`. */
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
  it('request granted and notice: one line with the path, what Home did and the notice on screen', () => {
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

  it('closing the notice becomes the second line, with the cause and how long it stayed open', () => {
    const trace = new ReopenTrace(now);
    promptedMissing(trace);
    trace.settle(unavailable, true);
    clock = 4000;
    trace.shown(openDialog());
    clock = 4120;
    trace.closed('backdrop');
    expect(lines()[1]).toBe('notice closed: backdrop after 120ms');
    // Once closed, the trace is over: nothing else is recorded.
    trace.closed('cancel');
    expect(lines()).toHaveLength(2);
  });

  it('request and project opened: does not record (the editor would light up "there are new errors")', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=prompt');
    trace.step('request=granted');
    trace.step('branch=opened');
    trace.settle(opened, true);
    expect(lines()).toEqual([]);
  });

  it('notice without a request (the path that works): does not record, not even on close', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.step('branch=no-mapping');
    trace.settle(unavailable, true);
    trace.shown(openDialog());
    trace.closed('cancel-button');
    expect(lines()).toEqual([]);
  });

  it('error shown as a message: always records, with the code', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle({ ok: false, error: 'storage-failed' }, true);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain('home=message:storage-failed');
  });

  const inconsistent = {
    ok: false,
    error: 'invariant-violation',
    inconsistent: { issues: [], repaired: [], unrepaired: [], repair: null },
  } as const;

  it('inconsistent project without a request: normal path, does not record', () => {
    const trace = new ReopenTrace(now);
    trace.settle(inconsistent, true);
    expect(lines()).toHaveLength(0);
  });

  it('inconsistent project after the permission request: records', () => {
    const trace = new ReopenTrace(now);
    trace.step('request=granted');
    trace.settle(inconsistent, true);
    expect(lines()[0]).toContain('home=inconsistent');
  });

  it('Home left before the result: records', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle(unavailable, false);
    expect(lines()[0]).toContain('home=unmounted');
  });

  it('notice that is not open on screen: records, even without a request', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle(unavailable, true);
    const dialog = openDialog();
    dialog.removeAttribute('open');
    trace.shown(dialog);
    expect(lines()[0]).toMatch(/shown=closed,/);
  });

  it('notice that never mounted: records when the trace ends', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle(unavailable, true);
    trace.end();
    expect(lines()[0]).toContain('shown=never');
  });

  it('window events come in with the time, at most 8', () => {
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

  it('once finished, the trace no longer listens to the window', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=granted');
    trace.settle(opened, true);
    window.dispatchEvent(new Event('pagehide'));
    expect(lines()).toEqual([]);
  });

  it('pagehide with the Open in progress records what is already known (goes to the console)', () => {
    const trace = new ReopenTrace(now);
    trace.step('query=prompt');
    clock = 50;
    window.dispatchEvent(new Event('pagehide'));
    expect(lines()).toHaveLength(1);
    // pt-BR kept: message emitted by src/app/reopenTrace.ts (outside this phase), asserted verbatim
    expect(lines()[0]).toMatch(/^pagehide com o Abrir em curso: query=prompt@0/);
    trace.end();
  });

  it('pagehide with the notice of a recorded trace open also records', () => {
    const trace = new ReopenTrace(now);
    promptedMissing(trace);
    trace.settle(unavailable, true);
    trace.shown(openDialog());
    window.dispatchEvent(new Event('pagehide'));
    expect(lines()).toHaveLength(2);
    // pt-BR kept: message emitted by src/app/reopenTrace.ts (outside this phase), asserted verbatim
    expect(lines()[1]).toMatch(/^pagehide com o aviso aberto/);
    trace.end();
  });
});
