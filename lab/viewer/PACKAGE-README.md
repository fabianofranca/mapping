# mapping-viewer

Visualizador embutível do Mapping: desenha **uma tela** de componentes (a biblioteca de um design system mais uma descrição de tela) num contêiner do seu site, só leitura, com atualização em tempo real. O núcleo não depende de framework; há um invólucro React opcional.

## Instalação

Dentro de `dist-viewer/` (a pasta gerada por `npm run build:viewer` no repositório do Mapping):

```bash
npm pack
# gera mapping-viewer-0.1.0.tgz
```

No projeto que vai usar:

```bash
npm install ./mapping-viewer-0.1.0.tgz
```

Também dá para copiar a pasta `dist-viewer/` inteira para o projeto e importar `mapping-viewer.js` por caminho.

## Núcleo (sem framework)

```ts
import { createViewer, loadLibrary, parseScreen } from 'mapping-viewer';

const library = loadLibrary(files); // files: { path, text?, bytes? }[]
const screen = parseScreen(JSON.parse(screenJson));

const viewer = createViewer(document.getElementById('preview')!, {
  library,
  screen,
  onClick: (id) => console.log('clicou em', id),
});

viewer.update({ screen: novaTela }); // redesenha só o que mudou
viewer.setSelection(['i-card']); // seleção vinda do seu painel
viewer.dispose(); // ao desmontar
```

O contêiner precisa ter tamanho; o enquadramento se refaz sozinho quando ele muda.

## React

```tsx
import { MappingViewer } from 'mapping-viewer/react';

<MappingViewer
  library={library}
  screen={screen}
  selection={selection}
  onClick={(id) => setSelection(id ? [id] : [])}
  fontsVersion={fontsVersion}
/>;
```

`react` é peer dependency **opcional**: só quem importa `mapping-viewer/react` precisa dele (18 ou mais novo).

## Carregar a biblioteca

`loadLibrary(files)` recebe a lista de arquivos da pasta do design system: a especialização (`"format": "mapping-spec"`), um `.json` por componente e as fontes (`bytes`). Se os arquivos estão num servidor, use `loadLibraryFromUrl`:

```ts
import { loadLibraryFromUrl } from 'mapping-viewer';

const library = await loadLibraryFromUrl('https://meu-site.com/ds/material3.spec.json');
if (library.problems.length > 0) console.warn(library.problems);
```

Ela busca a especialização, os componentes e as fontes que ela aponta (caminhos relativos à URL da especialização). Um arquivo que não vier fica de fora e aparece em `library.problems`; uma especialização que não vier lança `Error`. Opções: `{ fetch, fonts }` (`fetch` próprio, por exemplo com autenticação; `fonts: false` não busca as fontes).

## Fontes

O núcleo não carrega fonte. Duas formas:

- **CSS:** declare as famílias com `@font-face` no seu site;
- **Pela biblioteca:** `await registerLibraryFonts(library)` registra, via `FontFace`, as fontes que a especialização declara (com os bytes carregados) e devolve o status de cada uma (`loaded`, `missing`, `failed`).

Quando as fontes carregarem, remeça os textos: `viewer.redraw()` no núcleo, ou mude o valor de `fontsVersion` no `<MappingViewer/>`.

## Árvore das instâncias

`screenTree(screen, library)` devolve as raízes (na ordem de desenho) com os filhos aninhados; cada nó traz `id`, `parentId`, `depth`, `label` (o rótulo da instância), `typeId`, `typeName`, `instance` e `children`. `flattenTree(tree)` dá a mesma árvore em lista, em pré-ordem (a ordem de desenho), pronta para uma lista com recuo por `depth`. Seleção e realce voltam ao canvas por `setSelection` e `setHover`.

## Exports

Do núcleo (`mapping-viewer`) e também reexportados por `mapping-viewer/react`:

- `createViewer`, `ScreenRenderer`, `konvaMeasurer`, `approximateMeasurer`;
- biblioteca: `loadLibrary`, `loadLibraryFromUrl`, `registerLibraryFonts`, `resolvePath`, `instanceLabel`;
- tela: `parseScreen`, `serializeScreen`, `renderOrder`, `childrenOf`;
- árvore: `screenTree`, `flattenTree`;
- tipos: `Viewer`, `ViewerInput`, `ViewerOptions`, `InstanceWarnings`, `ScreenRendererOptions`, `ScreenRendererUpdateOptions`, `Library`, `TypeDef`, `FieldDef`, `LoadedFont`, `TextFile`, `Screen`, `Instance`, `Box`, `ComponentFile`, `FieldValue`, `FieldValues`, `TextMeasurer`, `TreeNode`, `LoadFromUrlOptions`, `FontStatus`, `FontHost`.

Só em `mapping-viewer/react`: `MappingViewer` e `MappingViewerProps`.

## Observações

- Cada bundle é **autocontido**, com o Konva e o motor dentro. Use `mapping-viewer` **ou** `mapping-viewer/react` no mesmo site; os dois juntos carregam duas cópias do Konva.
- O bundle do React deixa `react`, `react/jsx-runtime` e `react-dom` de fora: o seu site fornece o React dele.
- O pacote é ESM (`"type": "module"`) e vem minificado, com mapas de código (`.js.map`).
- `loadLibraryFromUrl` usa `fetch`: o site hospedeiro precisa permitir a requisição (CORS e, se houver, CSP `connect-src`).
