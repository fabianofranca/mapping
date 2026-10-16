# Laboratório

Experimentos **fora do produto**: páginas à parte, publicadas ao lado da app (`dist/lab/…`) para validar uma possibilidade antes de ela virar etapa do [`PLAN.md`](../PLAN.md). Nada daqui entra no `index.html` da app, nem nas regras do núcleo (i18n, store, tokens de design obrigatórios). As regras que continuam valendo: TypeScript strict, sem `any`, sem dependências novas, sem requisição de rede (a página leva a mesma CSP da app) e testes no Vitest.

## `figma/` — Figma somente leitura (Konva)

**Pergunta:** dá para copiar um componente do Figma e desenhá-lo nativamente no canvas (Konva), com estrutura de camadas, em vez de usar uma captura de tela?

**Onde:** `https://fabianofranca.github.io/mapping/preview/lab/figma/` depois de publicar o branch em Actions › Deploy (ou `npm run dev:lab` localmente; o build fica em `dist/lab/figma/index.html`, que também abre por `file://`).

**Como usar:**

1. No Figma, selecione o componente e use **botão direito › Copy/Paste as › Copy as SVG**. Se quiser os nomes das camadas na árvore, ligue **Include "id" attribute** nas preferências de exportação SVG do arquivo (sem isso, os nós aparecem pelo tipo: `rect`, `path`, `g`).
2. Na página do laboratório, `Ctrl+V`. Também vale soltar/abrir um `.svg`.
3. Compare com **Referência SVG** (o mesmo SVG rasterizado pelo navegador, por cima, com opacidade ajustável) e ligue **Contornos** para ver a estrutura. Passe o mouse ou clique nos nós (no canvas ou na árvore) para ver nome, caixa, preenchimentos e fonte.
4. Alternativa com mais informação: o JSON da API REST (`GET https://api.figma.com/v1/files/:key/nodes?ids=<id>&geometry=paths`, com o token em `X-Figma-Token`), colado como texto ou solto como `.json`. Vem com nomes, tipos do Figma (`FRAME`, `INSTANCE`, `TEXT`…), `relativeTransform` e os vetores como caminhos (`fillGeometry`). Sem `geometry=paths` os vetores viram só caixas.

**O que o `Ctrl+C` comum do Figma cola:** um HTML com `data-metadata="<!--(figmeta)…-->"` e `data-buffer="<!--(figma)…-->"`, que é o formato binário interno (fig-kiwi, comprimido), não documentado. A página só o detecta e explica: decodificá-lo exigiria reimplementar o formato interno e quebraria a cada versão do Figma. **Decisão:** a possibilidade validada é "Copy as SVG" (e o JSON da API), não a cópia nativa.

**Arquitetura:** `scene.ts` é o modelo intermediário (frame, group, rect, ellipse, line, path, text, unknown; paints sólido/gradiente/imagem; traço; sombra; matriz relativa ao pai). `svgToScene.ts` e `figmaJsonToScene.ts` produzem a cena, com uma lista de **avisos** do que ficou de fora ou foi aproximado. `renderScene.ts` transforma a cena em nós Konva (um `Konva.Group` por nó, com `sceneId` para o hover). `viewer.ts` é o palco (zoom na roda, pan arrastando, hover, seleção, contornos, referência). `main.tsx` é a página Preact. Testes em `tests/lab/figma/` e ponta a ponta em `tests/e2e/lab.spec.ts`.

**Limites conhecidos (aparecem como avisos na página):** sombra interna, desfoques, máscaras e modos de mesclagem não existem no canvas 2D ou não foram feitos; fontes só se estiverem instaladas na máquina (a CSP não deixa baixar); imagens só quando embutidas no SVG (`data:`), no JSON a API dá só o `imageRef`; estilos por trecho de texto e arcos de elipse são aproximados; traço por dentro/por fora só em retângulos e elipses.

**O que observar no teste:** fidelidade do desenho nativo contra a referência (texto é o ponto fraco: fonte, espaçamento e quebra de linha são do navegador, não do Figma); se a árvore e as caixas por nó bastam para "marcar" componentes sem imagem; desempenho com componentes grandes (o rodapé mostra nós, tamanho e tempo de conversão).
