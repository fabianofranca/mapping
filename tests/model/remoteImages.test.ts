import { describe, expect, it } from 'vitest';
import {
  REMOTE_IMAGE_URL_MAX_LENGTH,
  checkRemoteImageUrl,
  isLocalNetworkHost,
  sceneRemoteImageUrls,
  type RemoteImagePolicy,
} from '../../src/model';
import type { SceneNode } from '../../src/model/components/scene';

const STRICT: RemoteImagePolicy = { allowHttp: false, allowLocalNetwork: false };
const HTTP: RemoteImagePolicy = { allowHttp: true, allowLocalNetwork: false };
const LOCAL: RemoteImagePolicy = { allowHttp: false, allowLocalNetwork: true };
const BOTH: RemoteImagePolicy = { allowHttp: true, allowLocalNetwork: true };

function reason(value: unknown, policy: RemoteImagePolicy = STRICT): string | null {
  const result = checkRemoteImageUrl(value, policy);
  return result.ok ? null : result.reason;
}

describe('checkRemoteImageUrl: aceitas', () => {
  it('aceita uma URL https válida', () => {
    expect(checkRemoteImageUrl('https://cdn.a.com/img/x.png?v=1', STRICT)).toEqual({
      ok: true,
      url: 'https://cdn.a.com/img/x.png?v=1',
      origin: 'https://cdn.a.com',
      local: false,
    });
  });

  it('mantém a porta na origem', () => {
    const result = checkRemoteImageUrl('https://a.com:8443/x.png', STRICT);
    expect(result).toMatchObject({ ok: true, origin: 'https://a.com:8443' });
  });

  it('normaliza o host para minúsculas', () => {
    const result = checkRemoteImageUrl('https://CDN.A.COM/x.png', STRICT);
    expect(result).toMatchObject({ ok: true, origin: 'https://cdn.a.com' });
  });

  it('converte IDN para punycode', () => {
    const result = checkRemoteImageUrl('https://bücher.example/a.png', STRICT);
    expect(result).toMatchObject({ ok: true, origin: 'https://xn--bcher-kva.example' });
  });

  it('tira a porta padrão', () => {
    expect(checkRemoteImageUrl('https://a.com:443/x.png', STRICT)).toMatchObject({
      ok: true,
      origin: 'https://a.com',
    });
    expect(checkRemoteImageUrl('http://a.com:80/x.png', HTTP)).toMatchObject({
      ok: true,
      origin: 'http://a.com',
    });
  });

  it('aparar espaços nas pontas', () => {
    expect(checkRemoteImageUrl('  https://a.com/x.png \n', STRICT)).toMatchObject({
      ok: true,
      url: 'https://a.com/x.png',
    });
  });

  it('aceita http com allowHttp, com o esquema na origem', () => {
    expect(checkRemoteImageUrl('http://a.com:8080/x.png', HTTP)).toEqual({
      ok: true,
      url: 'http://a.com:8080/x.png',
      origin: 'http://a.com:8080',
      local: false,
    });
  });

  it('host público tem local falso', () => {
    expect(checkRemoteImageUrl('https://a.com/x.png', BOTH)).toMatchObject({
      local: false,
    });
  });

  it('aceita exatamente 2048 caracteres', () => {
    const prefix = 'https://a.com/';
    const url = prefix + 'a'.repeat(REMOTE_IMAGE_URL_MAX_LENGTH - prefix.length);
    expect(url).toHaveLength(2048);
    expect(reason(url)).toBeNull();
  });
});

describe('checkRemoteImageUrl: recusadas', () => {
  it('empty', () => {
    expect(reason('')).toBe('empty');
    expect(reason('   \t')).toBe('empty');
    expect(reason(null)).toBe('empty');
    expect(reason(undefined)).toBe('empty');
    expect(reason(42)).toBe('empty');
  });

  it('invalid', () => {
    expect(reason('data:image/png;base64,AAA')).toBe('invalid');
    expect(reason('img/a.png')).toBe('invalid');
    expect(reason('/a.png')).toBe('invalid');
    expect(reason('ftp://a.com/x')).toBe('invalid');
    expect(reason('javascript:alert(1)')).toBe('invalid');
    expect(reason('blob:https://a.com/uuid')).toBe('invalid');
    expect(reason('file:///etc/passwd')).toBe('invalid');
  });

  it('insecure: http com allowHttp falso', () => {
    expect(reason('http://a.com/x.png')).toBe('insecure');
    expect(reason('http://a.com/x.png', LOCAL)).toBe('insecure');
    expect(reason('http://127.0.0.1/x.png', LOCAL)).toBe('insecure');
  });

  it('credentials', () => {
    expect(reason('https://u:p@a.com/x')).toBe('credentials');
    expect(reason('https://u@a.com/x')).toBe('credentials');
    expect(reason('http://u:p@a.com/x', HTTP)).toBe('credentials');
  });

  it('too-long', () => {
    const prefix = 'https://a.com/';
    const url = prefix + 'a'.repeat(REMOTE_IMAGE_URL_MAX_LENGTH + 1 - prefix.length);
    expect(url).toHaveLength(2049);
    expect(reason(url)).toBe('too-long');
  });

  it('private-host', () => {
    const hosts = [
      '127.0.0.1',
      '10.0.0.1',
      '8.8.8.8',
      '[::1]',
      '[2001:db8::1]',
      'localhost',
      'localhost.',
      'intranet',
      'printer.local',
      'app.localhost',
      'api.internal',
    ];
    for (const host of hosts) {
      expect(reason(`https://${host}/x.png`), host).toBe('private-host');
      expect(reason(`http://${host}/x.png`, HTTP), `http ${host}`).toBe('private-host');
    }
  });

  it('normaliza IPv4 em outras notações antes de recusar', () => {
    expect(reason('https://0x7f.1/x.png')).toBe('private-host');
    expect(reason('https://2130706433/x.png')).toBe('private-host');
  });
});

describe('checkRemoteImageUrl: allowLocalNetwork', () => {
  it('aceita hosts locais com local verdadeiro', () => {
    const hosts = [
      '127.0.0.1',
      '10.0.0.1',
      '8.8.8.8',
      '[::1]',
      'localhost',
      'intranet',
      'printer.local',
    ];
    for (const host of hosts) {
      expect(checkRemoteImageUrl(`https://${host}/x.png`, LOCAL), host).toMatchObject({
        ok: true,
        local: true,
      });
    }
  });

  it('http local exige allowHttp também', () => {
    expect(reason('http://127.0.0.1:3000/x.png', LOCAL)).toBe('insecure');
    expect(checkRemoteImageUrl('http://127.0.0.1:3000/x.png', BOTH)).toEqual({
      ok: true,
      url: 'http://127.0.0.1:3000/x.png',
      origin: 'http://127.0.0.1:3000',
      local: true,
    });
  });
});

describe('isLocalNetworkHost', () => {
  it('reconhece IPs literais, localhost, nomes sem ponto e sufixos locais', () => {
    for (const host of [
      '127.0.0.1',
      '8.8.8.8',
      '[::1]',
      '[2001:db8::1]',
      'localhost',
      'LOCALHOST',
      'localhost.',
      'intranet',
      'printer.local',
      'a.b.localhost',
      'api.internal',
      '',
    ]) {
      expect(isLocalNetworkHost(host), host).toBe(true);
    }
  });

  it('não marca hosts públicos', () => {
    for (const host of [
      'a.com',
      'cdn.a.com',
      'xn--bcher-kva.example',
      'a.com.',
      'localhost.com',
      'notlocal.com',
    ]) {
      expect(isLocalNetworkHost(host), host).toBe(false);
    }
  });
});

describe('sceneRemoteImageUrls', () => {
  const base = {
    visible: true,
    opacity: 1,
    transform: [1, 0, 0, 1, 0, 0] as const,
    width: 10,
    height: 10,
    effects: [],
  };
  it('coleta as URLs dos preenchimentos image, em ordem e sem repetir', () => {
    const rect = (id: string, url?: string, src?: string): SceneNode => ({
      ...base,
      id,
      name: id,
      type: 'rect',
      cornerRadius: 0,
      fills: [
        { type: 'solid', color: '#000000' },
        { type: 'image', ...(url ? { url } : {}), ...(src ? { src } : {}) },
      ],
    });
    const root: SceneNode = {
      ...base,
      id: 'r',
      name: 'r',
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      fills: [],
      children: [
        rect('a', 'https://a.com/1.png'),
        {
          ...base,
          id: 'g',
          name: 'g',
          type: 'group',
          fills: [],
          children: [
            rect('b', 'https://b.com/2.png'),
            rect('c', 'https://a.com/1.png'),
            rect('d', undefined, 'data:image/png;base64,AAA'),
          ],
        },
      ],
    };
    expect(sceneRemoteImageUrls(root)).toEqual([
      'https://a.com/1.png',
      'https://b.com/2.png',
    ]);
  });
});
