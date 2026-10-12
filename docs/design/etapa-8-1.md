# Nota de desenho — fase 8.1: sessão e gravação

> Nota de desenho da fase 8.1 da etapa 8 (`PLAN.md`, "Fases pendentes — Etapa 8"). Cobre os achados **S1 a S10** de `docs/history/revisao-tecnica-2026-10-12.md`, seção 1. Escrita antes de qualquer código; o coordenador aprova ou devolve. Depois do merge, o conteúdo que vale vira a seção "Sessão e gravação" de `docs/ARCHITECTURE.md` e esta nota vai para `docs/history/` na fase 8.7.
>
> **Revisão 2** (depois da primeira leitura do coordenador): três ajustes incorporados, marcados **[A1]** (arquivo vazio persistente com a gravação em erro abre o conflito), **[A2]** (`written` nasce `null` quando o que está em memória difere do disco: migrado ou reparado) e **[A3]** (a gravação tira de `pendingFiles` só os arquivos que o `mapping.json` gravado cita); e as decisões D1 a D7 resolvidas (§7).

## 1. Resumo

Hoje a sessão tem **duas filas e três remendos**: a fila do `AutoSaver` (só gravações) e, fora dela, a conferência de alteração externa (`sync`), a adoção do arquivo do disco (`adopt`) e a decisão do conflito (`resolveConflict`), protegidas por `writing`, `writes`, `stalled()`, `syncing` e três checagens de `idle()`. A fase troca isso por **uma fila única no `AutoSaver`** (o desenho que `proposals.ts` já tem): gravação, conferência, recarga e decisão do conflito são trabalhos da mesma fila e nunca se cruzam **por construção**. Em volta disso, os achados pontuais: arquivo vazio na gravação é "tente depois" (S1), `saving` em toda gravação em curso (S2), `adopt` dentro da fila (S3), `unexported` com uma fonte (S4), nada regravado sem mudança (S5), órfãos limpos ao recarregar (S6), `resolveConflict` nunca rejeita (S7), exportar com a gravação em erro não devolve o aviso (S8), `sync` coalescido em vez de descartado (S9), comentários e acreções (S10).

Nada do schema v8 nem do formato da proposta muda. Nenhuma string nova de interface (ver §7).

## 2. Camada 1 — `AutoSaver` (`src/storage/autosave.ts`)

### Estado

| Campo        | Tipo                                    | Significado                                                                                              |
| ------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `status`     | signal `'saved' \| 'saving' \| 'error'` | O que a interface mostra. `saving` cobre o debounce, a espera na fila e a gravação.                      |
| `dirty`      | boolean                                 | Houve alteração desde a última gravação bem-sucedida.                                                    |
| `timer`      | timeout ou `undefined`                  | Debounce em curso.                                                                                       |
| `tail`       | `Promise<unknown>`                      | **A fila única**: cada trabalho começa quando o anterior termina (ok ou erro).                           |
| `inFlight`   | boolean                                 | `save()` rodando agora.                                                                                  |
| `generation` | number                                  | Sobe a cada `reset()`: um `save()` em curso quando o reset acontece não mexe mais no estado ao terminar. |

### API

```ts
export interface AutoSaver {
  readonly status: ReadonlySignal<SaveStatus>;
  /** Houve alteração: grava depois do debounce. */
  schedule(): void;
  /** Enfileira a gravação do pendente agora (ou a nova tentativa após um erro) e diz se gravou. */
  flush(): Promise<FlushResult>;
  /** Enfileira um trabalho que não pode cruzar com uma gravação (conferir, recarregar, decidir o conflito). */
  enqueue<T>(job: () => Promise<T>): Promise<T>;
  /** Descarta o pendente (o projeto foi recarregado do disco): cancela o debounce e a gravação enfileirada ainda não iniciada. */
  reset(): void;
  dispose(): void;
}
```

`FlushResult` não muda de forma: `{ ok: true } | { ok: false; error: unknown }`.

### Transições

| Evento                                   | Efeito                                                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule()`                             | `dirty = true`; `status = 'saving'`; reinicia o `timer` → `flush()`.                                                                                                                                                                                |
| `flush()`                                | Limpa o `timer`; enfileira o **trabalho de gravação**.                                                                                                                                                                                              |
| trabalho de gravação, ao começar         | `!dirty` → devolve `ok` sem gravar. Senão **`status = 'saving'`** (S2: também quando o anterior falhou), `dirty = false`, `inFlight = true`, guarda `generation`.                                                                                   |
| `save()` resolve                         | `inFlight = false`; se a `generation` é a mesma e `!dirty && timer === undefined` → `status = 'saved'`; devolve `ok`.                                                                                                                               |
| `save()` rejeita                         | `inFlight = false`; `reportError('save')`; se a `generation` é a mesma → `dirty = true`, `status = 'error'`; devolve `{ ok: false, error }`.                                                                                                        |
| `save()` termina com `generation` antiga | O pendente foi descartado por um `reset()`: `status = dirty ? 'saving' : 'saved'` (uma alteração pode ter entrado depois do reset), sem tocar em `dirty`.                                                                                           |
| `enqueue(job)`                           | Põe `job` na fila; devolve a promessa dele (rejeição do job vai para quem chamou; a fila continua).                                                                                                                                                 |
| `reset()`                                | Limpa o `timer`; `dirty = false`; `generation++`; `status = 'saved'` só se `!inFlight` (se há `save()` em curso, ele mesmo acerta o status ao terminar). Um trabalho de gravação já enfileirado e ainda não iniciado encontra `!dirty` e não grava. |
| `dispose()`                              | Como hoje: bloqueia `schedule()` e limpa o `timer`.                                                                                                                                                                                                 |

### Invariantes (teste automático, §6)

- **I1** `status === 'saved'` ⇒ nenhum `save()` em curso, `dirty === false` e nenhum `timer`.
- **I2** `save()` em curso ⇒ `status === 'saving'`.
- **I3** `status === 'error'` ⇒ nenhum `save()` em curso (e há pendência).

Hoje I2 falha (achado S2) e `tests/store/externalChanges.test.ts` L598-626 fixa a violação como comportamento esperado; esse teste é reescrito (§6).

### Regra de uso (não dá para impor por código)

Um trabalho da fila **nunca** chama `flush()`/`enqueue()` nem espera a fila de `proposals.ts`: a espera ficaria atrás dele mesmo. A direção permitida é só `proposals` → `saver` (`applyAccepted` chama `deps.flush()` de dentro da fila das propostas, como hoje). Na sessão isso vale por estrutura: `resolveConflict('keep')` é `enqueue(job)` **e depois** `flush()`; `proposals.scan()` roda **depois** do trabalho de conferência, fora dele (§3). Não há como distinguir, dentro do saver, uma chamada feita de dentro de um job de uma feita de fora enquanto o job roda, então a regra fica em comentário e nos testes (um deadlock aparece como timeout).

## 3. Camada 2 — sessão (`src/store/session.ts`)

### Estado

| Campo          | Significado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saver.status` | Como acima; é o `saveStatus` da sessão.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `conflict`     | `null`, `{ reloadFailed: false }` (há decisão pendente) ou `{ reloadFailed: true }` (Recarregar falhou; a decisão continua pendente). Nome e texto mantidos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `disk`         | `{ revision, text, lastModified }`: o `mapping.json` como a sessão o leu ou gravou por último. **`lastModified` nasce do `statMapping()` da abertura** (S10), não mais `null`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `written`      | `Project \| null`: o **snapshot confirmado que o disco tem** (por identidade). **[A2]** Nasce igual ao projeto aberto **só quando `serialize(project) === loadedText`** (o arquivo é exatamente a serialização do que está em memória); senão nasce `null`: projeto migrado (`migratedFrom`), reparado ao abrir (`repaired`) ou arquivo escrito por outro programa em formato não canônico. Com `null`, a primeira mudança de `revision` grava, como hoje, e o disco deixa de ter o arquivo antigo/inconsistente. Vira `p` a cada gravação; em `adopt`, a mesma regra sobre `loaded.text` (um `migratedFrom !== null` dá `null`); vira `null` em "Manter as minhas" (o disco passou a ter o arquivo de fora). Substitui a comparação por `revision` do store para decidir se há algo a gravar (S5). |
| `exported`     | `Project \| null`: o snapshot confirmado que o último `collectFiles()` levou (S8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pendingFiles` | `Set<string>`: arquivos de imagem que a sessão gravou e que **nenhum `mapping.json` gravado ainda cita** (S6). `putImage` acrescenta; **[A3]** a gravação de `p` tira **só os arquivos que `p` cita** (uma imagem posta durante essa gravação não está em `p` e continua pendente até a gravação que a citar); `adopt` apaga os que o projeto adotado não cita e, como os restantes são citados pelo arquivo do disco, zera o conjunto.                                                                                                                                                                                                                                                                                                                                                             |
| `pendingSync`  | A conferência enfileirada e ainda não iniciada, com o `images` acumulado (S9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `closed`       | Como hoje.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Somem**: `writing`, `writes`, `stalled()`, `checkStalled`, `syncing`, a exceção `text.trim() === ''` de `assertNotChangedExternally`, a opção `onSaved`, as três checagens de `idle()` em `syncProject` (fica **uma** guarda, no ponto de decisão; ver "conferência" abaixo).

### Os quatro trabalhos da fila

Todos rodam por `saver.enqueue` (a gravação, por `flush`); nenhum chama `flush`/`enqueue` nem espera `proposals`.

**Gravação** (`persist`, o `save()` do saver):

1. `p = store.committed.peek()`; sem projeto → sai. **`p === written` → sai sem gravar** (S5: nada mudou em relação ao disco; o saver conclui `ok` e volta a `saved`).
2. `text = readMapping()` (o único ponto de `storage.loadMapping(` da sessão), nesta ordem:
   - `null` (apagado por fora) → segue gravando, como hoje;
   - `!changedExternally(text)` (igual ao que a sessão leu ou gravou por último; inclui o caso em que "Manter as minhas" adotou um arquivo vazio, `disk.text === ''`) → segue gravando;
   - **vazio (`trim() === ''`) e diferente → "ilegível, tente depois"** (S1): espera o intervalo do debounce e relê, até **4 tentativas** (~1 s); se continuar vazio, falha com `EmptyMappingError` (vira `status = 'error'`, "Erro ao salvar / Tentar de novo"; a conferência seguinte, com a gravação em erro, abre o conflito: **[A1]**, passo 4 da conferência). Decisão D2;
   - texto diferente → `conflict = { reloadFailed: false }`; lança `ExternalChangeError`.
3. Backup pré-migração, imagens que voltaram da `trash` (`pendingFiles.add`), cópias de `specs/`; se gravou algo, **relê com a mesma regra do passo 2**.
4. `saveMapping(serialize({ ...p, revision: disk.revision + 1 }))`; `disk = { revision, text, lastModified: stat }`; `written = p`; **[A3]** `pendingFiles` perde só os arquivos citados por `p`; **`if (p !== exported) onChanged()`** (S8); `cleanUp` (erro só no Diagnóstico, como hoje).

**Conferência** (`syncProject`, chamado por `sync`):

1. `closed` ou sem projeto → `unchanged`; `conflict` aberto → `unchanged`; gesto em andamento → `busy`; `status === 'saving'` → `busy` (há gravação agendada ou na fila: ela mesma confere).
2. Espera o `statMapping()` da abertura; `modified = stat`; `null` ou igual a `disk.lastModified` → `unchanged` (e confere as imagens, se pedido).
3. `text = readMapping()`; `null` → `unchanged`; igual a `disk.text` → só `disk.lastModified = modified`, `unchanged`. **Vazio** e diferente: com `status === 'saved'` → `unchanged` (editor escrevendo; sem pendência, nada a proteger); com `status === 'error'` → **[A1]** conta como texto diferente e cai no passo 4.
4. Texto diferente com **`status === 'error'`** (a pendência não chega ao disco sozinha) → `conflict = { reloadFailed: false }` → `'conflict'`. É o `checkStalled` de hoje, sem `writes`: dentro da fila nenhuma gravação está correndo, e um "Tentar de novo" clicado durante a leitura é um trabalho atrás deste, que relê o arquivo. **[A1]** Com o arquivo vazio de vez (ferramenta que falhou no meio, sincronizador), é esta a saída: a gravação desistiu depois das 4 tentativas, a conferência abre "Projeto alterado fora da app", **Recarregar** falha com `reloadFailed` (ilegível) e **Manter as minhas** adota o vazio (`disk.text = ''`) e grava por cima, que é a saída decidida pela pessoa; sem isso, ela ficaria para sempre em "Erro ao salvar / Tentar de novo".
5. Texto diferente com **`status === 'saved'`** → `loaded = loadProject(storage)`; ilegível → `unchanged`; **guarda única**: `!idle()` (uma edição entrou durante as leituras, porque edições são síncronas e continuam acontecendo entre os `await`) → `busy`; senão `adopt(loaded, modified)` → `'reloaded'`, `checkImages(true)`.

`sync(options)` em volta: fora de pasta/fechada/sem projeto → `unchanged`. **Coalescência** (S9): se há uma conferência enfileirada e ainda não iniciada, acumula `images` nela e devolve a mesma promessa; se há uma rodando, enfileira **uma** atrás dela (com `images` acumulado). Depois do trabalho, se não fechou, `proposals.scan()` (fora da fila do saver, como hoje, para não cruzar as duas filas). O `syncing` some.

**Recarregar** (`resolveConflict('reload')`, S3 e S7): sem conflito → sai. `modified = stat`; `loaded = loadProject(storage)` em `try/catch`; lançou ou `!ok` → `reportError('session.reload')`, `conflict = { reloadFailed: true }`, sai; senão `adopt(loaded, modified)`, `conflict = null`, `checkImages(true)`. Como está na fila, **espera a gravação em curso terminar** (ela falha com `ExternalChangeError`, ou, se já passou do `assert`, grava e então o reload lê o disco como está) e **cancela a enfileirada** via `saver.reset()` dentro de `adopt`. Nunca rejeita.

**Manter as minhas** (`resolveConflict('keep')`, S7): trabalho enfileirado: sem conflito → sai; `text = readMapping()` em `try/catch` (lançou → `reportError('session.keep')` e segue como `null`: a revisão conhecida fica); `disk = { revision: readRevision(text) ?? disk.revision, text, lastModified: stat }`; `written = null`; `conflict = null`; `saver.schedule()` (as minhas vão para o disco mesmo que a pendência tenha sido desfeita no meio). Depois do trabalho, fora dele, `await saver.flush()`: se o disco está travado, o resultado é `status = 'error'` ("Erro ao salvar"), não uma rejeição solta. Nunca rejeita.

### `adopt(loaded, modified)` (só de dentro de um trabalho)

Parte síncrona, logo depois da guarda: `store.load`; `lastRevision`; `saver.reset()`; `orphans = pendingFiles − arquivos citados pelo projeto adotado`; `stored`, `trash`, `writtenSpecs`, `pendingBackup` como hoje; `disk = { revision, text, lastModified: modified }`; **[A2]** `written = serialize(loaded.project) === loaded.text ? store.committed.peek() : null` (um arquivo migrado ao recarregar fica `null` e a primeira edição grava o formato novo, como hoje); `pendingFiles.clear()` (os que sobraram são citados pelo arquivo do disco); `reloads++`. Depois, `await storage.removeImage(f)` para cada órfão (S6; falha vai para `session.cleanup`). Só arquivos que a própria sessão gravou **e que nenhum `mapping.json` gravado citou** são apagados: um arquivo citado por uma gravação anterior e "descitado" por fora fica no disco, como hoje.

### Efeito de `store.revision`

`committed !== written` → `saver.schedule()`. `committed === written` (o desfazer voltou ao snapshot que o disco tem, S5) → não agenda; se `status !== 'saved'`, `void saver.flush()` para a gravação encontrar `p === written` e o status voltar a `saved` sem escrita. Com o conflito aberto, o diálogo continua até a pessoa decidir (D3).

### Outras mudanças

- `collectFiles()` devolve também **`saved: boolean`** (o `ok` do `flush`) e registra `exported = p` (S8). Se a pessoa cancelar o "Salvar como", `exported` fica registrado sem efeito: o indicador só é limpo por `markExported`, e uma gravação do mesmo `p` não precisaria marcá-lo de novo mesmo.
- `close()`: `closed = true`; `stopWatching()`; `await proposals.settled()`; `await saver.flush()` (na fila, **atrás da conferência ou da recarga em curso**, S10); `dispose()`; `store.close()`. Um trabalho de conferência que começa depois de `closed` sai em `unchanged`, e `sync` não chama `scan` depois de fechado.
- `SyncResult`: comentário reescrito: `busy` = gesto em andamento ou gravação agendada/na fila (`status === 'saving'`); com a gravação em erro a resposta é `conflict` ou `unchanged`.
- `putImage` (imagens importadas, trocadas, restauradas pelo desfazer e as aceitas de propostas via `putProjectImage`) acrescenta a `pendingFiles`.

## 4. Contratos com os vizinhos

### `flush()` / `FlushResult` (para a fase 8.2, P7)

```ts
flush(): Promise<FlushResult>;
type FlushResult = { readonly ok: true } | { readonly ok: false; readonly error: unknown };
```

- **Nunca rejeita.** Entra na fila: espera a gravação, a conferência ou a recarga em curso.
- **`ok: true` ⇔ o projeto confirmado do instante da chamada está no disco** (foi gravado agora, ou já era o que o disco tinha). Não existe mais "ok sem gravar": o arquivo vazio tenta de novo dentro da própria gravação e, se não resolver, é `ok: false`.
- **`ok: false` ⇔ a pendência continua** (`saveStatus === 'error'`, "Erro ao salvar / Tentar de novo"), com a causa em `error`. Só `ExternalChangeError` é distinguível (`session.conflict` aberto); os demais (`EmptyMappingError`, erros do armazenamento) são opacos para quem chama.
- `flush()` pode ser chamado **duas vezes na mesma mutação** de `proposals.mutate` (como `applyAccepted` já faz uma vez, de dentro da fila das propostas): a direção `proposals → saver` é a permitida.
- **Compensação do `write-failed` depois do `flush` (P7, a 8.2 implementa):** quando `writeProposal` falha com o `mapping.json` já gravado, a 8.2 desfaz a entrada (`store.undo()` com o `link` marcado `abandoned`) e devolve as imagens (`rollback`). A sessão então vê `committed !== written` (o disco tem o projeto aplicado; a memória voltou ao de antes) e **agenda sozinha a gravação do projeto restaurado**, com `revision + 1`. A 8.2 pode chamar `deps.flush()` de novo para forçar e saber o resultado. Com o P7 compensado, `written` continua verdadeiro: a sessão não precisa saber da proposta.

### `onChanged` (controller e propostas; S4)

- `SessionOptions.onSaved` vira **`onChanged?: () => void`**: "algo deste projeto mudou no armazenamento desta sessão", chamado (a) pela gravação do `mapping.json` quando o projeto gravado não é o último exportado e (b) **por cada gravação bem-sucedida de `proposal.json`** (decidir, anotar, aplicar, desfazer/refazer a aplicação).
- `createProposalStore` ganha a opção **`onChanged?: () => void`**, chamada em `runMutation` logo depois de `storage.writeProposal` dar certo (único ponto). A sessão a liga a `options.onChanged`.
- `controller.ts` (`start`): `onChanged: () => { unexported.value = true }`. `markExported` fica como está (zera o signal e persiste `false`). O flag persistido no IndexedDB continua sendo gravado atomicamente por `local.ts` em `saveMapping` e `writeProposal` (fora do que esta fase pode mudar; ver D1).

### Outros

- `useExternalChanges.ts`: só o comentário (o coalescimento de `sync({ images: true })` mora na sessão). `EditorDialogs.tsx`: o `void session.resolveConflict(…)` passa a ser correto por contrato (nunca rejeita); se nada precisar mudar no arquivo, ele não muda.
- `pagehide`/`visibilitychange`/`beforeunload` (`bindPageLifecycle`): continuam chamando `flush()`; `beforeunload` continua bloqueando com `status !== 'saved'`. Sem mudança de comportamento; só o comentário cita que `flush` entra na fila.

## 5. O que sobra e o que some (lista)

| Some                                                       | Fica no lugar                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `writing`, `writes`, `stalled()`, `checkStalled`           | Trabalho de conferência na fila; passo 4 da conferência.                                                                                                        |
| `syncing` (descarta `sync` concorrente)                    | `pendingSync` com `images` acumulado.                                                                                                                           |
| três `idle()` em `syncProject`                             | `status === 'saving'` → `busy` no início; **uma** guarda antes do `adopt` síncrono.                                                                             |
| `text.trim() === ''` passa em `assertNotChangedExternally` | Vazio = tente depois (até 4 vezes), depois `EmptyMappingError`; com a gravação em erro, a conferência abre o conflito e "Manter as minhas" grava por cima [A1]. |
| `written` igual ao projeto aberto sempre                   | `written` só nasce igual quando `serialize(project) === loadedText` [A2].                                                                                       |
| `onSaved`                                                  | `onChanged` (sessão + propostas).                                                                                                                               |
| `reset()` que "não toca na fila"                           | `reset()` cancela a enfileirada não iniciada e deixa a em curso terminar sem efeito.                                                                            |
| `disk.lastModified = null` na abertura                     | `statMapping()` na abertura, esperado pela primeira conferência.                                                                                                |
| `resolveConflict` que rejeita                              | `try/catch` nos dois ramos; `reloadFailed` no Recarregar, `status = 'error'` no Manter.                                                                         |

## 6. Testes

Cada achado ganha o teste antes da correção (commit do teste antes do da correção). Arquivos: `tests/storage/autosave.test.ts`, `tests/store/externalChanges.test.ts` (reaproveita `hooked`/`holdSave`/`holdRead`), `tests/store/session.test.ts`, `tests/app/controller.test.ts` (um teste do `unexported`, ver D6).

| Achado | Teste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1     | externalChanges: "editor trunca o arquivo e depois escreve": a leitura da gravação vê `''`, não grava, relê e encontra o texto do editor → `conflict`, não recarga (o cenário do Aceite). "Arquivo vazio por mais de 4 tentativas → `status = 'error'`, nada gravado". **[A1]** "Vazio persistente depois do erro → a conferência abre o conflito; Recarregar dá `reloadFailed`; Manter as minhas grava por cima e o status volta a `saved`". O teste existente do `null` ("apagado por fora é gravado de novo") fica. |
| S2     | autosave: "gravação enfileirada atrás de uma que falhou roda com `saving`". externalChanges L598-626 **reescrito**: "com uma gravação em curso depois de um erro, o status é `saving` e a conferência devolve `busy`" (hoje fixa `status === 'error'`, a violação de I2). Teste de invariantes (abaixo).                                                                                                                                                                                                               |
| S3     | externalChanges com `holdRead`: gravação 1 falha com `ExternalChangeError`, a 2 (enfileirada) está lendo o arquivo quando chega `resolveConflict('reload')`: o disco nunca recebe o projeto antigo (`savesStarted` não cresce), o projeto adotado é o de fora, `status = 'saved'`. autosave: "`reset()` cancela a gravação enfileirada ainda não iniciada" e "um `save()` em curso no `reset()` termina sem mudar o status".                                                                                           |
| S4     | session: "gravar uma proposta chama `onChanged`" (decidir → 1 chamada; nada no `mapping.json`). controller: "decidir numa proposta marca `unexported` sem reabrir".                                                                                                                                                                                                                                                                                                                                                    |
| S5     | externalChanges: "desfazer depois de uma gravação recusada não regrava": edição → gravação falha → `undo` → `saveMapping` não é chamado de novo e `status` volta a `saved`; com `ExternalChangeError`, o conflito não é reaberto por uma gravação nova. session: o mesmo via `applyAccepted` com `save-failed` (o caminho do PLAN-etapa-5). **[A2]** session: "projeto migrado (`migratedFrom`): editar e desfazer até o estado inicial ainda grava o formato novo" (e o mesmo com `loadedText` não canônico).         |
| S6     | externalChanges: "Recarregar depois de adicionar imagem com a gravação recusada apaga o arquivo órfão"; "arquivo citado por um `mapping.json` já gravado não é apagado no Recarregar". **[A3]** com `holdSave`: "imagem adicionada durante uma gravação em curso, gravação seguinte recusada, Recarregar → o arquivo é apagado" (a primeira gravação não a cita e não a tira de `pendingFiles`).                                                                                                                       |
| S7     | externalChanges: "Recarregar com `loadMapping` lançando: `reloadFailed`, `reportError('session.reload')`, a promessa resolve"; "Manter as minhas com `loadMapping` lançando: resolve, e a gravação cai em `error` em vez de rejeitar".                                                                                                                                                                                                                                                                                 |
| S8     | session: "`collectFiles` com a gravação em erro devolve `saved: false` e leva o confirmado"; "a gravação que enfim passa com o conteúdo exportado não chama `onChanged`; a de um projeto diferente chama".                                                                                                                                                                                                                                                                                                             |
| S9     | externalChanges: "`sync({ images: true })` durante uma conferência em curso não é descartado: as imagens são conferidas ao fim" (`onImagesChanged` com o arquivo trocado); "duas chamadas concorrentes geram no máximo uma conferência a mais".                                                                                                                                                                                                                                                                        |
| S10    | externalChanges: "a primeira conferência com o arquivo igual não o lê (`lastModified` conhecido ao abrir)"; "`close()` espera a conferência em curso: nenhum `adopt` depois de fechar". Os comentários de `SyncResult` e da conferência são conferidos na revisão do diff.                                                                                                                                                                                                                                             |

**Regra automática 1 — invariantes do `AutoSaver`** (`tests/storage/autosave.test.ts`): um passeio aleatório com semente fixa (200 passos × 20 sementes) sobre `schedule`, `flush`, `reset`, avanço do timer e resolução/rejeição do `save()` em curso (controlado pelo mock); depois de cada passo, I2 e I3 pelo mock (`inFlight` observável), e I1 por comportamento: sempre que `status === 'saved'`, um `flush()` imediato não chama `save()`. Hoje falha em I2 no caso "enfileirada atrás de uma que falhou".

**Regra automática 2 — ESLint `no-restricted-syntax`** (`eslint.config.js`), em três blocos:

- `src/**` exceto `src/store/session.ts`, `src/storage/loadProject.ts` e `src/app/controller.ts`: proíbe `CallExpression[callee.property.name='loadMapping']` e `…='saveMapping'`;
- `src/store/session.ts`: `loadMapping(` só dentro de `readMapping` e `saveMapping(` só dentro de `writeProject`, com `:not(VariableDeclarator[id.name='…'] CallExpression)` (conferi no esquery instalado: o seletor aponta exatamente as chamadas fora da função nomeada);
- `src/app/controller.ts`: `saveMapping(` só dentro de `createFolderProject` (`FunctionDeclaration[id.name='createFolderProject']`); `loadMapping(` livre (as três conferências de existência).

**Convivência com a 8.3.** A 8.3 também usa `no-restricted-syntax` em `src/ui/**` e `src/app/**` (contra `document.querySelector` e seletor por classe). No flat config, um bloco posterior com a mesma regra **substitui** os seletores do anterior para os arquivos em comum, então dois blocos independentes se apagariam em silêncio. Por isso os seletores desta fase ficam numa **constante nomeada** no topo do `eslint.config.js`, **`sessionStorageSyntaxRules`** (array de `{ selector, message }` do bloco `src/**`; os blocos de `session.ts` e `controller.ts` têm as suas próprias, `sessionFileSyntaxRules` e `controllerFileSyntaxRules`, e não colidem com a 8.3 porque são por arquivo), e o bloco faz `'no-restricted-syntax': ['error', ...sessionStorageSyntaxRules]`. Ao mergear o segundo PR, o coordenador junta os dois conjuntos num só bloco (`[...sessionStorageSyntaxRules, ...focusSyntaxRules]`, ou o nome que a 8.3 der).

**Teste da regra** (`tests/tooling/sessionStorageLint.test.ts`, projeto `tooling`/`node` do Vitest): carrega o `eslint.config.js` real com `new ESLint({ overrideConfigFile })` e usa **`ESLint.lintText`** com `filePath` falso para provar, sem criar arquivo:

- `storage.loadMapping()` com `filePath: 'src/app/x.ts'` → 1 erro de `no-restricted-syntax` com a mensagem da sessão;
- `storage.saveMapping(text)` com `filePath: 'src/ui/x.tsx'` → 1 erro;
- `storage.saveMapping(text)` fora de `writeProject` com `filePath: 'src/store/session.ts'` → 1 erro; dentro de `const writeProject = async () => { … }` → 0;
- `storage.loadMapping()` com `filePath: 'src/storage/loadProject.ts'` e `src/app/controller.ts` → 0.

Como os casos de `src/app/` e `src/ui/` ficam no teste, a combinação com os seletores da 8.3 é verificável no merge: se o bloco da 8.3 substituir o desta fase, o teste quebra.

A prova no PR, além do teste: um arquivo temporário com `storage.loadMapping(` em `src/app/useExternalChanges.ts` e um `storage.saveMapping(` fora de `writeProject` em `session.ts`, com a saída do `npm run lint` falhando nos dois.

**Aceite** (do `PLAN.md`): R6.1 a R6.11 do `docs/TESTING.md` sem regressão (passos manuais no "Como testar"); o cenário "editor trunca e depois escreve" por teste; nenhum teste fixa `status === 'error'` com gravação em curso (o L598 é reescrito).

## 7. Decisões (resolvidas pelo coordenador na revisão da nota)

Todas seguem o "Proposto" de "Decisões a confirmar" do `PLAN.md` (itens 1 e 2) ou a opção conservadora; o que a pessoa percebe vai para "Decisões tomadas" do PR.

- **D1 — alcance do S8 (conservador, aprovado).** Esta fase entrega `collectFiles().saved`, o snapshot `exported` e o `onChanged` que não re-marca "não exportadas" quando a gravação pendente enfim grava o conteúdo já exportado. **Resíduo aceito e registrado**: no caminho raro "IndexedDB falhou → exportou → IndexedDB voltou", a lista da tela inicial mostra "Alterações não exportadas" ao reabrir, porque `local.ts#saveMapping` grava o flag `true` atomicamente em toda gravação (arquivo da 8.4). Fica para fases seguintes (seção "Para fases seguintes" do PR): o aviso "exportando com alterações não gravadas" no diálogo Exportar (`src/app/ExportDialog.tsx`, 8.3) e a fonte única do flag no IndexedDB (`local.ts`, 8.4).
- **D2 — limite das tentativas com o arquivo vazio (aprovado, com [A1]).** O `PLAN.md` diz "não grava, `schedule()` e sai sem erro". Literalmente, `flush()` resolveria `ok: true` sem o conteúdo no disco (quebra o P7 da 8.2) e `close()` perderia a edição (o `dispose` limpa o timer). A nova tentativa fica **dentro da gravação**, sem erro, até 4 vezes no intervalo do debounce (~1 s, de sobra para um editor que trunca e escreve); depois vira `error`, e **[A1]** a conferência abre o conflito para a pessoa decidir ("Manter as minhas" grava por cima). Visível só com o arquivo vazio por mais de um segundo.
- **D3 — conflito aberto sem pendência (conservador, aprovado).** Depois de desfazer a mudança que a gravação recusou, não há mais nada a perder, mas o diálogo "Projeto alterado fora da app" **continua aberto** até a pessoa escolher (Recarregar adota; Manter grava o confirmado por cima, como hoje).
- **D4 — "Manter as minhas" com o arquivo ilegível (aprovado).** Segue como se o arquivo tivesse sumido (`null`): a revisão conhecida fica e a gravação é tentada; se o disco está travado, o resultado é "Erro ao salvar" com "Tentar de novo". Nenhuma chave de i18n nova; `external.reloadFailed` continua servindo ao Recarregar (que falha por "sumiu ou ilegível", inclusive permissão revogada).
- **D5 — `AutoSaver.enqueue` em vez de `settled()` (aprovado).** Um só mecanismo para o que não pode cruzar com a gravação; `proposals.ts` não muda a fila dele.
- **D6 — um teste em `tests/app/controller.test.ts` (aprovado).** O arquivo é da 8.4 (onda 2), mas o teste do S4 no nível do controller (o signal `unexported` depois de decidir) só cabe ali; a 8.4 parte da `main` depois do merge desta fase.
- **D7 — identidade, não `revision`, para "há algo a gravar" (aprovado, com [A2]).** `written` compara o snapshot confirmado por identidade (`store.committed` troca de objeto só quando o projeto muda; o desfazer devolve o objeto guardado no histórico) e só nasce igual ao projeto quando o arquivo é exatamente a serialização dele. É o que faz o S5 funcionar sem mudar `history.ts` (fora do "Toca em").

### Para fases seguintes (registrado no PR)

- 8.3: aviso "exportando com alterações não gravadas" no diálogo Exportar, a partir de `collectFiles().saved` (precisa de `buildExport` repassar `saved` em `ExportedProject`).
- 8.4: fonte única do flag `unexported` persistido (`local.ts#saveMapping`/`writeProposal` gravam `true` por conta própria; o signal segue `onChanged`).

## 8. Riscos e o que fica igual

- **Fila única atrasa a conferência atrás de uma gravação longa** (imagens grandes): a conferência espera; antes ela devolvia `busy` na hora. O resultado para a interface é o mesmo (`busy` ou a resposta certa um pouco depois); o poll de 3 s coalesce em vez de acumular.
- **Edições durante a conferência**: continuam possíveis (são síncronas); por isso a guarda única antes do `adopt`. Nenhuma edição é perdida: ou ela vira `busy`, ou já foi gravada.
- **Comportamento visível igual** em R6.1 a R6.11; o que muda é não ver "Erro ao salvar" durante uma gravação que está rodando (S2) e o indicador "Alterações não exportadas" aparecer logo ao decidir uma proposta (S4).
- `docs/ARCHITECTURE.md`: os itens "Persistência" e "Revisão e mudanças externas" do "Fluxo de dados" viram **uma** seção "Sessão e gravação", com as tabelas de §2 e §3 (estados, trabalhos da fila, transições) e sem as exceções antigas (`writing`, `writes`, vazio "de ninguém").
