import { describe, expect, it, vi } from 'vitest';
import { SANDBOX_SRCDOC } from '../../src/app/formatSandbox';
import {
  SERVICE_WORKER_URL,
  createHTML,
  createScriptURL,
  installTrustedTypesPolicy,
} from '../../src/app/trustedTypes';
import { reportedErrors } from '../../src/utils/report';

describe('rules of the default Trusted Types policy', () => {
  it('createHTML accepts the empty string and exactly the sandbox document', () => {
    expect(createHTML('')).toBe('');
    expect(createHTML(SANDBOX_SRCDOC)).toBe(SANDBOX_SRCDOC);
    for (const input of [
      '<b>x</b>',
      ' ',
      '<img src="https://x/y.png">',
      'text',
      `${SANDBOX_SRCDOC} `,
      SANDBOX_SRCDOC.replace('<body>', '<body><b>x</b>'),
      SANDBOX_SRCDOC.slice(0, -1),
    ]) {
      expect(createHTML(input)).toBeNull();
    }
  });

  it('createHTML takes the sandbox document with its own CSP and refuses the one without it', () => {
    const withoutMeta = SANDBOX_SRCDOC.replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      '',
    );
    expect(withoutMeta).not.toBe(SANDBOX_SRCDOC);
    expect(SANDBOX_SRCDOC).toContain('Content-Security-Policy');
    expect(createHTML(SANDBOX_SRCDOC)).toBe(SANDBOX_SRCDOC);
    expect(createHTML(withoutMeta)).toBeNull();
  });

  it('createScriptURL accepts only the exact service worker URL', () => {
    expect(SERVICE_WORKER_URL).toBe('./sw.js');
    expect(createScriptURL('./sw.js')).toBe('./sw.js');
    for (const input of [
      '/sw.js',
      'sw.js',
      './sw.js?x',
      'https://x/sw.js',
      '',
      './sw.js ',
    ]) {
      expect(createScriptURL(input)).toBeNull();
    }
  });
});

describe('installTrustedTypesPolicy', () => {
  it('creates the default policy with the two rules and without createScript', () => {
    const createPolicy = vi.fn(() => ({}));
    expect(installTrustedTypesPolicy({ trustedTypes: { createPolicy } })).toBe(
      'installed',
    );
    expect(createPolicy).toHaveBeenCalledTimes(1);
    const [name, rules] = createPolicy.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe('default');
    expect(Object.keys(rules).sort()).toEqual(['createHTML', 'createScriptURL']);
    expect(rules.createHTML).toBe(createHTML);
    expect(rules.createScriptURL).toBe(createScriptURL);
  });

  it('without Trusted Types in the browser returns unsupported', () => {
    expect(installTrustedTypesPolicy({})).toBe('unsupported');
    expect(installTrustedTypesPolicy({ trustedTypes: {} })).toBe('unsupported');
    expect(installTrustedTypesPolicy(null)).toBe('unsupported');
  });

  it('if createPolicy throws, returns failed and records it in Diagnostics', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const createPolicy = () => {
      throw new TypeError('Policy with name "default" already exists.');
    };
    expect(installTrustedTypesPolicy({ trustedTypes: { createPolicy } })).toBe('failed');
    expect(reportedErrors.value.at(-1)).toMatchObject({
      context: 'trustedTypes.install',
    });
    spy.mockRestore();
  });
});
