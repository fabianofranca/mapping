# Histórico — Etapa 4, propostas de alteração com revisão (seção do antigo PLAN.md)

> Fases 4.0 a 4.5 concluídas. Referência atual: [`../PROPOSAL-FORMAT.md`](../PROPOSAL-FORMAT.md), [`../FORMAT.md`](../FORMAT.md) (schema v8), [`../SPEC-FORMAT.md`](../SPEC-FORMAT.md) (especialização `formatVersion` 3), [`../MCP.md`](../MCP.md), [`../AGENT-GUIDE.md`](../AGENT-GUIDE.md) e [`../redesign/HANDOFF-PROPOSALS.md`](../redesign/HANDOFF-PROPOSALS.md).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo (exceto os checkboxes e o registro da simulação do roteiro na 4.5, ao fechar a etapa). As seções 1 a 13 estão em [`PLAN-etapas-1-2.md`](PLAN-etapas-1-2.md); as etapas seguintes, nos outros arquivos desta pasta.

---

## Fases pendentes — Etapa 4: propostas de alteração com revisão

### Objetivo

Toda alteração feita por um agente chega como uma **proposta**, uma espécie de pull request dentro da ferramenta. O usuário vê o projeto **como ficaria**, revisa as diferenças, **aceita ou rejeita** em qualquer nível (proposta, imagem, item ou mudança) e deixa **notas** no que rejeitou. O agente lê a revisão e manda uma **nova proposta** corrigida, até ficar certo. Vale igual para a primeira importação (tudo é criação) e para as atualizações seguintes.

A funcionalidade é **genérica**: não sabe de onde vêm os dados. Importar do Figma, migrar telas antigas ou corrigir anotações são só usos, conduzidos por skills dos agentes (ver Evoluções no `docs/ROADMAP.md`).

### Decisões

- **Caminho único:** o agente nunca grava o projeto direto. O `apply_changes` sai do MCP; a escrita passa a ser `propose_changes`. O `plan_changes` continua como prévia sem gravar nada (validação e resumo). `create_project` continua direto (cria a pasta vazia).
- **Rejeição só antes de efetivar.** Reverter uma proposta já aplicada fica para Evoluções; até lá, o caminho é pedir a correção ao agente com uma nota.
- **Granularidade:** decisões em quatro níveis, **proposta → imagem → item → mudança**, mais um grupo **Projeto** para o que não pertence a uma imagem (camadas, especializações, repositórios por plataforma). Decidir num nível vale para tudo abaixo; um nível menor pode contrariar o maior; o nível de cima mostra "parcial" quando os de baixo divergem.
- **Aplicar parcialmente:** "Aplicar aceitas" efetiva só o que foi aceito, numa única entrada de desfazer. O que está sem decisão continua pendente na mesma proposta.
- **Identidade externa genérica (`source`)** em imagens e marcações, para reexportações reconhecerem os mesmos elementos. O núcleo não interpreta `system`: é só um texto (ex: `"figma"`).
- **Origens também nas especializações (`sources`)**: um tipo de anotação pode declarar a que elementos de um sistema externo corresponde (ex: o componente `DS/Button` do Figma), e cada campo, de que propriedade de origem vem e como os valores se traduzem. É o que um agente de importação usa para saber que componente vira que tipo, sem deduzir pelo nome.
- **Propostas ficam na pasta do projeto** (`proposals/`), versionadas no git junto com o resto. O zip exportado as inclui.

### Unidades da revisão

| Nível | O que é | Exemplo |
|---|---|---|
| Proposta | Tudo o que o agente enviou | "Atualização do Checkout a partir do Figma" |
| Projeto | Mudanças fora das imagens | camada "Eventos" criada; SDUI atualizada para v3 |
| Imagem | Tudo que muda numa tela, inclusive a própria imagem | tela Checkout trocada e 12 itens alterados |
| Item | Uma marcação com tudo que mudou nela (geometria, nome, trava, anotações); as marcações filhas aparecem dentro dela | marcação "Botão Pagar" |
| Mudança | Uma alteração isolada | posição alterada; campo `estilo` de `primary` para `secondary`; anotação onClick criada; marcação removida |

**Mudanças** são calculadas pelo servidor ao receber a proposta: ele aplica as operações a uma cópia do projeto (pelo `src/model/`) e compara entidade por entidade, campo por campo. Cada mudança guarda o valor **antes** (`from`, no momento da proposta) e o **depois** (`to`):

- **criação** de imagem, marcação, anotação, camada: uma mudança com a entidade inteira;
- **remoção**: uma mudança;
- **alteração**: uma mudança por campo. Imagem: `name`, arquivo (troca), `placement`, `markingColor`, `locked`, `source`. Marcação: `name`, `rect`, `parentId`, `locked`, `source`. Anotação: `name`, `inherit`, `parentAnnotationId`, cada chave de `values` e cada par de `entries` (pelo `id`). Camada: `name`, `color`, posição;
- **especialização** (aplicar, atualizar, remover) e **repositório por plataforma**: uma mudança cada.

Itens criados recebem o **id definitivo** já na proposta, para notas, dependências e propostas seguintes poderem citá-los.

### Dependências e conflitos

- **Dependências** (resolvidas sozinhas ao decidir):
  - aceitar uma mudança dentro de um item criado aceita a criação dele (e a dos ancestrais criados na mesma proposta);
  - rejeitar a criação de um item rejeita o que depende dele (anotações, filhas, vinculadas, referências que apontam para ele);
  - aceitar a remoção de um item aceita a remoção do que a cascata do modelo já remove (o resumo mostra quantos).
- **Conflito:** a mudança cujo `from` não bate com o valor atual (o projeto mudou depois da proposta) aparece marcada como **conflito**, com o valor atual, o antes e o depois. Aceitar sobrescreve o valor atual; rejeitar mantém.
- **Itens trancados:** mudanças de geometria ou remoção num item trancado aparecem com o aviso "item trancado". Aceitar é permitido (a revisão é uma decisão deliberada), e a trava continua ligada depois.
- **Validação ao aplicar:** o conjunto aceito é aplicado a uma cópia e validado pelas invariantes do modelo. Se algo ficar inválido (ex: posição da filha aceita sem a do pai), o "Aplicar" fica bloqueado e a revisão aponta as mudanças envolvidas.

### Formato (`proposals/<id>/proposal.json`, `formatVersion` 1)

```json
{
  "format": "mapping-proposal",
  "formatVersion": 1,
  "id": "8c1f…",
  "title": "Checkout a partir do Figma",
  "description": "Telas da página Checkout do arquivo Loja v3.",
  "origin": "Figma: Loja v3 › Checkout",
  "author": "Claude Code",
  "createdAt": "2026-10-09T12:00:00.000Z",
  "baseRevision": 41,
  "supersedes": null,
  "status": "open",
  "revision": 0,
  "operations": [],
  "changes": [
    {
      "id": "c1",
      "kind": "update",
      "entity": "marking",
      "entityId": "3f2a…",
      "imageId": "9b1c…",
      "field": "rect",
      "from": { "x": 10, "y": 20, "width": 300, "height": 80 },
      "to": { "x": 10, "y": 32, "width": 300, "height": 80 }
    }
  ],
  "decisions": { "c1": { "state": "rejected", "at": "…" } },
  "notes": [{ "id": "n1", "target": { "level": "change", "id": "c1" }, "text": "A posição antiga estava certa.", "at": "…" }],
  "applied": {}
}
```

- `operations`: as operações enviadas pelo agente, guardadas para referência; o que a revisão e a aplicação usam são as `changes`.
- `status`: `open`, `applied` (tudo decidido, aceitas aplicadas), `superseded` (substituída por outra proposta), `withdrawn` (retirada pelo agente).
- Decisões e notas são gravadas pela app à medida que o usuário revisa (a revisão sobrevive a fechar a app). O arquivo tem `revision` própria, com a mesma conferência do `mapping.json`.

### Retomar a revisão

A revisão pode ser interrompida e retomada quantas vezes o usuário quiser, inclusive depois de fechar a app (e por outra pessoa, se a pasta estiver num repositório git):

- **Decidir e aplicar são separados.** Sair da revisão mantém tudo como está: o que foi aceito continua aceito (e não aplicado), o que foi rejeitado continua rejeitado com as notas, e o que está sem decisão continua pendente.
- **Aceitas aguardando aplicação** ficam visíveis: a janela Propostas mostra a contagem ("5 aceitas aguardando aplicação"), e "Sair da revisão" lembra disso quando houver alguma, oferecendo "Aplicar agora" ou "Sair mesmo assim".
- **Voltar ao ponto onde parou:** ao reabrir, a revisão volta ao último item visto, com os mesmos filtros e a mesma alternância Atual/Proposto. É estado de interface, guardado por dispositivo (`localStorage` com try/catch), fora da proposta e do desfazer.
- **Projeto editado entre uma sessão e outra:** ao reabrir, as mudanças afetadas aparecem como **conflito** (o `from` deixou de bater com o valor atual), sem perder as decisões já tomadas nas demais.
- **Proposta substituída no meio da revisão:** se o agente enviar uma proposta com `supersedes` enquanto a anterior ainda tem mudanças sem decisão ou aceitas sem aplicar, a app avisa ("esta proposta foi substituída por outra") e mostra o que ficou para trás. O guia do agente orienta a **só substituir uma proposta depois que a revisão dela estiver concluída** (nada pendente nem aceito sem aplicar); o `propose_changes` com `supersedes` devolve um aviso quando isso não for verdade.
- Imagens novas ou trocadas ficam em `proposals/<id>/images/` até serem aceitas; ao aplicar, são movidas para `images/`.
- Notas: `target.level` é `proposal`, `project`, `image`, `item` ou `change`.

**Schema v8 do projeto:** imagens e marcações ganham `source` (`{ "system", "id", "url" }` ou `null`). Migração v7 → v8 com `source: null` e o backup que já existe. Função pura `findBySource(project, system, id)`.

**Especialização `formatVersion` 3** (a importação continua aceitando 1 e 2; a 3 é a 2 mais `sources`):

```json
{
  "id": "button",
  "name": "Button",
  "sources": [{ "system": "figma", "id": "3f2a9c…", "name": "DS/Button" }],
  "fields": [
    {
      "key": "estilo",
      "type": "enum",
      "options": ["primary", "secondary", "text"],
      "sources": [{ "system": "figma", "name": "Style", "values": { "Primary": "primary", "Secondary": "secondary", "Text": "text" } }]
    },
    { "key": "texto", "type": "string", "sources": [{ "system": "figma", "name": "Label" }] }
  ]
}
```

- **No tipo de anotação**, `sources` (opcional): lista de `{ system, id?, name? }`, com pelo menos `id` ou `name`. Um tipo pode corresponder a vários elementos (ex: variantes antigas e novas do mesmo componente).
- **No campo** (inclusive nas colunas de `table`), `sources` (opcional): lista de `{ system, name, values? }`; `values` traduz valor de origem → opção do `enum` (só em campos `enum`, com destinos que existam em `options`).
- O núcleo não interpreta `system` nem os nomes: só valida a estrutura e devolve os dados a quem pedir (app, `get_specialization` e as funções puras).
- Função pura `findTypesBySource(specs, system, { id?, name? })`, para o agente achar o tipo a partir do elemento de origem.
- Validação, `docs/spec.schema.json` e `docs/SPEC-FORMAT.md` atualizados; os exemplos de `examples/specs/` continuam válidos sem `sources`.

### MCP

- **`propose_changes(project, { title, description, origin, supersedes? }, operations[])`**: valida como o `plan_changes`, calcula as mudanças, grava a proposta e devolve a referência `mapping://<projeto>/p/<código>` e um resumo por nível. Com `supersedes`, a proposta anterior passa a `superseded` (as decisões dela continuam guardadas); se ela ainda tiver mudanças sem decisão ou aceitas sem aplicar, a resposta traz um aviso.
- **`list_proposals(project, status?)`** e **`get_proposal(ref)`**: a proposta com as mudanças, o estado de cada uma (pendente, aceita, rejeitada, aplicada, conflito) e as notas.
- **`get_proposal_review(ref)`**: só o que importa para a próxima rodada: mudanças rejeitadas com as notas, notas gerais e conflitos, de forma compacta.
- **`withdraw_proposal(ref)`**: o agente retira uma proposta aberta.
- **`find_by_source({ project?, system, id })`**.
- **`find_types_by_source({ project, system, id?, name? })`**: os tipos das especializações aplicadas que correspondem a um elemento de origem.
- **`validate_specialization({ path? | text? })`**: valida um arquivo de especialização (dentro das raízes) ou um texto JSON, sem aplicar a nenhum projeto, e devolve os erros com o caminho exato (ex: `layers[0].annotationTypes[2].fields[1].sources[0].values.Primary`) e avisos (ex: plataforma declarada e não usada, tipo sem `code`). É o ciclo "gerar, validar, corrigir" de um agente que cria especializações.
- Operações aceitam `source` em imagens e marcações.
- **Sai `apply_changes`.** `SERVER_VERSION` vai para `0.3.0`.
- **`docs/AGENT-GUIDE.md`:** fluxo "ler o projeto → `propose_changes` → avisar o usuário → esperar a revisão terminar (`get_proposal`: nada pendente nem aceito sem aplicar) → `get_proposal_review` → nova proposta com `supersedes`, só com as correções". Para reexportações: usar `source` para casar os elementos e propor só o que mudou.

### App

- **Janela Propostas** (inferior, ao lado de Lista e Incompletas; tela cheia no celular): propostas abertas e fechadas, com título, origem, autor, data e contagens (pendentes, aceitas, rejeitadas, conflitos). Aviso discreto quando chega uma proposta nova (a pasta é conferida junto com o `mapping.json`).
- **Modo revisão** ao abrir uma proposta:
  - faixa no topo com o título, as contagens e as ações **Aceitar tudo**, **Rejeitar tudo**, **Aplicar aceitas** e **Sair da revisão**;
  - o projeto fica **somente leitura** durante a revisão; editar exige sair dela;
  - o canvas mostra o projeto **como ficaria** (atual + mudanças não rejeitadas), com alternância **Atual / Proposto**: criadas tracejadas, movidas com a posição antiga em fantasma, removidas riscadas, alteradas com selo; imagem trocada com comparação antes/depois;
  - a Árvore mostra os selos de mudança por item e por imagem, e serve de navegação da revisão;
  - a janela Propostas, em modo revisão, lista os níveis (Projeto → Imagem → Item → Mudança) com a decisão de três estados em cada nível (aceita, rejeitada, sem decisão; "parcial" quando os de baixo divergem);
  - os Detalhes mostram, para o item selecionado, o antes e o depois de cada campo, com aceitar/rejeitar por mudança e por item;
  - **notas** em qualquer nível; uma nota numa rejeição é sugerida, não obrigatória;
  - **filtros:** tipo de mudança, imagem, camada, decisão, só conflitos;
  - atalhos de teclado para aceitar, rejeitar e ir para a próxima mudança pendente.
- **Aplicar aceitas:** uma entrada de desfazer; move as imagens aceitas para `images/`; grava as decisões e o estado `applied` na proposta.
- Projetos locais (navegador) e zip importado também mostram e aplicam propostas; só a criação de propostas depende do MCP (pasta).
- Interface com os componentes do design system 2.0 e o resultado da fase 4.0.

### Fases

#### 4.0 — Design (Claude Design)
- [x] Telas: janela Propostas, modo revisão (faixa, canvas com diferenças, Atual/Proposto, Árvore com selos, níveis com decisão de três estados, Detalhes com antes/depois, notas, filtros, conflitos, aviso de item trancado), no desktop e no celular, temas claro e escuro
- [x] Documento de passagem em `docs/redesign/HANDOFF-PROPOSALS.md` (componentes novos e reaproveitados, tokens novos, comportamento)

**Aceite**: telas aprovadas pelo dono; nenhum componente novo sem justificativa no documento.

> **Estado**: concluída. Telas (rodadas 1 a 3: desktop, retomada, vazio, grande e celular) e decisões 1 a 7 da seção 8 do `HANDOFF-PROPOSALS.md` aprovadas pelo dono em 2026-10-09. A 4.4 segue a ordem da seção 9 desse documento.

#### 4.1 — Modelo
- [x] Schema v8 (`source`) + migração; `findBySource`
- [x] Especialização `formatVersion` 3 (`sources` nos tipos e nos campos), `findTypesBySource`, schema JSON e `SPEC-FORMAT.md`
- [x] Formato da proposta (zod), com mensagens de erro por caminho
- [x] Cálculo das mudanças (operações → mudanças com `from`/`to`, ids definitivos para criações)
- [x] Decisões em níveis (três estados, "parcial", dependências)
- [x] Conflitos, aviso de item trancado e validação do conjunto aceito
- [x] Comparação entre propostas para a substituída (por mudança: igual, diferente ou não consta na nova), função pura
- [x] Aplicação do conjunto aceito (puro: projeto atual + proposta + decisões → novo projeto + mudanças aplicadas)
- [x] `docs/FORMAT.md` (v8) e `docs/PROPOSAL-FORMAT.md`

**Aceite**: testes cobrindo cada tipo de mudança, as quatro regras de dependência, conflito após alteração externa, item trancado, conjunto inválido bloqueado, aplicação parcial seguida de outra aplicação, uma importação inteira (projeto vazio + proposta com tudo), e especializações v3 com `sources` válidas e inválidas (destino de `values` fora de `options`, `values` em campo que não é `enum`, origem sem `id` nem `name`), além de v1 e v2 continuarem abrindo.

#### 4.2 — MCP
- [x] `propose_changes`, `list_proposals`, `get_proposal`, `get_proposal_review`, `withdraw_proposal`, `find_by_source`; `source` nas operações
- [x] `find_types_by_source` e `validate_specialization` (arquivo ou texto, erros com caminho e avisos)
- [x] Remoção do `apply_changes`; `SERVER_VERSION` 0.3.0
- [x] Testes de integração por stdio: importação inteira, revisão simulada (editando decisões no arquivo), nova proposta com `supersedes`
- [x] `docs/MCP.md` e `docs/AGENT-GUIDE.md`

**Aceite**: o agente nunca altera o `mapping.json` (teste); a proposta gerada abre e é aplicada pela app; `validate_specialization` devolve os mesmos erros que a importação da app para os mesmos arquivos.

> **Estado**: implementada. O aceite está coberto por testes: `tests/mcp/proposals.test.ts` (hash do `mapping.json` conferido depois de cada tool; a proposta do MCP é aceita e aplicada por `applyAccepted`, a função que a app usa), `tests/mcp/specValidation.test.ts` (erros iguais aos de `parseSpecText`, a validação da importação da app). Decisões de detalhe no PR: `author` padrão é o nome do cliente MCP; lote sem mudanças é recusado (`no-changes`); `withdraw_proposal` só retira proposta aberta e não apaga os arquivos; o `base64` das operações não vai para o `proposal.json`; o estado de uma mudança em `get_proposal` é `pending`, `accepted`, `rejected` ou `applied`, com `conflict` e `locked` à parte.

#### 4.3 — App: armazenamento e estado
- [x] Leitura e gravação de `proposals/` na pasta, no IndexedDB e no zip
- [x] Detecção de proposta nova e de proposta alterada por fora
- [x] Estado da revisão (proposta aberta, decisões, notas, filtros) e estado derivado ("como ficaria", contagens, níveis, aceitas aguardando aplicação)
- [x] Retomar a revisão: último item, filtros e Atual/Proposto por dispositivo; conflitos recalculados ao reabrir; aviso de proposta substituída
- [x] Aplicar aceitas pela sessão (uma entrada de desfazer, imagens movidas, proposta atualizada)

**Aceite**: testes de store e storage; zip com propostas faz round-trip sem perdas.

#### 4.4 — App: interface
- [x] Janela Propostas e modo revisão conforme a fase 4.0, com a contagem de aceitas aguardando aplicação e o lembrete ao sair da revisão
- [x] Canvas com as diferenças e a alternância Atual/Proposto
- [x] Detalhes com antes/depois, decisões e notas; filtros; atalhos
- [x] Celular
- [x] Textos pt-BR/en-US, Ajuda e Atalhos
- [x] e2e: revisar e aplicar parcialmente uma proposta de fixture

**Aceite**: roteiro da etapa 4 (abaixo) no desktop e no celular, nos dois temas.

> **Estado**: implementada (componentes em `src/ui/review/`, marcas do canvas em `src/canvas/reviewMarks.ts` e `src/canvas/renderers/review.ts`). e2e em `tests/e2e/proposals.spec.ts` (desktop e celular) com o zip de exemplo `examples/proposta-exemplo.zip`, que permite seguir o roteiro sem o agente. Decisões de detalhe no PR.

#### 4.5 — Documentação e release
- [x] `README.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` (etapa 4 concluída)
- [x] Roteiro executado e registrado no PR (simulado; ver o estado abaixo)
- [x] Comando da tag `mcp-v0.3.0` no PR (o dono cria a tag)

**Aceite**: roteiro completo; o `mapping-mcp.js` da Release funciona copiado para `tools/` de um repositório de teste.

> **Estado**: fase concluída; o Aceite depende do dono em dois pontos. Os 11 passos do roteiro foram **simulados** (sem o Claude Code real): o agente foi o `mapping-mcp.js` por stdio (copiado para `tools/` de um repositório de teste, com o `.mcp.json` do `docs/MCP.md`) e quem revisa foi a `dist/index.html` no Chromium do Playwright, com a pasta do projeto em OPFS espelhada com a do disco; passo a passo e resultados na descrição do PR. O que continua com o dono: criar a tag `mcp-v0.3.0` depois do merge, testar o `mapping-mcp.js` **baixado da Release** num repositório dele com o Claude Code de verdade e rodar um `propose_changes` simples. Um bug encontrado na simulação foi corrigido nesta fase: o "refazer", depois de desfazer um "Aplicar aceitas" com imagens novas, falhava ao salvar numa pasta (o conteúdo da imagem guardado para o "refazer" era uma referência ao arquivo, ilegível depois de removido; agora é uma cópia em memória, com teste em `tests/store/session.test.ts`). Observações que não foram corrigidas: na revisão de uma proposta sobre um projeto **vazio** (primeira importação) a Árvore e o canvas mostram o aviso "Nenhuma imagem ainda"; no celular, o botão de expandir/recolher das linhas dos níveis tem 16 × 16 px; no roteiro, o passo 7 só produz conflito se a edição à mão vier **depois** da proposta, e o passo 9 só recebe "uma proposta que move" o item trancado se a trava vier depois dela (o `propose_changes` recusa com `locked` um lote que mexe num item já trancado, a não ser que o lote o destranque antes).

> **Ordem e paralelismo**: 4.0 pode começar já, em paralelo com 4.1. Depois da 4.1, em paralelo, 4.2 (MCP) e 4.3 (app: armazenamento e estado). A 4.4 depende da 4.3 e da 4.0. Por último, 4.5.

### Decisões a confirmar

1. Projeto somente leitura durante a revisão (editar exige sair dela).
2. Aceitar mudança em item trancado é permitido, com aviso; a trava continua ligada.
3. Propostas incluídas no zip exportado.
4. Nota em rejeição sugerida, não obrigatória.
5. `plan_changes` continua como prévia sem gravar.
6. Proposta substituída (`superseded`) mantém as decisões e notas, mas as mudanças pendentes dela deixam de poder ser aplicadas (a app avisa, e o agente é orientado a só substituir depois da revisão concluída).
7. `sources` só em especializações `formatVersion` 3 (e não como campo opcional da 2), para versões antigas da app recusarem o arquivo com uma mensagem clara em vez de erro genérico.
8. `validate_specialization` aceita caminho (dentro das raízes) ou texto JSON.

### Roteiro de teste manual da etapa 4

Use uma pasta de projeto dentro de um repositório git e o Claude Code com o MCP 0.3.0.

1. **Importação nova:** peça ao agente para montar um projeto a partir de dois prints de tela, com a SDUI v2. Confira que o `mapping.json` não mudou e que a janela Propostas mostra a proposta nova.
2. Abra a proposta: o canvas mostra o projeto como ficaria, tudo como criado. Alterne Atual/Proposto.
3. **Aceite a tela 1 inteira.** Na tela 2, aceite tudo, **rejeite um item** com uma nota e, noutro item, **rejeite só a mudança de tipo** de uma anotação, com uma nota. Confira o estado "parcial" na tela 2 e na proposta.
4. **Aplicar aceitas:** confira o projeto, as imagens em `images/` e que um único desfazer volta tudo. Refaça.
5. **Retomar:** numa proposta nova, decida metade das mudanças, aceite algumas sem aplicar e feche a app. Reabra: a revisão volta ao mesmo item, com os mesmos filtros, as decisões e notas preservadas e a contagem de "aceitas aguardando aplicação". Clique em "Sair da revisão" e confira o lembrete.
6. Peça ao agente para ler a revisão e corrigir: a nova proposta substitui a anterior e traz só as correções. Aceite e aplique. Repita pedindo uma substituição antes de terminar a revisão: confira o aviso na app e na resposta do agente.
7. **Atualização:** edite à mão uma marcação e peça ao agente uma atualização que mexa nela: a mudança aparece como **conflito**, com os três valores.
8. **Dependências:** numa proposta com uma marcação criada e anotações nela, rejeite a criação e confira que as anotações foram rejeitadas junto; aceite uma anotação e confira que a criação voltou a ser aceita.
9. **Item trancado:** tranque uma marcação e receba uma proposta que a move: aparece o aviso, e aceitar mantém a trava.
10. **Reexportação:** uma segunda proposta com os mesmos elementos (mesmo `source`) só traz o que mudou.
11. Exporte o zip e confira `proposals/` com as decisões e notas; reimporte e confira a revisão preservada.
