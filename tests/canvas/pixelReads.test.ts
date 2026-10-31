import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Auditoria das leituras de pixel (imagens remotas, decisão 17 do PLAN.md): uma imagem `opaque`
// (carregada sem CORS) contamina o canvas, então tudo que lê pixels de volta (`toDataURL`,
// `toBlob`, `getImageData`, `toCanvas`, `toImage` do Konva) só pode rodar sobre cenas que nunca
// recebem imagem remota `opaque`. Este teste varre o código e falha se uma leitura nova aparecer
// fora da lista abaixo: quem a acrescentar precisa dizer por que ela é segura.

const ROOTS = ['src', 'lab', 'mcp'];

/** Leituras de pixel do Konva e do canvas 2D. */
const PIXEL_READ =
  /\b(toDataURL|toBlob|getImageData)\b|\.toImage\(|\.toCanvas\(\s*(\{|\))/g;

/** Arquivos auditados e o motivo de cada leitura ser segura. */
const AUDITED: Readonly<Record<string, string>> = {
  'src/canvas/components/exampleImages.ts':
    'galeria do Catálogo: `renderScene` com `pixelSafe: true` (imagem `opaque` vira reservado) e crossOrigin nas demais; provado em tests/canvas/exampleImages.test.ts',
  'src/storage/imageCrop.ts':
    '`toBlob` do recorte de uma imagem do projeto (`blob:` local), sem camada de componente',
  'src/storage/imageImport.ts':
    '`toBlob` da otimização de uma imagem importada (arquivo do usuário), sem camada de componente',
  'src/canvas/viewportController.ts':
    '`toCanvas` do viewport (converte ponto de tela em ponto do canvas), não é o do Konva; não lê pixel',
  'lab/components/editor.ts':
    'laboratório: `stage.toDataURL` de uma tela do lab, que desenha pelo `renderScene` sem `remoteImage` (imagem remota é sempre o reservado)',
  'lab/components/main.tsx':
    'laboratório: chama o `editor.toDataURL` acima (mesmo motivo)',
  'lab/viewer/viewer.ts':
    'visualizador embutível: `renderScene` sem `remoteImage` (a RI4 liga a opção `remoteImages`, desligada por padrão, e deve manter `pixelSafe` aqui)',
};

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

/** O código sem comentários (um comentário pode citar `toBlob` à vontade). */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|\s)\/\/.*$/gm, '$1');
}

describe('leituras de pixel (auditoria da decisão 17)', () => {
  const reads = ROOTS.flatMap(sources)
    .map((path) => ({ path, matches: [...code(path).matchAll(PIXEL_READ)] }))
    .filter((file) => file.matches.length > 0);

  it('toda leitura de pixel está na lista de arquivos auditados', () => {
    const unknown = reads.map((f) => f.path).filter((path) => !(path in AUDITED));
    expect(
      unknown,
      `Leitura de pixel nova fora da lista auditada (tests/canvas/pixelReads.test.ts): ${unknown.join(', ')}. ` +
        'Uma imagem remota `opaque` contamina o canvas; use `pixelSafe: true` e registre o motivo.',
    ).toEqual([]);
  });

  it('a lista não guarda arquivo que já não lê pixel', () => {
    const found = new Set(reads.map((f) => f.path));
    const stale = Object.keys(AUDITED).filter((path) => !found.has(path));
    expect(stale).toEqual([]);
  });

  it('o minimapa não lê pixel (é DOM)', () => {
    for (const path of ['src/canvas/minimap.ts', 'src/ui/Minimap.tsx']) {
      expect(code(path).match(PIXEL_READ), path).toBeNull();
    }
  });
});
