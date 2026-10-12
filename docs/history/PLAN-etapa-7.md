# Histórico — Etapa 7, correções da rodada dirigida (seção do antigo PLAN.md)

> Fases 7.1 a 7.4 concluídas (PRs #117 a #120; o plano entrou no #116). Referência atual: [`../TESTING.md`](../TESTING.md) (guia do testador), [`../ARCHITECTURE.md`](../ARCHITECTURE.md) e o [`README.md`](../../README.md); o MCP continua 0.3.2 ([`../MCP.md`](../MCP.md)). Ao lado ficam o relato que originou a etapa ([`relato-2026-10-12-dirigida.md`](relato-2026-10-12-dirigida.md)), o prompt do coordenador de agentes ([`etapa-7-coordenador.md`](etapa-7-coordenador.md)) e o prompt do testador em vigor ([`etapa-6-testes-cowork.md`](etapa-6-testes-cowork.md)).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes da 7.4, marcados ao fechar a etapa, e o caminho do prompt do coordenador, que saiu de `docs/prompts/`. Depois dela vêm o fechamento (o que valeu das decisões a confirmar e as decisões consolidadas dos PRs) e o que ficou para depois. As etapas anteriores estão nos outros arquivos desta pasta.

---

## Fases pendentes — Etapa 7: correções da rodada dirigida

### Objetivo

Fechar o que a **segunda rodada de testes** (dirigida: R0 e os achados 2 a 15 da rodada 1) encontrou no build `db5060d` em 2026-10-12. O relato fica em `docs/history/relato-2026-10-12-dirigida.md`: 58 linhas, 57 ✅ e 1 ❌; dos 14 achados corrigidos pela etapa 6, 12 confirmados e 2 fechados em parte (foco do teclado, achado 4; textos cortados ou cobertos, achado 6). Nenhum achado impede o uso com pessoas: a etapa é curta, só correções pequenas, sem funcionalidade nova, sem mudança de schema, de formato da proposta ou do MCP. O marco "Uso real" pode correr em paralelo sobre o build atual.

Entram: os três achados nos alvos (A1 foco no `body` em três diálogos; A2 etiqueta da filha selecionada sobre o rótulo do pai; A3 célula `exemplo` cortada sem `title`), as quatro regressões fora do alvo (G1 entrada antiga do "retomar revisão" vale para qualquer cópia nova; G2 zip importado entra nos recentes com a data de dentro do zip; G3 **Enquadrar tudo** com o tamanho antigo do canvas; G4 **Remover da lista** deixa o foco no `body`), a observação O2 (seta dupla no valor de referência) e os pontos de "O que atrapalhou" que são texto do guia ou do prompt do testador.

### Decisões

- **Mesmas regras das etapas 5 e 6**: teste primeiro (o commit do teste que reproduz o achado vem antes do da correção), um PR por fase, gates antes do PR. Nada do schema v8, do formato da proposta nem do MCP muda (o MCP continua 0.3.2; ver "Fora desta etapa").
- **Foco nunca cai no `body`** (A1, G4). O `Dialog` continua devolvendo o foco a quem o abriu; quando o abridor saiu do DOM ou foi trocado (item de menu que fechou com o menu, campo `dado` substituído pelo valor escolhido, botão **Exportar** que já não tinha o foco porque o zip foi gerado antes de o diálogo abrir), o foco vai a um **alvo de retorno explícito** passado pelo chamador (o campo `dado`, o botão de ações da linha ou a própria tabela, o botão **Exportar**); sem alvo explícito, vai ao contêiner focável mais próximo do abridor registrado ao abrir. Na tela inicial, **Remover da lista** passa o foco ao botão **Abrir** da linha seguinte (ou da anterior, na última) e, sem linhas, ao título da lista.
- **Entrada antiga do "retomar revisão" não conta como "vista"** (G1). A entrada sem a cópia do projeto na chave (de antes da 6.5) continua devolvendo posição e filtros, como decidido na 6.5, mas a proposta da cópia nova é **nova**: a barra de status mostra "1 proposta(s) nova(s)" e o primeiro **Revisar** começa pela visão Proposto.
- **Importar um zip conta como uso** (G2). Ao abrir um zip, o projeto neste dispositivo nasce com `openedAt` igual a agora e vai para o topo dos recentes; `updatedAt` continua sendo a data de dentro do zip (é a última alteração do projeto).
- **Enquadrar tudo mede antes de enquadrar** (G3). `fitAll` lê o tamanho atual do contêiner em vez do último medido pelo `ResizeObserver`, que ainda não disparou logo depois de fechar uma janela de ferramenta.
- **Texto cortado tem `title`** (A3). Toda célula de texto da tabela `atributos` (e os campos de texto dos tipos) ganha `title` com o valor inteiro quando estiver cortada, não só os valores de referência (6.4).
- **Etiqueta da selecionada não cobre o rótulo do pai** (A2). A etiqueta de nome da marcação selecionada é deslocada quando colide com o rótulo do pai, como a 6.4 já faz para o rótulo de filha não selecionada e para o título da imagem.

### Execução por um coordenador de agentes

Mesmo desenho das etapas 5 e 6; o prompt do coordenador está em `docs/history/etapa-7-coordenador.md` (modelo e esforço por fase, execução completa, parcial, paralela ou sequencial). Regras:

1. **Uma fase = um branch + um PR**, `claude/etapa-7-<n>-<assunto>`. O executor recebe só a sua fase e não mexe em arquivos de outra fase da mesma onda (exceção: `src/i18n/pt-BR.ts` e `en-US.ts`).
2. **Ondas** (arquivos disjuntos dentro de cada uma; releia esta seção na `main` antes de abrir cada onda):
   - **Onda 1:** 7.1 (foco e Detalhes), 7.2 (canvas), 7.3 (revisão, recentes e guia).
   - **Onda 2:** 7.4 (fechamento; depende das três).
3. **Gates antes de abrir o PR:** `npm run lint && npm run typecheck && npm test && npm run build`. O coordenador confere `check` e `e2e` verdes.
4. **Descrição do PR** com Resumo, Como testar (só desktop) e Decisões tomadas; checkboxes da fase marcados neste `PLAN.md` no mesmo PR.
5. **Decisões pequenas** o executor toma e documenta; ambiguidade que mude comportamento visível vira pergunta no PR e o coordenador decide ou escala ao dono.
6. **Aceite** de cada fase é o descrito nela; sem o teste que reproduz o achado, o PR volta.

### Fases

#### 7.1 — Foco ao fechar diálogos e Detalhes

**Achados A1 (média), G4 (baixa), A3 (baixa) e O2.** Depois de fechar **Exportar** (Esc, **Cancelar** ou salvar), de escolher um alvo em "Escolher alvo de …" com Enter e de confirmar **Excluir** no "Referências vão quebrar" (menu "Ações da linha" › **Remover linha**), `document.activeElement` é o `body`: o `Dialog` da 6.4 só devolve o foco se o abridor continuar no DOM, e nesses três casos ele sumiu ou foi trocado. **Remover da lista**, na tela inicial, tem o mesmo efeito. Na tabela `atributos`, a célula `exemplo` mostra "ana@exe" sem `title`. No valor de referência, o ícone de seta e o texto "→" aparecem juntos ("→ → User.nome").

**Toca em:** `src/ui/Dialog.tsx` (alvo de retorno explícito e fallback), `src/app/ExportDialog.tsx`, `src/ui/RefPicker.tsx` e `src/ui/FieldEditors.tsx` (retorno ao campo `dado`; seta dupla), `src/ui/TableField.tsx` (retorno após **Remover linha**; `title` nas células), `src/ui/ActionMenu.tsx` (se precisar expor o abridor do menu), `src/app/Home.tsx` (foco após **Remover da lista**), `src/i18n/*`, `tests/components/dialogs.test.tsx`, `tests/components/editorShell.test.tsx`, `tests/components/Home.test.tsx`, `tests/components/*` da tabela e dos campos.

- [x] Testes que reproduzem: fechar Exportar, escolher alvo com Enter, Excluir no "Referências vão quebrar" e Remover da lista deixam o foco no `body` (hoje falham ao esperar o alvo certo); `exemplo` cortado sem `title`
- [x] `Dialog`: prop de alvo de retorno (elemento ou função) usada quando o abridor não está mais no DOM; sem ela, o contêiner focável mais próximo do abridor; o `body` nunca
- [x] Exportar volta ao botão **Exportar**; Escolher alvo volta ao campo `dado`; Referências vão quebrar volta ao botão de ações da linha (ou à tabela, se a linha saiu); Remover da lista vai ao **Abrir** da linha seguinte (ou anterior) ou ao título da lista
- [x] `title` com o valor inteiro nas células de texto da tabela e nos campos de texto dos tipos quando cortados
- [x] Valor de referência com uma seta só (ícone ou texto)
- [x] Testes de componente para cada caso

**Aceite**: R1.8, R1.9, R1.15, R1.22 e R0.7 do `docs/TESTING.md` com o foco no controle esperado depois de fechar; "Visual: diálogos" da rodada dirigida sem o ❌.

#### 7.2 — Canvas: etiqueta da selecionada e Enquadrar tudo

**Achados A2 (baixa) e G3 (baixa).** A 52%, selecionar **Nome** (filha encostada no topo do Formulário) põe a etiqueta azul "Nome" por cima do rótulo "Formulário …"; a 6.4 tratou o rótulo de filha não selecionada e a etiqueta que encosta no título da imagem, não a etiqueta da selecionada sobre o rótulo do pai. **Enquadrar tudo** logo depois de fechar a janela de baixo usa a altura antiga do canvas (a imagem fica na parte de cima); o segundo clique enquadra certo.

**Toca em:** `src/canvas/renderers/overlay.ts` (`renderNameTag`), `src/canvas/renderers/markings.ts` (posição dos rótulos, se a colisão precisar ser calculada lá), `src/canvas/viewportController.ts` (`fitAll` mede o contêiner antes), `src/canvas/CanvasController.ts` (se a medição precisar ser exposta), `tests/canvas/viewportController.test.ts`, `tests/canvas/renderers/*`, `tests/canvas/CanvasController.test.ts`.

- [x] Testes que reproduzem: `fitAll` depois de o contêiner crescer sem o `ResizeObserver` ter disparado usa o tamanho novo (hoje usa o antigo); a etiqueta da selecionada não intersecta o retângulo do rótulo do pai (hoje intersecta)
- [x] `fitAll` (e `centerOn`, se tiver o mesmo problema) mede o contêiner antes de calcular
- [x] Etiqueta da marcação selecionada deslocada quando colide com o rótulo do pai (para baixo da linha de cima da marcação, ou para o lado), com a mesma regra da 6.4
- [x] Orçamentos de desempenho (`tests/canvas/renderPerformance.test.ts`) continuam no limite

**Aceite**: R1.6 e R1.9 do guia sem a etiqueta cobrindo o pai; fechar a janela de baixo e clicar em **Enquadrar tudo** uma vez enquadra no canvas inteiro.

#### 7.3 — Revisão, recentes e guia

**Regressões G1 e G2 (baixas) e "O que atrapalhou".** Com um `mapping.reviewResume` de antes da 6.5 no `localStorage` (chave só com o id da proposta), a primeira importação do `proposta-exemplo.zip` não mostra "1 proposta(s) nova(s)" e o primeiro **Revisar** já diz "A revisão voltou ao ponto onde você parou": `seen` nasce com as chaves legadas, que valem para qualquer cópia. Um projeto aberto do zip entra nos recentes com o "Último uso" da data de dentro do zip e vai para o fim da lista, porque a importação não grava `openedAt`. No guia: a seção 4 pede "janela à vista" mas os seletores nativos abertos pelo agente (**Baixar**, **Abrir pasta**, **Abrir zip**) só aparecem com a janela **em foco** (a recusa vira cancelamento silencioso); R4.2 e R4.6 dizem que a Árvore mostra selos, mas os selos (Criada, Removida, Conflito…) ficam na lista **Nível** da janela Propostas e a Árvore mostra a visão (Atual ou Proposto), sem o item removido na Proposto; R4.5 descreve o caso secundário do "junto" (**Rejeitar item** rejeita as duas mudanças direto, sem a marca); R5.4 "aceite o que ainda estiver sem decisão" não diz que **Aceitar tudo** vira as rejeitadas; R0.3 e R1.1 não avisam que uma imagem pequena fica `.png` quando o WebP sai maior; o prompt do testador não avisa que projetos e entradas de rodadas anteriores no navegador do dono contaminam R4.1.

**Toca em:** `src/store/review.ts` (`seen` inicial só com as entradas da própria cópia), `src/storage/local.ts` (importar grava `openedAt`) e `src/app/controller.ts` (se a ordem dos recentes precisar), `tests/store/review.test.ts`, `tests/storage/*` dos recentes, `tests/app/controller.test.ts`, `docs/ARCHITECTURE.md` (parágrafos dos recentes e do retomar revisão), `docs/TESTING.md`, `docs/history/etapa-6-testes-cowork.md` (o prompt do testador em vigor; só as frases novas).

- [x] Testes que reproduzem: entrada legada no `localStorage` e cópia nova: a proposta conta como nova (hoje não); importar zip: `openedAt` de agora e o projeto no topo (hoje fica com a data do zip)
- [x] `review.ts`: `seen` começa só com as chaves da própria cópia; a entrada legada continua devolvendo posição e filtros ao retomar
- [x] `local.ts`: `import` grava `openedAt`; `ARCHITECTURE.md` diz que abrir ou importar conta como uso
- [x] `TESTING.md`: seção 4 "à vista **e com o foco**" com a nota dos seletores nativos; R4.2 e R4.6 com os selos na lista Nível e a Árvore na visão; R4.5 reescrito a partir do que a app faz (rejeitar só a criação da marcação leva a anotação junto; aceitar a anotação traz a criação de volta com **junto**); R5.4 com "filtro **Sem decisão** e **Aceitar** no nível Projeto" e o aviso sobre **Aceitar tudo**; R0.3 e R1.1 com a nota do `.png`
- [x] Prompt do testador: item 7 pede janela à vista **e em foco** (e o que fazer quando o clique num seletor não abre nada); novo item sobre estado de rodadas anteriores no navegador do dono (projetos **Loja**/**Local** e `mapping.reviewResume`): usar perfil limpo ou registrar o que já existia antes do R4.1

**Aceite**: R4.1 com uma entrada legada no `localStorage` mostra "1 proposta(s) nova(s)"; **Abrir zip** põe o projeto no topo dos recentes com a data de hoje; um agente novo lê os passos alterados do guia e não encontra nenhum dos pontos de "O que atrapalhou" acima.

#### 7.4 — Fechamento

**Toca em:** `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`, novo `docs/history/PLAN-etapa-7.md`, `docs/prompts/etapa-7-coordenador.md` (vai para `docs/history/`).

- [x] Esta seção vai para `docs/history/PLAN-etapa-7.md` com as decisões consolidadas dos PRs e o que valeu de "Decisões a confirmar"; o prompt do coordenador vai junto, com o aviso de histórico; `PLAN.md` volta a "nenhuma etapa em andamento"; `docs/ROADMAP.md` marca a etapa 7 concluída e o marco com as duas rodadas; `CLAUDE.md` atualiza "Etapa atual"
- [x] Linha no topo de `docs/history/relato-2026-10-12-dirigida.md` apontando para o histórico da etapa (já aponta para o `PLAN.md`)

**Aceite**: `PLAN.md` sem fases pendentes; `CLAUDE.md`, `ROADMAP.md` e `docs/history/` coerentes entre si.

### Decisões a confirmar

1. Alvo de retorno explícito por diálogo, com fallback no contêiner do abridor; o `body` nunca. Proposto: sim.
2. Entrada legada do "retomar revisão" devolve posição e filtros, mas não conta como "vista". Proposto: sim.
3. Importar um zip grava `openedAt` de agora (o projeto vai para o topo). Proposto: sim.
4. `fitAll` mede o contêiner antes de enquadrar. Proposto: sim.
5. `title` em toda célula de texto cortada, não só nos valores de referência. Proposto: sim.

### Fora desta etapa

- **O1** (diálogo Exportar que não fechou depois de um "Salvar como"): não reproduziu; provável soma de dois cliques com a janela sem foco. Fica para o uso real.
- **O3** (bloco de código da Ajuda rola na horizontal): comportamento aceitável num `pre`.
- **O4** (`create_project` do MCP cria `images/` vazia): cosmético e mudaria a saída do MCP, o que exige release; fica para a próxima mudança do MCP.
- As mudanças de produto de "Fora desta etapa" das etapas 5 e 6 continuam valendo (`docs/history/PLAN-etapa-5.md`, `docs/history/PLAN-etapa-6.md`).
- Depois da etapa: o dono decide entre uma rodada dirigida nos itens A1 a A3 e G1 a G4 (prompt `docs/history/etapa-6-testes-cowork.md`, citando `docs/history/relato-2026-10-12-dirigida.md`) ou seguir direto com o marco "Uso real".

---

## Fechamento (fase 7.4)

### Decisões a confirmar: o que valeu

As cinco foram adotadas como **Proposto**, sem comentário do dono:

1. Alvo de retorno explícito por diálogo, com fallback no contêiner do abridor; o `body` nunca (7.1, prop `returnFocus` do `Dialog`).
2. Entrada legada do "retomar revisão" devolve posição e filtros, mas não conta como "vista" (7.3; a visão também não volta).
3. Importar um zip grava `openedAt` de agora e o projeto vai para o topo (7.3; vale para todo `create`).
4. `fitAll` mede o contêiner antes de enquadrar (7.2).
5. `title` em toda célula de texto, não só nos valores de referência (7.1; sempre, não só quando cortada).

### Decisões consolidadas dos PRs

**Coordenação**

- Onda 1 em paralelo, cada fase a partir da `main` com o plano (#116): #117 (7.2), #118 (7.3) e #119 (7.1), mergeados nessa ordem. Onda 2: #120 (7.4).
- Todos os PRs foram mergeados pela conta do dono (na API, autor e quem mergeou aparecem como a mesma conta).
- Nada do schema v8, do formato da proposta nem do MCP mudou; o MCP continua 0.3.2, sem tag nova.

**7.1 — Foco ao fechar diálogos e Detalhes (#119)**

- `Dialog` ganhou a prop `returnFocus` (elemento ou função, lida ao fechar). Ordem do retorno: quem abriu; se saiu do DOM (ou não havia ninguém), o alvo explícito; sem ele, o contêiner focável mais próximo de quem abriu, registrado ao abrir (ou o primeiro controle dentro dele); o `body` nunca. Se o foco já foi para outro lugar de propósito, o diálogo não mexe nele.
- O retorno roda **depois da renderização que fecha o diálogo** (`restoreFocusAfterRender`, um `queueMicrotask`): o Preact desmonta o diálogo antes de aplicar o resto da mesma renderização, então só depois dela se sabe se quem abriu continua no DOM. Os auxiliares `captureFocusOrigin`, `restoreFocus` e `restoreFocusAfterRender` são exportados e servem também ao `RefPicker`.
- **Escolher alvo**: o seletor de referência fecha o modal antes de devolver o foco ao campo `dado` (antes, `focus()` era chamado com o modal aberto e o resto da página inerte).
- **Exportar** volta ao botão **Exportar** da barra principal (achado pelo `aria-keyshortcuts`, que não muda com o idioma).
- **Referências vão quebrar** volta ao botão de ações da linha (a que ficou no lugar, ou a anterior se era a última); sem linhas, ao **+ Linha** da tabela. Em **Cancelar**, ao botão de ações da própria linha.
- **Remover da lista** vai ao **Abrir** da linha seguinte (ou da anterior) ou, sem linhas, ao título "Projetos recentes" (`tabIndex=-1`); vale também pelo aviso "Pasta indisponível". **Excluir projeto** deste dispositivo usa o mesmo mecanismo (extensão fora do plano, documentada no PR).
- `title` sempre com o valor inteiro (não só quando cortado: saber se está cortado exigiria medir o layout), nos campos de texto e de número do `SimpleEditor` (células da tabela e campos dos tipos); o motivo de pendência vem depois, em outra linha.
- **Seta única** no valor de referência: fica o ícone; o texto "→ …" só na dica e na exibição em texto (Lista, canvas).
- Fora do "Toca em", pelo mínimo: `src/ui/TypedFields.tsx` (onde mora o campo `dado`) e `tests/e2e/flows.spec.ts` (esperava "→ User.name" no texto). Helper de teste novo: `tests/components/modalFocus.ts` (simula a inércia do modal, que o jsdom não tem). `src/ui/ActionMenu.tsx` não mudou.

**7.2 — Canvas: etiqueta da selecionada e Enquadrar tudo (#117)**

- Quando colide com o rótulo do pai, a etiqueta da selecionada desce para **logo abaixo do rótulo do pai** (vão de 2 px, mesmo x), dentro da filha; não vai para o lado. Só o **pai imediato** conta, como na 6.4. O `MarkingRenderer` expõe `headers`, consulta preguiçosa ao rótulo desenhado, sem alocação por quadro.
- `centerOn` não mudou: o único caminho que o chama (`focusSelection`) já mede o contêiner.
- `fitAll` mede o contêiner antes de enquadrar; o signal `size` só muda quando o tamanho mudou. Enquadrar com o canvas já medido conta como **enquadramento inicial** (a primeira medição do `ResizeObserver` não enquadra de novo).

**7.3 — Revisão, recentes e guia (#118)**

- A entrada legada do retomar revisão devolve posição e filtros, **não a visão** (a revisão começa em Proposto) e não conta como vista. O aviso "A revisão voltou ao ponto onde você parou" continua aparecendo com a entrada legada (a posição volta de fato; mantido por ser o mais conservador).
- Criar ou importar grava `openedAt` (`LocalLibrary.create`); `updatedAt` continua a data de dentro do zip. O `controller.ts` não mudou.
- Guia (`docs/TESTING.md`): a nota do `.png` (R0.3, R1.1 e a convenção de adicionar imagem); **Aceitar N visíveis** na barra só a partir de 1200 px (abaixo, menu **Em lote**); os selos são ícones com o nome na dica; R4.9 diz onde selecionar o Banner promoção.
- Prompt do testador (`docs/history/etapa-6-testes-cowork.md`): item 7 com a janela à vista e em foco, pedindo ao dono que clique no Chrome antes de cada seletor nativo; **item 8 novo** sobre o estado de rodadas anteriores (projetos Loja/Local, a chave `preview:mapping.reviewResume` na prévia, `file://` e Pages com `localStorage` separados); o agente não apaga nada.
- Aceite do guia feito por um agente novo, sem contexto: 8 pontos apontados e corrigidos; a ordem do texto do R4.6 ficou de lado (opcional).

**7.4 — Fechamento (#120)**

- Esta seção saiu do `PLAN.md`; o prompt do coordenador foi de `docs/prompts/` para esta pasta (`git mv`, com o aviso de histórico), e a pasta `docs/prompts/` deixou de existir.
- `docs/ARCHITECTURE.md` (Diálogos e tela inicial) ganhou a frase sobre `returnFocus` e `restoreFocus` que a 7.1 deixou para o fechamento.

### Fora desta etapa (acrescentado no fechamento)

- **Próxima rodada do Cowork**, se o dono quiser: dirigida nos itens **A1 a A3 e G1 a G4** (prompt [`etapa-6-testes-cowork.md`](etapa-6-testes-cowork.md), modo dirigido, citando [`relato-2026-10-12-dirigida.md`](relato-2026-10-12-dirigida.md)). Ou seguir direto com o marco "Uso real" ([`../ROADMAP.md`](../ROADMAP.md)).
- **Aviso "A revisão voltou ao ponto onde você parou" com entrada legada** (7.3): se o dono preferir sem o aviso (ou sem devolver posição e filtros), é uma linha em `open` (`src/store/review.ts`).
- O1, O3 e O4 continuam como acima; e continuam valendo os itens de "Fora desta etapa" das etapas 5 e 6 ([`PLAN-etapa-5.md`](PLAN-etapa-5.md), [`PLAN-etapa-6.md`](PLAN-etapa-6.md)).
- **Resíduos da auditoria da entrega** (PR aberto depois do fechamento): último recurso do foco no primeiro controle da app (`data-focus-root`), para um diálogo aberto por atalho com o foco no `body` não deixar o foco lá; teste do **Cancelar** no "Referências vão quebrar"; os números dos PRs.
- **Ctrl+Enter no seletor de alvo ("Ir ao alvo")**: a navegação troca a marcação selecionada, o campo `dado` sai do DOM e o foco cai no primeiro controle do painel Detalhes. A correção certa é a navegação focar o cartão da anotação de destino (desenho de foco do editor), não o `Dialog`; fica para quando o uso real pedir.
