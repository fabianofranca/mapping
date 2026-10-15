# Auditoria da etapa 8 — segunda leitura

> Leitura independente da entrega da etapa 8 sobre a `main` em `312915f` (PR #133, fase 8.7 parte 1), feita em 2026-10-13 pela sessão do dono, depois da auditoria do coordenador (os resíduos 1 a 12 tratados ou registrados no PR #133). Seis leitores em paralelo, um por fase, juntaram a evidência; **cada resíduo abaixo foi conferido no código por esta sessão antes de entrar aqui**, e a regressão alta foi reproduzida. Feita com o Opus 5.5 em esforço máximo porque o limite do Fable tinha acabado: a seção 4 lista o que uma sessão com o Fable deve fechar, a seção 5 traz o prompt pronto e a seção 6 é a resposta dessa sessão (terceira leitura). O que valer daqui vai para `docs/history/PLAN-etapa-8.md` na 8.7 parte 2.
>
> **Certeza** de cada conclusão: **alta** (conferido no código e coberto por teste, ou reproduzido), **média** (conferido no código, mas depende de comportamento do navegador ou de raciocínio sobre concorrência que vale uma segunda leitura), **baixa** (não fechado; vai para o Fable).

## 1. Veredito

| Fase | Veredito | Alto | Médio | Baixo | Certeza |
| --- | --- | --- | --- | --- | --- |
| 8.1 Sessão e gravação | Entregue | 0 | 0 | 5 | alta |
| 8.2 Revisão de propostas | Entregue | 0 | 0 | 3 + 1 corrida teórica | alta (a corrida vai para o Fable decidir, seção 4) |
| 8.3 Foco, diálogos e teclado | **Entregue com uma regressão** | **1** | 1 | 6 | alta (reproduzida) |
| 8.4 Recentes e controller | Entregue | 0 | 0 | 5 | alta |
| 8.5 MCP 0.3.3 | Entregue | 0 | 0 | 4 | alta |
| 8.6 Guia e prompt + 8.7 parte 1 | Entregue | 0 | 7 | 9 | alta |

Todos os achados da revisão técnica (S1 a S10, P1 a P11, F1 a F10, R1 a R10, M1 a M14 menos o M11, G1 a G16) estão corrigidos e cobertos, com a exceção parcial do S10 (o backup não conta em `wrote`, baixo). Em toda fase com código, o commit do teste veio antes do da correção (exceções: o F7, retroativo, e o `closest` por classe do PR #133, no mesmo commit). As regras automáticas prometidas existem e pegam o padrão antigo (conferido rodando-as sobre o código de antes de cada fase).

**Portão.** A rodada completa do Cowork deve esperar um PR pequeno com:

1. **A regressão alta da 8.3** (seção 3.3): depois de gravar, desfazer e digitar o mesmo texto, o Enter não grava.
2. **Três médios do guia e do prompt que geram atrito ou falso achado na própria rodada:** M6 (o prompt manda conferir o build id "esperado", mas ninguém o informa), M4 (R5.2 a R5.7 pedem algo ao Claude Code sem a marca [pessoa]) e M3 (o R5 deixa os prints e o `sdui.json` fora das raízes do servidor).
3. Opcional no mesmo lote, por ser barato: o médio do `MenuPopover` (3.3).

O resto (os outros médios do guia e todos os baixos) vai para a 8.7 parte 2.

## 2. Bloco para o coordenador (antes do portão)

```
Segunda leitura da etapa 8 (docs/history/auditoria-etapa-8.md): 1 alto, 8 médios, ~30 baixos.
Antes da rodada completa do Cowork:

1. ALTO, fase 8.3, reproduzido (CommitInput isolado, nome da marcação no MarkingPanel, Valor de um par no AnnotationEditor):
   a guarda do Enter (F5, commit 601a990) em src/ui/CommitInput.tsx:33,39 e src/ui/KeyValueGrid.tsx:96,102-103
   guarda a última gravação (base, texto) e nunca a zera. Gravar "Novo nome", desfazer e digitar "Novo nome" de novo:
   Enter e change são engolidos, o campo mostra o texto e o projeto não muda; ao trocar a seleção, o texto se perde.
   Afeta todo CommitInput (nomes de marcação, anotação e camada, campos tipados, CodeRefField, PlatformRepos) e os pares livres.
   Correção: a guarda vale só enquanto o valor externo ainda é a base da gravação; zerar quando ele mudar.
   Teste antes da correção: gravar, desfazer, redigitar e Enter grava, nos dois componentes.
2. MÉDIO, 8.3: src/ui/MenuPopover.tsx:67-69 executa o item antes de devolver o foco ao gatilho (nota §3 e ARCHITECTURE.md:208
   dizem o contrário; o ActionMenu faz certo). Sem efeito hoje.
3. MÉDIOS do guia (fase 8.6), que pesam na própria rodada:
   - M6: docs/TESTING-COWORK.md:27-33 e :37 — o prompt manda conferir se o build id é "o esperado", mas nem a pergunta única
     nem a mensagem-modelo o pedem. Acrescentar o item (g) "build id esperado" e citá-lo na mensagem da rodada completa.
   - M4: docs/TESTING.md:368-375 — R5.2 a R5.7 dizem "Peça ao Claude Code" sem [pessoa] (o R3.6, :298, tem). Marcar.
   - M3: docs/TESTING.md:363 e :368 — os prints e o sdui.json ficam na pasta de trabalho, fora das raízes; apply_specialization
     e add_image recusam (outside-roots). A dica da segunda raiz só está no apêndice A (:550). Criar assets/ no passo 2 da
     seção 6 e acrescentar --root assets ao .mcp.json.
4. Segurar a rodada completa até esse PR estar na main e publicado; o build id dele vai na mensagem ao Cowork.

O resto (M1, M2, M5, M7 do guia e todos os baixos) está na seção 3 do relatório, para a 8.7 parte 2.
```

## 3. Por fase

### 3.1 Sessão e gravação (8.1) — entregue, certeza alta

- **Testes** (`9d23362`) antes da correção (`0624980`); no PR #133, `e489984` antes de `84e779e`. 219 testes em 7 arquivos passando. S1 `externalChanges.test.ts:704/:727/:749`; S2 `autosave.test.ts:153/:248` (invariantes I1 a I3 por passeio aleatório, 20 sementes × 200 passos); S3 `externalChanges.test.ts:766`; S4 `session.test.ts:772`, `controller.test.ts:569`; S5 `externalChanges.test.ts:792-855`, `session.test.ts:1021`; S6 `session.test.ts:801-840`; S7 `externalChanges.test.ts:867/:887`; S8 `session.test.ts:874-917`, `controller.test.ts:931/:960`; S9 `externalChanges.test.ts:914/:938`; S10 `:959/:972` (parcial).
- **Conferência própria da fila** (`src/storage/autosave.ts`, 142 linhas): as três invariantes valem por inspeção de todos os pontos que mudam `status`; `error` implica `dirty`, então o ramo `!dirty && error` do `write()` é inalcançável; `reset()` só é chamado no `adopt` (`session.ts:559`), que roda dentro da fila, então a guarda de `generation` é defensiva; o `idle()` é relido logo antes do `adopt`, sem `await` entre a guarda e o `store.load`; a cadeia B2 (aplicar → efeito síncrono → `saving` → conferência devolve `busy`) confere. As duas filas não se travam: a varredura de propostas roda no `.then` da conferência, fora da cauda da fila da sessão, e a direção proposals → saver é a única usada.
- **Regra automática:** `sessionStorageSyntaxRules`, `sessionFileSyntaxRules` e `controllerFileSyntaxRules` (`eslint.config.js:85-115`) dão 4 erros no `session.ts` de antes da fase. Limite, não resíduo: desestruturação (`const { saveMapping } = storage`) e acesso computado passam.
- **Resíduos (baixos, certeza alta):**
  1. Falta a variante A2 "`loadedText` não canônico" prometida na nota §6; o teste do projeto migrado (`session.test.ts:1021`) abre sem `loadedText`, então `written` nasce `null` pela falta do texto, não pela migração, e o caminho real (`controller.ts:159` passa `loadedText` e `migratedFrom`) fica sem teste.
  2. S10: o backup pré-migração não marca `wrote = true` (`session.ts:387-396`); quando só o backup foi escrito, a reconferência antes de gravar não acontece. Nem corrigido nem registrado como descartado.
  3. O comentário de `session.ts:357-359` (e o D2 do PR #126) diz que `disk.text === null` só acontece nos testes; acontece em produção depois de **Manter as minhas** com o arquivo sumido ou ilegível (`session.ts:693-705`). O efeito (gravar por cima de um arquivo vazio) é coerente com a escolha da pessoa; só o texto está errado.
  4. `PLAN.md:86` cita a revisão 3 da nota; ela está na revisão 4.
  5. Pré-existente, registrar: uma imagem adicionada durante uma gravação em curso é apagada do disco pela limpeza dessa gravação (está em `stored` e não é citada pelo projeto que está sendo gravado) e vai para a `trash`; a gravação seguinte, o `flush` do próprio `addImages`, a regrava antes do `mapping.json` que a cita. O disco nunca cita arquivo ausente; o custo é apagar e regravar o arquivo, e uma janela de milissegundos em que a imagem só existe em memória (com o `beforeunload` bloqueando). Ver a pergunta 3 da seção 4.

### 3.2 Revisão de propostas (8.2) — entregue, certeza alta

- **Testes** antes da correção nos quatro pares do PR #131 (P10 `92a62b8`→`22c7ccc`; P1 `3113c4b`→`605c57a`; P2, P3, P5, P6, P9, P11 `b135792`→`cddf0aa`; P4, P7, P8 `2d076ef`→`0fadbb0`). 163 testes passando. P1 `shownProject.test.tsx` e `reviewCursor.test.ts:35`; P2/R3 `review.test.ts:500/:572`; P3 `:618/:652/:674`; P4 `proposalList.test.tsx:96/:196`; P5 `review.test.ts:552/:581/:605`; P6 `:458` e `:314` (F1); P7 `proposals.test.ts:400/:426`; P8 `details.test.tsx:104`; P9 `review.test.ts:703`; P10 `proposalView.test.ts`; P11 `review.test.ts:724`.
- **Ajustes da segunda leitura da nota** (E1 a E4) e divergências pós-código (F1 a F4) conferidos no código: escopo só por `copyId`, sem `legacyScope`; `seen` reatribuído só quando cresce (`review.ts:281`); `close()` grava os conflitos conhecidos na abertura, os anunciados nela e os decididos (`review.ts:356-359`).
- **Catraca** `shownProjectReaders`: a allowlist de 12 arquivos é idêntica ao `git grep` de agora, com `toEqual` exato. Limite do desenho: a allowlist é por arquivo, então `ReviewCanvasControls.tsx` (que entra pelo `CompareDialog`) esconderia um retorno do `useComparable` no mesmo arquivo.
- **Conferência própria da compensação do P7** (`proposals.ts:239-247`, `proposalActions.ts:391-397`): `abandoned` impede o `HistoryLink` de mexer na proposta; a ordem é desfazer → `discardRedoOf` → `flush` → `rollback` só com o `flush` ok. No caminho ok, a limpeza da própria sessão já tira a cópia (o `discardRedoOf` antes do `flush` a tira do histórico) e o `rollback` vira no-op; no caminho com falha, as cópias ficam (o disco ainda as cita) e saem quando a gravação passar (teste `:426`). A premissa "`writeProposal` que rejeita não gravou nada" vale nos dois armazenamentos: na pasta, `createWritable` + `close()` com `abort` no erro (`folder.ts:174-195`); no local, uma transação do IndexedDB (`local.ts:205-217`). Certeza média só nessa premissa, porque depende do navegador.
- **Corrida teórica** achada na conferência (baixa; análise com certeza alta, decisão para o Fable, pergunta 2): se uma conferência da sessão rodar exatamente durante o `await storage.writeProposal(...)` que vai falhar e adotar um `mapping.json` escrito por fora nesse intervalo, o `compensate` não desfaz nada (o projeto em memória já não é o aplicado), mas o `rollback` ainda chama `dropProjectImage(m.to)`; depois do `adopt`, `stored` foi refeito com as imagens citadas pelo arquivo de fora, e, se ele cita a imagem nova, ela é apagada com o disco a citando. Exige três eventos raros na mesma janela de milissegundos; a origem continua em `proposals/<id>/images/`. Correção mínima: guardar se o desfazer aconteceu e só fazer o `rollback` nesse caso.
- **Resíduos (baixos, certeza alta):**
  1. Nota [`etapa-8-2.md`](etapa-8-notas/etapa-8-2.md): a tabela da §8 (`:180`) ainda diz `knownAtOpen ∪ decididos` (o código, a §3 e a §5 incluem os conflitos à vista na abertura, F1); a §10 (`:205`) põe o teste do cursor em `CanvasController.test.ts` (F2); a revisão 4 aparece antes da 3 no cabeçalho.
  2. A nota §10 (`:218`) prometia registrar no PR o tempo do `reviewPerf`; o PR não traz.
  3. A primeira metade do teste do P11 e o teste do E2 já passavam antes (o código antigo tinha a mesma guarda): protegem contra regressão, não reproduzem.

### 3.3 Foco, diálogos e teclado (8.3) — entregue com uma regressão alta, certeza alta

- **F1 eliminado na causa:** `useModal` em `useLayoutEffect` (`focus.ts:199-236`) faz `showModal`, foco, `modalOpen++` e registra o cleanup no mesmo commit; `overrides` de `@testing-library/dom` `^10.4.2` (`package.json:56-58`) e lockfile com uma versão só. `TypedFields.test.tsx` passou 5 de 5, com o caso do flake repetido 20 vezes. Observação de ambiente: um `node_modules` instalado antes do override ainda tem a 8.20.1 aninhada; o CI usa `npm ci`.
- **Testes:** F1 `focusModel.test.tsx:89-146`; F2 `Home.test.tsx:429-478`, `Details.test.tsx:280-322`; F3 `editorShell.test.tsx:697-731`, `Home.test.tsx:543-563`, `Details.test.tsx:231-265`; F4 `focusRules.test.ts:16-123`; F5 `CommitInput.test.tsx:62-96`, `Details.test.tsx:185-209`; F6 `menus.test.tsx:20-147`; F7 `focusModel.test.tsx:150-173` (retroativo); F8 `tests/setup.ts:23-29`; F9 `Home.test.tsx:99-111`; F10 `EditorDialogs.test.tsx:130-157`. 241 testes em 11 arquivos passando.
- **Regras:** `classSelectorRules` e `focusSyntaxRules` (`eslint.config.js:36-67`, `:341-370`) acusam dez arquivos de antes da fase. Limites coerentes com a nota: seletor montado por função ou constante e `querySelector('button')` genérico passam.
- **ALTO, reproduzido:** a guarda do Enter criada para o F5 (`src/ui/CommitInput.tsx:33,39`; `src/ui/KeyValueGrid.tsx:96,102-103`) guarda a última gravação (base, texto) e nunca a zera. Gravar "Novo nome", desfazer (o valor volta a ser a base) e digitar "Novo nome" de novo: o Enter e o `change` são engolidos; o campo mostra o texto e o projeto não muda; ao trocar a seleção, o texto se perde. Introduzida em `601a990` (antes não havia guarda e o Enter fazia `blur`). Os dois componentes são os únicos com o padrão. Afeta todo `CommitInput` (nome de marcação, anotação e camada, campos tipados, `CodeRefField`, `PlatformRepos`) e os pares livres. Correção: a guarda vale só enquanto o valor externo ainda é a base da gravação e é zerada quando ele muda; o `change` duplicado que chega depois da renderização já cai no `typed === value`.
- **Médio:** `src/ui/MenuPopover.tsx:67-69` executa o item no próprio clique e fecha (devolvendo o foco ao gatilho) na volta do evento, ao contrário da nota §3 e do `ARCHITECTURE.md:208`; o `ActionMenu` faz na ordem certa. Sem efeito hoje (os itens só abrem diálogo depois de um `await`); um item síncrono que abrisse diálogo perderia o foco.
- **Baixos:** `openDialog()` (`tests/components/modalFocus.ts:85-94`) sem chamador, embora a nota e o `ARCHITECTURE.md:226` o apresentem como a espera dos testes; `Popover.tsx:66-70` acha o gatilho por heurística ("primeiro focável do host fora do painel"), registrar como limite; falta o teste "ActionMenu (escolher)" que a nota §6 prometia; nenhum teste prova que montar `Dialog` ou `RefPicker` soma em `modalOpen`; o `ARCHITECTURE.md:209` omite o `CanvasContextMenu` (microtarefa) e o rAF do Alt+N entre as exceções; o resíduo 9 do coordenador (abaixo).
- **Resíduo 9 do coordenador identificado:** `PLAN.md:124` (a prop `origin?: FocusOrigin` não existe; a origem chega por contexto, `DialogSlotContext`) e `PLAN.md:125` (o dono do "ir para" é o painel, `AnnotationsPanel.tsx:113-140`, não o `returnFocus` do `RefPicker`). As duas são divergências aprovadas (nota §11.2 e §11.4); só falta registrá-las no histórico.

### 3.4 Recentes e controller (8.4) — entregue, certeza alta

- **Testes** (`bafadc4`, `bfc9612`) antes da correção (`a96d231`). R1 `controller.test.ts:889` (o vínculo roda antes de publicar o projeto; `openFolderId` sumiu); R2 `:913`; R4 `:743`; R5 `:977`; R6 `:996`; R7 `recents.test.ts:43`, `controller.test.ts:1064`, `Home.test.tsx:314`; R10 `local.test.ts:81`. 1.095 testes em 8 arquivos passando.
- **`copyId`:** todos os caminhos que entregam um armazenamento à sessão o preenchem (local, criar, importar zip, reparar, pasta nova, recente, Localizar com e sem fusão, criar na pasta, pasta fora dos recentes por `sessionCopyId`); o único `openSession` está em `controller.ts:155`.
- **`controller.ts` com 449 linhas** (aceite < 450), sem regra que guarde o teto.
- **Regras:** globais de armazenamento proibidos fora de `safeStorage.ts` e `local.ts` (`eslint.config.js:116-135`, `:255-263`; `storageGlobalsLint.test.ts`), `max-lines` 600 em `src/app` (aviso no `Home.tsx`, 604), `loadMapping` proibido no controller, `error.<code>` para todo `AppErrorCode`.
- **Resíduos (baixos, certeza alta):** comentário de `eslint.config.js:74-75` ainda cita "no controller, as conferências de existência" como exceção; `ARCHITECTURE.md:192`, o limite do R7 emendado na frase do R6; sem asserção de `copyId` em "criar projeto na pasta" e "Localizar com fusão" (`controller.test.ts:1162`); `sessionCopyId` (`recents.ts:168-175`) e o par `readSessionSetting`/`writeSessionSetting` (`safeStorage.ts:23-37`) sem teste, inclusive do motivo de usar `sessionStorage` (sobreviver a recarregar a aba); `ARCHITECTURE.md:118` não cita a regra ESLint dos globais de armazenamento.

### 3.5 MCP 0.3.3 (8.5) — entregue, certeza alta

- `mcp/` idêntico entre o merge da fase (`59ed141`), a tag `mcp-v0.3.3` (leve, em `1df7506`) e a `main`; release publicada com `mapping-mcp.js` e `.sha256`; `--version` imprime 0.3.3. 256 testes em `tests/mcp/` passando.
- **Testes:** M1 `read.test.ts:902-931` (o bundle real por stdio, `cwd` no espaço de trabalho, raízes relativas); M2 `:793/:809`; M3 `proposalDisk.test.ts:77/:100/:120` e Q3 `:144`; M4 `:170/:187`; M5 `:205/:238`; M6 e M7 só documentação ("Limites conhecidos" do `ARCHITECTURE.md`); M8 `staticGuards.test.ts:32-68`; M9 `errorCodes.test.ts`; M10 `backups.test.ts:28`, `images.test.ts:200`; M11 fora; M12 `read.test.ts:935`; M13 `version.test.ts:24-37`; M14 `paths.test.ts:9-50`.
- **M3 por desenho:** a "app" concorrente é um gancho de disco (`fsHooks.mjs`) no processo do servidor, determinístico, não um segundo processo. A janela do M6 (uma decisão gravada pela app entre a releitura e o `rename` do servidor se perde) está documentada como limite aceito.
- **Resíduos (baixos, certeza alta):** `mcp/batch.ts:392-393` lança `unknown-type` (um `ModelErrorCode`, então o `tsc` aceita) num ternário que a regex de `errorCodes.test.ts:21` não lê, e o código não aparece no `AGENT-GUIDE.md` (só `ambiguous-type`, `:311`); `read.test.ts:915-919` diz cobrir "o nome da pasta, se único", mas casa pelo caminho, e o ramo `paths.ts:246-249` fica sem teste; a nota da 8.5 não tem bloco de revisão (aprovação, Q1 a Q5 respondidas e os desvios: `fsHooks.mjs` com `--import`, testes em `proposalDisk.test.ts`, `EOPNOTSUPP`, registro com 50 códigos); o aceite "R5.2 a R5.7 com o 0.3.3" depende da rodada do portão.

### 3.6 Guia e prompt (8.6) e a parte 1 da 8.7 — entregue, certeza alta

- G1 a G16 resolvidos no guia e no prompt; aceite por agentes novos zerado (PR #124); as 12 regras de `testingGuide.test.ts` passam. Numa amostra de 20 passos conferidos contra o código e o i18n, nenhum texto citado falta e o comportamento descrito bate com as fases 8.1 a 8.5. 103 passos, sem código repetido; o maior, R5.3, com 1.191 caracteres.
- **Médios (certeza alta):**
  - **M1** `TESTING.md:9`: "Os apêndices não são para você", mas o R6 e o R7 mandam a pessoa ao apêndice B (`:321`, `:334`, `:337`, `:338`, `:350`). Escrever "o A não é para você; o B tem os comandos de disco do R6 e do R7".
  - **M2** `TESTING.md:24` ("sem o MCP, pule a linha 4, o R3.6 e o R5") contradiz `:205` e `:289` (o R3 exige "a seção 6 inteira"); `:55` e `TESTING-COWORK.md:52` repetem. Sem MCP, fazer os passos 1 e 2 da seção 6 (repositório e pasta) e rodar R3.1 a R3.5.
  - **M3** `TESTING.md:363` e `:368`: os prints e o `sdui.json` ficam na pasta de trabalho, fora das raízes; `apply_specialization` e `add_image` recusam (`outside-roots`). A dica só está no apêndice A (`:550`). **Antes do portão.**
  - **M4** `TESTING.md:368-375`: R5.2 a R5.7 dizem "Peça ao Claude Code" sem a marca [pessoa] (o R3.6, `:298`, tem); o bloco [pessoa] do R5 no prompt sai incompleto. **Antes do portão.**
  - **M5** `TESTING.md:144`: a justificativa da 0.3.3, "pasta relativa em `--root`", está errada (a 0.3.2 já resolvia `--root` relativo, `mcp-v0.3.2:mcp/main.ts:50`); o M1 é o `root` relativo do `create_project`.
  - **M6** `TESTING-COWORK.md:27-33` e `:37`: o prompt manda conferir se o build id "é o esperado", mas nenhum item da pergunta única nem a mensagem-modelo o pedem. **Antes do portão.**
  - **M7** `ARCHITECTURE.md:148`: "`createProject.ts` cria a pasta (`mapping.json`, `images/`, `.gitignore`)" contradiz `:158` e o M2 da 8.5 (`images/` nasce na app).
- **Baixos (certeza alta):** `TESTING.md:203` ainda cita "R0.4" (agora R0.4a e R0.4b); `:24` diz "sem achados altos" e `:387` "sem achados altos ou médios" como critério para o teste avançado; a tabela de atalhos (`:102-112`) não tem `Ctrl+L`; o bloco [pessoa] tem 6 itens e o `PLAN.md:170` diz "quatro"; o prompt não pede o tempo por roteiro explicitamente nem exclui a seção 9 da rodada completa nem liga a passada visual dos diálogos que o aceite da 8.3 pede (`PLAN.md:131`); o R4 não registra que decidir numa proposta de um projeto local já mostra "Alterações não exportadas" (S4); o R2.6 confere um contorno de foco que, por ser `:focus-visible` (`base.css:58`), pode não aparecer depois de um clique de mouse; `ARCHITECTURE.md:109` ainda diz que a interface e o `derived.ts` leem `store.committed` (antes do `shownProject` da 8.2) e `:191` tem o limite do R7 emendado; para a parte 2, o `ROADMAP.md:109` aponta o prompt antigo e o `:110` descreve o O5 ("Enter tira o foco"), que a 8.3 mudou, o `PLAN.md:23` não lista o `docs/TESTING-COWORK.md`, e os resíduos 9 e 11 do PR #133 estão só na descrição dele.

## 4. Para o Fable: o que fechar

Cada pergunta diz o que ler, o que responder e como confirmar. Fora daqui, a certeza é alta e não precisa de outra leitura.

**Estado em 2026-10-14, depois do fechamento da etapa (#141).** A pergunta 1 está respondida: os testes do #137 falham antes da correção e passam depois, cobrindo (a) a (d), inclusive o `onCommit` que normaliza o texto; os testes da política de teclado da 8.3 (e) continuam verdes; e a reprodução desta leitura passa contra a correção. As perguntas 2 a 4 foram fechadas pela terceira leitura, em 2026-10-15 (seção 6): a 2 confirmada e reproduzida, a 3 e a 4 confirmadas sem defeito a corrigir. Os arquivos de código que elas citam (`session.ts`, `proposalActions.ts`, `proposals.ts`) não mudaram desde esta leitura, e os dois testes citados continuam nas linhas 400 e 426: as referências abaixo valem na `main`.

1. **A correção da regressão alta da 8.3** (respondida no #137; ver o estado acima). Ler o PR inteiro, mais `src/ui/CommitInput.tsx` e `src/ui/KeyValueGrid.tsx`. Responder se a guarda nova (a) ainda impede a gravação dupla quando o `change` chega antes da renderização, (b) deixa gravar de novo depois de desfazer, (c) se comporta quando o `onCommit` normaliza o texto (o valor gravado difere do digitado: espaços, maiúsculas), (d) cobre a Chave e o Valor dos pares livres e o par novo, e (e) não muda o Esc e o Alt+Enter da política de teclado. Confirmar com os testes do PR e, se faltar um caso, escrever o teste que falha.
2. **A corrida teórica do P7** (seção 3.2). Ler `src/store/proposalActions.ts:240-417`, `src/store/proposals.ts:199-262` e, em `src/store/session.ts`, `dropProjectImage` (`:524`), `adopt` (`:551`) e a conferência (`syncProject`, `:616`). Responder: a sequência (a falha do `writeProposal` + um `mapping.json` escrito por fora na mesma janela + uma conferência que o adota) é alcançável como descrita? O `rollback` apaga mesmo uma imagem que o disco cita? Se sim, a correção (guardar se o desfazer aconteceu e só fazer o `rollback` nesse caso) cobre o caso sem quebrar os testes `proposals.test.ts:400` e `:426`, e vale o código? Um teste possível: o armazenamento falso grava o `mapping.json` "de fora" e chama `session.sync()` de dentro do `writeProposal` antes de rejeitar.
3. **A imagem que sai e volta durante uma gravação** (seção 3.1, resíduo 5). Ler, em `src/store/session.ts`, `putImage` (`:321`), `writeProject` (`:384`), `cleanUp` (`:457`) e `addImages` (`:751`). Responder se, em qualquer intercalação de adicionar imagem, desfazer, refazer e gravar, o `mapping.json` em disco pode citar uma imagem ausente, e se a imagem pode se perder sem a pessoa ser avisada. A análise desta sessão diz que não (a gravação que apaga não cita a imagem; a seguinte a regrava da `trash` antes de citá-la). Se confirmar, basta registrar no histórico.
4. **A premissa do P7 no navegador** (seção 3.2). Só leitura e raciocínio, porque não dá para testar falha de disco aqui: um `close()` de `FileSystemWritableFileStream` que rejeita deixa o arquivo com o conteúdo anterior em todos os navegadores suportados (Chrome e Edge desktop)? Se houver caso em que ele rejeita depois de gravar, a compensação inverte o estado dividido (projeto desfeito, proposta "aplicada"), e isso vai para o histórico como limite.

## 5. Prompt para a sessão do Fable

Numa sessão do Claude Code com este repositório, no Fable 5.1 com esforço alto, mande:

> Leia `CLAUDE.md` e `docs/history/auditoria-etapa-8.md` (seções 1 a 4) e, para o que mudou depois dessa leitura, o fechamento em `docs/history/PLAN-etapa-8.md`. Você é a terceira leitura da etapa 8: não refaça a auditoria; feche só as perguntas 2 a 4 da seção 4 (a 1 já foi respondida). Para cada uma, responda **confirmado**, **refutado** ou **precisa de teste**, com `arquivo:linha` e o raciocínio em poucas linhas; onde confirmar um defeito, proponha a correção mínima e o teste que falha antes dela. Não edite nada sem o meu pedido. Termine com um bloco curto, só com o que muda o plano: o que corrigir (num PR pequeno, já que não há etapa em andamento) e o que só registrar no histórico e na lista do marco do `docs/ROADMAP.md`.

## 6. Terceira leitura (2026-10-15): as perguntas 2 a 4

> Sessão do Fable 5.1 com o prompt da seção 5, sobre a `main` em `d3c21d3` (depois do fechamento, #141 e #142). Os arquivos que as perguntas citam não mudaram desde a segunda leitura; as linhas abaixo valem na `main`. A pergunta 2 foi reproduzida com um teste e a correção mínima foi conferida na árvore de trabalho (teste novo mais os 20 de `tests/store/proposals.test.ts` passando, ESLint limpo), sem commit: o código fica para o PR pequeno descrito no bloco do coordenador (6.5). As perguntas 3 e 4 fecham sem defeito.

| Pergunta | Veredito | Certeza | O que fazer |
| --- | --- | --- | --- |
| 2. Corrida teórica do P7 | **Confirmado** (reproduzido) | alta | Corrigir num PR pequeno (6.1 e 6.5) |
| 3. Imagem que sai e volta durante uma gravação | **Confirmado** sem defeito (a análise da seção 3.1 vale) | alta | Só registrar; dois testes de regressão opcionais (6.2) |
| 4. Premissa do P7 no navegador | **Confirmado** como premissa, com um limite | média (raciocínio sobre o navegador; não testável aqui) | Só registrar como limite (6.3) |

### 6.1 Pergunta 2 — confirmado: a sequência é alcançável e o `rollback` apaga uma imagem que o disco cita

- **A janela existe e é a única.** Entre o `store.apply` e o `flush` nenhuma conferência adota nada: o `schedule` do efeito põe o status em `saving` e `syncProject` devolve `busy` (`src/store/session.ts:620`). Depois do `flush` bem-sucedido o status volta a `saved`, e a janela vai até o `writeProposal` se resolver (`src/store/proposals.ts:238`). O poll de 3 s do `useExternalChanges` (`src/app/useExternalChanges.ts:37`) cabe nela se a gravação demorar.
- **O que acontece na janela.** O `mapping.json` já gravado cita `images/nova.webp` e `pendingFiles` já não a tem (`session.ts:422`). Um escritor externo que relê esse arquivo e grava `revision + 1` (o caso natural é o próprio MCP editando qualquer coisa) produz um arquivo que cita a cópia. A conferência adota (`session.ts:642`) e `adopt` refaz `stored` a partir do arquivo de fora (`session.ts:564`), então a cópia continua em `stored`.
- **A compensação.** `compensate` (`src/store/proposalActions.ts:391-397`) vê o projeto diferente do aplicado e não desfaz nada; o `flush` passa sem gravar (o `reset` do `adopt` zerou a pendência); o `rollback` chama `dropProjectImage`, que remove o arquivo porque ele está em `stored` (`session.ts:525`). Resultado: o `mapping.json` em disco e em memória citam um arquivo apagado. A origem em `proposals/P1/images/` fica, então a pessoa reaponta a imagem; o que se perde é a invariante "o disco nunca cita arquivo ausente".
- **Vale o código:** quatro linhas, e o gatilho é real (o MCP editando enquanto a gravação da proposta falha). O caminho `save-failed` (`proposalActions.ts:375-382`) não precisa da guarda: ali o `flush` falhou, então o disco não cita as cópias.
- **Limite que fica (baixo):** se o arquivo de fora não citar a cópia, ela vira órfã em `images/`, com ou sem a correção, porque `pendingFiles` já a tinha soltado. Inofensivo (nenhum `mapping.json` a cita; a limpeza da sessão só mexe em `stored`).

**Correção mínima** (a que a seção 4 propôs), em `src/store/proposalActions.ts`, no `compensate` de `applyAcceptedChanges`:

```ts
compensate: async () => {
  abandoned = true;
  const undone = applied !== null && store.project.peek() === applied;
  if (undone) store.undo();
  store.discardRedoOf(id);
  // O projeto já não é o aplicado (recarregado por fora na janela da gravação): não há
  // o que regravar, e o disco pode citar as cópias. Elas ficam.
  if (!undone) return;
  const restored = await deps.flush();
  if (restored.ok) await rollback();
},
```

**Teste que falha antes da correção** (na `main`, falha só na última asserção: `images/nova.webp` é `null`; com a correção, passa junto com os testes das linhas 400 e 426). Entra no `describe` "aplicar aceitas só conclui se o mapping.json gravou (fase 5.2)" de `tests/store/proposals.test.ts`, que já tem `readyToApply`, `diskProject`, `diskProposal` e `NEW_IMAGE_PATH`; `serialize` já está importado:

```ts
// Terceira leitura da etapa 8 (auditoria, §6.1): uma conferência adota um mapping.json de
// fora durante a falha do proposal.json. O arquivo de fora cita a cópia; o rollback da
// compensação não pode apagá-la.
it('proposal.json falhando com o mapping.json recarregado por fora na janela: a cópia citada pelo disco fica', async () => {
  const h = await readyToApply();
  vi.spyOn(h.storage, 'writeProposal').mockImplementationOnce(async () => {
    // O mapping.json aplicado já gravou e cita images/nova.webp. Nessa janela, o MCP o
    // relê, edita o nome do projeto e grava revision + 1 (o arquivo continua citando a cópia).
    const applied = await diskProject(h);
    expect(applied.images.map((i) => i.file)).toContain('images/nova.webp');
    h.root.put(
      'mapping.json',
      serialize({
        ...applied,
        revision: applied.revision + 1,
        project: { ...applied.project, name: 'Do agente' },
      }),
    );
    // O poll do useExternalChanges confere e recarrega (sem pendência local: 'reloaded').
    // Não dá para esperar a promessa inteira do sync aqui (a varredura das propostas fica
    // atrás desta mesma mutação): espera só o trabalho da fila da sessão.
    void h.session.sync();
    await h.session.flush();
    expect(h.session.reloads.value).toBe(1);
    throw new Error('disco cheio');
  });

  expect(await h.review.apply()).toEqual({ ok: false, error: 'write-failed' });
  await h.session.proposals.settled();
  // O projeto em memória e no disco são o de fora, e ele cita a cópia.
  expect(h.session.store.project.value?.project.name).toBe('Do agente');
  expect(h.session.store.project.value?.images.map((i) => i.file)).toContain(
    'images/nova.webp',
  );
  expect((await diskProject(h)).images.map((i) => i.file)).toContain(
    'images/nova.webp',
  );
  // A proposta continua sem `applied` e a origem continua lá.
  expect((await diskProposal(h.root)).applied).toEqual({});
  expect(await h.root.read(NEW_IMAGE_PATH)).toBe('WEBP');
  // O ponto da pergunta: o rollback da compensação não pode apagar um arquivo que o disco cita.
  expect(await h.root.read('images/nova.webp')).toBe('WEBP');
});
```

### 6.2 Pergunta 3 — confirmado sem defeito: o disco nunca cita arquivo ausente

Em nenhuma intercalação de adicionar, desfazer, refazer e gravar o `mapping.json` em disco cita um arquivo ausente, e a imagem só se perde como qualquer edição não gravada.

- **O caso do resíduo 5 (3.1).** A gravação em curso não cita a imagem nova; a limpeza dela (`session.ts:457-476`) lê o arquivo para a `trash` em memória antes de removê-lo, porque a imagem está no histórico. A gravação seguinte, o `flush` do próprio `addImages` (`session.ts:781`), regrava da `trash` (`session.ts:399-401`), reconfere o arquivo (`:414`) e só então grava o `mapping.json`. A ordem é sempre "gravar antes de citar".
- **Desfazer antes da gravação seguinte.** O projeto volta ao que o disco tem e `onDisk` não grava nada; o arquivo apagado pela limpeza fica na `trash` enquanto o "refazer" existir. Refazer agenda a gravação que o restaura antes de citá-lo. Um gesto novo descarta o refazer e a `trash` solta o conteúdo, sem nenhum snapshot citando o arquivo.
- **Perda sem aviso.** Na janela em que a imagem só existe em memória o status é `saving` e o `beforeunload` segura a saída (`src/app/pageLifecycle.ts:23`). Se a gravação seguinte falhar e a pessoa escolher "Recarregar" no conflito, a `trash` é limpa (`session.ts:565`) e a imagem some com as outras alterações locais, que é o que o diálogo promete.
- **A única dependência externa:** a invariante supõe que `readImage` devolve o arquivo recém-gravado na limpeza; se devolvesse `null`, a gravação seguinte citaria um arquivo ausente. Na pasta (File System Access, depois do `close()`) e no IndexedDB (transação confirmada) isso não acontece. Registrar.

Os dois caminhos foram confirmados com testes temporários na suíte da sessão, reaproveitando o `hookedStart`/`holdSave` que já existe em `tests/store/session.test.ts` (o `describe` do teste "S6, A3"). Ficam aqui como regressão opcional para o mesmo PR pequeno:

```ts
it('imagem adicionada durante uma gravação em curso: a primeira não a cita e a apaga; a segunda a regrava antes de citar (auditoria §6.2)', async () => {
  const root = new MemoryDirectory('p');
  const project = sampleProject();
  root.put('mapping.json', serialize(project));
  const h = hookedStart(root, project);
  session = h.session;
  session.actions.renameProject('Um');
  const first = h.holdSave();
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
  await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
  const adding = session.addImages([file('a.jpg', '400x300')]);
  await vi.waitFor(async () => expect(await root.read('images/a.jpg')).toBe('400x300'));
  const second = h.holdSave();
  first.resolve();
  await vi.waitFor(() => expect(h.savesStarted()).toBe(2));
  // A primeira gravação não cita a imagem; a segunda já a regravou (está parada no saveMapping).
  const between = await savedProject(root);
  expect(between.project.name).toBe('Um');
  expect(between.images.map((i) => i.file)).not.toContain('images/a.jpg');
  expect(await root.read('images/a.jpg')).toBe('400x300');
  second.resolve();
  await adding;
  expect(session.saveStatus.value).toBe('saved');
  const after = await savedProject(root);
  expect(after.images.map((i) => i.file)).toContain('images/a.jpg');
  expect(await root.read('images/a.jpg')).toBe('400x300');
});

it('imagem adicionada durante uma gravação, desfeita antes da seguinte e refeita: o disco nunca cita arquivo ausente (auditoria §6.2)', async () => {
  const root = new MemoryDirectory('p');
  const project = sampleProject();
  root.put('mapping.json', serialize(project));
  const h = hookedStart(root, project);
  session = h.session;
  session.actions.renameProject('Um');
  const first = h.holdSave();
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
  await vi.waitFor(() => expect(h.savesStarted()).toBe(1));
  const adding = session.addImages([file('a.jpg', '400x300')]);
  await vi.waitFor(async () => expect(await root.read('images/a.jpg')).toBe('400x300'));
  expect(session.store.undo()).toBe(true);
  first.resolve();
  await adding;
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
  expect(session.saveStatus.value).toBe('saved');
  // Nada a gravar depois do desfazer (o disco já tem 'Um'); a limpeza da primeira apagou o arquivo.
  expect(h.savesStarted()).toBe(1);
  expect((await savedProject(root)).images.map((i) => i.file)).not.toContain(
    'images/a.jpg',
  );
  expect(await root.read('images/a.jpg')).toBeNull();
  // Refazer: a imagem volta da lixeira em memória antes do mapping.json que a cita.
  expect(session.store.redo()).toBe(true);
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
  await vi.waitFor(() => expect(session.saveStatus.value).toBe('saved'));
  expect(h.savesStarted()).toBe(2);
  expect((await savedProject(root)).images.map((i) => i.file)).toContain('images/a.jpg');
  expect(await root.read('images/a.jpg')).toBe('400x300');
});
```

### 6.3 Pergunta 4 — confirmado como premissa, com um limite a registrar

- **Pasta.** `writeFile` (`src/storage/folder.ts:182-203`) escreve num `FileSystemWritableFileStream` e fecha; a especificação manda escrever num arquivo temporário e só substituir o original no `close()`. Toda rejeição antes da troca (quota no `write`, permissão revogada, a verificação de segurança do Chrome que recusa no `close`) deixa o arquivo anterior intacto, e o `abort` que segue só descarta o temporário. No Chrome e no Edge desktop a troca é um rename atômico.
- **Local.** `writeProposal` (`src/storage/local.ts:205-217`) é uma transação do IndexedDB: `tx.done` só rejeita se nada foi confirmado. A premissa vale estritamente.
- **O limite.** Resta um caso que nenhum app distingue de sucesso: o `close()` rejeitar depois de a troca já ter acontecido (a ligação com o processo do navegador cair nesse instante). Para o `mapping.json` é benigno: a próxima `assertWritable` (`session.ts:361-368`) vê um texto diferente do conhecido e abre o conflito com o conteúdo da própria app; "Manter as minhas" regrava. Para o `proposal.json` a compensação **inverte** o estado dividido: o projeto é desfeito e regravado sem as mudanças e as cópias saem de `images/`, mas o arquivo diz `applied` com `revision + 1`. A próxima mutação adota o arquivo do disco e a proposta aparece aplicada sem o projeto ter as mudanças; reaplicar não faz nada, e a app não tem como limpar `applied`. Nada se perde (as origens ficam em `proposals/<id>/images/`), mas a proposta fica presa até alguém editar o `proposal.json`.
- **Se um dia aparecer num relato**, a defesa é barata: no `catch` do `writeProposal` (`proposals.ts:239`), reler o arquivo e, se ele já for `nextText`, seguir como sucesso em vez de compensar. Não vale o código sem um caso visto.

### 6.4 O que muda o plano

- **Corrigir num PR pequeno** (não há etapa em andamento): a corrida do P7 (6.1), com a guarda `undone` em `compensate` e o teste acima. Opcional no mesmo PR: os dois testes de regressão de 6.2.
- **Só registrar**, no `PLAN-etapa-8.md` e na lista do marco do `ROADMAP.md`: a pergunta 3 fechada sem defeito (com a dependência do `readImage`); a pergunta 4 fechada como limite (o `close()` que rejeita depois da troca deixa a proposta presa como "aplicada", com a defesa de releitura anotada); e o órfão em `images/` quando o arquivo de fora não cita a cópia.

### 6.5 Bloco para o coordenador

```
Terceira leitura da etapa 8 (docs/history/auditoria-etapa-8.md, seção 6): 1 defeito confirmado e
reproduzido, nada mais a corrigir. Um PR pequeno, um executor, sem nota de desenho:

1. CORRIGIR, src/store/proposalActions.ts:391-397 (compensate de applyAcceptedChanges): guardar se o
   desfazer aconteceu (`undone`) e só regravar (flush) e fazer o rollback nesse caso; sem o desfazer,
   voltar depois do discardRedoOf. Código pronto em §6.1.
   Teste antes da correção: o `it` de §6.1 no describe "aplicar aceitas só conclui se o mapping.json
   gravou (fase 5.2)" de tests/store/proposals.test.ts. Na main ele falha na última asserção
   (images/nova.webp apagado); com a correção passa, junto com os testes das linhas 400 e 426.
   Commit do teste antes do commit da correção, como nas fases da etapa.
2. OPCIONAL no mesmo PR: os dois testes de regressão de §6.2 em tests/store/session.test.ts, no
   describe do teste "S6, A3" (usam hookedStart/holdSave/savedProject/file dali). Passam na main.
3. REGISTRAR no mesmo PR: em docs/history/PLAN-etapa-8.md, no parágrafo "Segunda leitura do dono",
   o fechamento das perguntas 2 a 4 (apontar para §6); em docs/ROADMAP.md, na lista do marco,
   tirar o item "PR pequeno da corrida do P7" e manter o item dos limites registrados (perguntas 3
   e 4 e o órfão de images/).
4. Aceite: npm run lint && npm run typecheck && npm test && npm run build; o PR com Resumo,
   Como testar (R4.8 e R4.9 do guia como regressão manual) e Decisões.
```
