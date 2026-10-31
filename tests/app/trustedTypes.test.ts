import { describe, expect, it, vi } from 'vitest';
import {
  SERVICE_WORKER_URL,
  createHTML,
  createScriptURL,
  installTrustedTypesPolicy,
} from '../../src/app/trustedTypes';
import { reportedErrors } from '../../src/utils/report';

describe('regras da política default de Trusted Types', () => {
  it('createHTML aceita só a string vazia', () => {
    expect(createHTML('')).toBe('');
    for (const input of ['<b>x</b>', ' ', '<img src="https://x/y.png">', 'texto']) {
      expect(createHTML(input)).toBeNull();
    }
  });

  it('createScriptURL aceita só a URL exata do service worker', () => {
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
  it('cria a política default com as duas regras e sem createScript', () => {
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

  it('sem Trusted Types no navegador devolve unsupported', () => {
    expect(installTrustedTypesPolicy({})).toBe('unsupported');
    expect(installTrustedTypesPolicy({ trustedTypes: {} })).toBe('unsupported');
    expect(installTrustedTypesPolicy(null)).toBe('unsupported');
  });

  it('se createPolicy lança devolve failed e registra no Diagnóstico', () => {
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
