# Propostas de alteração — passagem para implementação

Documento de passagem do desenho da etapa 4 (propostas de alteração com revisão), feito com o Claude Design. É a referência das fases 4.3 (estado) e 4.4 (interface); o `PLAN.md` aponta para cá. Complementa o [`HANDOFF.md`](HANDOFF.md) do redesenho: tudo o que não é citado aqui segue o design system 2.0 como está.

| Fonte                                     | Endereço                                          | O que tem                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas “Propostas de alteração”           | https://claude.ai/artifact/7gTGB3ACoBQGgN1VqbSgqs | Rodada 1 (modo revisão, desktop), Rodada 2 (Propostas, retomada, vazio, grande), Rodada 3 (celular), Bases. Pranchetas duplas mostram escuro à esquerda e claro à direita |
| Design system **Mapeador de Imagens 2.0** | https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9 | Atualizado com esta etapa: 10 componentes, 7 ícones, 2 tokens, seção Revisão, atalhos e contraste                                                                         |

Os artifacts são privados: só abrem para quem tiver acesso compartilhado pelo dono. As pranchetas foram escritas, mas **não foram renderizadas nem conferidas visualmente** pelo autor; a revisão visual é do dono.

**Regras que continuam valendo** (CLAUDE.md): um único `dist/index.html` que funciona em `file://`; sem requisições de rede; CSP sem `style=""` nem handlers inline; `src/model/` sem APIs de navegador; toda mutação por action do store; estado do projeto separado do estado da UI; nenhuma string fixa (pt-BR e en-US, com +30% em inglês); nenhum valor de design fora dos tokens; Konva só em `src/canvas/`; desktop primeiro e utilizável em 380px com toque (alvos de 44px).

> As pranchetas usam `style=""` e medidas soltas **só como maquete**. Na implementação, tudo vira classe com `var(--…)`, como nas demais janelas.

---

## 1. Mapa das telas

| Tela ou estado                                                | Prancheta (página do canvas)                                                                       | Onde entra na app                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Modo revisão, visão geral (escuro e claro)                    | `R-Escuro`, `R-Claro` (Rodada 1)                                                                   | `ReviewBar`, Árvore, canvas, janela Propostas em modo revisão, Detalhes       |
| Rejeição com dependências e nota                              | `R-Rejeicao` (Rodada 1)                                                                            | Detalhes (bloco de decisão e nota), aviso “rejeitadas junto”                  |
| Aplicar bloqueado                                             | `R-Bloqueado` (Rodada 1)                                                                           | `ReviewBar` (sinalizador), janela Propostas (aviso), `ChangeCard` “Envolvida” |
| Marcas do canvas, selos, comparação                           | `Marcas` (Rodada 1)                                                                                | `src/canvas/` (renderers de revisão) e `ImageCompare`                         |
| Faixa de revisão e variações em pt-BR e en-US                 | `Faixa` (Rodada 1)                                                                                 | `ReviewBar` (estados padrão, filtros, bloqueada, sem aceitas, compacta)       |
| Janela Propostas, lista e aviso de proposta nova              | `R2-Lista` (Rodada 2)                                                                              | Janela inferior ao lado de Lista e Incompletas                                |
| Estado vazio                                                  | `R2-Vazio`                                                                                         | Janela Propostas sem propostas                                                |
| Retomada: reabrir no último item com os mesmos filtros        | `R2-Retomada`                                                                                      | Estado da revisão (UI por dispositivo)                                        |
| Sair da revisão com aceitas não aplicadas                     | `R2-Saida`                                                                                         | Diálogo de saída                                                              |
| Projeto editado entre sessões: conflitos novos                | `R2-Conflitos`                                                                                     | Conflitos recalculados ao reabrir                                             |
| Proposta substituída: o que ficou para trás                   | `R2-Substituida`                                                                                   | Janela Propostas e Detalhes                                                   |
| Proposta grande (412 mudanças, 14 imagens)                    | `R2-Grande`                                                                                        | Janela Propostas agrupada por imagem, progresso                               |
| Celular: lista, vazio, revisão, gaveta, níveis, filtros, menu | `M2-Lista`, `M2-Vazio`, `M2-Revisao`, `M2-Gaveta`, `M2-Niveis`, `M2-Filtros`, `M2-Menu` (Rodada 3) | Telas cheias da faixa de abas, gaveta de Detalhes, menu “Painéis e ações”     |
| Celular: saída, comparar, conflitos, substituída, grande      | `M2-Saida`, `M2-Comparar`, `M2-Conflitos`, `M2-Substituida`, `M2-Grande` (Rodada 3)                | Diálogo em tela cheia, `ImageCompare` em tela cheia, demais estados           |
| Bases reutilizadas (não precisam de revisão)                  | `Review`, `MReview`, `ReviewBar`, `ShotCheckout` (Bases)                                           | —                                                                             |

Dados de exemplo das pranchetas (úteis para fixtures de teste e e2e): proposta principal “Checkout a partir do Figma” com 38 mudanças (15 aceitas, 6 rejeitadas, 17 pendentes, 3 conflitos); variações com rejeição (10/11/17), bloqueada (16/7/15: “Rodapé” reduzido aceito e posição do “Botão Pagar” rejeitada deixam o botão 40px fora do pai), desatualizada (5 conflitos, revisão 41 → 44), substituída “Checkout v1” (2 aceitas, 1 rejeitada, 4 pendentes) e grande “Loja v4 · importação completa” (412 mudanças: 138/9/265, 7 conflitos, 14 imagens).

---

## 2. Componentes

### 2.1 Novos (10) e justificativa

Nenhum componente novo foi criado se um existente servia. Para cada um: por que o existente não serve.

| Componente        | Para quê                                                                                | Por que não reaproveitar                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `DecisionMark`    | Estado de decisão (sem decisão, aceita, rejeitada, parcial) de um nível, só leitura     | `Choice` é entrada, não status, e não tem “parcial” com forma própria; `Chip` é texto. O estado precisa ser dito pela forma, não só pela cor |
| `DecisionControl` | Par ✓ ✕ que decide um nível; apertar o marcado limpa a decisão                          | `Segmented` é escolha única sem “nenhum” e ocupa o dobro. É montado com `IconButton` e `Button` mais as variantes `--accept` e `--reject`    |
| `ChangeKind`      | Selo neutro do tipo de mudança (criada, removida, movida, alterada, imagem trocada)     | Não existe selo de tipo; verde e vermelho estão reservados para aceita e rejeitada, então o tipo precisa de forma e ícone neutros            |
| `Flag`            | Pílula de 18px com um fato sobre a linha (Conflito, Trancado, junto, Envolvida, status) | `Chip` é controle de 24px (filtrável, removível); aqui é rótulo não interativo, mais baixo, com variantes semânticas                         |
| `DiffValue`       | Valor atual, antes e depois de um campo                                                 | `PropertyGrid` mostra valor editável. Aqui são até três linhas somente leitura, sem vermelho e verde                                         |
| `ChangeCard`      | Uma mudança nos Detalhes (decisão, tipo, campo, valores, ajuda)                         | Composição dos componentes acima; `Notice` e `LayerGroup` não têm cabeçalho com decisão nem corpo de comparação                              |
| `ReviewRow`       | Linha dos níveis Proposta → Imagem → Item → Mudança com resumo e decisão                | `TreeRow` tem uma coluna de rótulo. A revisão precisa de resumo (contagens ou antes → depois) e decisão alinhados em colunas                 |
| `ProposalRow`     | Linha da lista de propostas (título, status, origem, autor, data, contagens, ação)      | `DataGrid` é tabela editável de valores; a lista precisa de duas linhas de contexto, status e botão de ação                                  |
| `ReviewBar`       | Faixa do modo revisão com título, andamento, contagens e as quatro ações                | `Notice` e `StatusBar` não são barras de comando. Reutiliza `Button`, `IconButton` e `Tooltip`                                               |
| `ImageCompare`    | Antes/depois de uma imagem trocada (lado a lado, deslizar, sobrepor)                    | Não existe comparação de imagens; a alça é `role="slider"`                                                                                   |

Além deles, o `CanvasMarking` ganhou as **marcas de revisão** (seção 4). Cada componente tem guia e prévia com todos os estados no design system (`components/<Nome>/`).

### 2.2 Variantes de componentes existentes

| Existente         | Variante                           | Uso                                                                           |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `Tabs`            | `mp-count--info`                   | Contador azul na aba Propostas quando chega proposta nova                     |
| `ToolStripButton` | `mp-sb__badge--info`               | Selo numérico na faixa lateral                                                |
| `Notice`          | `mp-notice--info`, `mp-notice--sm` | Aviso de proposta nova; avisos compactos dentro da janela (ex: item trancado) |
| `TextField`       | `mp-field--area`                   | Campo de nota em várias linhas                                                |
| `Button`          | `mp-btn--accept`, `mp-btn--reject` | “Aceitar item” e “Rejeitar item” nos Detalhes                                 |
| `IconButton`      | `mp-ib--accept`, `mp-ib--reject`   | Versão de ícone do `DecisionControl`                                          |

### 2.3 Reaproveitados sem mudar

`Button`, `IconButton`, `Segmented` (Atual / Proposto e modos de comparação), `Tabs`, `ToolWindow`, `TreeRow` (Árvore), `PropertyGrid`, `LayerGroup`, `Notice`, `StatusBar`, `Breadcrumbs`, `BottomSheet` (gaveta e filtros no celular), `Tooltip`, `Dialog` (lembrete ao sair), `TextField` (busca e nota), `Chip` (filtros), `Select` (imagem e camada) e `Choice` (“Só conflitos”). Cores `cv-*` do canvas.

### 2.4 Onde implementar (sugestão)

Controles de formulário continuam vindo de `src/ui/controls/`; os componentes novos entram em `src/ui/review/` (um arquivo por componente, Preact funcional, sem lógica de negócio). Ícones novos em `src/ui/icons.tsx`. As contagens, os níveis, as pendências e os conflitos vêm de `src/store/derived.ts` (memoizado pela versão do projeto e da proposta); os componentes só leem. Marcas de revisão em `src/canvas/` (renderers lendo tokens; nada de cor em TypeScript).

---

## 3. Tokens e ícones

### 3.1 Tokens novos (2)

| Token                   | Valor                                         | Por que                                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cv-badge`              | `rgba(10, 12, 16, 0.9)`, igual nos dois temas | Fundo do selo de tipo sobre a foto. Com `cv-halo` (72%), o `cv-invalid` caía a 2,9:1 sobre foto branca. Com `cv-badge`, o pior caso é 5,6:1 (`cv-line` 15,5:1, `cv-warning` 9,6:1)                                                                                                       |
| `size-tw-bottom-review` | `344px`                                       | Altura inicial da janela inferior em modo revisão (cabeçalho, filtros, cerca de nove linhas de 28px e rodapé de atalhos). Sem ela, o padrão da janela inferior esconde as linhas que a revisão precisa. A pessoa continua podendo redimensionar, e a altura escolhida é guardada à parte |

**Nenhuma cor de tema nova.** Aceita usa `color-success`, rejeitada `color-danger`, conflito `color-warning`, novo e selo REVISÃO `color-accent` com `color-accent-text`, seleção `color-selection`. As tabelas de contraste (todos os pares passam AA nos dois temas) estão na seção Contraste do design system.

### 3.2 Ícones novos (7)

`proposal`, `moved`, `changed`, `replaced`, `compare`, `note`, `blocked`: grade de 16×16, traço de 1.25, sem preenchimento, `currentColor`. Os caminhos SVG estão em `assets/Icons/` do design system; copiar para `src/ui/icons.tsx` no formato dos demais. Os estados de decisão **não** são ícones: são o `DecisionMark`.

### 3.3 Medidas que as pranchetas usam e não viraram token

Colunas do `ReviewRow` (`minmax(0, 1fr) 232px 60px`), do `ProposalRow` (`minmax(0, 1fr) 236px 92px`), linha de 52px e cabeçalho do cartão de 52px no celular. Na implementação, derive de `size-row`, `space-*` e `size-touch` quando possível. Se o teste `tests/theme/tokenLiterals.test.ts` recusar o literal, criar `size-review-col-summary` e `size-review-col-action` em `src/theme/tokens.ts` e registrar a decisão no PR.

---

## 4. Linguagem visual da revisão

1. **A forma diz o tipo; a cor diz a decisão.** Verde e vermelho só significam aceita e rejeitada, e sempre acompanhados da forma do `DecisionMark`. O tipo da mudança é neutro: **+** criada, **−** removida, **⇄** movida, **∿** alterada, duas molduras para imagem trocada.
2. **Decisão de três estados** em `DecisionMark`: círculo tracejado = sem decisão; cheio com ✓ = aceita; cheio com ✕ = rejeitada; metade esquerda cheia = parcial (sempre com as contagens ✓ · ✕ · ○). No nível “mudança” só existem os três primeiros.
3. **Regra do item:** um item com vários campos mostra o tipo dominante, na ordem criada > removida > alterada; “movida” só quando a posição é a única coisa que muda.
4. **Marcas no canvas** (`src/canvas/`), todas legíveis em foto clara e escura (linha `cv-line` com halo):

   | Marca                       | Desenho                                                                      |
   | --------------------------- | ---------------------------------------------------------------------------- |
   | Criada                      | Linha tracejada e selo +                                                     |
   | Movida                      | Fantasma pontilhado na posição antiga (`opacity-ancestor`) e selo ⇄          |
   | Removida                    | Hachura clara e escura, nome riscado e selo −                                |
   | Alterada                    | Linha dupla de 3px e selo ∿                                                  |
   | Conflito                    | Selo ⚠ em `cv-warning`, somado ao tipo                                       |
   | Rejeitada                   | Pontilhada e esmaecida, selo ✕ pontilhado; **não aparece** na visão Proposto |
   | Inválida (bloqueia Aplicar) | 2px tracejada em `cv-invalid` e ⚠                                            |
   | Trancada                    | Cadeado depois do nome                                                       |
   | Imagem trocada              | Dois quadros no selo; botão “Comparar” abre `ImageCompare`                   |

   O selo (`mp-cv-ks`, 16px) fica no canto superior direito sobre `cv-badge`, no máximo dois por marcação; em zoom baixo ou com muitas marcas só aparecem os de alterada, removida e conflito. Nada se entende só pela cor.

5. **“Criada” × “a revisar”:** as duas usam linha tracejada. Criada leva o selo +; “a revisar” (reescalada) leva ⚠ e nenhum selo de tipo.
6. **Atual / Proposto** é um `Segmented` ao lado dos breadcrumbs; a legenda das marcas fica num popover (`L`).

---

## 5. Comportamento por tela

### 5.1 Janela Propostas (lista)

- Janela inferior, ao lado de Lista e Incompletas; no celular, tela cheia da faixa de abas. Atalho oficial **Ctrl+Shift+7**; **Alt+7** como extra onde o navegador não o intercepta (decisão 1 do `HANDOFF.md`).
- Grupos “Abertas” e “Fechadas” (linhas `mp-pg`). Cada `ProposalRow` mostra título, status (`Nova`, `Em revisão`, `Substituída`, `Aplicada`, `Retirada`), origem, autor, data relativa e as contagens pendentes, aceitas, rejeitadas e conflitos, mais a linha **“N aceitas aguardando aplicação”** quando houver. Ação: Revisar (primário na que chegou e ninguém abriu), Continuar (em andamento) ou Ver (fechadas).
- **Proposta nova:** `Notice` informativo no canto do canvas com “Revisar”, selo numérico na faixa lateral e item na barra de status. Só uma `Flag` “Nova” por janela.
- Busca por título, origem e autor.
- **Vazio:** ícone, “Nenhuma proposta ainda”, uma frase sobre como as propostas chegam (servidor MCP), “Como o agente envia propostas”, “Verificar a pasta agora” e a nota de que projetos do navegador e zips também mostram e aplicam propostas.

### 5.2 Modo revisão

- **Faixa** (`ReviewBar`, 40px, `color-selection`, filete `color-accent`) logo abaixo da barra principal: selo REVISÃO, título, origem, progresso, contagens (pendentes, aceitas, rejeitadas, conflitos), **Rejeitar tudo**, **Aceitar tudo**, **Aplicar aceitas · N** (único primário) e **Sair da revisão**.
- O projeto fica **somente leitura**: barra principal desabilitada, “Somente leitura” na faixa e na barra de status. Editar exige sair.
- **Canvas “como ficaria”** com as marcas da seção 4; **Atual / Proposto** troca o que é desenhado. Imagem trocada: botão “Comparar” (`ImageCompare`: lado a lado, deslizar, sobrepor).
- **Árvore** com o selo `ChangeKind` e o `DecisionMark` por imagem e por item; serve de navegação da revisão.
- **Janela Propostas em modo revisão:** filtros (tipo, imagem, camada, decisão, só conflitos) e as `ReviewRow` dos níveis Projeto, Imagem, Item e Mudança; rodapé com os atalhos principais. Enter seleciona e centraliza no canvas; ←/→ recolhem e expandem.
- **Detalhes** do nível selecionado: `ChangeCard` por mudança (decisão por mudança), bloco “Aceitar item / Rejeitar item” e campo de **nota** (`mp-field--area`) em qualquer nível. A nota numa rejeição é sugerida, nunca obrigatória.
- **Decisões gravam na hora**, sem confirmação (são reversíveis). **Aceitar tudo / Rejeitar tudo** valem para o que a lista mostra; com filtros ativos o rótulo vira “Aceitar 12 visíveis” e aparece o aviso “Filtros ativos”. Rejeitar com dependências (“4 mudanças rejeitadas junto: 1 marcação filha e 3 anotações”) e os lotes mostram um `Notice` com **Desfazer** (ver decisão 3 da seção 8).
- **Dependências** (resolvidas sozinhas, sempre explicadas): aceitar uma mudança dentro de um item criado aceita a criação (e a dos ancestrais criados); rejeitar a criação rejeita o que depende dela (“3 anotações rejeitadas junto”, `Flag` “junto” com o ícone de elo); aceitar a remoção aceita a cascata (“+2 marcações”).
- **Conflito:** `ChangeCard` com três linhas, **Atual / Antes / Depois**, e a ajuda do efeito (“Aceitar sobrescreve o valor atual; rejeitar mantém”). Aceitar e rejeitar têm `aria-label` com o efeito.
- **Item trancado:** `Notice` de aviso acima dos cartões; aceitar é permitido e a trava continua depois.
- **Aplicar bloqueado:** botão primário desabilitado com a dica do motivo; sinalizador vermelho “N conjunto inválido” na faixa leva ao problema; a janela mostra o aviso com o que está inválido e as linhas envolvidas ficam marcadas (`is-invalid`, `Flag` “Envolvida”, marca inválida no canvas). As duas saídas são oferecidas: aceitar a mudança que falta ou rejeitar a que causa o problema.
- **Aplicar aceitas** (`Ctrl+Enter`): uma entrada de desfazer do projeto; as decisões e o estado `applied` ficam na proposta.

### 5.3 Retomada

- **Sair da revisão** nunca perde nada. Com aceitas não aplicadas, o diálogo lembra (“Há 15 mudanças aceitas que ainda não foram aplicadas ao projeto”) e resume o que fica (aceitas, rejeitadas, sem decisão). Ações: **Aplicar agora · N** (primário), **Sair mesmo assim** e **Continuar revisando**. Sem aceitas pendentes de aplicação, sair não pergunta nada.
- **Reabrir** volta ao último item visto, com os mesmos filtros e a mesma visão Atual / Proposto. É estado de UI **por dispositivo** (`localStorage` com try/catch), indexado pelo id da proposta, fora da proposta e do desfazer. Se o último item não existir mais (proposta alterada por fora), cai na primeira pendente.
- **Projeto editado entre sessões:** as mudanças afetadas voltam como **conflito** (`Flag` “Conflito novo” só na primeira abertura depois da edição), sem perder as decisões das demais.
- **Proposta substituída:** a proposta antiga mostra `Flag` “Substituída” e a lista diz “2 aceitas e 4 sem decisão ficaram para trás”. Linhas agrupadas em “Sem decisão / Aceitas sem aplicar / Rejeitadas”. As pendentes ficam desabilitadas (não podem mais ser aplicadas); as aceitas ainda podem. Cada mudança que ficou para trás diz se é **igual**, **diferente** ou **não consta** na proposta nova (ver decisão 4 da seção 8).

### 5.4 Proposta grande

- Centenas de mudanças: a janela lista por imagem, com `mp-prog` de progresso por imagem e “Aceitar imagem” no cabeçalho; os grupos começam recolhidos, exceto o da imagem selecionada. **N** pula para a próxima pendente mesmo dentro de grupos recolhidos (expande e rola).
- Implementação: **virtualizar** a lista (as 412 mudanças são só o exemplo; o limite deve ser de milhares), contagens por imagem vindas de `derived.ts` sem recalcular a cada decisão do projeto inteiro, e o canvas desenha só as marcações da imagem em tela.

### 5.5 Celular (380 × 760, toque)

Nenhuma função do desktop some; as janelas viram telas cheias e a gaveta e o menu absorvem o resto.

| Elemento                  | Como fica                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra de cima             | “Sair” (fantasma, com seta), nome do projeto, `Flag` “Somente leitura” e o menu ⋯ “Painéis e ações”                                                                                                                                                                                               |
| Faixa de revisão          | `mp-mstrip`: selo REVISÃO e título numa linha; progresso e contagens (pendentes, aceitas, rejeitadas, conflitos) na outra. Fica entre a barra e o canvas                                                                                                                                          |
| Canvas                    | Atual / Proposto (`Segmented`) e, sobre o canvas, “Comparar antes e depois” e “Legenda das marcas”                                                                                                                                                                                                |
| Gaveta de Detalhes        | Recolhida (64px): nome do item, Aceitar e Rejeitar o item e a seta para abrir. Aberta (72%): `ChangeCard` de cada mudança, com “Tela cheia” e “Recolher”. Cabeçalho do cartão de 52px                                                                                                             |
| Barra de baixo            | Botões de 44px: Painéis (menu), Filtros, Próxima pendente e **Aplicar aceitas · N** (primário)                                                                                                                                                                                                    |
| Níveis (janela Propostas) | Tela cheia da faixa de abas: linha de filtros rápidos (`Chip` com contagem), linhas de 56px (resumo na segunda linha) com `DecisionControl` de 44px. Barra de baixo: “Em lote” (aceitar ou rejeitar tudo), Próxima pendente e Aplicar aceitas · N; numa proposta substituída entra “Abrir a nova” |
| Filtros                   | `BottomSheet` de 68%: Decisão e Tipo de mudança em `Chip`, `Select` de Imagem e de Camada, `Choice` “Só conflitos (N)”; “Limpar” no topo e “Mostrar N mudanças” (primário) no rodapé                                                                                                              |
| Menu “Painéis e ações”    | Seção Painéis (Árvore, Camadas, Detalhes, Lista, Incompletas, Diagnóstico e Propostas com o contador) e seção Revisão (Aceitar tudo, Rejeitar tudo, Legenda das marcas, Sair da revisão)                                                                                                          |
| Comparar imagem           | Tela cheia com `ImageCompare` (modos no `Segmented`, alça de 44px) e a decisão da troca de imagem abaixo                                                                                                                                                                                          |
| Lembrete ao sair          | Tela cheia com o resumo (aceitas, rejeitadas, sem decisão), a frase de que nada se perde e três botões empilhados: **Aplicar agora · N**, **Sair mesmo assim** e **Continuar revisando**                                                                                                          |

---

## 6. Atalhos (valem enquanto a revisão está aberta e o foco não está num campo de texto)

| Ação                        | Atalho                        |
| --------------------------- | ----------------------------- |
| Aceitar / Rejeitar o nível  | **A** / **R**                 |
| Limpar a decisão            | Backspace                     |
| Próxima / anterior pendente | **N** / Shift+N               |
| Próximo / anterior conflito | **C** / Shift+C               |
| Alternar Atual / Proposto   | **P**                         |
| Legenda das marcas          | **L**                         |
| Aplicar aceitas             | Ctrl+Enter                    |
| Janela Propostas            | Ctrl+Shift+7 (extra: Alt+7)   |
| Pai / filha do item         | Alt+↑ / Alt+↓ (já existentes) |

Agem sobre o nível selecionado (proposta, imagem, item ou mudança). **`R` passa a ser Rejeitar** durante a revisão, porque o projeto está somente leitura e Desenhar não está disponível. O que muda deve entrar em `app/shortcuts.ts`, na Ajuda (seção Atalhos) e nas dicas (`title` com dois espaços antes do atalho). No celular não há atalhos.

---

## 7. Estado e dados

| O que                                                                               | Onde vive                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Decisões, notas, `status`, `applied`                                                | `proposals/<id>/proposal.json`, gravado pela sessão (com `revision`)  |
| Aplicar aceitas                                                                     | Projeto (`mapping.json`): uma entrada de desfazer                     |
| Último item visto, filtros, Atual / Proposto, janelas e alturas                     | UI, `localStorage` por dispositivo (try/catch), fora do desfazer      |
| Seleção, zoom, janela aberta                                                        | UI                                                                    |
| Contagens, níveis, “parcial”, “aceitas aguardando aplicação”, conflitos, pendências | Derivado em `src/store/derived.ts`, nunca guardado                    |
| Aviso “Desfazer” dos lotes                                                          | UI: guarda o mapa de decisões anterior e regrava a proposta (ver 8.3) |

---

## 8. Decisões e pontos em aberto

**Aprovação:** as telas (rodadas 1 a 3) e as decisões 1 a 7, como desenhadas, foram aprovadas pelo dono em 2026-10-09. O item 4 ainda pede trabalho na fase 4.1; o 8 é decidido ao implementar; 9 e 10 são só registro.

1. **`R` vira Rejeitar na revisão.** Justificativa: projeto somente leitura. Alternativa descartada: `X`.
2. **Atalho da janela Propostas:** Ctrl+Shift+7 oficial e Alt+7 extra, seguindo a decisão 1 do `HANDOFF.md`.
3. **“Desfazer” dos lotes é do nível da tela**, não o desfazer do projeto: guarda o mapa de decisões anterior e regrava a proposta numa única escrita. Alternativa: sem desfazer, só confirmação (descartada porque decidir deve ser barato).
4. **Comparação “igual / diferente / não consta na nova”** (proposta substituída) exige comparar as mudanças da proposta antiga com as da nova (por entidade, campo e valor `to`). Sugestão: função pura em `src/model/` na 4.1, usada pela 4.3. O desenho assume esse resultado pronto.
5. **Rejeitadas não aparecem na visão Proposto**, só na Atual (fantasma e ✕).
6. **Aceitar o que ainda vale numa proposta substituída:** as aceitas continuam aplicáveis e as pendentes não; o botão Aplicar conta só as aceitas. Já está no `PLAN.md` (decisão 6); o desenho só o torna visível.
7. **Linha tracejada de “criada” × “a revisar”** (seção 4): distinguidas pelo selo + e pelo ⚠. Se na prática ficar confuso, trocar a criada por linha cheia mais selo.
8. **Colunas e alturas fixas** (seção 3.3): decidir token ou derivação ao implementar.
9. **Estado “Retirada”** (`withdrawn`) aparece só na lista, com `Flag` neutra e ação Ver. Não há tela de revisão para ela.
10. **Fora do desenho:** navegação do canvas por teclado (P11 do `HANDOFF.md`), animações além das durações do design system, telas do lado do MCP.

---

## 9. Ordem sugerida na fase 4.4

Cada passo pode virar um PR pequeno; a 4.3 já deve estar pronta.

1. Tokens (`cv-badge`, `size-tw-bottom-review`), ícones e variantes de componentes existentes (seção 2.2).
2. `DecisionMark`, `ChangeKind`, `Flag`, `DecisionControl` com testes de componente e todos os estados.
3. `ProposalRow` e a janela Propostas (lista, vazio, aviso de proposta nova, contagem de aceitas aguardando).
4. Modo revisão: `ReviewBar`, somente leitura, `ReviewRow` e filtros; atalhos.
5. Canvas: marcas de revisão, Atual / Proposto, `ImageCompare`.
6. Detalhes: `DiffValue`, `ChangeCard`, notas, conflito, trancado e aplicar bloqueado.
7. Retomada: lembrete ao sair, último item, conflitos novos, proposta substituída.
8. Celular (em paralelo com 4 a 7, pois reaproveita os mesmos componentes com a densidade `.mp-m`).
9. Textos pt-BR e en-US, Ajuda, e2e.

## 10. Riscos e cuidados

- **Desempenho:** lista virtualizada, derivados memoizados por versão da proposta, nenhum recálculo de pan e zoom (regras do CLAUDE.md).
- **Acessibilidade:** `role="treeitem"` com `aria-level`, `aria-expanded` e `aria-selected` nas `ReviewRow`; `aria-pressed` e `aria-label` com o alvo e o efeito nos `DecisionControl`; barra de progresso com `role="img"` e texto; `ImageCompare` com `role="slider"`.
- **i18n:** rótulos podem crescer 30% em inglês (“Apply accepted changes”, “Exit review”): nada de largura fixa em rótulo; títulos de uma linha usam reticências; a faixa compacta mostra só ícone e número (rótulo na dica).
- **CSP:** nada de `style=""` nem `setAttribute('style')`; estilo dinâmico por JS (`el.style.x`, objeto `style` do Preact). Cores de camada e de linha são dados do projeto; as demais saem dos tokens.
- **`file://`:** `localStorage` sempre em try/catch; o estado de retomada precisa funcionar sem ele (cai na primeira pendente).
- **e2e:** os seletores de revisão são novos; não dependem de `.side-panel` nem do Menu antigo.
