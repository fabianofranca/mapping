# Laboratório

Experimentos **fora do produto**: páginas à parte, publicadas ao lado da app (`dist/lab/…`) para validar uma possibilidade antes de ela virar etapa do [`PLAN.md`](../PLAN.md). Nada daqui entra no `index.html` da app, nem nas regras do núcleo (i18n, store, tokens de design obrigatórios). As regras que continuam valendo: TypeScript strict, sem `any`, sem dependências novas além do React 19, que é só de desenvolvimento e só da página `react` (ver `viewer/`), sem requisição de rede (a página leva a CSP de perfil `static`, a da app antes da etapa Imagens remotas: sem imagem remota nem Trusted Types) e testes no Vitest.

O laboratório é o épico `epic/lab` (PR [#160](https://github.com/fabianofranca/mapping/pull/160)): toda mudança entra por um PR com base nesse branch, nunca na `main`, conforme o [`CLAUDE.md`](../CLAUDE.md) ("Fluxo de trabalho").

> O experimento "Figma somente leitura" (colar "Copy as SVG" ou o JSON da API e desenhar com Konva) foi encerrado e removido; o laboratório segue só com os componentes. O que ele mostrou: "Copy as SVG" e o JSON da API dão para desenhar, a cópia nativa do Figma (fig-kiwi) não. O código fica no histórico do git.

## `components/` — Componentes por template

**Pergunta:** dá para montar telas **sem importar imagens**, só com componentes genéricos de uma especialização, e ter o desenho refletindo as propriedades da anotação?

**Onde:** `https://fabianofranca.github.io/mapping/preview/lab/components/` (ou `npm run dev:lab`; build em `dist/lab/components/index.html`).

**Decisões (do dono):** instâncias posicionadas por **retângulo**, como as marcações de hoje (uma tela sem imagem é um canvas em branco; cada instância ocupa o próprio retângulo; o template se adapta ao tamanho, nada é esticado). **Um arquivo por componente**; a especialização só referencia (`"component": "components/button.json"`, caminho relativo ao arquivo da especialização; chave nova, `formatVersion` 4 experimental).

**Formato do componente (`mapping-component`, `src/model/components/componentFormat.ts`; documentado em [`docs/COMPONENT-FORMAT.md`](../docs/COMPONENT-FORMAT.md)):** `id`, `name`, `size` (inicial), `minSize`, `preview` (valores de exemplo dos campos) e `template`, uma árvore de primitivas genéricas: `frame` (com `layout` `none`/`row`/`column`, `gap`, `padding`, `align`, `justify`, `clip`), `rect`, `ellipse`, `text`, `path` (com `viewBox`, escalado para a caixa) e `slot` (espaço para outro componente). Tamanhos: px, `"fill"`, `"hug"` ou `"50%"`; em `layout: none`, âncoras (`left`/`right`/`top`/`bottom`/`centerX`/`centerY`). Qualquer atributo pode ser uma **expressão sobre os campos**: `{"$field": "label", "default": "Botão"}`, `{"$if": {"$eq": ["variant", "ghost"]}, "then": …, "else": …}`, `{"$switch": "variant", "cases": {…}, "default": …}`, `{"$concat": […]}`; `visible` aceita condições (`$has`, `$not`, `$and`, `$or`). Campos booleanos são `enum` `sim`/`não`, lidos por veracidade. Validação com caminho e mensagem (`src/model/components/parseComponent.ts`); layout e instanciação em `src/model/components/instantiate.ts` (puro, sem DOM; o texto é medido por uma função injetada, o Konva na página). **O motor mora no produto:** desde a fase B1 da etapa Biblioteca, `componentFormat`, `parseComponent`, `expressions`, `instantiate`, `scene`, `screen`, `arrange`, `layout`, `origin` e a parte pura de `library` ficam em `src/model/components/` (testes em `tests/model/components/`), e o laboratório importa de lá, sem cópia. Ficam no laboratório só o que depende do navegador e é do laboratório: `lab/components/libraryFiles.ts` (a leitura de arquivos e pastas, que era o fim do antigo `library.ts`), `board.ts`, o editor e as páginas. O que depende de Konva ou das fontes (`renderScene`, `konvaMeasurer`, `screenRenderer` e as fontes) mora, desde a B3, em `src/canvas/components/` e `src/storage/fonts.ts`, e o laboratório importa de lá.

**Design system de verdade:** o botão **Material 3** carrega o Material Design 3 (baseline, tema claro) escrito nesse formato, em `lab/components/samplesMaterial3.ts`: doze componentes (top app bar, button com as cinco variantes, FAB, text field outlined, switch, checkbox, chip, card, list item, navigation bar, modal bottom sheet e scrim), com os tokens de cor, tipografia (Roboto) e forma da especificação pública e ícones dos Material Icons, mais uma tela de configurações num Pixel (412 × 917) só com instâncias. É o teste de que o formato genérico representa um design system existente sem nada específico dele no código.

**Como usar:** **Exemplos** carrega a especialização de exemplo (seis componentes: barra do app, avatar, botão, cartão, interruptor, campo de texto) e uma tela de login montada só com instâncias. Clique numa instância: o painel da direita mostra os campos do tipo (do `mapping-spec`) e editar redesenha na hora; arraste para mover; as alças redimensionam com o template se re-adaptando ao vivo; `Delete` exclui; `Ctrl+Z` desfaz. **Várias telas:** o canvas é um quadro; **Duplicar tela** e **Excluir tela** agem na tela ativa (clique nela ou num componente dela; o nome é editável na barra). Arraste o fundo de uma tela para reorganizá-la no quadro; o vazio faz pan. Tamanho, **Exportar tela** e **PNG** são da tela ativa; importar um `*.screen.json` acrescenta uma tela ao quadro. A posição no quadro não vai para o `*.screen.json` (o formato da tela não mudou). **Adicionar** na biblioteca cria uma instância com os valores de `preview`. **Baixar exemplos (zip)** entrega a pasta (especialização + `components/*.json` + a tela) para editar num editor de texto e reabrir com **Abrir pasta…** (Chrome/Edge) ou **Abrir arquivos…**; os problemas de carga aparecem em Avisos (arquivo ausente, componente inválido com o caminho do erro, tipo sem componente). **Exportar tela** grava a tela (`*.screen.json`, instâncias com retângulo e valores); **PNG** rasteriza o desenho.

**Posições fixas:** o toggle da barra é um modo do editor: os componentes não se arrastam nem se redimensionam (a seleção continua, sem alças), mas cada **tela** continua arrastável como um todo pelo quadro (arrastar por cima de um componente move a tela inteira), além do pan, do zoom e de Ajustar: o que fica fixo é cada componente dentro da sua tela. **Decisão do dono:** é assim que a visualização por componentes deve funcionar na app, com várias telas reorganizáveis no canvas. A caixa (x, y, L, A), o Pai, a Ordem e **Trazer para frente** ficam desabilitados. Os campos do tipo continuam editáveis e redesenham na hora; **Adicionar** e **Excluir** seguem valendo. É um modo da visualização, não um dado da tela: não vai para o `*.screen.json`, não é por instância nem fica guardado entre sessões. Não é a trava `locked` das marcações da app, que é por item e gravada no projeto (bloqueia mover, redimensionar e excluir o item e deixa anotar livre).

**Containers (Box, Row, Column):** um componente cujo template tem um `slot` é um container; as instâncias filhas têm `parentId` e a ordem entre irmãos é a ordem na lista da tela. O slot pode declarar `layout` (`row`/`column`, com `gap` e `padding` ligados a campos): o editor então **recalcula e grava os retângulos dos filhos** a cada mudança (`src/model/components/arrange.ts`), em vez de criar uma segunda fonte de verdade; `none` (Box) deixa cada filho no próprio retângulo. Mover um container leva os filhos; arrastar uma instância para dentro de um container a adota (o alvo fica realçado) e, num Row/Column, a posição do centro define a ordem; o painel tem **Pai** e **Ordem** para fazer o mesmo sem arrastar. Na biblioteca Material 3, `Box`, `Row` e `Column` são os primitivos do Compose (spacing, padding, background, shape); na tela de exemplo os chips e os botões de ação estão dentro de Rows. Decisão registrada: entre instâncias o layout é opcional e escreve retângulos; dentro de um template continua sendo o do próprio componente.

**Fontes do design system:** a especialização declara `fonts` (`[{ "family": "Roboto", "file": "fonts/Roboto-Regular.ttf", "weight": 400 }]`; `weight` aceita faixa de fonte variável, `"100 900"`; `style: "italic"`). Os arquivos (`.ttf`, `.otf`, `.woff`, `.woff2`) são lidos como bytes da pasta ou dos arquivos escolhidos e registrados com `FontFace` (`fonts.ts`): a CSP bloqueia fonte por URL, não uma face construída de bytes em memória. Depois da carga os textos são remedidos e a tela redesenhada. O painel **Fontes** mostra carregada, ausente ou falhou; ausente cai na fonte do sistema. O zip traz `material3/fonts/LEIA-ME.txt` com os arquivos da Roboto a baixar (as fontes não ficam no repositório nem no build: licença e tamanho).

**O que observar no teste:** se escrever um componente à mão é razoável (o formato é a parte que iria para o produto); se o layout `row`/`column` + âncoras cobre os componentes reais de um design system ou falta algo (empilhamento automático entre instâncias ficou de fora de propósito); a fidelidade do texto (fonte do sistema).

**Caminho para o produto (conclusão da análise de 2026-10-16):** deu certo. O **motor** (formato, parser, expressões, instanciação, cena, renderizador Konva e arrumação) vai para o produto como a etapa **Biblioteca** do [`docs/ROADMAP.md`](../docs/ROADMAP.md). O **editor do laboratório** (`editor.ts` e a página) não vai: o canvas da app já faz esse papel (entrada geométrica, seleção na UI, alças no overlay, undo no histórico). No produto não existe entidade "instância": uma instância é **uma marcação com uma anotação tipada**, e o desenho é derivado (retângulo da marcação, tipo e valores da anotação, molde da especialização) e não é gravado. Uma tela sem imagem é uma **imagem sem arquivo** (tela em branco com tamanho e cor de fundo); o quadro com telas reorganizáveis já existe na app (`placement` das imagens). O desenho é opcional por tipo, então projetos só com fotos não executam nada novo.

**Desenho pelo núcleo (fase L1):** o editor deixou de desenhar por conta própria e passou a desenhar pelo `ScreenRenderer` do núcleo do visualizador (`lab/viewer/`, ver a seção `viewer/` abaixo): um por tela do quadro, com `onInstanceCreated` ligando o arrasto de cada instância. O editor ficou só com o que é edição: quadro, pan, zoom, pinça, `Transformer`, arrasto para container e rótulos. O medidor de texto do Konva (`konvaMeasurer`) mudou para `lab/viewer/measure.ts` (hoje `src/canvas/components/konvaMeasurer.ts`). A página e o comportamento não mudaram.

## `viewer/` — Visualizador embutível

**Pergunta:** o motor dos componentes dá um **visualizador de só leitura**, sem framework, que qualquer site hospedeiro embute (inclusive React) para desenhar uma tela a partir da biblioteca e de uma descrição de tela, atualizando em tempo real? E a API basta para o hospedeiro construir a edição por cima?

**Onde:** `https://fabianofranca.github.io/mapping/preview/lab/react/` (o deploy do branch é disparado pelo `workflow_dispatch`, como a página de componentes em `.../preview/lab/components/`); `npm run dev:lab:react` para rodar à parte; `npm run build:viewer` gera `dist-viewer/`; a página buildada fica em `dist/lab/react/index.html`. A página de demonstração não usa os tokens nem o CSS da app: tem variáveis próprias (`--demo-*`, tema claro e escuro) em `lab/react/react.css`, para ser um exemplo copiável de hospedeiro.

**O que é:**

- **Núcleo sem framework** (`lab/viewer/index.ts`, `viewer.ts` e, em `src/canvas/components/`, `screenRenderer.ts` e `konvaMeasurer.ts`): `createViewer(contêiner, opções)` desenha uma tela com Konva, só leitura. O `ScreenRenderer` desenha **uma** tela num `Konva.Group` fornecido por quem chama e não conhece quadro nem "tela ativa"; o `createViewer` usa um por `Stage` e o editor do laboratório usa um por tela do quadro. `update` faz o diff por identidade (`===`): só as instâncias novas ou com objeto novo são re-instanciadas, as que sumiram são destruídas. O desenho do Konva roda no `requestAnimationFrame`, no máximo uma vez por quadro.
- **Invólucro React fino** (`lab/viewer/react.tsx`): `<MappingViewer/>` é um `<div>` que hospeda um `createViewer`.
- **Build de biblioteca e pacote npm** (`lab/viewer/build.mjs`, `npm run build:viewer`): o `tsc` roda primeiro (e verifica os tipos), depois o esbuild gera, **minificados e com mapas externos** (`.js.map`), `dist-viewer/mapping-viewer.js` (cerca de 254 kB; eram 487 kB sem minificar) e `dist-viewer/mapping-viewer-react.js` (cerca de 255 kB; eram 489 kB). O script também escreve o pacote instalável: `dist-viewer/package.json` (`name: "mapping-viewer"`, versão **`0.3.0`**, lida da constante `VIEWER_VERSION` do `build.mjs`, que sobe junto com mudanças da API; `type: "module"`; `exports` `.` e `./react`, cada um com `types` e `import`; `peerDependencies` com `react >=18` opcional, para quem usa só o núcleo; sem `license`, porque o repositório ainda não tem `LICENSE`), `dist-viewer/types/` (`.d.ts`) e `dist-viewer/README.md` (copiado de `lab/viewer/PACKAGE-README.md`: instalação, uso do núcleo e do React, biblioteca, fontes, árvore e exports). No fim, o build confere que todo arquivo apontado por `exports` existe e falha com a lista dos que faltam. Para instalar: `npm pack` dentro de `dist-viewer/` gera `mapping-viewer-0.3.0.tgz` (`npm install ./mapping-viewer-0.3.0.tgz` no projeto hospedeiro) ou a pasta é copiada. Cada `.js` é ESM e autocontido, com o Konva e o motor embutidos; o do React deixa `react`, `react/jsx-runtime` e `react-dom` de fora (o hospedeiro fornece o dele). O hospedeiro usa um **ou** outro.

**Entrada:** a biblioteca (`Library`, montada por `loadLibrary(files)`) e a tela (`Screen`, de `parseScreen(json)` ou um objeto): a descrição neutra que o laboratório já tinha (tamanho, fundo, instâncias com retângulo, tipo, valores e pai). O hospedeiro ou a app traduzem o que têm para isso.

**API:**

- `createViewer(container, { library, screen, onHover, onClick, onWarnings, measure, fit: 'contain' | número, padding, interactive, selectionColor, hoverColor })` devolve `{ update({ library?, screen? }), redraw(), setSelection(ids), setHover(id), setInteractive(on), fit(), scale(), boxOf(id), instanceAt(ponto), clientToScreen(ponto), warnings(), toDataURL(pixelRatio?), dispose() }`. `fit` e `padding` valem só na criação; o enquadramento se refaz sozinho quando o contêiner muda de tamanho. `interactive` (padrão `true`) e `setInteractive(on)`: com `false` o canvas vira só imagem (`stage.listening(false)`; o ponteiro não chama `onHover` nem `onClick`), e `setSelection` e `setHover` continuam valendo, porque a seleção e o hover vêm do hospedeiro; `boxOf`, `instanceAt` e `clientToScreen` funcionam nos dois modos. Ao desligar com hover do ponteiro ativo, o hospedeiro recebe `onHover(undefined)` uma vez. **Imagens remotas (RI4, `VIEWER_VERSION` 0.3.0):** `remoteImages` (padrão `false`, só na criação) e `allowOrigin(origin)` (padrão recusar tudo) mostram o nó `image` dos componentes; a URL passa na política do modelo (só `https:`, sem rede local, sem `http:` nem interruptor) e na função do hospedeiro, sem consentimento próprio; carregador do produto (um por visualizador, sem nova tentativa sem CORS, sempre `pixelSafe`); a CSP é do site hospedeiro (`PACKAGE-README.md`). As páginas do laboratório não ligam a opção.
- Invólucro: `<MappingViewer library screen selection hover interactive onHover onClick onWarnings fit padding className style fontsVersion />`. Os callbacks são lidos por ref (passar uma função nova a cada render não recria o viewer); `library`/`screen` viram `update`, `selection` vira `setSelection`, `hover` vira `setHover`, `interactive` vira `setInteractive` (muda sem recriar o viewer) e `fontsVersion` vira `redraw`. Em `<StrictMode>` o viewer é criado, destruído e criado de novo sem vazar.
- Árvore (`lab/viewer/tree.ts`, puro): `screenTree(screen, library)` devolve as raízes na ordem de desenho (`renderOrder`), com os filhos aninhados (`parentId` que não existe na tela = raiz); cada `TreeNode` traz `id`, `parentId`, `depth`, `label` (`instanceLabel`; tipo desconhecido ou biblioteca `undefined`: o `typeId`), `typeId`, `typeName` (ausente se o tipo não existe), `instance` e `children`. `flattenTree(nodes)` dá a lista em pré-ordem (a mesma de `renderOrder`).
- **Funções do hospedeiro** (`lab/viewer/host.ts`): `loadLibraryFromUrl(specUrl, { fetch?, fonts? })` busca a especialização, os componentes (texto) e as fontes (bytes, salvo `fonts: false`) relativos à URL dela e devolve `loadLibrary(arquivos)`; um componente ou fonte que não vem fica de fora (o `loadLibrary` relata), uma especialização não-ok ou a falta de `fetch` lançam `Error`. `registerLibraryFonts(library, host?)` registra as fontes da biblioteca (`registerFonts`) e devolve o status de cada uma. **As duas existem para o site que instala o pacote e não rodam nas páginas do laboratório**, que não fazem rede (CSP `connect-src 'none'`) e carregam a biblioteca de arquivos escolhidos ou dos exemplos embutidos.
- Também exportados: `ScreenRenderer`, `konvaMeasurer`, `loadLibrary`, `resolvePath`, `parseScreen`, `serializeScreen`, `instanceLabel`, `renderOrder`, `childrenOf` e os tipos (`TreeNode`, `LoadFromUrlOptions`, `FontStatus`, `FontHost` entre eles).

**Fontes:** o núcleo não registra fonte. O hospedeiro fornece (`@font-face` no CSS, `FontFace` de bytes ou `registerLibraryFonts(library)` com a biblioteca de `loadLibraryFromUrl`) e chama `redraw()` (ou muda `fontsVersion` no invólucro) para remedir os textos. A demonstração usa a fonte do sistema.

**Página de demonstração (`lab/react/`):** hospedeiro React 19 de verdade (`react-dom/client`, sem `preact/compat`). À esquerda, o JSON da tela numa caixa de texto: cada edição válida vira a `screen` do visualizador (atualização em tempo real); uma edição inválida mostra o erro e mantém a última tela válida. **Exemplos** e **Material 3** trocam a biblioteca e a tela. **Desmontar/Montar** exercita a criação e a destruição do viewer, o toggle **StrictMode** recria o root em modo estrito e o checkbox **Seleção pelo canvas** (ligado por padrão) liga e desliga a prop `interactive`. No centro, o visualizador e um painel com a tela, o hover, o último clique (id e posição em px da tela), a seleção (o clique seleciona), os avisos e o tempo aproximado da última edição (da edição até o efeito do invólucro, sem o desenho do Konva). À direita, a **Árvore** das instâncias (montada por `flattenTree(screenTree(screen, library))`: hierarquia pelo `parentId`, na ordem de `renderOrder`, cada linha com o rótulo e o nome do tipo): clicar numa linha seleciona (clicar de novo deseleciona), passar o mouse realça a instância no canvas (`hover`), e a seleção feita no canvas acende a mesma linha. Abaixo, as **Propriedades** (só leitura) da instância selecionada: tipo, id, caixa e os campos do tipo com os valores. Com a seleção pelo canvas desligada, a árvore é a única forma de selecionar.

**Observações da fase:**

- **Custo das atualizações frequentes.** O teste `tests/lab/viewer/viewer.test.ts` mede, em jsdom com canvas falso e medidor aproximado, a tela do Material 3 com 21 instâncias: atualizar **uma** instância leva cerca de **1 ms** e um `redraw()` completo cerca de **7,5 ms**. O diff por identidade deixa a atualização frequente proporcional ao que mudou. O desenho do Konva fica fora dessa medição (é no `requestAnimationFrame`, no máximo uma vez por quadro). Os números são de ordem de grandeza (canvas falso); a página de demonstração mostra o tempo aproximado de cada edição do JSON no navegador.
- **A API basta para o hospedeiro construir a edição para leigos por cima (conclusão da fase).** Basta para o que uma ferramenta administrativa precisa: selecionar pelo clique, realçar pelo hover vindo da lista (`setHover`), editar os campos num formulário do hospedeiro e ver o redesenho na hora (`update` com a tela nova). `boxOf`, `scale` e `clientToScreen` deixam o hospedeiro desenhar as próprias alças ou rótulos em DOM por cima do contêiner, se quiser. A seleção pela árvore e o modo sem interação no canvas (`interactive: false`) são o caminho para a ferramenta administrativa: o canvas vira pré-visualização e a edição acontece na árvore e no formulário do hospedeiro. O que o núcleo **não** dá, de propósito, é arrastar e redimensionar: isso é edição (no laboratório fica no editor; no produto, no canvas da app). Se a ferramenta precisar de arrastar, a saída é a do editor: ligar o arrasto nos grupos via `ScreenRenderer` (exportado), em vez do `createViewer`.
- **Pontos em aberto.** (1) `toDataURL` captura só o que cabe no `Stage`: com `fit` numérico maior que o contêiner, a tela sai cortada. (2) Os dois bundles duplicam o Konva: quem usar os dois no mesmo site carrega duas cópias; se incomodar, a saída é um bundle só com o invólucro dentro.
- **Tamanho.** Página `dist/lab/react/index.html`: 518 kB (491 kB antes da L2; sem nenhuma ocorrência de "preact"); `dist/lab/components/index.html`: 418 kB.

**Estrutura:**

- `lab/viewer/index.ts`: entrada pública do núcleo.
- `lab/viewer/viewer.ts`: `createViewer`, `Viewer`, `ViewerOptions` (inclui `source`, `onSource` e `screen()`, fase L2).
- `src/canvas/components/screenRenderer.ts` e `src/canvas/components/konvaMeasurer.ts`: `ScreenRenderer` (o desenho de uma tela num grupo) e `konvaMeasurer`; moveram-se do laboratório para o produto na B3 (junto com `renderScene`, hoje `src/canvas/components/renderScene.ts`, e as fontes, `src/storage/fonts.ts`, que agora é um registro criado por quem usa: `createFontRegistry`). O laboratório importa de `src/`.
- `lab/viewer/react.tsx`: `<MappingViewer/>`.
- `lab/viewer/tree.ts`: `screenTree`, `flattenTree`, `TreeNode`.
- `lab/viewer/host.ts`: `loadLibraryFromUrl`, `registerLibraryFonts` (funções do hospedeiro).
- `lab/viewer/PACKAGE-README.md`: o README do pacote (copiado para `dist-viewer/README.md`).
- `lab/viewer/build.mjs` e `lab/viewer/tsconfig.json`: build de biblioteca, pacote npm e declarações de tipo.
- `lab/react/` (`index.html`, `main.tsx`, `react.css`): a página de demonstração, com CSS próprio (`--demo-*`, sem os tokens da app); `vite.lab.config.ts` com `--mode react` (sem o plugin `preact()` nem `tokensCss()`).
- `src/model/components/layout.ts` e `src/model/components/origin.ts`: arrumação por tamanhos e declaração de origem (fase L2, ver abaixo; moveram-se do laboratório para o produto na B1); `tests/model/components/layout.test.ts`, `origin.test.ts` e `sourceScreen.test.ts` os cobrem.
- `lab/components/libraryFiles.ts`: a parte de navegador da biblioteca (`readFileList`, `readDirectory`, `pickDirectory`); a parte pura é `src/model/components/library.ts`.
- `tests/lab/viewer/`: núcleo, `ScreenRenderer`, árvore, funções do hospedeiro, invólucro e página React.

React 19 é dependência de desenvolvimento **só do laboratório**: a app continua em Preact e nada de React entra no `dist/index.html`.

## Tela a partir de um JSON sem geometria (fase L2)

**Pergunta:** dá para desenhar uma tela a partir do JSON de um backend de SDUI, que é uma árvore **sem retângulos**, sem o núcleo saber o que é SDUI? Isso pede duas coisas: cada componente se dimensionar sozinho (arrumação por tamanhos) e a especialização declarar, em dados, como traduzir o JSON externo para a biblioteca.

**Onde ver:** `https://fabianofranca.github.io/mapping/preview/lab/react/`, terceiro botão **Material 3 (SDUI)** (ao lado de **Exemplos** e **Material 3**): a caixa de texto traz `lab/components/sdui/settings.sdui.json` e cada edição válida redesenha a tela.

**Fluxo:** JSON externo → declaração de origem (`src/model/components/origin.ts`) → `LayoutScreen` (árvore sem geometria) → arrumação por tamanhos (`src/model/components/layout.ts`) → `Screen` (a descrição neutra que o visualizador já desenhava). Nada no núcleo conhece "SDUI": só a declaração da especialização, e o núcleo executa dados, nunca código vindo dela.

**Dimensionamento (`sizing`):** o componente ganha `sizing?: { width?, height? }` (px, `"fill"` ou `"hug"`; eixo ausente = px de `size`), validado em `src/model/components/parseComponent.ts`. Só vale para instâncias sem retângulo; `formatVersion` do componente continua 1 (aditivo). No Material 3: top app bar fill × 64, text field fill × 56, chip hug × 32, card fill × hug, button hug × 40, list item fill × 72, switch fill × 32, checkbox fill × 40, row, column e box fill × hug, FAB 56 × 56, navigation bar fill × 80, bottom sheet fill × hug, scrim fill × fill. O cartão ganhou um slot de ações de verdade (`layout: row`, `gap: 8`, `justify: end`).

**Arrumação por tamanhos (`layoutScreen(input, library, measure)`, em `src/model/components/layout.ts`):** calcula tamanhos além de posições. A tela é o container raiz em **coluna**, sem padding nem gap: as raízes sem âncora entram no fluxo; as com âncora são posicionadas pela âncora e pela margem. Um componente é medido por `measureComponent` (`src/model/components/instantiate.ts`), e `InstantiateOptions.slotContent` informa o tamanho do conteúdo do slot (filhos arrumados mais o padding), de modo que a altura de um container `hug` acompanha o que há dentro. As regras:

- `hug` é arredondado para cima (o texto não quebra por arredondamento) e todo tamanho final é limitado por `minSize`; o resto fica exato.
- `fill` no eixo principal dentro de pai `hug` cai em `hug`, com aviso (dentro de templates continua virando 0). No eixo cruzado de uma row `hug`, os `fill` recebem a maior altura dos outros filhos.
- `stretch` só afeta filhos `hug`; filho `hug` em column é limitado à largura do conteúdo.
- Slot invisível ignora os filhos, com aviso. Slot vazio conta só o padding (o cartão sem ações fica com o gap de 8 a mais embaixo: ponto conhecido).
- Conteúdo maior que a tela: o laboratório **avisa** (`tela: conteúdo maior que a altura da tela`) e não recorta nem recusa; o produto segue a mesma regra, avisar sem recortar nem recusar, por decisão do plano da etapa Biblioteca ([`PLAN.md`](../PLAN.md)).
- Caso de prova (`tests/model/components/layout.test.ts`): com um texto de apoio mais longo, o cartão, a coluna que o contém e o irmão seguinte crescem os mesmos 80 px. As regras de dimensionamento, com este caso, estão documentadas no produto em [`docs/COMPONENT-FORMAT.md`](../docs/COMPONENT-FORMAT.md).

O editor (`src/model/components/arrange.ts`) **não mudou**: lá o retângulo continua sendo a fonte de verdade e o layout do slot só posiciona; a arrumação por tamanhos vale para telas sem geometria. No produto, a ação "Arrumar" pode usar o `layoutScreen`.

**Declaração de origem:** reaproveita as `sources` da `formatVersion` 3 e acrescenta `origins` na raiz da especialização (a `formatVersion` 4, hoje no produto: [`docs/SPEC-FORMAT.md`](../docs/SPEC-FORMAT.md), "Origens (sources)"). `origins` é a parte executável do documento: chaves do nó, raízes da tela com âncoras, margem e película (`scrim`), valores da tela e `booleans`.

```json
"origins": [{
  "system": "sdui",
  "node": { "type": "type", "props": "props", "children": "children" },
  "screen": {
    "id": { "path": "screen.id" },
    "width": { "path": "screen.device.width" },
    "height": { "path": "screen.device.height" },
    "background": { "path": "screen.background", "values": { "surface": "#FEF7FF" }, "default": "#FFFFFF" },
    "roots": [
      { "path": "content" },
      { "path": "bottomBar", "anchor": "bottom" },
      { "path": "floating[*]", "anchor": { "path": "anchor" }, "margin": { "path": "margin" } },
      { "path": "modal", "anchor": "bottom", "scrim": "m3-scrim" }
    ]
  },
  "booleans": { "true": "sim", "false": "não" }
}]
```

Caminhos são `a.b[0].c`; `[*]` em `roots[].path` faz cada elemento virar uma raiz, e raiz cujo caminho não existe é ignorada sem aviso (tela sem FAB). Os `path` de `anchor` e `margin` são relativos ao nó da raiz. `props` e `children` são obrigatórios nesta versão (backend com props no próprio nó fica para depois). Largura ou altura ausente no documento é erro (sem tela). O mapeamento fica nos tipos e campos, no formato das `sources` da v3: no tipo, `name` é o tipo externo, mais `slot` (conferido: há um slot por componente e os filhos vão sempre para ele) e `ignore` (props aceitas e não desenhadas); no campo, `path` é o caminho dentro de `props` (o `name` é só o nome de exibição; no laboratório da L2 o caminho ficava no `name`) e `values` só vale em `enum`.

```json
{
  "id": "m3-card",
  "sources": [{ "system": "sdui", "name": "Card", "slot": "ações" }],
  "fields": [
    {
      "key": "active",
      "type": "enum",
      "options": ["1", "2", "3"],
      "sources": [{ "system": "sdui", "path": "selectedIndex", "values": { "0": "1" } }]
    }
  ]
}
```

`parseOrigins` (em `origin.ts`) é estrito (chave desconhecida é problema, com caminho) e o `loadLibrary` valida o resto e põe em `library.problems`: `slot` que não existe no componente, `values` fora das regras, `scrim` que não é tipo, caminho inválido em campo, origem repetida. `translateSource(library, json, { system? })` traduz e `screenFromSource(library, json, { system?, measure })` traduz e arruma; nenhum lança (devolvem `error` ou `warnings`). O esboço `origem-material3.sketch.json` foi apagado: a declaração real está no `M3_SPEC` (`lab/components/samplesMaterial3.ts`) e vai para o `material3.spec.json` do zip; o produto não gera mais um pacote a partir dele (a origem executável de exemplo é `examples/libraries/sdui-backend/`).

**Avisos:** tipo externo sem tipo de anotação (o nó e a subárvore ficam de fora), propriedade desconhecida (primeira chave de `props` que não é caminho de campo nem está em `ignore`; subchaves de objetos e listas conhecidos não são conferidas), valor fora das opções de um `enum`, objeto onde se esperava valor simples, âncora inválida (usa `top-start`), tipo sem componente e filhos de componente sem slot. Os avisos levam o caminho do nó (`content.children[1].props.foo`). Chaves ignoradas pelo desenho (`actions`, `binding`, `id`, `route`) não geram aviso.

**Visualizador:** `createViewer` aceita `source` (o JSON já parseado, `unknown`), `sourceSystem` (também no `update`) e `onSource(result)`; `source` vence `screen`. A tela é recalculada quando a biblioteca ou o `source` mudam (identidade) e no `redraw()`, com o mesmo medidor do desenho, e `viewer.screen()` devolve a tela desenhada. `<MappingViewer source sourceSystem onSource />` faz o mesmo. Também exportados: `screenFromSource`, `translateSource`, `layoutScreen` e os tipos (`SourceResult`, `LayoutScreen`, `LayoutNode`, `LayoutRoot`, `ScreenAnchor`). `VIEWER_VERSION` foi a 0.2.0.

**Página React:** o botão **Material 3 (SDUI)** põe a biblioteca do Material 3 e o `settings.sdui.json` na caixa de texto; a tela calculada chega por `onSource` e alimenta a árvore e as propriedades, e os avisos da origem aparecem no painel de status. Com JSON inválido ou `error` do resultado, a página mantém a última tela válida e mostra o erro. A página de componentes (editor) não importa JSON externo nesta fase. O Material 3 ganhou `Box`, `Row` e `Column` na declaração (spacing, padding, background, shape).

**Teste de contrato:** `settings.sdui.json` passa pela declaração do Material 3 com **zero avisos** (`tests/model/components/origin.test.ts` e `sourceScreen.test.ts`; o produto repete o contrato no pacote congelado `tests/fixtures/material3/`, em `tests/model/libraryExamples.test.ts`). É o modelo para o produto: os exemplos de cada componente serão o próprio JSON do SDUI e a biblioteca vira teste de contrato do backend.

**Pontos em aberto:**

- O JSON real do backend ainda não foi testado (o dono não o tem por enquanto); se for irregular demais para uma declaração, a saída é o backend ou a ferramenta administrativa normalizarem antes.
- Listas que viram campos numerados (`items[0].label` vira `label1`) são frágeis: é o argumento para a barra de navegação e o bottom sheet aceitarem campo de tabela no produto.
- ~~A declaração reaproveita as `sources` da `formatVersion` 3, com o caminho do campo (`a.b[0].c`) no `name`~~ **Fechado na B1:** o caminho do campo passou a ser a chave `path` e o `name` voltou a ser só nome, em qualquer sistema; `slot` e `ignore` entram no schema do produto (`src/model/spec.ts`), só em sistemas declarados em `origins`. O Figma (ou outro sistema) convive com a origem executável porque cada entrada tem o seu `system`, e um nome com `.` ou `[` não é mais mal lido. Ver [`docs/SPEC-FORMAT.md`](../docs/SPEC-FORMAT.md).
- Props no próprio nó (sem `props`) e vários slots por componente ficam para depois.
- O cartão sem ações fica com o gap de 8 a mais embaixo, e conteúdo maior que o slot só avisa.
- Na demonstração por desenho (botão **Material 3**), o FAB e a barra de navegação ficam sob a folha do modal; no SDUI, sem o `modal` aparecem.

## Conclusões do laboratório

Detalhes e checkboxes das fases em [`docs/history/PLAN-etapa-lab.md`](../docs/history/PLAN-etapa-lab.md). L1 (visualizador embutível) e L2 (tela a partir de um JSON sem geometria) estão concluídas; falta só o teste com o JSON real do backend, quando o dono tiver (até lá, o exemplo passa sem avisos).

**O que o laboratório provou**

- O formato `mapping-component` (template de primitivas com expressões sobre os campos), os containers com arrumação, as fontes do design system carregadas por bytes e o Material 3 escrito nesse formato funcionam.
- O **motor** (formato, parser, expressões, instanciação, cena, renderizador Konva, arrumação por tamanhos) vai para o produto. O **editor do laboratório** (`editor.ts` e a página) não vai: o canvas da app já faz esse papel.
- O visualizador embutível funciona sem framework, com invólucro React fino; uma instância custa cerca de 1 ms e o `redraw()` completo cerca de 7,5 ms. A API basta para o hospedeiro construir a edição para leigos por cima.
- Um JSON de SDUI sem geometria vira tela por uma declaração de origem executável; o núcleo executa a declaração e nunca código da especialização.

**O que o produto herda** (decisões em "Decisões registradas" de [`docs/history/PLAN-etapa-lab.md`](../docs/history/PLAN-etapa-lab.md))

- Instância = marcação com anotação tipada; o desenho é derivado e não é gravado. Tela sem imagem = imagem sem arquivo.
- Declaração de origem: chave `path` própria para o caminho do campo e `slot`/`ignore` aceitos nas `sources` de sistemas executáveis (feito na B1, em `src/model/spec.ts`).
- Em aberto: campos de tabela no lugar de listas numeradas, props no próprio nó e vários slots por componente.

**Fechamento:** o épico `epic/lab` foi mesclado na `main` em 2026-10-17 (PR #160); a etapa seguinte, a **Biblioteca**, está detalhada no [`PLAN.md`](../PLAN.md) (B1 a B5, em épico próprio).

## O que foi para o produto e o que fica no laboratório (Fechamento da Biblioteca)

Registro feito no Fechamento da etapa Biblioteca ([`docs/history/PLAN-etapa-biblioteca.md`](../docs/history/PLAN-etapa-biblioteca.md)). O motor mora em `src/` e o laboratório **importa dele**, sem cópia duplicada.

**Foi para o produto** (e as páginas do laboratório apontam para ele):

| Peça                                                                                                                                                                                   | Onde mora hoje                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Formato, parser, expressões, instanciação, cena, arrumação (`arrange`), arrumação por tamanhos (`layout`), origem (`origin`), tela (`screen`) e a parte pura da biblioteca (`library`) | `src/model/components/` (testes em `tests/model/components/`) |
| `ScreenRenderer`, `renderScene`, `konvaMeasurer`                                                                                                                                       | `src/canvas/components/`                                      |
| Fontes do design system (`FontFace` por bytes)                                                                                                                                         | `src/storage/fonts.ts`                                        |
| Pacote da biblioteca, validação nas três portas, telas com componentes, atualização com migrações e Catálogo                                                                           | app, MCP 0.5.0 e skill `spec-author` (ver `docs/`)            |

**Fica no laboratório** (fora do produto e fora das regras do núcleo):

- `lab/components/`: a página do editor de componentes (`editor.ts`, `board.ts`, `main.tsx`), os exemplos (`samples.ts`, `samplesMaterial3.ts`), `libraryFiles.ts` (a parte de navegador do carregamento) e `sdui/settings.sdui.json`. O canvas da app substitui o editor; a página continua publicada em `dist/lab/components/`.
- `lab/viewer/`: o pacote `mapping-viewer` (núcleo sem framework, invólucro React, `tree.ts`, `host.ts` e o build `npm run build:viewer`). Não é consumido pela app; é a base para um site hospedeiro embutir o desenho.
- `lab/react/`: a página de demonstração do visualizador (React 19, CSS próprio).
- `lab/shared/`: utilitários só das páginas (`download.ts`, `pinch.ts`).

**Pendências herdadas:** o teste com o JSON real do backend (depende do dono), campos de tabela no lugar de listas numeradas, props no próprio nó e vários slots por componente.

## `components/sdui/` — Exemplo de JSON do SDUI

Um arquivo, entrada da fase L2: `settings.sdui.json`, a tela de configurações do Material 3 escrita como um backend de SDUI escreveria. É uma árvore com `type`, `props`, `children`, `actions`, `binding`, `floating`, `bottomBar` e `modal`, **sem retângulos**. A declaração que o traduz (o esboço `origem-material3.sketch.json` saiu) está no `M3_SPEC`, em `lab/components/samplesMaterial3.ts`.

O que o exemplo exercita, de propósito:

- nomes diferentes dos do componente (`text` e `style` contra `label` e `variant`);
- booleanos de verdade, traduzidos para `sim`/`não`;
- valor com outro domínio (`selectedIndex: 2` vira `active: "3"`);
- listas que viram campos numerados (`items[0].label` vira `label1`); é frágil e é o argumento para a barra de navegação e o bottom sheet aceitarem campo de tabela no produto;
- propriedade aninhada (`avatar.initials`);
- elementos fora do fluxo: o FAB em `floating` com âncora, a `bottomBar` e o `modal` com scrim implícito;
- chaves ignoradas pelo desenho (`actions`, `binding`, `id`, `route`); `binding` é a relação com o modelo e viraria campo de referência na importação.

Caso de prova da arrumação por tamanhos: o texto de apoio do cartão, com altura `hug` dentro de coluna `hug`. O cartão ganhou o slot de ações na L2. O dono não consegue testar com o JSON real do backend por enquanto.
