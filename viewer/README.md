# Visualizador embutível (`viewer/`)

Ferramenta do Mapping para quem desenvolve o `mapping-viewer`: um **visualizador de só leitura**, sem framework, que um site hospedeiro embute (inclusive React) para desenhar uma tela a partir de uma biblioteca de componentes e de uma descrição de tela, atualizando em tempo real. Não é consumido pela app; usa o motor que já mora em `src/`. O guia de uso para quem instala o pacote é o [`PACKAGE-README.md`](PACKAGE-README.md).

## Estrutura

- Núcleo, na raiz da pasta:
  - `index.ts`: entrada pública do núcleo (`createViewer` e os reexports do motor).
  - `viewer.ts`: `createViewer`, `Viewer`, `ViewerOptions`.
  - `react.tsx`: invólucro `<MappingViewer/>`, um `<div>` que hospeda um `createViewer`.
  - `tree.ts`: `screenTree` e `flattenTree` (árvore das instâncias, pura).
  - `host.ts`: `loadLibraryFromUrl` e `registerLibraryFonts`, funções do hospedeiro (rede e fontes); o núcleo não faz nenhuma das duas.
  - `remoteImages.ts`: imagens remotas, desligadas por padrão e sempre `pixelSafe`.
  - `pinch.ts`: pinça com dois dedos no palco Konva e teto do pixel ratio.
  - `build.mjs` e `tsconfig.json`: build do pacote e das declarações de tipo.
- `demo/`: página de demonstração em React 19 de verdade (sem `preact/compat`), com CSS próprio (`--demo-*`, sem os tokens da app). É um exemplo copiável de hospedeiro.
- `samples/`: exemplos embutidos (`samples.ts`, `samplesMaterial3.ts`, `settings.sdui.json`), usados pela demo e pelos testes do modelo e do canvas.
- Os testes ficam em `tests/viewer/`. O desenho em si é o `ScreenRenderer` de `src/canvas/components/`.

## Comandos

```bash
npm run dev:viewer    # demo React em desenvolvimento (vite.viewer.config.ts)
npm run build:viewer  # gera dist-viewer/ (o tsc roda primeiro e verifica os tipos)
cd dist-viewer && npm pack   # gera mapping-viewer-<versão>.tgz para instalar no hospedeiro
```

A demo não entra no `npm run build` nem no deploy. `npm run build:viewer` gera `mapping-viewer.js` (núcleo) e `mapping-viewer-react.js` (invólucro), ESM minificados, com mapas externos e o Konva embutido, mais `package.json`, `types/` e o `README.md` do pacote. No fim ele confere que todo arquivo apontado por `exports` existe. A versão do pacote é a constante `VIEWER_VERSION` do `build.mjs` e sobe junto com mudanças da API.

## API em resumo

- `createViewer(container, { library, screen, drawingMode, onHover, onClick, onWarnings, measure, fit, padding, interactive, selectionColor, hoverColor, remoteImages, allowOrigin })` devolve `{ update, redraw, setSelection, setHover, setInteractive, fit, scale, boxOf, instanceAt, clientToScreen, warnings, toDataURL, dispose }`.
- `update` faz o diff por identidade (`===`): só as instâncias novas ou com objeto novo são re-instanciadas. O desenho roda no `requestAnimationFrame`, no máximo uma vez por quadro.
- `drawingMode` escolhe o modo dos `tokens` da especialização (`light`, `dark`…); sem ele (ou com um modo que a especialização não declara) vale o primeiro modo. O visualizador não tem projeto nem container: o modo é só o da opção. Mudá-lo em tempo de execução (`update({ drawingMode })`, ou a prop `drawingMode` do invólucro) redesenha sem recarregar a biblioteca nem a tela (a biblioteca com os tokens do modo é guardada por modo). Os tokens embutidos `font-sans` e `font-mono` valem a fonte do hospedeiro (`fonts`, ou a pilha do tema da app) em qualquer modo, a menos que a especialização os redefina.
- `<MappingViewer library screen selection hover interactive ... />` lê os callbacks por ref e sobrevive ao `<StrictMode>`.
- A biblioteca vem de `loadLibrary(files)` (ou `loadLibraryFromUrl`); a tela, de `parseScreen(json)`, de um objeto ou de um JSON de origem (`source`) traduzido pela declaração da especialização.
- O núcleo não registra fonte: o hospedeiro fornece e chama `redraw()` (ou muda `fontsVersion` no invólucro).

Os detalhes de cada opção e de cada exportação estão no `PACKAGE-README.md`.

## O que fica de fora, de propósito

- **Arrastar e redimensionar**: é edição. O núcleo dá seleção pelo clique, hover e o modo sem interação (`interactive: false`); `boxOf`, `scale` e `clientToScreen` deixam o hospedeiro desenhar alças próprias em DOM. Quem precisar de arrasto liga o gesto nos grupos via `ScreenRenderer` (exportado).
- Rede e fontes no núcleo: ficam em `host.ts`, para o site que instala o pacote.
- Tokens e i18n da app: a demo e o pacote não os usam.

## Pontos em aberto

- `toDataURL` captura só o que cabe no `Stage`: com `fit` numérico maior que o contêiner, a tela sai cortada.
- Os dois bundles duplicam o Konva: quem usa os dois no mesmo site carrega duas cópias; a saída seria um bundle só com o invólucro dentro.
- Teste com o JSON real de um backend de SDUI (o exemplo `settings.sdui.json` passa sem avisos).

## Regras da pasta

TypeScript strict, sem `any`, sem requisição de rede; React é dependência só de desenvolvimento e só da demo; a demo usa a CSP de perfil `static`. Imagem por URL só pelo carregador de `src/canvas/components/` (regra de lint também vale em `viewer/**`).
