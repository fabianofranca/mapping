// @vitest-environment node
// A single image creator (docs/ARCHITECTURE.md, "Remote images"). The ESLint rule
// (`imageCreationSyntaxRules` in eslint.config.js) forbids creating an image from a URL in
// `src/**` and `viewer/**`, except in the loader (`src/canvas/components/imageLoader.ts`) and in
// `src/storage/**`. Since a `no-restricted-syntax` of a later block replaces the earlier one, this
// test also proves that the old rules still apply where the new one was joined.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

/** Messages of `no-restricted-syntax` when linting `code` as if it were the file `filePath`. */
async function restricted(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message);
}

const IMAGE_MARK = 'image URL outside';
const imageErrors = async (code: string, filePath: string) =>
  (await restricted(code, filePath)).filter((m) => m.includes(IMAGE_MARK));

const forbidden: Record<string, string> = {
  'new Image()': `export const a = new Image();\n`,
  'new Image(w, h)': `export const a = new Image(10, 10);\n`,
  "createElement('img')": `export const a = document.createElement('img');\n`,
  "createElementNS(…, 'image')": `export const a = document.createElementNS('http://www.w3.org/2000/svg', 'image');\n`,
  'assignment to .src': `export function f(el: HTMLImageElement) {\n  el.src = 'https://x/y.png';\n}\n`,
  'assignment to .srcset': `export function f(el: HTMLImageElement) {\n  el.srcset = 'a 1x';\n}\n`,
  'x.src += …': `export function f(el: HTMLImageElement) {\n  el.src += '?d=1';\n}\n`,
  "x['src'] = …": `export function f(el: HTMLImageElement) {\n  el['src'] = 'u';\n}\n`,
  "setAttribute('src', …)": `export function f(el: Element) {\n  el.setAttribute('src', 'u');\n}\n`,
  "setAttribute('srcset', …)": `export function f(el: Element) {\n  el.setAttribute('srcset', 'u');\n}\n`,
  'Konva.Image.fromURL': `declare const Konva: { Image: { fromURL(u: string, cb: () => void): void } };\nKonva.Image.fromURL('u', () => {});\n`,
};

const restrictedFiles = [
  'src/ui/StatusBar.tsx',
  'src/app/useExternalChanges.ts',
  'src/store/derived.ts',
  'src/canvas/CanvasController.ts',
  'src/canvas/components/renderScene.ts',
  'src/app/controller.ts',
  'src/store/session.ts',
  'src/ui/focus.ts',
  'src/ui/toolWindowLayout.ts',
  'viewer/main.ts',
];
const allowedFiles = ['src/canvas/components/imageLoader.ts', 'src/storage/images.ts'];

describe('single image creator (decision 14)', () => {
  for (const [name, code] of Object.entries(forbidden)) {
    it(`${name} is an error outside the loader`, async () => {
      for (const file of restrictedFiles) {
        const messages = await imageErrors(code, file);
        expect(messages.length, `${file}: ${name}`).toBeGreaterThan(0);
      }
    });

    it(`${name} is free in the loader and in src/storage/`, async () => {
      for (const file of allowedFiles) {
        expect(await imageErrors(code, file), `${file}: ${name}`).toEqual([]);
      }
    });
  }

  it('only reading .src and using src in an object literal is not an error', async () => {
    const code = `export function f(el: HTMLImageElement) {
  const s = el.src;
  const o = { src: s, srcset: 'a' };
  el.getAttribute('src');
  return o;
}
`;
    for (const file of restrictedFiles) {
      expect(await restricted(code, file), file).toEqual([]);
    }
  });

  it('createElement of another element is not an error', async () => {
    const code = `export const a = document.createElement('canvas');\n`;
    expect(await restricted(code, 'src/ui/Foo.tsx')).toEqual([]);
  });
});

describe('the old rules still apply where the image one was joined', () => {
  const write = `export async function x(storage: { saveMapping(text: string): Promise<void> }) {
  await storage.saveMapping('{}');
}
`;
  const globalQuery = `export const a = document.querySelector('[data-x]');\n`;
  const classQuery = `export function f(el: HTMLElement) {\n  return el.querySelector('.x');\n}\n`;

  it('saveMapping in src/ui/ is still an error', async () => {
    expect(await restricted(write, 'src/ui/StatusBar.tsx')).toHaveLength(1);
  });

  it('saveMapping in src/storage/ (outside the implementations) is still an error', async () => {
    expect(await restricted(write, 'src/storage/share.ts')).toHaveLength(1);
  });

  it('saveMapping in the image loader is also an error (it gets the session rules)', async () => {
    expect(await restricted(write, 'src/canvas/components/imageLoader.ts')).toHaveLength(
      1,
    );
  });

  it('the global focus selector is still an error in src/ui/ and src/app/', async () => {
    expect(await restricted(globalQuery, 'src/ui/Foo.tsx')).toHaveLength(1);
    expect(await restricted(globalQuery, 'src/app/controller.ts')).toHaveLength(1);
  });

  it('the class selector is still an error in the focus exceptions', async () => {
    expect(await restricted(classQuery, 'src/ui/focus.ts')).toHaveLength(1);
  });

  it('in session.ts, saveMapping outside writeProject is still an error', async () => {
    const outside = `declare const storage: { saveMapping(t: string): Promise<void> };
export const other = () => storage.saveMapping('{}');
`;
    expect(await restricted(outside, 'src/store/session.ts')).toHaveLength(1);
  });

  it('the controller still forbids loadMapping', async () => {
    const code = `declare const storage: { loadMapping(): Promise<string | null> };
export const other = () => storage.loadMapping();
`;
    expect(await restricted(code, 'src/app/controller.ts')).toHaveLength(1);
  });
});
