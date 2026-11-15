import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  A11Y_SCREEN,
  a11yCall,
  a11yWorkspace,
  type A11yWorkspace,
} from './a11yWorkspace';

// Stage #1128 (A3, decision 9 of #1081): the audit's reads share the drawing memo. Every MCP call reloads the project,
// so identity never hits: `projectAudit` memoizes by the project folder's content key, as the drawings do. Reading twice
// (or reading a list, a marking and an annotation) on the same revision audits once.

const audits = { calls: 0 };

vi.mock('../../src/model', async (importOriginal) => {
  const model = await importOriginal<typeof import('../../src/model')>();
  return {
    ...model,
    accessibilityAudit: (...args: Parameters<typeof model.accessibilityAudit>) => {
      audits.calls += 1;
      return model.accessibilityAudit(...args);
    },
  };
});

let ws: A11yWorkspace;

beforeAll(async () => {
  ws = await a11yWorkspace((add) => {
    add('small', 'button', {
      name: 'small',
      rect: { x: 100, y: 100, width: 108, height: 120 },
    });
    add('bare', 'bar', {
      name: 'bare',
      rect: { x: 100, y: 800, width: 800, height: 168 },
    });
  });
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('the audit memo', () => {
  it('two get_marking, a list and a get_annotation on the same revision audit once', async () => {
    audits.calls = 0;
    await a11yCall(ws, 'get_marking', { ref: 'mapping://a11y/m/mksmall' });
    await a11yCall(ws, 'get_marking', { ref: 'mapping://a11y/m/mksmall' });
    await a11yCall(ws, 'get_marking', { ref: 'mapping://a11y/m/mkbare' });
    await a11yCall(ws, 'get_annotation', { ref: 'mapping://a11y/a/anbare' });
    await a11yCall(ws, 'list_markings', { project: 'a11y', container: A11Y_SCREEN });
    await a11yCall(ws, 'get_project', { project: 'a11y' });
    expect(audits.calls).toBe(1);
  });
});
