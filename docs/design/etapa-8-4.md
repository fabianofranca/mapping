# Nota de desenho — fase 8.4: recentes e controller

> **Revisão 2** (na aprovação): corrigida a frase do §3 sobre a chave do retomar (é da 8.2, `${copyId}|${proposalId}`); respostas do coordenador às perguntas do §8: 1, 2 e 3 aprovadas como propostas; 4 fica registrada.

> Nota de desenho da fase 8.4 da etapa 8 (`PLAN.md`), escrita antes do código e aprovada pelo coordenador antes do primeiro commit de código. Achados R1, R2 e R4 a R10 da seção 4 de `docs/history/revisao-tecnica-2026-10-12.md` (R3 vai pela 8.2, que lê o `copyId` definido aqui). Base: `main` `9682ee8` (8.1 e 8.3 já mergeadas).

## 1. O que fica no fim

Uma regra muda a forma do subsistema: **a entrada dos recentes é resolvida antes de a sessão abrir**, não depois. Hoje o projeto abre (`start` publica `openProject`, o editor monta) e só então `rememberFolder` grava a pasta no IndexedDB e define `openFolderId`, um estado de módulo. É daí que vêm a corrida do R1 (fechar durante o `remember`) e a impossibilidade de dar à sessão a chave da cópia (o `copyId` só existiria depois de o `ProjectStorage` já estar na sessão). Com a ordem nova:

```
ler (loadProject)  ─►  vincular (bind: guardar nos recentes / marcar uso)  ─►  start (sessão + openProject)
        │                         │                                              │
  storage de leitura      devolve { storage com copyId, folderId }       OpenProject.folderId
  (sem copyId)            (o mesmo passo no caminho normal e no "Reparar e abrir")
```

- **R1 some por construção**: quando o editor aparece, o `remember` já terminou; não existe mais `openFolderId` de módulo. O id da entrada vive no próprio `OpenProject` (`folderId: string | null`), e `closeProject`/`onChanged` leem dali.
- **O `ProjectStorage` da sessão nasce com o `copyId`** e não muda (imutável, `readonly`).
- **R4 some por construção**: o vínculo roda igual no caminho normal e no reparado (hoje a pasta envolve o `repair` à mão e o local esqueceu); o embrulho manual do `repair` em `openFolderHandle` desaparece.

Custo: o editor aparece depois de uma gravação pequena no IndexedDB (`remember`: ler os candidatos com o mesmo nome de pasta, `isSameEntry`, um `put`). São milissegundos; uma falha não impede a abertura (cai no id por sessão, seção 3).

## 2. Módulos: o que sobra, o que muda de lugar, o que some

| Módulo                                                                                      | Responsabilidade                                                                                                                                                                                                                                                                                                                                                                                                                                          | Estado de módulo                                             |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/app/controller.ts` (alvo **< 450** linhas, hoje 716)                                   | detecção (`initApp`, `features`), `openProject`, `start`/`openFromStorage`/reparo, local + zip, pasta (`openFolder`, `openFolderHandle`, `createFolderProject`), exportar, `markExported`, `closeProject`; **re-exporta** o que `Home.tsx` e os testes usam de `recents.ts`                                                                                                                                                                               | `features`, `openProject`                                    |
| `src/app/recents.ts` (novo)                                                                 | os dois bancos (`initRecents(folderMode)` abre `LocalLibrary` e `FolderLibrary`), `localProjects`, `recentFolders`, `RecentProject`, `recentProjects` (computed, com `showFolderName`, R7), `refreshLocalProjects`, `refreshRecentFolders`, `deleteLocalProject`, `markLocalOpened`, `rememberFolder` (devolve `{ folderId, copyId }`), `sessionCopyId`, `touchFolder`, `handleOf` + `knownHandles`, `openRecentFolder`, `relocateFolder`, `forgetFolder` | `library`, `folderLibrary`, `knownHandles`, signals da lista |
| `src/app/pageLifecycle.ts` (novo)                                                           | `bindPageLifecycle(currentSession: () => ProjectSession \| undefined)`: `visibilitychange`, `pagehide`, `beforeunload` (o corpo de hoje, sem mudança)                                                                                                                                                                                                                                                                                                     | `bound`                                                      |
| `src/app/appResult.ts` (novo, **pede aprovação**: não está em "Toca em", mas o split exige) | `AppErrorCode`, `AppResult`, `InconsistentProject`, `ok`, `err`, `guarded`                                                                                                                                                                                                                                                                                                                                                                                | —                                                            |

**Por que `appResult.ts`:** `recents.ts` precisa de `AppResult`/`guarded` (Abrir, Localizar e Remover devolvem `AppResult`), e o controller importa `recents.ts`; com os tipos no controller, `recents.ts` importaria o controller e fecharia um ciclo de imports. O módulo de tipos sem dependências quebra o ciclo e tira ~55 linhas do controller. Alternativa se o coordenador recusar: `openRecentFolder`/`relocateFolder`/`forgetFolder` ficam no controller, e o controller passa de 450 (não cumpre o aceite).

**Sem ciclo**: `recents.ts` não importa o controller. Abrir e Localizar precisam de `openFolderHandle` (do controller): ele entra como argumento, e o controller re-exporta a versão ligada:

```ts
// controller.ts
export const openRecentFolder = (id: string) =>
  recents.openRecentFolder(id, openFolderHandle);
export const relocateFolder = (id: string) =>
  recents.relocateFolder(id, openFolderHandle);
export {
  forgetFolder,
  localProjects,
  recentProjects,
  refreshLocalProjects,
  deleteLocalProject,
  type RecentProject,
  type RecentFolderOpen,
  type FolderRelocation,
} from './recents';
export type { AppErrorCode, AppResult, InconsistentProject } from './appResult';
```

`Home.tsx`, `tests/components/Home.test.tsx` (que faz `vi.mock` do controller inteiro) e `tests/app/controller.test.ts` continuam importando só de `./controller`. `openRecentFolder` continua começando a consulta de permissão **sincronamente** no clique (o corpo síncrono da função ligada chega ao `queryPermission` antes de qualquer `await`; o teste "a consulta começa no próprio clique" continua valendo).

**Some:** `openFolderId` (módulo), o embrulho do `repair` em `openFolderHandle`, `openProjectName()` (o nome vem do projeto carregado, no vínculo), a ordenação de `LocalLibrary.list()` (R10). **Muda:** `refreshRecentFolders` deixa de ser exportada do controller (ninguém de fora usa; os testes usam `recentProjects`).

**Conferências de existência fora do `loadMapping`.** Hoje o controller chama `createFolderStorage(handle).loadMapping() === null` em três lugares (abrir pasta, abrir recente, Localizar), e é por isso que a regra da 8.1 deixa o `loadMapping` livre no controller. Dois desses lugares vão para `recents.ts`, onde a regra pegaria. Em vez de abrir outra exceção: `folder.ts` ganha `hasMappingFile(root): Promise<boolean>` (lê o arquivo pelo `readFile` interno, sem passar pelo `ProjectStorage`), os três lugares usam ele, e a regra do controller **aperta**: `loadMapping` passa a ser proibido também no controller (`controllerFileSyntaxRules` ganha o seletor; `tests/tooling/sessionStorageLint.test.ts` ganha o caso). `saveMapping` continua só em `createFolderProject`, que fica no controller.

## 3. O contrato `copyId` (com a 8.2)

```ts
// src/storage/types.ts, em ProjectStorage
/**
 * A cópia do projeto a que o estado por dispositivo (retomar a revisão) pertence. Local: o id
 * do projeto no IndexedDB. Pasta: o id da entrada dos recentes (por pasta física, sobrevive ao
 * "Localizar"); sem recentes, um id por sessão da aba. Definido na criação do storage e
 * imutável. Todo storage entregue a uma sessão aberta pelo controller tem copyId; só os de
 * leitura (abrir, conferir a pasta escolhida) não têm.
 */
readonly copyId?: string;
```

| Caso                                                                                                                                           | Valor                                                              | Quem preenche                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Local (criar, abrir, importar zip, reparado)                                                                                                   | `id` do projeto (o mesmo `LocalProjectStorage.id`)                 | `LocalLibrary.open(id)` devolve `copyId: id`                                       |
| Pasta guardada nos recentes (abrir pasta, abrir recente, Localizar, criar projeto na pasta, reparado)                                          | id da entrada de `mapping-folders` devolvido por `remember`        | vínculo → `createFolderStorage(handle, { copyId })`                                |
| Pasta sem recentes (sem `FolderLibrary` porque não há IndexedDB; handle sem `queryPermission`/`isSameEntry`; pasta do OPFS; `remember` falhou) | `sessionCopyId(folderName)`: um UUID por nome de pasta **por aba** | `recents.ts`, guardado no `sessionStorage` por `safeStorage` (seção 6, pergunta 2) |

- **Quando fica disponível:** antes de `openSession`. `session.storage.copyId` já está lá quando `createReviewState(session)` roda; não há janela em que a sessão exista sem ele.
- **Mutável?** Não. Nada reatribui o `copyId` de uma sessão aberta.
- **"Localizar" (`relocateFolder` → `remember(handle, info, replaceId)`):** a pasta escolhida não estava na lista ⇒ o id devolvido é o `replaceId` ⇒ **o `copyId` não muda** e o retomar continua. A pasta escolhida já tinha a própria entrada (`isSameEntry`) ⇒ as duas entradas viram uma, com o id **da entrada que já era dessa pasta física**, e é esse o `copyId` (o retomar que vale é o daquela pasta; o da entrada fundida fica órfão e sai pelo corte das 12).
- **Abrir pelo seletor uma pasta que já está na lista:** `isSameEntry` acha a entrada ⇒ o mesmo id ⇒ o mesmo `copyId` que pelo recente.
- **Pasta renomeada no disco e reaberta pelo seletor** (não pelo Localizar): o `remember` só compara entradas com o mesmo `folderName`, então nasce entrada nova ⇒ `copyId` novo (o retomar recomeça). É o comportamento atual dos recentes; a linha velha morta é o caso do R7.
- **O5 da rodada 4:** a pasta `loja` recém-descompactada é outra pasta física ⇒ entrada nova ⇒ `copyId` novo ⇒ a entrada `folder:loja|…` de outra rodada não vale para ela. Fecha quando a 8.2 trocar `resumeScope` para `copyId ?? folderName`.
- A 8.2 só lê. A chave do retomar é da 8.2 (nota dela, PR #131): passa a ser `${copyId}|${proposalId}`, sem `kind:` (blob v2). Esta fase não implementa a chave.

## 4. Achados → mudança

| Achado                                   | Mudança                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 corrida fechar × guardar              | Vínculo antes de `start` (seção 1); `OpenProject.folderId`; sem estado de módulo.                                                                                                                                                                                                                                                                                                                                         |
| R2 nome da pasta só no Fechar            | `start` recebe `folderId`; o `onChanged` da sessão (o gancho da 8.1, preservado: continua marcando `unexported`) também chama `touchFolder(folderId, nome atual)` quando `folderId !== null`. O `closeProject` continua tocando (último uso ao fechar). Limite registrado: o `onChanged` não dispara ao gravar um conteúdo já exportado (8.1, S8); nesse caso raro o nome acompanha só no Fechar, como hoje.              |
| R4 reparar e abrir local não conta uso   | `openLocalProject` passa `bind = markLocalOpened(id)`; roda nos dois caminhos.                                                                                                                                                                                                                                                                                                                                            |
| R5 `SecurityError` sem Localizar/Remover | Em `openRecentFolder`, qualquer exceção de `ensurePermission` ⇒ `reportError('folders.permission', e)` + `unavailable('denied')`; as do `hasMappingFile` como hoje (`NotFound` ⇒ `missing`, o resto ⇒ `storage-failed`).                                                                                                                                                                                                  |
| R6 `requestPersistentStorage`            | `void requestPersistentStorage()` em `rememberFolder` depois de o `remember` gravar.                                                                                                                                                                                                                                                                                                                                      |
| R7 nomes repetidos                       | `RecentProject` de pasta ganha `showFolderName: boolean` = `folderName !== name` **ou** outra pasta da lista tem o mesmo `name`. `Home.tsx` troca a condição `project.folderName !== project.name` por `project.showFolderName` (uma linha; nada de foco). Limite: duas pastas com o mesmo nome de projeto **e** o mesmo nome de pasta continuam iguais (o navegador não dá o caminho); a coluna Último uso as distingue. |
| R8 regra da ativação                     | Comentário no teste "numa visita nova…" de `controller.test.ts`: a leitura do handle no IndexedDB precede a consulta e precisa caber na ativação do gesto; sem mudança de código.                                                                                                                                                                                                                                         |
| R9 god-module                            | Split da seção 2.                                                                                                                                                                                                                                                                                                                                                                                                         |
| R10 ordenação morta                      | `LocalLibrary.list()` sem `sort` (doc: "sem ordem; a ordem da tela inicial é a de `recentProjects`"); `tests/storage/local.test.ts:38` alinhado (compara como conjunto). `FolderLibrary.list()` fica como está (a doc promete a ordem e ela é a mesma da lista).                                                                                                                                                          |

**Fora desta fase (registrado):** a fonte única do flag `unexported` persistido (resíduo D1 da 8.1). Fica como está: `local.ts#saveMapping`/`writeProposal` gravam `true` na mesma transação que o conteúdo. A alternativa (o `onChanged` do controller chamar `setUnexported(id, true)`) troca um falso positivo raro e seguro ("IndexedDB falhou → exportou → voltou" mostra o aviso ao reabrir) por um falso negativo possível (o conteúdo grava e o `setUnexported` separado falha: a lista diz "exportado" com mudanças não exportadas). A atomicidade de hoje é a escolha conservadora; fica no "Para fases seguintes" do PR.

## 5. Testes (cada achado com o teste antes da correção)

| Achado   | Teste (arquivo)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1       | `controller.test.ts`: "fechar durante o `remember` não vaza a pasta para o projeto seguinte": segura o `remember` (spy em `FolderLibrary` via `local.openFolderLibrary` com `put` lento, ou `vi.spyOn` no protótipo), chama `closeProject`, solta, abre e fecha um projeto local; a linha da pasta mantém nome e data. Na ordem nova, o próprio `openFolder` só resolve depois do `remember`, então o teste também prova que `openProject` só é publicado com o `remember` feito. |
| R2       | `controller.test.ts`: "renomear o projeto em pasta reflete nos recentes sem Fechar": renomeia, `session.flush()`, lê a lista do `FolderLibrary` (nova instância, como numa visita nova) e vê o nome novo.                                                                                                                                                                                                                                                                         |
| R4       | `controller.test.ts`: "reparar e abrir um projeto local conta como uso": projeto local inconsistente semeado, `openLocalProject` → `repair()`, `openedAt` atualizado.                                                                                                                                                                                                                                                                                                             |
| R5       | `controller.test.ts`: "`SecurityError` no `requestPermission` oferece Localizar/Remover": `PermissionDirectory` com `requestPermission` que lança `DOMException('…', 'SecurityError')` ⇒ `unavailable('denied')` e um erro no Diagnóstico.                                                                                                                                                                                                                                        |
| R6       | `controller.test.ts`: `navigator.storage.persist` espiado, chamado ao guardar a pasta.                                                                                                                                                                                                                                                                                                                                                                                            |
| R7       | `recents.test.ts` (novo): `showFolderName` nos casos nome≠pasta, dois nomes iguais, nome único; `Home.test.tsx`: duas pastas com o mesmo nome mostram o `folderName` nas duas linhas.                                                                                                                                                                                                                                                                                             |
| R10      | `local.test.ts`: o teste de hoje que fixa a ordem por `updatedAt` é reescrito (fixa o comportamento morto; dito no PR).                                                                                                                                                                                                                                                                                                                                                           |
| `copyId` | `controller.test.ts`: os três casos (local = `localId`; pasta = id da entrada, igual antes e depois do Localizar; pasta sem recentes = o mesmo id ao reabrir na mesma aba, diferente entre duas pastas de nomes diferentes) e o reparado (local e pasta).                                                                                                                                                                                                                         |
| Split    | os testes atuais de `controller.test.ts` e `Home.test.tsx` passam sem mudar os imports.                                                                                                                                                                                                                                                                                                                                                                                           |
| R8       | comentário no teste existente.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 6. Regras automáticas

1. **`no-restricted-globals`** para `localStorage`, `sessionStorage`, `indexedDB` em `src/**/*.{ts,tsx}`, com `ignores: ['src/model/**', 'src/utils/safeStorage.ts', 'src/storage/local.ts']`. O bloco do model **não é substituído**: `src/model/**` fica fora deste bloco (lá a regra da arquitetura já proíbe os três e muito mais). Mais **`no-restricted-properties`** para `window.`/`globalThis.` + os três nomes (o `no-restricted-globals` não pega `window.localStorage`). Mensagem: "use `readSetting`/`writeSetting` (`utils/safeStorage.ts`) ou `storage/local.ts`".
2. **Teste `tests/tooling/storageGlobalsLint.test.ts`** (no modelo de `sessionStorageLint.test.ts`): `localStorage.getItem` em `src/app/x.ts` é erro; `window.sessionStorage` em `src/ui/x.tsx` é erro; o mesmo em `src/utils/safeStorage.ts` passa; em `src/model/x.ts`, `localStorage` **e** `document` continuam erro com a mensagem do model (as duas regras valendo). No PR, a prova de que a regra pega o padrão antigo (um `localStorage.getItem` colado em `src/app/`).
3. **`tests/i18n/dictionaries.test.ts`**: `error.<code>` nos dois dicionários para todo `AppErrorCode`. A lista é um `Record<AppErrorCode, true>` no teste: um código novo sem entrada quebra o `typecheck`; um código sem texto quebra o teste.
4. **`max-lines`** (`warn`, `{ max: 600, skipBlankLines: true, skipComments: true }`) em `src/app/**`. `Home.tsx` tem 673 linhas brutas; se passar de 600 sem brancos e comentários, o aviso aparece e fica registrado (dividir o `Home.tsx` é foco/UI, fora desta fase).
5. **Regra da 8.1 apertada**: `loadMapping` proibido também no `controller.ts` (seção 2). O bloco do controller no fim do `eslint.config.js` continua juntando `controllerFileSyntaxRules` e `focusSyntaxRules`; os arquivos novos em `src/app/` herdam o bloco `src/{ui,app}/**` (sessão + foco) sem bloco novo de `no-restricted-syntax`.

## 7. Arquivos

`src/app/controller.ts`, `src/app/recents.ts` (novo), `src/app/pageLifecycle.ts` (novo), `src/app/appResult.ts` (novo, pergunta 1), `src/storage/types.ts`, `src/storage/local.ts`, `src/storage/folder.ts` (`createFolderStorage(root, { copyId })`, `hasMappingFile`), `src/app/Home.tsx` (só `showFolderName`), `src/utils/safeStorage.ts` (pergunta 2), `eslint.config.js`, `docs/ARCHITECTURE.md` (recentes, `copyId`, módulos), `tests/app/controller.test.ts`, `tests/app/recents.test.ts` (novo), `tests/storage/local.test.ts`, `tests/storage/folder.test.ts`, `tests/i18n/dictionaries.test.ts`, `tests/components/Home.test.tsx`, `tests/tooling/storageGlobalsLint.test.ts` (novo), `tests/tooling/sessionStorageLint.test.ts`. Nada do schema nem do formato da proposta. Sem texto novo de UI previsto (`src/i18n/*` só se o R5 pedir; não pede: usa o aviso "denied" existente).

## 8. Perguntas ao coordenador

1. **`src/app/appResult.ts`** (fora de "Toca em"): aprovar? Sem ele o controller não fica abaixo de 450 sem ciclo de imports.
2. **Id por sessão da pasta sem recentes**: proposto `sessionStorage` (sobrevive a recarregar a aba; outra aba ou outro dia começam do zero, que é o que evita o O5), acessado por duas funções novas em `src/utils/safeStorage.ts` (`readSessionSetting`/`writeSessionSetting`, try/catch e `channelStorageKey` como as de hoje), com um `Map` em memória como reserva se o `sessionStorage` lançar. `safeStorage.ts` não está em "Toca em", mas é a exceção nomeada da regra desta fase. Alternativa mais estreita: só o `Map` em memória (perde o retomar ao recarregar a aba; não toca `safeStorage.ts`).
3. **Regra da 8.1 apertada** (`loadMapping` proibido no controller, via `hasMappingFile` em `folder.ts`): de acordo? A alternativa é abrir uma exceção nomeada para `recents.ts`.
4. **`unexported` persistido**: confirmar que fica registrado (seção 4) e não entra.
