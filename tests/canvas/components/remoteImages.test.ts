// The remote image source: the two gates of the app and the loader, in one place.
import { signal } from '@preact/signals';
import { describe, expect, it, vi } from 'vitest';
import {
  REMOTE_IMAGE_LIMITS,
  type RemoteImageLoader,
  type RemoteImageView,
} from '../../../src/canvas/components/imageLoader';
import { createRemoteImageSource } from '../../../src/canvas/components/remoteImages';
import {
  clearRemoteImageIssues,
  remoteImageIssues,
} from '../../../src/store/diagnostics';
import type { RemoteImageGate } from '../../../src/store/imagePermissions';

const URL = 'https://cdn.exemplo.com/a.png?x=1';
const NORMAL = 'https://cdn.exemplo.com/a.png?x=1';

function setup(gate: (url: string) => RemoteImageGate) {
  const request = vi.fn<(url: string, o: { allowNoCors: boolean }) => RemoteImageView>(
    () => ({ state: 'loading' }),
  );
  let listener: ((url: string) => void) | null = null;
  const loader = {
    request,
    subscribe: (l: (url: string) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    epoch: signal(0),
  } as unknown as RemoteImageLoader;
  const gateSignal = signal(gate);
  const noCors = signal(false);
  const report = vi.fn();
  const source = createRemoteImageSource({
    loader,
    gate: gateSignal,
    allowNoCors: noCors,
    report,
  });
  return {
    source,
    request,
    gateSignal,
    noCors,
    report,
    emit: (u: string) => listener?.(u),
  };
}

const allow = (url: string): RemoteImageGate => ({
  allowed: true,
  url,
  origin: 'https://cdn.exemplo.com',
});

describe('createRemoteImageSource', () => {
  it('gate denied: returns the state, reports and requests nothing from the loader', () => {
    const blocked = setup((): RemoteImageGate => ({
      allowed: false,
      state: 'blocked-consent',
      origin: 'https://cdn.exemplo.com',
    }));
    expect(blocked.source.resolve(URL)).toEqual({ state: 'blocked-consent' });
    expect(blocked.report).toHaveBeenCalledWith(URL, 'blocked-consent');
    expect(blocked.request).not.toHaveBeenCalled();

    const invalid = setup((): RemoteImageGate => ({
      allowed: false,
      state: 'invalid',
      reason: 'private-host',
    }));
    expect(invalid.source.resolve(URL)).toEqual({ state: 'invalid' });
    expect(invalid.report).toHaveBeenCalledWith(URL, 'invalid');
    expect(invalid.request).not.toHaveBeenCalled();
  });

  it('gate open: requests the normalized URL from the loader, with the CORS switch', () => {
    const ctx = setup((url) => ({
      allowed: true,
      url: `${url}#n`,
      origin: 'https://cdn.exemplo.com',
    }));
    ctx.source.resolve(URL);
    expect(ctx.request).toHaveBeenCalledWith(`${NORMAL}#n`, { allowNoCors: false });
    ctx.noCors.value = true;
    ctx.source.resolve(URL);
    expect(ctx.request).toHaveBeenLastCalledWith(`${NORMAL}#n`, { allowNoCors: true });
    expect(ctx.report).not.toHaveBeenCalled();
  });

  it('reports failed, timeout and too-large; loaded does not report', () => {
    const ctx = setup(allow);
    ctx.request.mockReturnValueOnce({ state: 'failed', reason: 'failed' });
    ctx.source.resolve(URL);
    expect(ctx.report).toHaveBeenLastCalledWith(URL, 'failed');
    ctx.request.mockReturnValueOnce({ state: 'failed', reason: 'timeout' });
    ctx.source.resolve(URL);
    expect(ctx.report).toHaveBeenLastCalledWith(URL, 'timeout');
    ctx.request.mockReturnValueOnce({ state: 'too-large' });
    ctx.source.resolve(URL);
    expect(ctx.report).toHaveBeenLastCalledWith(URL, 'too-large');
    ctx.report.mockClear();
    ctx.request.mockReturnValueOnce({ state: 'loaded' });
    ctx.source.resolve(URL);
    expect(ctx.report).not.toHaveBeenCalled();
  });

  it('the loader notice arrives with the field URL, not the normalized one', () => {
    const ctx = setup((url) => ({
      allowed: true,
      url: `${url}#n`,
      origin: 'https://cdn.exemplo.com',
    }));
    const heard: string[] = [];
    ctx.source.subscribe((u) => heard.push(u));
    ctx.source.resolve(URL);
    ctx.emit(`${NORMAL}#n`);
    ctx.emit('https://desconhecida.test/z.png');
    expect(heard).toEqual([URL, 'https://desconhecida.test/z.png']);
  });

  it('gate changes (another object) with the consent or the switch', () => {
    const ctx = setup(allow);
    const first = ctx.source.gate.value;
    ctx.gateSignal.value = (url) => allow(url);
    const second = ctx.source.gate.value;
    expect(second).not.toBe(first);
    ctx.noCors.value = true;
    expect(ctx.source.gate.value).not.toBe(second);
  });
});

describe('Diagnostics: the image that started being shown leaves the list (R15.5)', () => {
  function realSource(initial: (url: string) => RemoteImageGate) {
    const view = { current: { state: 'loading' } as RemoteImageView };
    const loader = {
      request: () => view.current,
      subscribe: () => () => {},
      epoch: signal(0),
    } as unknown as RemoteImageLoader;
    const gate = signal(initial);
    const source = createRemoteImageSource({
      loader,
      gate,
      allowNoCors: signal(false),
    });
    return { source, gate, view };
  }

  it('blocked by consent enters; after Allow and loading, it leaves', () => {
    clearRemoteImageIssues();
    const { source, gate, view } = realSource((): RemoteImageGate => ({
      allowed: false,
      state: 'blocked-consent',
      origin: 'https://cdn.exemplo.com',
    }));
    source.resolve(URL);
    expect(remoteImageIssues.value.map((i) => i.reason)).toEqual(['blocked-consent']);
    gate.value = allow;
    source.resolve(URL);
    // Loading does not show it yet: the line stays until it draws.
    expect(remoteImageIssues.value).toHaveLength(1);
    view.current = { state: 'loaded' };
    source.resolve(URL);
    expect(remoteImageIssues.value).toEqual([]);
    clearRemoteImageIssues();
  });

  it('an image that loaded without CORS (opaque) also leaves; other lines stay', () => {
    clearRemoteImageIssues();
    const { source, gate, view } = realSource(allow);
    source.resolve('https://b.com/y.png');
    view.current = { state: 'failed', reason: 'timeout' };
    source.resolve('https://b.com/y.png');
    view.current = { state: 'failed' };
    source.resolve(URL);
    expect(remoteImageIssues.value).toHaveLength(2);
    view.current = { state: 'opaque' };
    source.resolve(URL);
    expect(remoteImageIssues.value.map((i) => i.reason)).toEqual(['timeout']);
    expect(gate.value).toBe(allow);
    clearRemoteImageIssues();
  });

  it('keeps the normalized URL map only up to the loader limit (the oldest leave)', () => {
    const normalized = (raw: string) => `norm:${raw}`;
    const ctx = setup((raw) => ({
      allowed: true,
      url: normalized(raw),
      origin: 'https://cdn.exemplo.com',
    }));
    const heard: string[] = [];
    ctx.source.subscribe((u) => heard.push(u));
    const total = REMOTE_IMAGE_LIMITS.failureEntries + 100;
    for (let i = 0; i < total; i += 1) ctx.source.resolve(`https://cdn.exemplo.com/${i}`);
    // The recent one still translates the normalized URL to the field one...
    ctx.emit(normalized(`https://cdn.exemplo.com/${total - 1}`));
    // ...the oldest has already left the map: the notice goes with the normalized one.
    ctx.emit(normalized('https://cdn.exemplo.com/0'));
    expect(heard).toEqual([
      `https://cdn.exemplo.com/${total - 1}`,
      normalized('https://cdn.exemplo.com/0'),
    ]);
  });
});
