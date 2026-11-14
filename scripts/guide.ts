// Interactive guide (`public/guide/index.html`): generated from the template
// `scripts/guide/template.html`, the texts of `scripts/guide/messages.ts` (en-US and pt-BR) and the
// example project (`EXAMPLE_DIR`), the single source of the data. The CSS uses the app's tokens
// (`renderTokensCss`) and the page carries the CSP of the `static` profile (the app's without
// remote image or Trusted Types). `public/guia/index.html`, the old address, is a page that
// redirects to the new one. `npm run build:guide` writes both files (and `npm run build`
// regenerates them before Vite); tests/examples/guide.test.ts proves the repository is up to date.
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { extname, join } from 'node:path';
import { applyCsp } from '../pwa/csp';
import { enUS } from '../src/i18n/en-US';
import { ptBR } from '../src/i18n/pt-BR';
import { deserialize, type Project } from '../src/model';
import { TOOL_WINDOWS, WINDOW_NUMBER, type ToolWindowId } from '../src/store/toolWindows';
import { renderTokensCss } from '../src/theme/tokens';
import { GUIDE_MESSAGES, NAMES, type GuideMessages } from './guide/messages';
import { EXAMPLE_DIR } from './guide/exampleDir';
import type { GuideLocale } from './guide/pickLocale';

export { EXAMPLE_DIR };

export const GUIDE_TEMPLATE = 'scripts/guide/template.html';
export const GUIDE_OUTPUT = 'public/guide/index.html';
/** The old address of the guide (`guia/`): a page that redirects to `guide/`. */
export const GUIDE_REDIRECT_OUTPUT = 'public/guia/index.html';
const PICK_LOCALE_SOURCE = 'scripts/guide/pickLocale.ts';
const LOCALES: readonly GuideLocale[] = ['en-US', 'pt-BR'];
const DICTIONARIES: Readonly<Record<GuideLocale, Readonly<Record<string, string>>>> = {
  'en-US': enUS,
  'pt-BR': ptBR,
};

const MIME: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Name of the marking that arrived; a loose note has no name, its annotation's `titulo` stands in. */
function arrivalName(project: Project, rootId: string): string {
  const marking = project.markings.find((m) => m.id === rootId);
  if (marking?.name) return marking.name;
  for (const a of project.annotations) {
    const title = a.markingId === rootId ? a.values?.['titulo'] : undefined;
    if (typeof title === 'string' && title !== '') return title;
  }
  return '';
}

/** What the page knows of the project: the subset of `mapping.json` that it draws and inspects. */
function guideData(root: string): unknown {
  const parsed = deserialize(
    readFileSync(join(root, EXAMPLE_DIR, 'mapping.json'), 'utf8'),
  );
  if (!parsed.ok) {
    throw new Error(`${EXAMPLE_DIR}/mapping.json invalid: ${parsed.error.code}`);
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
  // The guide draws only what is inside a container; the notes (markings loose on the canvas)
  // stay out, with their annotations.
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
    // "Everyone" perspectives: the guide only filters containers (the items that are containers) and
    // hidden layers; the position and the loose notes stay in the app. Arrivals carry the marking name.
    perspectives: project.perspectives.map((p) => ({
      name: p.name,
      containers: p.items
        .map((item) => item.root)
        .filter((root) => project.containers.some((c) => c.id === root)),
      hiddenLayers: p.hiddenLayers,
    })),
    arrivals: project.arrivals.map((arrival) => ({
      name: arrivalName(project, arrival.root),
      fromName: arrival.fromName,
    })),
    files,
  };
}

/** JSON inside a `<script>`: `<` and the JS line separators become escapes. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

/** Replaces the marker without interpreting `$` in the new text (the JSON and the CSS have `$`). */
function fill(html: string, marker: string, text: string): string {
  if (!html.includes(marker)) throw new Error(`the template has no marker ${marker}`);
  return html.split(marker).join(text);
}

/** Name of each window, as the app shows it (the keys of the given language). */
function windowTitles(
  dict: Readonly<Record<string, string>>,
): Record<ToolWindowId, string> {
  const title = (key: string): string => {
    const text = dict[key];
    if (text === undefined)
      throw new Error(`UI term missing from the dictionary: ${key}`);
    return text;
  };
  return {
    tree: title('panel.tree'),
    layers: title('layer.title'),
    details: title('panel.details'),
    list: title('view.list'),
    incomplete: title('incomplete.title'),
    notices: title('notices.title'),
    comments: title('comments.title'),
    diagnostics: title('diagnostics.title'),
    proposals: title('proposals.title'),
    catalog: title('catalog.window.title'),
  };
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const UI_TOKEN = /\{ui:([A-Za-z0-9_.]+)((?:\|[A-Za-z]+=[^|}]*)*)\}/g;

/** The `{ui:key}` keys that a text uses. */
export function uiKeys(text: string): string[] {
  return [...text.matchAll(UI_TOKEN)].map((m) => m[1] ?? '');
}

/**
 * Resolves the tokens of a guide text (see scripts/guide/messages.ts): `{ui:key|param=value}`
 * becomes the exact text of the app's dictionary and `{exampleZip}` the example project's zip.
 * A key missing from the dictionary throws: a guide must not quote a UI term that does not exist.
 */
export function resolveText(
  text: string,
  dict: Readonly<Record<string, string>>,
): string {
  return text
    .replace(UI_TOKEN, (_, key: string, params: string) => {
      let term = dict[key];
      if (term === undefined) {
        throw new Error(
          `the guide quotes a UI term that is not in the dictionary: ${key}`,
        );
      }
      for (const param of params.split('|').filter(Boolean)) {
        const [name = '', ...value] = param.split('=');
        term = term.split(`{${name}}`).join(value.join('='));
      }
      return escapeHtml(term);
    })
    .split('{exampleZip}')
    .join(`${EXAMPLE_DIR}.zip`);
}

/** Every text of a language resolved against its dictionary. */
export function resolveMessages(
  messages: GuideMessages,
  dict: Readonly<Record<string, string>>,
): GuideMessages {
  const resolve = (value: unknown): unknown => {
    if (typeof value === 'string') return resolveText(value, dict);
    if (Array.isArray(value)) return value.map(resolve);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
    }
    return value;
  };
  return resolve(messages) as GuideMessages;
}

/** The `{ui:key}` keys of a language's messages that its dictionary does not have. */
export function missingUiKeys(
  messages: GuideMessages,
  dict: Readonly<Record<string, string>>,
): string[] {
  const keys = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') uiKeys(value).forEach((k) => keys.add(k));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object')
      Object.values(value).forEach(walk);
  };
  walk(messages);
  return [...keys].filter((key) => dict[key] === undefined).sort();
}

/** The texts of the page, for each language, and the example's names in each one. */
function guideTexts(): unknown {
  return {
    messages: Object.fromEntries(
      LOCALES.map((l) => [l, resolveMessages(GUIDE_MESSAGES[l], DICTIONARIES[l])]),
    ),
    names: NAMES,
  };
}

/** The shortcut table rows: one per window (from `WINDOW_NUMBER`, 0 last) and Arrange, per language. */
function shortcutRows(): string {
  const order = (id: ToolWindowId) => (WINDOW_NUMBER[id] === 0 ? 10 : WINDOW_NUMBER[id]);
  const windows = [...TOOL_WINDOWS].sort((a, b) => order(a) - order(b));
  return LOCALES.flatMap((locale) => {
    const dict = DICTIONARIES[locale];
    const titles = windowTitles(dict);
    const rows = windows.map(
      (id) => [`Ctrl+Shift+${WINDOW_NUMBER[id]}`, titles[id]] as [string, string],
    );
    rows.push(['Alt+Shift+A', dict['shortcuts.arrange'] ?? '']);
    return rows.map(
      ([combo, label]) =>
        `<tr data-locale="${locale}"><td><kbd>${combo}</kbd></td><td>${escapeHtml(label)}</td></tr>`,
    );
  }).join('\n');
}

/** `pickLocale` as page code: the TypeScript file with types and `export` stripped. */
function pickLocaleCode(root: string): string {
  const source = readFileSync(join(root, PICK_LOCALE_SOURCE), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
  return code.replace(/^export /gm, '').trim();
}

/** The final HTML of the guide (with the CSP). `root`: the repository root. */
export function guideHtml(root = process.cwd()): string {
  const template = readFileSync(join(root, GUIDE_TEMPLATE), 'utf8');
  const noscript = LOCALES.map((l) => GUIDE_MESSAGES[l].noscript).join(' · ');
  const html = [
    ['/*__TOKENS_CSS__*/', renderTokensCss()],
    ['/*__PICK_LOCALE__*/', pickLocaleCode(root)],
    ['<!--__NOSCRIPT__-->', noscript],
    ['<!--__SHORTCUT_ROWS__-->', shortcutRows()],
    ['/*__MESSAGES__*/ null', inlineJson(guideTexts())],
    ['/*__DATA__*/ null', inlineJson(guideData(root))],
  ].reduce(
    (acc, [marker, text]) => fill(acc as string, marker as string, text as string),
    template,
  );
  return applyCsp(html, 'static');
}

/** The page at the old address (`guia/`): redirects to `guide/`. */
export function guideRedirectHtml(): string {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=../guide/" />
    <title>Mapping guide</title>
  </head>
  <body>
    <p><a href="../guide/">Mapping guide</a></p>
  </body>
</html>
`;
  return applyCsp(html, 'static');
}
