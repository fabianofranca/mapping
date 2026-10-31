// Guia interativo (`public/guia/index.html`): gerado do template `scripts/guia/template.html`
// e do projeto de exemplo (`examples/exemplo-completo/`), a fonte única dos dados. O CSS usa
// os tokens da app (`renderTokensCss`) e a página leva a CSP do perfil `static` (a da app sem imagem remota nem Trusted Types).
// `npm run build:guia` grava o arquivo (e o `npm run build` o regera antes do Vite);
// tests/examples/guia.test.ts prova que o repositório está em dia.
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { applyCsp } from '../pwa/csp';
import { deserialize } from '../src/model';
import { renderTokensCss } from '../src/theme/tokens';

export const GUIA_TEMPLATE = 'scripts/guia/template.html';
export const GUIA_OUTPUT = 'public/guia/index.html';
const EXAMPLE_DIR = 'examples/exemplo-completo';

const MIME: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** O que a página sabe do projeto: o subconjunto do `mapping.json` que ela desenha e inspeciona. */
function guiaData(root: string): unknown {
  const parsed = deserialize(
    readFileSync(join(root, EXAMPLE_DIR, 'mapping.json'), 'utf8'),
  );
  if (!parsed.ok) {
    throw new Error(`${EXAMPLE_DIR}/mapping.json inválido: ${parsed.error.code}`);
  }
  const project = parsed.project;
  const files: Record<string, string> = {};
  for (const image of project.containers) {
    if (image.file === null) continue;
    const mime = MIME[extname(image.file).toLowerCase()];
    if (!mime) throw new Error(`${image.file}: tipo de imagem desconhecido`);
    const bytes = readFileSync(join(root, EXAMPLE_DIR, image.file));
    files[image.file] = `data:${mime};base64,${bytes.toString('base64')}`;
  }
  // O guia desenha só o que está dentro de um container; as notas (marcações soltas no canvas)
  // ficam de fora, com as anotações delas.
  const inContainer = new Set(
    project.markings.filter((m) => m.containerId !== null).map((m) => m.id),
  );
  return {
    layers: project.layers.map(({ id, name, color, spec }) => ({
      id,
      name,
      color,
      spec,
    })),
    images: project.containers.map((image) => ({
      id: image.id,
      name: image.name ?? image.file ?? image.id,
      file: image.file,
      width: image.width,
      height: image.height,
      background: image.background,
    })),
    markings: project.markings
      .filter((m) => inContainer.has(m.id))
      .map((m) => ({
        id: m.id,
        containerId: m.containerId,
        parentId: m.parentId,
        name: m.name ?? '',
        rect: m.rect,
        needsReview: m.needsReview,
        locked: m.locked,
      })),
    annotations: project.annotations
      .filter((a) => inContainer.has(a.markingId))
      .map((a) => ({
        id: a.id,
        markingId: a.markingId,
        layerId: a.layerId,
        name: a.name,
        type: a.type,
        values: a.values,
        entries: a.entries,
      })),
    files,
  };
}

/** JSON dentro de um `<script>`: `<` e os separadores de linha do JS viram escapes. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

/** Troca o marcador sem interpretar `$` do texto novo (o JSON e o CSS têm `$`). */
function fill(html: string, marker: string, text: string): string {
  if (!html.includes(marker)) throw new Error(`o template não tem o marcador ${marker}`);
  return html.split(marker).join(text);
}

/** O HTML final do guia (com a CSP). `root`: a raiz do repositório. */
export function guiaHtml(root = process.cwd()): string {
  const template = readFileSync(join(root, GUIA_TEMPLATE), 'utf8');
  const html = fill(
    fill(template, '/*__TOKENS_CSS__*/', renderTokensCss()),
    '/*__DATA__*/ null',
    inlineJson(guiaData(root)),
  );
  return applyCsp(html, 'static');
}
