# Detalhes na revisão — passagem para implementação

Documento de passagem do desenho da fase 9.1 (etapa 9, ponto 4 do [`PLAN.md`](../../PLAN.md)), feito com o Claude Design a partir do [`BRIEF-REVIEW-DETAILS.md`](BRIEF-REVIEW-DETAILS.md). É a referência das fases 9.5 (o painel normal com os marcadores) e 9.6 (decidir no painel). Complementa o [`HANDOFF-PROPOSALS.md`](HANDOFF-PROPOSALS.md): tudo o que não é citado aqui (faixa de revisão, Árvore, canvas, janela Propostas, Atual / Proposto, `ImageCompare`, atalhos) segue aquele documento e o design system 2.0 como estão.

| Fonte                                          | Endereço                                          | O que tem                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Canvas “Detalhes na revisão”                   | https://claude.ai/artifact/Dr7UrwwuFX7Rg3UqfCfdWD | Leia primeiro (decisões, respostas, legenda do marcador), E1 a E9 e E10 a E17. Pranchetas duplas: escuro à esquerda, claro à direita |
| Design system **Mapeador de Imagens 2.0**      | https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9 | Componentes, tokens e a seção Revisão (sem mudança nesta fase; os componentes novos daqui entram no DS quando forem implementados)   |
| [`HANDOFF-PROPOSALS.md`](HANDOFF-PROPOSALS.md) | neste repositório                                 | Linguagem visual da revisão (seção 4), atalhos (seção 6) e dependências (seção 5.2)                                                  |

Os artifacts são privados: só abrem para quem tiver acesso compartilhado pelo dono. As pranchetas foram escritas, mas **não foram renderizadas nem conferidas visualmente** pelo autor; a revisão visual é do dono, que aprovou o desenho e os quatro pontos da seção 10 em 2026-10-15.

**Regras que continuam valendo** (CLAUDE.md): um único `dist/index.html` que funciona em `file://`; CSP sem `style=""` nem handlers inline; `src/model/` sem APIs de navegador; toda mutação por action do store; estado do projeto separado do estado da UI; nenhuma string fixa (pt-BR e en-US, com +30% em inglês); nenhum valor de design fora dos tokens; só desktop (900 px a 1920 px).

> As pranchetas usam classes de maquete (`rd-*`) e `style=""` **só como maquete**. Na implementação, tudo vira classe com `var(--…)` em `src/theme/`, com os nomes da app (`details-*`, `review-*`).

---

## 1. Mapa das telas

| Estado                                                     | Prancheta (página)               | Onde entra na app                                                                    |
| ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| Leitura do desenho, legenda do marcador                    | `Main` (Leia primeiro)           | —                                                                                    |
| E1 · Marcação alterada, um campo (nome)                    | `E01-Nome` (E1–E9)               | `MarkingPanel` com `ChangeMark` no Nome e `ChangePopover` aberto                     |
| E2 · Vários campos (nome, `rect`, pai), item parcial       | `E02-Varios`                     | Cabeçalho de decisão do item (parcial com contagens); um marcador para o `rect`      |
| E3 · Anotação tipada (texto, lista, tabela, referência)    | `E03-Tipada`                     | `TypedFields`, `TableField` (popover acima, tabela com linha nova), `ReferenceField` |
| E4 · Anotação livre (par alterado, novo, removido)         | `E04-Livre`                      | `KeyValueGrid` com o marcador na coluna de ações; par removido riscado               |
| E5 · Tudo novo e o que vai junto ao rejeitar               | `E05-TudoNovo`                   | Marcador “novo” sem decisão; ✓ ✕ no cabeçalho de cada anotação criada; aviso “junto” |
| E6 · Marcação removida e a cascata                         | `E06-Removida`                   | Painel do projeto atual com “Será removida”, decisão no cabeçalho e o que sai junto  |
| E7 · Anotação removida e criada na mesma camada            | `E07-AnotRemovida`               | `LayerGroup` com a anotação removida riscada (fantasma) e a criada                   |
| E8 · Conflito                                              | `E08-Conflito`                   | Marcador âmbar com ⚠; popover com Atual, Antes e Depois                              |
| E9 · Decisão no campo (pendente, aceita, rejeitada, junto) | `E09-Decisoes`                   | Estados do marcador e do rodapé do popover; nota sugerida na rejeição                |
| E10 · Item trancado e conjunto inválido                    | `E10-TrancadoInvalido` (E10–E17) | Avisos no cabeçalho do item com as duas saídas; campo envolvido marcado              |
| E11 · Visão Atual × Proposto; item criado na Atual         | `E11-AtualProposto`              | O painel lê `shownProject`; aviso “ainda não existe no projeto atual”                |
| E12 · Mudança em camada escondida                          | `E12-CamadaEscondida`            | Aviso nas Anotações com **Mostrar aqui**                                             |
| E13 · Mudanças sem campo; níveis Proposta e Projeto        | `E13-OutrasMudancas`             | Seção **Outras mudanças** (imagem, proposta e projeto); **Comparar** no popover      |
| E14 · Notas                                                | `E14-Notas`                      | Nota do item no cabeçalho; nota da mudança no popover e embaixo do campo             |
| E15 · Proposta fechada e substituída                       | `E15-FechadaSubstituida`         | Decisões desabilitadas com o motivo; selos igual / diferente / não consta na nova    |
| E16 · Teclado                                              | `E16-Teclado`                    | Mudança selecionada na janela Propostas → linha destacada, marcador focado           |
| E17 · Item grande (40 anotações em 3 camadas)              | `E17-ItemGrande`                 | Grupos recolhidos, cabeçalhos sem corpo, “Mostrar mais”                              |

Dados de exemplo: a proposta “Checkout a partir do Figma” do `examples/proposta-exemplo.zip`. E2, E3, E8, E10, E12, E14, E15 e E17 usam casos extras, descritos no topo de cada prancheta (anotação tipada da SDUI, conflito com o nome “Topo”, Rodapé encolhido, camada escondida, proposta aplicada e “Checkout v1” substituída, importação com 40 anotações). A camada criada pela proposta do zip é **Eventos** (o briefing dizia Componentes); as pranchetas seguem o zip.

---

## 2. Componentes

### 2.1 Novos (3) e justificativa

| Componente       | Para quê                                                                                                    | Por que não reaproveitar                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChangeMark`     | Marcador do campo alterado: tipo da mudança e decisão numa peça de 18 px, focável, que abre o popover       | `ChangeKind` (20 px) e `DecisionMark` separados não cabem no fim da coluna de rótulo nem na coluna de ações das grades, e não são botões; `Flag` é rótulo de texto, não interativo |
| `ChangePopover`  | Conteúdo do popover: título com o tipo, `DiffValue`, ajuda do efeito, rodapé com a decisão, nota e Comparar | O `Popover` da app é só o contêiner (posição fixa, foco, Esc); faltava o conteúdo de uma mudança. Substitui o corpo do `ChangeCard`                                                |
| `OtherChangeRow` | Linha de “Outras mudanças”: `ChangeKind`, o que mudou em uma linha de resumo e o `ChangeMark`               | `ReviewRow` tem colunas de nível (resumo, decisão) e vive na janela Propostas; o `ChangeCard` ocupava um cartão inteiro por mudança, que é o que o pedido quis tirar               |

Ninguém mais desenha ícone ou controle avulso: o `ChangeMark` monta os glifos do `ChangeKind` e a forma do `DecisionMark` (as mesmas funções de desenho).

### 2.2 Variantes de componentes existentes

| Existente                    | Variante                                                                                                       | Uso                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `PropertyGrid` (linha)       | Slot do marcador no fim da coluna de rótulo; `is-target` (fundo `color-selection`)                             | Todo campo do painel normal; `is-target` na mudança selecionada na janela Propostas |
| `PropertyGrid` (`rect`)      | Rótulo de duas linhas (Posição, Tamanho) com um colchete e um marcador só                                      | `rect` da marcação                                                                  |
| `KeyValueGrid`               | Coluna de ações vira a coluna do marcador; linha `is-removed` (riscada, `color-text-muted`)                    | Pares livres na revisão                                                             |
| `TableField` / `DataGrid`    | Linha `is-added` (fundo `color-selection`, + na coluna do número); rodapé com as linhas que saem               | Campo tabela alterado                                                               |
| `DetailsSection`             | Resumo de mudanças no cabeçalho (“3 mudanças”, contagens ✓ ✕ ○)                                                | Marcação, Imagem, Anotações, Outras mudanças                                        |
| `LayerGroup`                 | Resumo de mudanças no cabeçalho; selo `ChangeKind` para camada criada; selo “escondida”                        | Anotações por camada                                                                |
| Cabeçalho da anotação        | `ChangeKind` + `DecisionControl` (ícones) quando a anotação é criada ou removida                               | `AnnotationEditor` na revisão                                                       |
| Anotação removida (fantasma) | Cabeçalho riscado, borda tracejada, `Flag` “Será removida”, resumo e “Ver na visão Atual P”                    | Anotação removida numa marcação que fica, na visão Proposto                         |
| `DetailsIdentity`            | Nome riscado (remoção) e uma linha de `Flag` (Criada pela proposta, Será removida, Trancada, Bloqueia aplicar) | Identidade do item na revisão                                                       |
| Estado “Somente leitura”     | O do design system: valor em texto, borda `color-border`, contraste cheio (decisão 1 da seção 10)              | Todos os controles do painel na revisão                                             |

### 2.3 Reaproveitados sem mudar

`DecisionMark`, `DecisionControl` (ícones e com texto), `ChangeKind`, `Flag`, `DiffValue` (dentro do popover), `Notice` (`--info`, `--warning`, `--error`, `--sm`), `TextField` (`mp-field--area`, nota), `Button` (`--accept`, `--reject`, `--link`), `IconButton`, `Segmented`, `ReferenceField`, `Popover`, `Tooltip`, `ImageCompare` (aberto pelo **Comparar** do popover).

### 2.4 O que sai

- **`ChangeCard`** sai de vez: o painel do item mostra os campos e os níveis Proposta, Projeto e Imagem usam “Outras mudanças” (seção 5.6).
- **`ReviewDetails`** deixa de montar a pilha de cartões: o bloco de decisão do nível passa a ser o cabeçalho do item (seção 5.4) e os demais pedaços (aviso de conjunto inválido, trancado, notas) vão para ele.
- O resumo de uma linha da criação e da remoção (`changeText.ts`) deixa de ser o corpo dos Detalhes; continua servindo a janela Propostas e as linhas de “Outras mudanças”.
- **`DiffValue`** fica, só dentro do `ChangePopover`.

### 2.5 Onde implementar (sugestão)

`ChangeMark`, `ChangePopover` e `OtherChangeRow` em `src/ui/review/`, um arquivo cada. Os componentes do painel normal (`MarkingPanel`, `SelectionPanel`, `AnnotationsPanel`, `AnnotationEditor`, `TypedFields`, `KeyValueGrid`, `TableField`, `FieldEditors`) ganham **um ponto de extensão** (por exemplo, uma função `markFor(entityId, field)` vinda do contexto do editor que devolve o marcador ou nada), sem saber de revisão. O índice “mudanças por entidade e campo” fica em `review.derived` (`src/store/derived.ts`), memoizado pela proposta.

---

## 3. Tokens e ícones

### 3.1 Tokens novos (2)

| Token                   | Valor   | Por que                                                                                                                                                                                      |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size-change-popover`   | `320px` | Largura do `ChangePopover`. Cabe na janela Detalhes na largura inicial (`size-tw-right` 360 − 2 × 12 de margem = 336, com folga) e é larga o bastante para as três linhas do conflito        |
| `duration-hover-intent` | `300ms` | Atraso para abrir o popover pelo hover. As `duration-*` do DS são de animação; abrir conteúdo interativo ao passar o mouse pede intenção, senão percorrer o painel abre um popover por linha |

**Nenhuma cor nova.** Alterado e novo usam `color-text` sobre `color-surface`; conflito usa `color-warning` sobre `color-warning-bg`; aceita e rejeitada, `color-success` e `color-danger` só na forma do `DecisionMark`; envolvida no conjunto inválido, `color-danger` (como a `Flag` “Envolvida”); aberto, `color-selection` com borda `color-accent`.

### 3.2 Ícones

Nenhum ícone novo. O marcador usa `changed`, `plus`, `minus`, `replaced`, `warning` e `link` (o elo do “junto”), todos já em `src/ui/icons.tsx`; a nota usa `note`; Comparar usa `compare`; a camada escondida usa `eyeOff`.

### 3.3 Medidas que as pranchetas usam e não viraram token

| Medida                                  | Valor da maquete | Derivar de                                                             |
| --------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| Altura do marcador                      | 18 px            | `calc(var(--size-icon) + var(--space-0-5))` (a mesma da `Flag`)        |
| Glifo dentro do marcador                | 12 px            | `var(--space-3)` (como no `ChangeKind` e na `Flag`)                    |
| Afastamento do popover                  | 4 px             | `var(--space-1)`                                                       |
| Margem do marcador no rótulo            | 5 px no topo     | `(var(--control-height) − altura do marcador) / 2`                     |
| Altura máxima do popover com “Ver tudo” | 60% da janela    | `60vh` (se o `tokenLiterals` recusar, criar `size-change-popover-max`) |
| Colchete do `rect`                      | 5 px de largura  | `var(--space-1)` mais a borda                                          |

---

## 4. Linguagem visual: o marcador

1. **Duas partes, sempre na mesma ordem.** À esquerda o **tipo** (o glifo do `ChangeKind`: ∿ alterado, + novo, − removido, duas molduras para imagem trocada); à direita a **decisão** (a forma do `DecisionMark`: círculo tracejado, ✓ cheio, ✕ cheio). Verde e vermelho só aparecem no ✓ e no ✕ cheios.
2. **Conflito** troca o glifo do tipo por ⚠ e pinta o marcador de `color-warning-bg` com borda `color-warning`. Continua âmbar depois de decidido: o conflito não some ao decidir.
3. **Parte de uma criação ou remoção** (campo de um item criado ou removido): só o tipo, numa peça quadrada de 18 px com **borda tracejada** e o glifo em `color-text-muted`. Sem decisão própria: o popover diz onde decidir.
4. **Decidida junto** (pela dependência): o elo toma o lugar do tipo; a decisão mostra o estado.
5. **Envolvida no conjunto inválido:** anel `color-danger` em volta do marcador e os controles do campo no estado “Inválido” do DS (`aria-invalid`).
6. **Aberto:** fundo `color-selection` e borda `color-accent`. **Focado:** contorno 2 px `color-focus`, afastado 1 px.
7. **Lugar:** no fim da coluna de rótulo do `PropertyGrid`, colado ao controle (a coluna continua com `size-label-col`; o rótulo quebra linha se precisar). Nas grades (pares, tabela), na coluna de ações da linha, que na revisão fica vazia. No `rect`, um marcador só, centrado num colchete que junta Posição e Tamanho. Nas linhas de “Outras mudanças”, à direita.
8. **Valores no painel:** a visão Proposto mostra o proposto; uma mudança **rejeitada** volta a mostrar o valor atual (rejeitadas não aparecem na visão Proposto, decisão 5 do `HANDOFF-PROPOSALS.md`), com o marcador ✕.

---

## 5. Comportamento

### 5.1 O painel

- Na revisão, Detalhes mostra o **painel normal** (`MarkingPanel`/`SelectionPanel` com as anotações) em somente leitura, sobre `review.derived.shownProject`: acompanha Atual / Proposto (`P`), como o canvas e a Árvore.
- **Item criado na visão Atual** (E11) e **item removido na visão Proposto** (E6): o item não existe na visão aberta. O painel mostra o item do outro lado (a prévia ou o projeto atual) com um `Notice --info --sm` que diz isso e, no criado, “Ver em Proposto P”.
- **Anotação ou par removido numa entidade que fica** (E4, E7): aparece no lugar onde estava, **riscado**, com a decisão ali (decisão 3 da seção 10). A anotação removida mostra só o cabeçalho e o resumo; o corpo, na visão Atual.

### 5.2 Seções que abrem

- Ao selecionar um item, abrem as seções, as camadas (`LayerGroup`) e as anotações que contêm mudanças; as outras ficam como a pessoa deixou (estado da UI). Recolhida, a seção mostra o resumo (“3 mudanças”, contagens).
- **Item grande** (E17): camada com mais de 8 anotações começa recolhida, com as contagens no cabeçalho; dentro da camada aberta, as anotações aparecem só como cabeçalho (tipo, nome, ✓ ✕) e o corpo abre ao clicar ou ao chegar pela navegação; mais de 12 cabeçalhos: o resto vem por “Mostrar mais”, de 20 em 20. Abrem sozinhos a camada e a anotação da mudança selecionada.
- **Camada escondida** (E12): o painel normal não mostra a camada; um `Notice --sm` nas Anotações conta as mudanças escondidas e oferece **Mostrar aqui**, que mostra essas camadas **só no painel**, até trocar de item, com o selo “escondida”. O canvas e a janela Camadas não mudam (decisão 4 da seção 10). As contagens do cabeçalho do item e “Aceitar marcação” incluem as escondidas.

### 5.3 Popover

| Ação                        | Resultado                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Hover no marcador           | Abre depois de `duration-hover-intent`; fecha `duration-base` depois que o ponteiro sai do marcador e do popover          |
| Foco no marcador (Tab)      | Abre na hora                                                                                                              |
| Clique ou Enter no marcador | Fixa aberto até Esc, clique fora ou outro marcador                                                                        |
| Tab dentro do popover       | Aceitar, Rejeitar, Limpar (se decidida), Nota, Comparar (imagem); Tab depois do último fecha e segue para o próximo campo |
| Shift+Tab no primeiro botão | Volta ao marcador                                                                                                         |
| Esc ou clique fora          | Fecha e devolve o foco ao marcador (nunca ao `body`, `docs/ARCHITECTURE.md`, “Foco e teclado”)                            |
| Decidir no popover          | Grava na hora (como hoje); o popover continua aberto mostrando a decisão; o marcador muda no mesmo quadro                 |

- **Lugar:** abaixo do campo (acima, `rd-pop--up` na maquete, se não couber), alinhado ao início da coluna de rótulo, com `size-change-popover`. É o `Popover` da app (`position: fixed`), então a rolagem da janela não o corta.
- **Conteúdo:** título com o `ChangeKind` e “Campo · tipo” (e `Flag` Conflito, Envolvida, Aplicada, igual / diferente / não consta na nova); `DiffValue` com o outro lado primeiro (na visão Proposto, Atual e depois Proposto; na Atual, Proposto e depois Atual); em conflito, Atual, Antes e Depois e a ajuda do efeito; no `rect`, só o número que muda em negrito; na tabela, a tabela do outro lado com as linhas que saem riscadas; rodapé com a decisão.
- **Valores longos:** até 6 linhas de texto e 5 de tabela; o resto por **Ver tudo**, que expande dentro do próprio popover com rolagem interna (altura máxima de 60% da janela). Nada expande em linha no painel.
- **Um aberto por vez.** O conteúdo só existe aberto: o painel desenha marcadores, nunca popovers fechados.
- **Sem decisão própria** (campo de criação ou remoção): o rodapé diz “Faz parte da criação da marcação: decida no cabeçalho, acima.” (ou da remoção).

### 5.4 Cabeçalho do item

- Logo abaixo da identidade: `DecisionMark` do nível, o que é (“Marcação alterada”, “Marcação criada”, “Marcação removida”, “Imagem alterada”, “Proposta”), as contagens ✓ ✕ ○ quando parcial, `DecisionControl` com texto (“Aceitar marcação / Rejeitar marcação”, “Aceitar remoção / Rejeitar remoção”, “Aceitar imagem”, “Aceitar tudo” na proposta) e o botão de nota.
- **Criação:** “+ N anotações criadas” e a ajuda “A criação é uma mudança só…”. **Remoção:** a lista do que sai junto (marcações filhas com link, anotações por camada).
- **Item trancado:** `Notice --warning --sm` (“aceitar é permitido e a trava continua depois de aplicar”).
- **Conjunto inválido:** `Notice --error --sm` com `role="alert"`, a frase do problema e as duas saídas (os textos `review.issue.acceptMissing` e `review.issue.rejectCause` de hoje, ou a forma concreta “Aceitar a posição deste botão” / “Rejeitar o tamanho do Rodapé” quando houver uma mudança só de cada lado). A identidade ganha a `Flag` “Bloqueia aplicar”.
- **Depois de rejeitar com dependências:** `Notice --sm` com “N anotações rejeitadas junto: …” e **Desfazer** (o aviso dos lotes de hoje).

### 5.5 Notas

- **Nota do item:** o botão de nota no cabeçalho abre o campo (`mp-field--area`) ali; grava ao sair do campo; fica na proposta.
- **Nota da mudança:** dentro do popover; uma mudança com nota mostra a nota numa linha (`note` + texto) embaixo do controle, no painel.
- **Sugerida numa rejeição:** rejeitar pelo popover com o mouse abre o campo de nota vazio, com o foco; se ficar vazio, some. Rejeitar pelo teclado (`R`) não move o foco: a nota abre com Enter. Os atalhos não disparam dentro do campo de texto.

### 5.6 Outras mudanças (requisito 7)

Uma seção **“Outras mudanças”** no fim do painel junta o que não tem campo no painel normal, uma `OtherChangeRow` por mudança, com o mesmo marcador e o mesmo popover.

| Painel           | Vai para “Outras mudanças”                                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marcação         | `source` (origem externa), `locked`, `imageId` (mudou de imagem)                                                                                                                                                                                                                                     |
| Imagem           | `placement` (posição no canvas), `locked`, `source`. O `file` tem campo (Arquivo): marcador ali, com **Comparar** no popover; `markingColor` tem campo (Cor das linhas)                                                                                                                              |
| Proposta (nível) | O painel é a identidade da proposta (título, origem, autor, data, descrição), o cabeçalho com “Aceitar tudo / Rejeitar tudo” e duas seções: **Outras mudanças** (grupo Projeto: camadas, especializações, repositórios por plataforma) e **Imagens** (uma linha por imagem com mudanças e **Abrir**) |
| Projeto (nível)  | O mesmo painel da proposta, só com o grupo Projeto                                                                                                                                                                                                                                                   |

Justificativa: os níveis Proposta e Projeto não têm painel no modo normal; manter cartões só ali deixaria duas linguagens na mesma janela. Uma forma só (linha + marcador + popover) para tudo o que não tem campo, e o `ChangeCard` sai.

**Anotação** (sem prancheta; regra derivada, ver ponto em aberto 2): `name`, `parentAnnotationId` (“Pertence a”) e `inherit` (“Aplicar às marcações filhas”) têm campo e levam o marcador ali; `type` leva o marcador no selo do tipo; `layerId` mostra a anotação na camada nova com o marcador no cabeçalho (“veio de Componentes”); `markingId` mostra a anotação na marcação de destino com o marcador no cabeçalho e, na de origem, como removida (fantasma).

### 5.7 Proposta fechada e substituída

- **Aplicada ou retirada:** `Notice --info --sm` (“Proposta aplicada em … Só para ver”); todos os `DecisionControl` desabilitados com `aria-describedby` no motivo; o popover mostra a decisão e as datas, sem botões.
- **Substituída:** `Notice --warning --sm` com **Abrir a nova**; as aceitas ainda podem ser aplicadas, as sem decisão não (botões desabilitados no popover, com o motivo). Cada mudança mostra o selo igual / diferente / não consta na nova embaixo do controle e no popover, que compara Atual, Esta e Na nova. Os marcadores continuam focáveis.

---

## 6. Teclado e atalhos

- Os atalhos da revisão (seção 6 do `HANDOFF-PROPOSALS.md`: A, R, Backspace, N, C, P) continuam valendo e agem sobre o nível selecionado. **Focar um marcador seleciona aquela mudança**: A, R e Backspace decidem o campo focado.
- **Mudança selecionada na janela Propostas** (E16): o painel abre a seção, a camada e a anotação, rola até o campo e destaca a linha (`is-target`, `aria-current`). Por **clique** ou **Enter** na mudança, o foco vai ao marcador e o popover abre. Pelas **setas**, o painel só rola e destaca; o foco fica na lista (decisão 2 da seção 10).
- N / C pulam para a próxima pendente / conflito também dentro de grupos recolhidos (abrem e rolam), como na janela Propostas.
- `aria-keyshortcuts` na sintaxe ARIA (`"A R Backspace"` no marcador, `"A"` e `"R"` nos botões do popover).

---

## 7. Acessibilidade

| Peça                      | Papel e nome                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChangeMark`              | `button`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` quando aberto; nome “Nome: alterado, pendente. Atual: Cabeçalho. Proposto: Cabeçalho do checkout” (com “conflito”, “com nota”, “envolvida no conjunto inválido”, “igual na nova” quando valer) |
| `ChangeMark` sem decisão  | Nome “Nome: novo, parte da criação da marcação. Proposto: Campo Cupom”                                                                                                                                                                                              |
| `ChangePopover`           | `role="dialog"` não modal, nome “Nome: alterado”; ao decidir, uma região `status` anuncia “Nome: aceita”                                                                                                                                                            |
| Botões do popover         | `aria-pressed` e `aria-label` com o efeito em conflito (“Aceitar: sobrescreve Topo por Cabeçalho do checkout”, “Rejeitar: mantém Topo”), como hoje                                                                                                                  |
| Linha alvo                | `aria-current="true"` na linha destacada                                                                                                                                                                                                                            |
| Grade de pares na revisão | `aria-readonly="true"`; a coluna do marcador com cabeçalho só para leitor de tela                                                                                                                                                                                   |

Contraste: o marcador usa pares que já estão na tabela de contraste do DS (`color-text` e `color-border-control` sobre `color-surface`; `color-warning` sobre `color-warning-bg`, o par da `Flag --warn`; `color-success` e `color-danger` do `DecisionMark`). O estado “Somente leitura” mantém o valor em `color-text` (4,5:1 nos dois temas), ao contrário do desabilitado (opacidade 0,45).

---

## 8. Textos novos

Reaproveitar o que existe em `src/i18n/review.ts` (`review.kind.*`, `review.diff.*`, `review.flag.*`, `review.compare.*`, `review.issue.*`, `review.locked.*`, `review.note.*`, `review.undo*`, `review.details.accept.*`). Novos (nomes sugeridos):

| Chave                             | pt-BR                                                                      | en-US                                                                        |
| --------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `review.mark.label`               | `{field}: {kind}, {state}.`                                                | `{field}: {kind}, {state}.`                                                  |
| `review.mark.values`              | `Atual: {current}. Proposto: {proposed}`                                   | `Current: {current}. Proposed: {proposed}`                                   |
| `review.mark.part.create`         | `{field}: novo, parte da criação de {entity}`                              | `{field}: new, part of creating {entity}`                                    |
| `review.mark.part.remove`         | `{field}: será removido com {entity}`                                      | `{field}: removed with {entity}`                                             |
| `review.mark.withNote`            | `com nota`                                                                 | `with a note`                                                                |
| `review.pop.title`                | `{field} · {kind}`                                                         | `{field} · {kind}`                                                           |
| `review.pop.proposed`             | `Proposto`                                                                 | `Proposed`                                                                   |
| `review.pop.notThere`             | `(não existe)`                                                             | `(doesn't exist)`                                                            |
| `review.pop.decideOnItem.create`  | `Faz parte da criação da marcação: decida no cabeçalho, acima.`            | `Part of creating the marking: decide in the header above.`                  |
| `review.pop.decideOnItem.remove`  | `Sai com a marcação: decida a remoção no cabeçalho, acima.`                | `Goes with the marking: decide the removal in the header above.`             |
| `review.pop.showAll`              | `Ver tudo`                                                                 | `Show all`                                                                   |
| `review.pop.clear`                | `Limpar`                                                                   | `Clear`                                                                      |
| `review.pop.overwrite`            | `Sobrescrever`                                                             | `Overwrite`                                                                  |
| `review.pop.keepCurrent`          | `Manter atual`                                                             | `Keep current`                                                               |
| `review.pop.acceptWithItem`       | `Aceitar com a marcação`                                                   | `Accept with the marking`                                                    |
| `review.pop.tableHint`            | `A tabela é um campo: decide-se inteira.`                                  | `The table is one field: it's decided as a whole.`                           |
| `review.pop.rectHint`             | `Posição e tamanho são decididos juntos.`                                  | `Position and size are decided together.`                                    |
| `review.pop.closed`               | `Aceita em {accepted} e aplicada em {applied}.`                            | `Accepted on {accepted} and applied on {applied}.`                           |
| `review.pop.supersededPending`    | `Sem decisão numa proposta substituída: decida na nova.`                   | `Undecided in a superseded proposal: decide in the new one.`                 |
| `review.panel.notInView.proposed` | `Na visão Proposto este item não existe. O painel mostra o projeto atual.` | `This item doesn't exist in the Proposed view. Showing the current project.` |
| `review.panel.notInView.current`  | `Ainda não existe no projeto atual. O painel mostra como ficaria.`         | `Not in the current project yet. Showing how it would look.`                 |
| `review.panel.seeProposed`        | `Ver em Proposto`                                                          | `See in Proposed`                                                            |
| `review.panel.seeCurrent`         | `Ver na visão Atual`                                                       | `See in the Current view`                                                    |
| `review.panel.willBeRemoved`      | `Será removida`                                                            | `Will be removed`                                                            |
| `review.panel.createdByProposal`  | `Criada pela proposta`                                                     | `Created by the proposal`                                                    |
| `review.panel.blocksApply`        | `Bloqueia aplicar`                                                         | `Blocks applying`                                                            |
| `review.panel.removesWith`        | `Aceitar remove junto:`                                                    | `Accepting also removes:`                                                    |
| `review.panel.createdCount`       | `+ {count} anotação(ões) criada(s)`                                        | `+ {count} annotation(s) created`                                            |
| `review.panel.createHint`         | `A criação é uma mudança só: os campos marcados com + entram juntos.`      | `Creating is one change: the fields marked + come in together.`              |
| `review.panel.changes`            | `{count} mudança(s)`                                                       | `{count} change(s)`                                                          |
| `review.panel.allNew`             | `tudo novo`                                                                | `all new`                                                                    |
| `review.panel.otherChanges`       | `Outras mudanças`                                                          | `Other changes`                                                              |
| `review.panel.images`             | `Imagens`                                                                  | `Images`                                                                     |
| `review.panel.open`               | `Abrir`                                                                    | `Open`                                                                       |
| `review.panel.hiddenLayers`       | `{count} mudança(s) em camada escondida: {layers}`                         | `{count} change(s) in a hidden layer: {layers}`                              |
| `review.panel.showHere`           | `Mostrar aqui`                                                             | `Show here`                                                                  |
| `review.panel.hideAgain`          | `Ocultar de novo`                                                          | `Hide again`                                                                 |
| `review.panel.hiddenTag`          | `escondida`                                                                | `hidden`                                                                     |
| `review.panel.showMore`           | `Mostrar mais {count} anotação(ões)`                                       | `Show {count} more annotation(s)`                                            |
| `review.panel.rowAdded`           | `Linha nova`                                                               | `New row`                                                                    |
| `review.panel.rowsRemoved`        | `{count} linha(s) sai(em): veja no marcador`                               | `{count} row(s) removed: see the marker`                                     |
| `review.panel.closedNotice`       | `Proposta aplicada em {date}. Só para ver: as decisões não mudam mais.`    | `Proposal applied on {date}. View only: decisions can't change.`             |

Os rótulos do cabeçalho do item usam as chaves de hoje com o nome do nível (“Aceitar marcação” no lugar de “Aceitar item”, a decidir na 9.6 se vira chave nova por tipo de item).

---

## 9. Respostas às perguntas do briefing (seção 6)

1. **Forma e lugar do marcador:** selo de duas partes, tipo e decisão, no fim da coluna de rótulo (seção 4). O tipo é dito pelo glifo, a decisão pela forma; verde e vermelho só no ✓ e no ✕ cheios.
2. **Campos compostos:** um marcador para o `rect`, com colchete; tabela com um marcador para o campo, linhas novas com + e as que saem no popover e no rodapé da tabela; par livre com um marcador por par (chave e valor juntos), na coluna de ações.
3. **Seções recolhidas:** abrem sozinhas quando contêm mudanças; recolhidas, mostram “N mudanças” e as contagens (seção 5.2).
4. **Requisito 7:** “Outras mudanças” no fim do painel, também nos níveis Proposta e Projeto (seção 5.6).
5. **Popover ou expansão:** popover, com “Ver tudo” que expande dentro dele (seção 5.3).
6. **O que sai:** `ChangeCard` sai; `DiffValue` fica no popover (seção 2.4).

---

## 10. Decisões e pontos em aberto

**Aprovação:** o desenho e os quatro pontos abaixo foram aprovados pelo dono em 2026-10-15. Os pontos 1 a 3 se afastam de um requisito do briefing e por isso foram perguntados.

1. **Somente leitura legível, não desabilitado** (requisito 1 pedia “desabilitados como no Somente leitura de hoje”). Os controles usam o estado “Somente leitura” do DS (valor em texto, borda `color-border`, contraste cheio), não a opacidade 0,45: ler o valor é o trabalho da revisão.
2. **Foco pelas setas fica na lista** (requisito 8 pedia foco no marcador ao selecionar). Clique e Enter levam o foco ao marcador; as setas só rolam e destacam, para a navegação da janela Propostas continuar funcionando.
3. **Removidos riscados na visão Proposto** (exceção ao requisito 2, o painel mostra o projeto da visão aberta): par e anotação removidos numa entidade que fica aparecem riscados no lugar, com a decisão ali, sem trocar de visão.
4. **Camada escondida:** aviso com **Mostrar aqui**, só no painel, até trocar de item; o canvas e a janela Camadas não mudam.

Pontos que ficam para a implementação decidir e registrar no PR:

1. **Atraso do hover:** 300 ms (`duration-hover-intent`) e fechamento em `duration-base`; ajustar no teste manual se parecer lento.
2. **Mudanças de anotação sem prancheta** (`type`, `layerId`, `markingId`): a regra da seção 5.6 é derivada do desenho, não desenhada. Se não fechar na 9.5, perguntar no PR.
3. **Rótulos do cabeçalho por tipo de item** (“Aceitar marcação”, “Aceitar remoção”, “Aceitar imagem”): chaves novas ou interpolação; decidir na 9.6.
4. **Limites do item grande** (8 anotações por camada para começar recolhida, 12 cabeçalhos, lotes de 20): números da maquete; ajustar pelo orçamento de desempenho (`npm run test:perf`).
5. **`ChangeCard` sai de vez:** se algum teste e2e ou roteiro do `docs/TESTING.md` depender dele, a 9.6 atualiza no mesmo PR.

---

## 11. Ordem sugerida (fases 9.5 e 9.6)

1. **9.5** — índice “mudanças por entidade e campo” em `review.derived` com teste; o painel normal em somente leitura sobre `shownProject`; o ponto de extensão do marcador nos componentes do painel; `ChangeMark` e `ChangePopover` sem decisão (só valores); criação, remoção e fantasmas; seções que abrem; tokens novos; testes de componente (alteração, tudo novo, remoção, conflito, teclado).
2. **9.6** — decisão no popover e no cabeçalho do item e das anotações; “junto”; notas; trancado e conjunto inválido; “Outras mudanças” nos painéis de marcação e imagem e nos níveis Proposta e Projeto; proposta fechada e substituída; navegação a partir da janela Propostas (seção 6); `ChangeCard` sai; e2e, `ARCHITECTURE.md` e os roteiros R4 e R5 do guia.

## 12. Riscos e cuidados

- **Desempenho:** centenas de mudanças numa marcação (importação completa). O painel desenha só marcadores; o popover existe só aberto; o índice por campo é derivado e memoizado pela proposta, sem recalcular a cada decisão; `tests/components/editorRenders.test.tsx` continua no limite.
- **Componentes do modo normal sem saber de revisão:** o marcador entra por um ponto de extensão; nada de `if (review)` espalhado em `MarkingPanel`, `TypedFields` e afins.
- **Foco:** popover com `returnFocus` para o marcador (o modelo do `Dialog` e dos menus, etapa 7); fechar ao trocar de item não pode deixar o foco no `body`.
- **CSP:** estilo dinâmico só por JS (`el.style.x`, objeto `style`); cor de camada continua dado do projeto.
- **i18n:** rótulos podem crescer 30% em inglês; o rótulo da grade quebra linha ao lado do marcador, nunca empurra o controle.
