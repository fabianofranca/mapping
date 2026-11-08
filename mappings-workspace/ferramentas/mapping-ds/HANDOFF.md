# Mapping DS — estado e como continuar

Biblioteca `especializacoes/mapping-ds/` (o design system do app Mapping como especialização) e o projeto `projetos/comentarios/` (o sistema de comentários do app, mapeado item a item com ela). Atualizado em 2026-11-08 (MCP 0.28.1).

**Onde isto mora:** `mappings-workspace/ferramentas/mapping-ds/`, dentro do próprio repositório do Mapping (antes ficava fora dele). Os caminhos dos scripts saem de `paths.mjs` (`PATHS.base` = esta pasta, `PATHS.ws` = `mappings-workspace/`, `PATHS.repo` = a raiz do repositório), então funcionam em qualquer clone; nenhum script tem caminho absoluto. As tags e o código do app (`git show mcp-v0.28.2:…`, `src/ui/icons.tsx`) são os do repositório onde esta pasta está. `app/`, `app25/`, `mcp25/` e as saídas de `shots/` não vão para o git (ver o `.gitignore` do `mappings-workspace/`) e se recriam: `app/` e `app25/` com o `git clone --local` da tabela abaixo (a tag é `mcp-v0.28.1` e `mcp-v0.25.0`); `mcp25/` é o `mapping-mcp.js` da release 0.25.0.

## Onde estamos

- **Biblioteca:** `mapping-ds` **v9** (especialização 15, componentes no formato 4): 83 tipos, **62 com desenho**, 18 estruturais, só Arrow, Container e ComponentDrawing sem desenho (são a seta, o container e o desenho do próprio canvas). 0 erros e 0 avisos. Os 43 tipos novos da v9 foram feitos em grupos (`v9/<grupo>/`: `revisao`, `detalhes`, `telas`, `dialogos`, cada um com `lib.mjs`, `rules.mjs` e `screens.mjs`; regras em `v9/README.md`).
- **Propostas (2026-11-08):** `p/5e37a21f` (v9 1/2) aplicada; abertas `p/9bd4f34d` (tranca os 20 containers, as notas e as setas) e `p/9ac74bcb` (v9 2/2: as 13 telas restantes, já trancadas). O MCP aceita no máximo 1000 operações por proposta.
- **Projeto `comentarios`:** Editor, Configurações › Identidade, Apagar a conversa, Apagar conversas em lote, Pinos e as notas; com a v9, mais 28 telas medidas (Detalhes, diálogos, revisão, tela inicial, catálogo, avisos, árvore, minimapa, zoom).

## Decisões do dono (não reabrir)

1. **Cada item visível é uma marcação editável** ("como num IDE"): botão, texto, ícone, selo, campo, aba, opção de Segmented, linha de tabela. Compostos (ThreadMessage, ThreadsSection, Composer, CommentsWindow, StatusBar, ToolWindow, Menu, ProposalCard, Tabs, Segmented…) desenham **só a moldura**; o conteúdo é marcação filha.
2. **Biblioteca sem avisos.** Todo tipo tem `code` (primitivos: JSX `span`/`div` com a classe do CSS; Aba = `TabItem`; Opção = `SegmentedItem`).
3. **Layout medido do app real, não posicionado à mão**, e **conferido visualmente no app** antes de propor.
4. Fonte e cores do app: tokens `font-sans`/`font-mono` (a pilha do tema do hospedeiro) e os tokens claro e escuro de `src/theme/tokens.ts`.
5. **Projeto trancado: só comentários.** Tudo (containers, marcações, notas, setas) fica trancado; tela nova nasce trancada no próprio lote (`update_container` com `locked` e `markingsLocked` no fim). Mudança de geometria ou remoção em item trancado chega na proposta marcada `locked` e pode ser aceita; a trava não impede editar valores de anotação na app.

## O pipeline (esta pasta)

| Arquivo | O que faz |
| --- | --- |
| `lib.mjs` | Os desenhos (componentes), documentos, exemplos, campos e a migração. Ícones avaliados do `src/ui/icons.tsx` do repo. Organizado em blocos "Revisão N" (o último vence). |
| `build-spec.mjs` | Os tipos (id, descrição, `code` conferido no repo) e a versão; grava o pacote em `especializacoes/mapping-ds/`. **Suba `version` a cada mudança** (a aplicada é a do projeto). |
| `app/` | Clone compilado do repo do Mapping em **mcp-v0.28.1** (fora do git): é o que desenha a prévia (formato 4). Recriar: `git clone --local ../../.. app && cd app && git checkout <tag> && npm ci && npm run build` (com `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; o Chromium do cache do Playwright já serve). |
| `app25/` | O mesmo em **mcp-v0.25.0**: o app cujo layout o projeto mapeia. É o que `extract.mjs` mede (`SRC=…/app25`). |
| `shots/fixture.mjs` | Remonta em `shots/fixture/` o projeto comentarios de antes da v5 (as conversas de teste ancoram em marcações que a v5 apagou). É o que `extract.mjs` abre. Diferença conhecida: as notas foram movidas depois, então o zoom ajustado sai 11% (o projeto tem 12%) e o minimapa muda. |
| `shots/extract.mjs` | Abre o app real (`SRC`, padrão `app/`; use `app25/`) com a fixture + conversas de teste, a 1440 × 900, e converte cada elemento do DOM num item da biblioteca → `shots/extracted.json` (+ `real-*.png`). Texto dentro de `text-overflow: ellipsis` leva `tw` (largura do texto) e `cw` (do conteúdo da caixa): o app corta quando `tw > cw`. `extracted-v7.json` é a extração anterior. |
| `shots/fixture.mjs` + `shots/review-fixture.mjs` | A fixture no schema 15 (o app 0.25 não lê o 18) e, para o modo revisão, uma proposta aberta de teste gravada com o MCP 0.25 (`mcp25/`). `extract.mjs` (telas existentes) roda com a fixture **sem** a proposta; `screens-v9.mjs` (telas novas), com ela. |
| `shots/extractor.mjs` | O extrator como módulo (`openApp`, `extract` com regras de fora). |
| `shots/ops-v9.mjs`, `screens-v9.mjs`, `split-v9.mjs` | Operações da v9: casa a medição nova com o projeto (troca a anotação de uma marcação substituída em vez de apagá-la, que levaria as filhas), cria as telas novas e divide em lotes de até 1000. Todo campo vai explícito (null quando vazio): campo omitido o MCP completa com o exemplo do componente. |
| `v9/preview.mjs <grupo>` | Prévia de um grupo: pacote próprio, validação, medição das telas do grupo e captura na app 0.28.1. |
| `shots/ops-v8.mjs` | Da extração: `reticencias` "sim" (e a largura da caixa) nos textos que o app corta e o tamanho medido nos textos menores que 8 px → `ops-min.json`. Modelo para correções pontuais de valores e retângulos. |
| `shots/text-ops.mjs` | `node text-ops.mjs <final-antes> <final-depois>` (os `FINAL=` de duas rodadas do `gen.mjs`, com `IN=` para a extração antiga): só os textos que mudaram viram `update_marking`/`update_annotation` em `ops-min.json`. Para correções pontuais, sem recriar containers (o `gen.mjs` recria tudo com ids antigos). |
| `shots/gen.mjs` | De `extracted.json`: `preview-N.zip` (projeto de prévia por container) e `ops.json` (operações da proposta). |
| `shots/shoot2.mjs` | `node shoot2.mjs preview-0.zip saida.png [larg alt]`: abre a prévia no app e captura o canvas. `KEYS=Control+Shift+5 FULL=1` abre a janela Incompletas. |
| `shots/zooms.mjs` | `node zooms.mjs <prefixo-do-id-do-container> <base> 50 100 200`: captura um container do projeto em vários zooms. `DSF=3` densidade, `VW`/`VH` viewport, `KEYS=Alt+h` modo Visualizar, `CLIP50=x,y,w,h` recorte, `LIB=<pasta>` usa a biblioteca da pasta, `OPS=<ops-min.json>` aplica os `update_marking`/`update_annotation` em memória (prévia da proposta), `DM=dark` desenha no modo escuro. O container do Editor fica 1:1 a 144%. |
| `shots/mcp-propose.mjs` | `node mcp-propose.mjs plan_changes` (simula) ou `propose_changes` (envia, com título/descrição/origem de `shots/ops-meta.json`), com `shots/ops-min.json`, falando direto com `tools/mapping-mcp.js`. |

Ciclo: editar `lib.mjs`/`build-spec.mjs` → `node build-spec.mjs` → `validate_library` (com `previous` = `projetos/comentarios/specs/mapping-ds/mapping-ds.spec.json`) → `node shots/extract.mjs` → `node shots/gen.mjs` → conferir a prévia com `shoot2.mjs` → propor.

## Limitações descobertas (motor de componentes / app)

Resolvidas na 0.28.1 e já usadas na v8: `hug` com `fill` (medição em duas passagens), `justify` por expressão, ponta/canto do traço (`cap`/`join`, e no conjunto de ícones), traço `outside` recortado, mínimo de 8 px (1 px para tipo com componente), `values` parciais (#746), pilha de fonte (#748), reticências (`font.wrap`/`ellipsis`), pino em pixels de tela (`screen`), agrupador estrutural, tema escuro (`tokens` + `drawingMode`). As que ficam:

- **Konva, `wrap: "none"` com largura fixa, tira a letra que passa da caixa** (mesmo por 0,03 px): por isso o Texto sem reticências é `hug` e só o com `reticencias` "sim" tem largura fixa.
- **Konva quebra a última palavra** se a caixa ficar fração de px mais estreita: texto arredondado para fora; parágrafo com a largura da caixa onde o DOM quebra.
- **Chip no meio do texto**: o formato tem `runs` com caixa em linha, mas aqui o chip é marcação própria (decisão 1); o lugar dele no Texto começa com U+2060 (o Konva apaga espaços, inclusive U+00A0, do começo da linha quebrada).
- **`stroke.sides` com os quatro lados** traça retas (perde o canto redondo): a Caixa continua com um retângulo de 1 px por lado.
- **`stroke.dash` não aceita expressão**: o rascunho do pino é um nó próprio.
- **Largura do pino**: o app usa 7 px por caractere + 16; o desenho usa o rótulo medido + 16 (4 caracteres saem ~5 px mais estreitos). Falta aritmética no formato (#869 A5).
- **Sombra**: uma por nó, `x`/`y`/`blur` literais (só a cor é token, #869 A1), sem `spread` nem `inset`.
- **Prova de desenho sem tokens** (#869 A3): o validador mede com 14 px se `font.size` vier de token; por isso os tamanhos de fonte seguem literais.
- **Estados de interação** (hover, foco, pressionado) não desenhados: o formato já permite um campo `estado` (#869 Frente C); o anel de foco por fora (`outline-offset`) depende da #869 A15.
- **Linha de base** (`verticalAlign` só top/middle/bottom; #840, #869 A7) e **altura pelo conteúdo** numa marcação com retângulo (#869 A8).
- **Zoom baixo:** os pontos azuis de anotação continuam por cima dos itens (somem só abaixo de 24 px de tela).

## Próximos passos / em aberto

- **Ver aplicadas** `p/9bd4f34d` (trava) e `p/9ac74bcb` (v9 2/2) e ler `get_proposal_review` de cada uma. Depois, tudo trancado e 33 telas no projeto.
- **Diferenças que ficaram da v9** (cada uma é um campo ou opção aditiva numa próxima versão):
  - TextField sem estado desabilitado (no app: transparente, sem borda, 45% de opacidade; ex. nomes "Notas" e "Mapping" na lista de camadas) e sem placeholder (hoje um Texto `muted` por cima do campo);
  - Button sem a variante `link` ("+ Linha", "+ Par" saem como Texto `accent`);
  - Selo sem o estilo `erro` (a lista de problemas de pacote usa Caixa + Texto);
  - peso 700 desenhado como 600 (só existe `t-body-strong`);
  - pontos de camada da árvore como Caixa sem a cor da camada (o `layer-group` `ponto` tem `cor`; falta a regra do grupo telas usá-lo);
  - `image-compare` não conferido em captura (a fixture não tem imagem trocada);
  - Arrow, Container e ComponentDrawing sem desenho (são a seta, o container e o desenho do próprio canvas).
- **Avisos aproximados da prova do servidor** (18 marcações, sem pendência no projeto): medem com a fonte livre do MCP, não com a do app; conferir na app se algum vira "não cabe" de verdade (o chip de citação de 2 linhas na janela Propostas falta 141 px: o CitationChip é de uma linha).
- O fundo de um container (`background`) não segue o modo do desenho: o "Pinos das conversas — estados" (#E4E7EB) fica claro no escuro; uma Caixa `fundo` `canvas` resolve.
- **Só comentários de verdade:** a trava não impede editar valores, renomear nem criar anotações na app; não existe modo somente leitura. Se o dono quiser, abrir issue pedindo um modo de projeto somente leitura com conversas liberadas (oferecido, ainda não aberto).
- O layout do projeto é o da app 0.25; a 0.28 mudou telas (perspectivas, modo do desenho, barra de status, Configurações). Remedir com `app/` é decisão do dono.
- Decisões do dono ainda em aberto: chip da citação como `runs` ou continua marcação; campo `estado` (hover/foco/pressionado) nos controles (#869 Frente C).
- "Aguardando agente" sobre "há 3 h" na tabela de conversas é do próprio app.

## Ambiente e issues

- Workspace no **MCP 0.28.2** (`./setup.sh` normal funciona de novo; a correção do download é a #877). O `watch-comments.mjs` veio com a 0.28.2.
- O projeto vivo está no schema 18, com a perspectiva "Limpa" e `drawingMode` `dark` (do dono): a fixture volta ao schema 15 e a prévia (`zooms.mjs`, `v9/preview.mjs`) zera as perspectivas e força `light` (`DM=dark` para o escuro).
- Limites do motor achados aqui estão na #869 (A16 a A20); fechadas: #746, #747, #748, #877.
- `mcp25/mapping-mcp.js` (0.25.0) só grava a proposta de teste da fixture; o resto usa `tools/mapping-mcp.js`. `shots/mcp-propose.mjs` passa por `operationsFile` (`shots/lote/`) acima de 1000 operações, mas o MCP recusa mais de 1000 por proposta de qualquer jeito: dividir (`split-v9.mjs`).
