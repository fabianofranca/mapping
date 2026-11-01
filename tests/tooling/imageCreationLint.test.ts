// @vitest-environment node
// Decisão 14 da etapa "Imagens remotas": um só criador de imagem. A regra ESLint
// (`imageCreationSyntaxRules` em eslint.config.js) proíbe criar imagem a partir de URL em
// `src/**` e `lab/**`, salvo no carregador (`src/canvas/components/imageLoader.ts`) e em
// `src/storage/**`. Como `no-restricted-syntax` de um bloco posterior substitui o anterior, este
// teste também prova que as regras antigas continuam valendo onde a nova foi juntada.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

/** Mensagens de `no-restricted-syntax` ao lintar `code` como se fosse o arquivo `filePath`. */
async function restricted(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message);
}

const IMAGE_MARK = 'decisão 14';
const imageErrors = async (code: string, filePath: string) =>
  (await restricted(code, filePath)).filter((m) => m.includes(IMAGE_MARK));

const forbidden: Record<string, string> = {
  'new Image()': `export const a = new Image();\n`,
  'new Image(w, h)': `export const a = new Image(10, 10);\n`,
  "createElement('img')": `export const a = document.createElement('img');\n`,
  "createElementNS(…, 'image')": `export const a = document.createElementNS('http://www.w3.org/2000/svg', 'image');\n`,
  'atribuição a .src': `export function f(el: HTMLImageElement) {\n  el.src = 'https://x/y.png';\n}\n`,
  'atribuição a .srcset': `export function f(el: HTMLImageElement) {\n  el.srcset = 'a 1x';\n}\n`,
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
  'lab/viewer/main.ts',
];
const allowedFiles = ['src/canvas/components/imageLoader.ts', 'src/storage/images.ts'];

describe('criador de imagem único (decisão 14)', () => {
  for (const [name, code] of Object.entries(forbidden)) {
    it(`${name} é erro fora do carregador`, async () => {
      for (const file of restrictedFiles) {
        const messages = await imageErrors(code, file);
        expect(messages.length, `${file}: ${name}`).toBeGreaterThan(0);
      }
    });

    it(`${name} é livre no carregador e em src/storage/`, async () => {
      for (const file of allowedFiles) {
        expect(await imageErrors(code, file), `${file}: ${name}`).toEqual([]);
      }
    });
  }

  it('só ler .src e usar src num objeto literal não é erro', async () => {
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

  it('createElement de outro elemento não é erro', async () => {
    const code = `export const a = document.createElement('canvas');\n`;
    expect(await restricted(code, 'src/ui/Foo.tsx')).toEqual([]);
  });
});

describe('as regras antigas continuam valendo onde a de imagem foi juntada', () => {
  const write = `export async function x(storage: { saveMapping(text: string): Promise<void> }) {
  await storage.saveMapping('{}');
}
`;
  const globalQuery = `export const a = document.querySelector('[data-x]');\n`;
  const classQuery = `export function f(el: HTMLElement) {\n  return el.querySelector('.x');\n}\n`;

  it('saveMapping em src/ui/ ainda é erro', async () => {
    expect(await restricted(write, 'src/ui/StatusBar.tsx')).toHaveLength(1);
  });

  it('saveMapping em src/storage/ (fora das implementações) ainda é erro', async () => {
    expect(await restricted(write, 'src/storage/share.ts')).toHaveLength(1);
  });

  it('saveMapping no carregador de imagem também é erro (recebe as regras da sessão)', async () => {
    expect(await restricted(write, 'src/canvas/components/imageLoader.ts')).toHaveLength(
      1,
    );
  });

  it('o seletor global de foco ainda é erro em src/ui/ e src/app/', async () => {
    expect(await restricted(globalQuery, 'src/ui/Foo.tsx')).toHaveLength(1);
    expect(await restricted(globalQuery, 'src/app/controller.ts')).toHaveLength(1);
  });

  it('o seletor por classe ainda é erro nas exceções de foco', async () => {
    expect(await restricted(classQuery, 'src/ui/focus.ts')).toHaveLength(1);
  });

  it('em session.ts, saveMapping fora de writeProject ainda é erro', async () => {
    const outside = `declare const storage: { saveMapping(t: string): Promise<void> };
export const other = () => storage.saveMapping('{}');
`;
    expect(await restricted(outside, 'src/store/session.ts')).toHaveLength(1);
  });

  it('o controller ainda proíbe loadMapping', async () => {
    const code = `declare const storage: { loadMapping(): Promise<string | null> };
export const other = () => storage.loadMapping();
`;
    expect(await restricted(code, 'src/app/controller.ts')).toHaveLength(1);
  });
});
