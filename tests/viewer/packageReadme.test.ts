// @vitest-environment node
// A versão do pacote citada no guia de uso vem do manifesto: subir `VIEWER_VERSION` sem atualizar
// o `PACKAGE-README.md` (o `npm pack` e o `npm install ./…tgz` dos exemplos) quebra aqui.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs do build, sem declarações
import { VIEWER_VERSION } from '../../viewer/packageManifest.mjs';

const version = VIEWER_VERSION as string;
const readme = readFileSync(join(__dirname, '../../viewer/PACKAGE-README.md'), 'utf8');

describe('PACKAGE-README.md', () => {
  it('cita a versão do manifesto em todo nome de pacote', () => {
    const versions = [...readme.matchAll(/mapping-viewer-(\d+\.\d+\.\d+)\.tgz/g)].map(
      (match) => match[1],
    );
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([version]));
  });
});
