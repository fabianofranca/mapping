# Detalhes na revisão — briefing para o Claude Design

Pedido de desenho da fase 9.1 (etapa 9, ponto 4 do [`PLAN.md`](../../PLAN.md)). O dono cola este documento no Claude Design; o resultado volta como `docs/redesign/HANDOFF-REVIEW-DETAILS.md`, no formato do [`HANDOFF-PROPOSALS.md`](HANDOFF-PROPOSALS.md), antes do código (fases 9.5 e 9.6).

| Fonte                                          | Endereço                                          | Para quê                                                                                   |
| ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Design system **Mapeador de Imagens 2.0**      | https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9 | Componentes, tokens, ícones e a seção Revisão (a base de tudo o que for desenhado aqui)    |
| Canvas "Propostas de alteração"                | https://claude.ai/artifact/7gTGB3ACoBQGgN1VqbSgqs | O desenho atual da revisão (etapa 4): prancheta `R-Escuro`/`R-Claro`, Detalhes com cartões |
| [`HANDOFF-PROPOSALS.md`](HANDOFF-PROPOSALS.md) | neste repositório                                 | Linguagem visual da revisão (seção 4), atalhos (seção 6) e o que já foi decidido           |

---

## 1. O problema

Na revisão de uma proposta, a janela **Detalhes** deixa de ser o painel que a pessoa conhece e vira uma pilha de cartões (`ChangeCard`), um por mudança, com linhas **Antes / Depois** (`DiffValue`). Funciona para "o nome mudou de X para Y", mas:

- **Quando tudo é novo** (a primeira importação de uma tela, uma marcação criada), a criação é **uma** mudança da entidade inteira e o cartão mostra uma linha de resumo ("Botão Pagar · 4 anotações"). Não dá para ver os campos da marcação nem os valores das anotações que vão entrar no projeto: posição, tamanho, pai, cada campo tipado, cada par livre.
- O cartão não mostra o contexto: os campos que **não** mudaram, a camada, a quem a anotação pertence, as referências.
- A pessoa aprende um painel no modo normal e precisa ler outro na revisão.

**O que o dono pediu:** na revisão, o **mesmo painel de Detalhes do modo normal**; em cada campo alterado, um indicador que, ao passar o mouse, mostra o valor atual e permite aceitar a alteração ali mesmo.

## 2. Como é hoje

Só desktop, janela da direita com 360 px de largura inicial (`size-tw-right`, redimensionável).

**Modo normal** (é o que o desenho novo reaproveita):

- **Marcação** (`src/ui/MarkingPanel.tsx`): `DetailsIdentity` (ícone, nome, "na imagem Checkout › Formulário", ID com copiar, cadeado); avisos (trancada, "a revisar"); seção recolhível **Marcação** com `PropertyGrid`: Nome, Pai (select), Posição (x, y) e Tamanho (largura, altura) em pixels; seção **Anotações** (`src/ui/AnnotationsPanel.tsx`) com as pendências e um `LayerGroup` por camada **visível** (faixa de 3 px na cor da camada); botão Excluir.
- **Anotação** (`src/ui/AnnotationEditor.tsx`, dentro do `LayerGroup`): cabeçalho com o nome (tipada: o tipo da especialização), resumo, "Pertence a" (outra anotação da mesma marcação), "Aplicar às marcações filhas"; corpo tipado (`src/ui/TypedFields.tsx`: texto, número, data, lista de opções, tabela, referência para outra anotação) ou livre (`KeyValueGrid`: pares chave-valor); "Referências recebidas"; "Vinculadas"; "+ <tipo filho>".
- **Imagem** (`src/ui/SelectionPanel.tsx`): seção **Imagem** com Nome, Arquivo e Dimensões; Trocar imagem; Excluir.

**Modo revisão** (o que sai):

- `src/app/EditorPanel.tsx:27-34`: na revisão, Detalhes troca o painel normal por `ReviewDetails`.
- `src/ui/review/ReviewDetails.tsx` (desde a linha 211): caminho do nível; `Flag` (trancado, quantos tipos, criada, "bloqueia aplicar"); aviso de conjunto inválido com as duas saídas ("aceitar o que falta", "rejeitar a causa"); bloco de decisão do nível (`DecisionControl` ✓ ✕, progresso); aviso de item trancado; a lista de `ChangeCard` (até 60 por vez); as notas; "Ver o item" (da mudança para o item).
- `src/ui/review/ChangeCard.tsx`: cabeçalho com `DecisionMark`, `ChangeKind`, o nome do campo e as `Flag` (conflito, conflito novo, trancado, junto, envolvida, comparação com a proposta substituída); corpo `DiffValue` com **Atual** (só em conflito), **Antes** (não na criação) e **Depois** (não na remoção); botões ✓ ✕.
- `src/ui/review/changeText.ts:391-392`: criação e remoção viram uma linha de resumo da entidade. É a causa do "não vejo nada quando tudo é novo".

**O que continua igual** e não precisa de desenho: a faixa da revisão (`ReviewBar`), a Árvore, o canvas com as marcas (seção 4 do `HANDOFF-PROPOSALS.md`), a janela Propostas com os níveis e os filtros, Atual / Proposto, `ImageCompare`, os atalhos.

### O que uma mudança pode ser

A decisão é **por mudança**. Os níveis acima dela (proposta, projeto, imagem, item) agregam, com "parcial".

| Entidade                                           | Criada / removida  | Campos alterados (uma mudança cada)                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marcação                                           | a marcação inteira | `name`, `rect` (posição e tamanho juntos), `parentId` (pai), `imageId` (mudou de imagem), `locked`, `source` (origem externa)                                                                                             |
| Anotação                                           | a anotação inteira | `name`, cada campo tipado (`values.<campo>`; uma tabela é um campo), cada par livre (`entries.<id>`), `parentAnnotationId` ("Pertence a"), `inherit`, `markingId`, `layerId`, `type` (troca de tipo, ex.: tipada → livre) |
| Imagem                                             | a imagem inteira   | `name`, `file` (troca do arquivo, com **Comparar**), `placement` (posição no canvas), `markingColor`, `locked`, `source`                                                                                                  |
| Camada, especialização, repositório por plataforma | inteira            | camada: `name`, `color`, `spec`, `position`                                                                                                                                                                               |

Fatos que o desenho precisa respeitar:

- **Dependências:** aceitar algo dentro de um item criado aceita a criação; rejeitar a criação rejeita o que depende dela ("3 anotações rejeitadas junto"); aceitar uma remoção aceita a cascata. Hoje isso aparece como `Flag` "junto" e um aviso com **Desfazer**.
- **Conflito:** o projeto mudou depois da proposta. São três valores: **Atual** (o que está no projeto agora), **Antes** (o que a proposta viu) e **Depois** (o proposto).
- **Item trancado:** aceitar é permitido; a trava continua.
- **Conjunto inválido:** as aceitas juntas violam uma regra (ex.: filha fora do pai); "Aplicar" fica bloqueado e as mudanças envolvidas são marcadas.
- **Proposta fechada** (aplicada, substituída, retirada): só para ver; decisões desabilitadas, com o motivo.
- **Proposta substituída:** cada mudança diz se é igual, diferente ou se não consta na nova.

## 3. O que já foi decidido (requisitos)

Decidido com o dono na sessão de planejamento da etapa 9. O desenho detalha; se algo abaixo não fechar visualmente, registre como ponto em aberto em vez de mudar.

1. **O mesmo painel do modo normal, somente leitura**, na mesma ordem e com as mesmas seções (Identidade, Marcação, Anotações por camada; Imagem). Controles desabilitados como no "Somente leitura" de hoje.
2. **O painel mostra o projeto da visão aberta:** na visão **Proposto**, o projeto como ficaria (a prévia); na **Atual**, o projeto de agora. Igual ao canvas e à Árvore.
3. **Marcador em cada campo alterado.** É focável (Tab), e hover ou foco abre um **popover** com:
   - o valor do outro lado: na visão Proposto, o valor **atual**; na Atual, o **proposto**;
   - em **conflito**, os três valores: Atual, Antes e Depois;
   - nas **alterações**, a **decisão daquele campo** (aceitar, rejeitar, limpar), que grava na hora, como hoje.
4. **Criação:** cada campo de um item criado mostra o marcador "novo", **sem decisão própria**. A decisão da criação fica no **cabeçalho do item** (a marcação) e no **cabeçalho de cada anotação criada** (criação é uma mudança só).
5. **Remoção:** um item removido não existe na prévia; o painel mostra o projeto atual com o estado **"será removida"** e a decisão no cabeçalho. Vale também para uma anotação removida dentro de uma marcação que fica.
6. **Cabeçalho do item:** a decisão de três estados do item (com "parcial" e as contagens), as **notas**, o aviso de **item trancado** e o de **conjunto inválido** (com as duas saídas).
7. **O que não tem campo no painel normal** (`source`, `placement` e troca de arquivo da imagem, `locked`, camadas, especializações, repositórios): os níveis **Proposta**, **Projeto** e **Imagem** ficam como hoje (cartões) **ou** vão para uma seção **"Outras mudanças"** no fim do painel. Escolha uma das duas e justifique.
8. **Teclado:** os atalhos da revisão (seção 6 do `HANDOFF-PROPOSALS.md`: A, R, Backspace, N, C, P) continuam valendo e agem sobre o nível selecionado. Selecionar uma **mudança** na janela Propostas leva ao campo dela no painel (rolagem e foco no marcador).
9. **Nada se entende só pela cor** e verde/vermelho continuam reservados a aceita/rejeitada, sempre com a forma do `DecisionMark` (seção 4 do `HANDOFF-PROPOSALS.md`).

## 4. Restrições

- **Tokens:** só os de `src/theme/tokens.ts` (temas claro e escuro). Um valor novo vem pedido como token, com o porquê (como a seção 3.1 do `HANDOFF-PROPOSALS.md`). Nenhuma cor de tema nova sem justificar.
- **Componentes:** controles de `src/ui/controls/` (`Button`, `IconButton`, `TextField`, `Select`, `Choice`, `Segmented`, `Tabs`, `Tooltip`, `Chip`) e os da revisão (`DecisionMark`, `DecisionControl`, `ChangeKind`, `Flag`, `DiffValue`), ícones de `src/ui/icons.tsx` (grade 16, traço 1,25). Componente ou ícone novo vem com "por que o existente não serve".
- **Densidade:** controles de 28 px (`--control-height`), ícone de 16 px, linhas de 28 px. O marcador não pode empurrar o `PropertyGrid` para outra linha nem quebrar o alinhamento rótulo | controle na largura de 360 px.
- **Só desktop**, de 900 px a 1920 px de janela; mouse e teclado. O popover precisa caber com a janela Detalhes na largura mínima e não pode ser cortado pela rolagem da janela (o `Popover` da app é `position: fixed`).
- **Foco e teclado** (`docs/ARCHITECTURE.md`, "Foco e teclado"): o popover devolve o foco ao marcador ao fechar (Esc, clique fora); menus e popovers nunca deixam o foco no `body`; `aria-keyshortcuts` na sintaxe ARIA.
- **Textos:** pt-BR e en-US, com +30% em inglês; nada de largura fixa em rótulo.
- **Desempenho:** uma proposta pode ter centenas de mudanças numa marcação (importação completa). O painel não pode desenhar centenas de popovers; o conteúdo do popover só existe aberto.

## 5. Estados a desenhar

Pranchetas duplas (escuro e claro), Detalhes com 360 px. Dados de exemplo: a proposta **"Checkout a partir do Figma"** do `examples/proposta-exemplo.zip` (11 mudanças: camada **Componentes** criada; imagem **Checkout** com o arquivo trocado e uma imagem nova; duas marcações criadas, uma removida, uma renomeada e uma redimensionada; duas anotações criadas; um par livre alterado), mais os casos abaixo.

| #   | Estado                                                      | O que mostrar                                                                                                                                                            |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Marcação alterada, um campo (nome)                          | Painel normal; marcador no Nome; popover aberto com o valor atual e ✓ ✕                                                                                                  |
| E2  | Marcação alterada, vários campos (nome, `rect`, pai)        | Marcadores em Nome, Posição/Tamanho (um marcador para o `rect`) e Pai; cabeçalho do item com "parcial" (1 ✓ · 1 ✕ · 1 ○)                                                 |
| E3  | Anotação tipada alterada                                    | Um campo de texto, um de lista de opções, uma **tabela** (linhas acrescentadas e removidas) e uma **referência**; marcador por campo                                     |
| E4  | Anotação livre alterada                                     | Um par com o valor mudado, um par novo e um par removido                                                                                                                 |
| E5  | "Tudo novo": marcação criada com anotações tipadas e livres | Todos os campos com o marcador "novo"; decisão no cabeçalho do item e no de cada anotação; o que acontece ao rejeitar a marcação (anotações "junto")                     |
| E6  | Marcação removida                                           | Painel do projeto atual em estado "será removida", com a decisão no cabeçalho e o que a cascata leva (filhas, anotações)                                                 |
| E7  | Anotação removida e anotação criada numa marcação que fica  | Os dois no mesmo `LayerGroup`, na visão Proposto (a removida não existe na prévia)                                                                                       |
| E8  | Conflito                                                    | Marcador com o sinal de conflito; popover com Atual, Antes e Depois e a ajuda do efeito ("aceitar sobrescreve o valor atual")                                            |
| E9  | Decisões no campo                                           | O mesmo marcador pendente, aceito e rejeitado; mudança "junto" (decidida por dependência)                                                                                |
| E10 | Item trancado e conjunto inválido                           | Os dois avisos no cabeçalho do item, com as saídas do inválido; o campo envolvido marcado                                                                                |
| E11 | Visão Atual × Proposto                                      | O mesmo item nas duas visões, com o popover mostrando o outro lado; item **criado** selecionado na visão Atual (ele não existe lá)                                       |
| E12 | Mudança em camada escondida                                 | O painel normal só mostra camadas visíveis; como avisar que há mudanças em camadas escondidas e mostrá-las                                                               |
| E13 | Mudanças sem campo no painel                                | `source`, `locked`, troca de arquivo da imagem (com **Comparar**), `placement`, camada criada, especialização; e os níveis Proposta e Projeto (a escolha do requisito 7) |
| E14 | Notas                                                       | Nota no cabeçalho do item e nota numa mudança; sugerida quando há rejeição                                                                                               |
| E15 | Proposta fechada e proposta substituída                     | Decisões desabilitadas com o motivo; selos "igual / diferente / não consta na nova"                                                                                      |
| E16 | Teclado                                                     | Marcador focado; popover aberto pelo teclado; foco de volta ao fechar; a mudança selecionada na janela Propostas com o seu campo destacado                               |
| E17 | Item grande                                                 | Marcação criada com 40 anotações em 3 camadas: seções recolhidas e o que abre sozinho                                                                                    |

## 6. Perguntas que o desenho deve responder

1. **Forma e lugar do marcador:** ponto, selo ou ícone; antes do rótulo, depois do controle ou na margem do `PropertyGrid`. Como ele mostra o tipo (novo, alterado, removido, conflito) e a decisão (pendente, aceita, rejeitada) sem depender só da cor.
2. **Campos compostos:** um marcador para o `rect` inteiro ou por número; numa **tabela**, um marcador para o campo e como as linhas alteradas aparecem; num par livre, chave e valor.
3. **Seções recolhidas:** abrem sozinhas quando contêm mudanças? Um resumo "3 mudanças" no cabeçalho recolhido?
4. **Requisito 7:** cartões nos níveis Proposta, Projeto e Imagem, ou "Outras mudanças" no painel.
5. **Popover ou expansão em linha** para valores longos (tabela inteira, texto de várias linhas): o popover cabe? Precisa de um "ver tudo"?
6. **O que sai:** `ChangeCard` e `DiffValue` continuam em algum lugar (popover, níveis acima do item) ou saem.

## 7. O que o handoff precisa trazer

No formato do [`HANDOFF-PROPOSALS.md`](HANDOFF-PROPOSALS.md), em `docs/redesign/HANDOFF-REVIEW-DETAILS.md`:

1. **Mapa das telas:** cada estado E1 a E17 com a prancheta e onde entra na app.
2. **Componentes:** novos (com por que o existente não serve), variantes de existentes e os reaproveitados; o que sai.
3. **Tokens e ícones novos**, com valor e justificativa; medidas que não viraram token.
4. **Comportamento:** abrir e fechar o popover (hover, foco, clique, Esc, clique fora), atraso do hover, onde o foco vai, o que acontece ao decidir no popover, rolagem até o campo, seções que abrem.
5. **Acessibilidade:** papel e nome do marcador e do popover (ex.: "Nome: alterado, pendente. Atual: Pagar. Proposto: Pagar agora"), contraste nos dois temas.
6. **Textos** novos em pt-BR e en-US.
7. **Respostas às perguntas da seção 6** e os pontos que ficaram em aberto.

As pranchetas podem usar `style=""` e medidas soltas só como maquete; na implementação tudo vira classe com `var(--…)`.
