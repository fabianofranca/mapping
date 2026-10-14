# Auditoria da etapa 8 — segunda leitura

> Leitura independente da entrega da etapa 8 sobre a `main` em `312915f` (PR #133, fase 8.7 parte 1), feita em 2026-10-13 pela sessão do dono, depois da auditoria do coordenador (os resíduos 1 a 12 tratados ou registrados no PR #133). Seis leitores em paralelo, um por fase, juntaram a evidência; **cada resíduo abaixo foi conferido no código por esta sessão antes de entrar aqui**, e a regressão alta foi reproduzida. Feita com o Opus 5.5 em esforço máximo porque o limite do Fable tinha acabado: a seção 4 lista o que uma sessão com o Fable deve fechar, e a seção 5 traz o prompt pronto. O que valer daqui vai para `docs/history/PLAN-etapa-8.md` na 8.7 parte 2.
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

**Estado em 2026-10-14, depois do fechamento da etapa (#141).** A pergunta 1 está respondida: os testes do #137 falham antes da correção e passam depois, cobrindo (a) a (d), inclusive o `onCommit` que normaliza o texto; os testes da política de teclado da 8.3 (e) continuam verdes; e a reprodução desta leitura passa contra a correção. As perguntas 2 a 4 continuam abertas e estão na lista do marco ([`../ROADMAP.md`](../ROADMAP.md)). Os arquivos de código que elas citam (`session.ts`, `proposalActions.ts`, `proposals.ts`) não mudaram desde esta leitura, e os dois testes citados continuam nas linhas 400 e 426: as referências abaixo valem na `main`.

1. **A correção da regressão alta da 8.3** (respondida no #137; ver o estado acima). Ler o PR inteiro, mais `src/ui/CommitInput.tsx` e `src/ui/KeyValueGrid.tsx`. Responder se a guarda nova (a) ainda impede a gravação dupla quando o `change` chega antes da renderização, (b) deixa gravar de novo depois de desfazer, (c) se comporta quando o `onCommit` normaliza o texto (o valor gravado difere do digitado: espaços, maiúsculas), (d) cobre a Chave e o Valor dos pares livres e o par novo, e (e) não muda o Esc e o Alt+Enter da política de teclado. Confirmar com os testes do PR e, se faltar um caso, escrever o teste que falha.
2. **A corrida teórica do P7** (seção 3.2). Ler `src/store/proposalActions.ts:240-417`, `src/store/proposals.ts:199-262` e, em `src/store/session.ts`, `dropProjectImage` (`:524`), `adopt` (`:551`) e a conferência (`syncProject`, `:616`). Responder: a sequência (a falha do `writeProposal` + um `mapping.json` escrito por fora na mesma janela + uma conferência que o adota) é alcançável como descrita? O `rollback` apaga mesmo uma imagem que o disco cita? Se sim, a correção (guardar se o desfazer aconteceu e só fazer o `rollback` nesse caso) cobre o caso sem quebrar os testes `proposals.test.ts:400` e `:426`, e vale o código? Um teste possível: o armazenamento falso grava o `mapping.json` "de fora" e chama `session.sync()` de dentro do `writeProposal` antes de rejeitar.
3. **A imagem que sai e volta durante uma gravação** (seção 3.1, resíduo 5). Ler, em `src/store/session.ts`, `putImage` (`:321`), `writeProject` (`:384`), `cleanUp` (`:457`) e `addImages` (`:751`). Responder se, em qualquer intercalação de adicionar imagem, desfazer, refazer e gravar, o `mapping.json` em disco pode citar uma imagem ausente, e se a imagem pode se perder sem a pessoa ser avisada. A análise desta sessão diz que não (a gravação que apaga não cita a imagem; a seguinte a regrava da `trash` antes de citá-la). Se confirmar, basta registrar no histórico.
4. **A premissa do P7 no navegador** (seção 3.2). Só leitura e raciocínio, porque não dá para testar falha de disco aqui: um `close()` de `FileSystemWritableFileStream` que rejeita deixa o arquivo com o conteúdo anterior em todos os navegadores suportados (Chrome e Edge desktop)? Se houver caso em que ele rejeita depois de gravar, a compensação inverte o estado dividido (projeto desfeito, proposta "aplicada"), e isso vai para o histórico como limite.

## 5. Prompt para a sessão do Fable

Numa sessão do Claude Code com este repositório, no Fable 5.1 com esforço alto, mande:

> Leia `CLAUDE.md` e `docs/history/auditoria-etapa-8.md` (seções 1 a 4) e, para o que mudou depois dessa leitura, o fechamento em `docs/history/PLAN-etapa-8.md`. Você é a terceira leitura da etapa 8: não refaça a auditoria; feche só as perguntas 2 a 4 da seção 4 (a 1 já foi respondida). Para cada uma, responda **confirmado**, **refutado** ou **precisa de teste**, com `arquivo:linha` e o raciocínio em poucas linhas; onde confirmar um defeito, proponha a correção mínima e o teste que falha antes dela. Não edite nada sem o meu pedido. Termine com um bloco curto, só com o que muda o plano: o que corrigir (num PR pequeno, já que não há etapa em andamento) e o que só registrar no histórico e na lista do marco do `docs/ROADMAP.md`.
