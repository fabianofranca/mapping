# Nota de desenho — fase 8.5: servidor MCP 0.3.3

> Fase 8.5 da etapa 8 (`PLAN.md`). Achados M1 a M10 e M12 a M14 da seção 5 de `docs/history/revisao-tecnica-2026-10-12.md` (M11, cache e paginação, fica fora: decisão 9). Esta nota vem antes de qualquer código; o código segue o que estiver aprovado aqui.

## 1. O que entra na 0.3.3

| Achado | O que muda                                                                                                                                              | Saída do MCP muda?                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| M1     | `root` aceita o caminho como no `--root` (relativo ao diretório de trabalho, com ou sem `./` e barra final), o absoluto, o `realpath` e o nome da pasta | sim: o que antes dava `unknown-root` passa a funcionar                |
| M2     | `create_project` não cria `images/`                                                                                                                     | sim: pasta sem `images/`, como a da app                               |
| M3     | só testes por stdio das três promessas de concorrência                                                                                                  | não                                                                   |
| M4     | `link` sem suporte cai para gravação `wx`; `EEXIST` vira `image-exists`                                                                                 | sim: `propose_changes` deixa de dar `internal-error` em exFAT e afins |
| M5     | imagens aceitas e não aplicadas da proposta substituída continuam reservadas                                                                            | sim: a nova recebe `tela-2.webp`, não `tela.webp`                     |
| M6, M7 | só documentação (limites conhecidos em `docs/ARCHITECTURE.md`)                                                                                          | não                                                                   |
| M8     | guardas estáticas recursivas e nominais                                                                                                                 | não                                                                   |
| M9     | `ToolErrorCode` como união literal e tabela completa nos docs                                                                                           | não (os códigos não mudam de nome)                                    |
| M10    | duplicações movidas para `src/model/`; `projectIndex`/`Map` no lugar de `find`/`some` em laço                                                           | não                                                                   |
| M12    | `root` + `path` absoluto fora dessa raiz dá `invalid-arguments`                                                                                         | sim: antes o `root` era ignorado em silêncio                          |
| M13    | teste versão × `docs/MCP.md`; `SERVER_VERSION = '0.3.3'`                                                                                                | só o `--version`                                                      |
| M14    | `isWithin` recebe a API de caminho (padrão `node:path`) para o teste com `path.win32`                                                                   | não                                                                   |

Nada do schema v8 nem do formato da proposta v1 muda.

## 2. Como o subsistema fica

### 2.1 Raízes e caminhos (`mcp/paths.ts`: M1, M12, M14)

`Roots` continua o único ponto que transforma o que o agente digitou em caminho de disco. Muda só `resolveRoot` e `newTarget`.

**`resolveRoot(hint)`**, na ordem; a primeira regra que casa decide:

1. **Por caminho**: `resolve(this.workDir, hint)` (o mesmo `resolve` que o `main.ts` aplica ao `--root`, então `design/mapeamentos`, `./design/mapeamentos`, `design/mapeamentos/` e o absoluto dão o mesmo caminho) é igual a uma raiz; ou o `realpath` desse caminho é igual ao `realpath` de uma raiz (link simbólico para a raiz, ou a raiz listada por outro caminho). Devolve essa raiz.
2. **Por nome**: `basename(root) === hint` em **exatamente uma** raiz. Devolve essa raiz.
3. Nome que casa com mais de uma raiz: `unknown-root`, com `roots` e a mensagem "o nome casa com mais de uma raiz: use o caminho" (hoje devolve a primeira em silêncio; pergunta Q1).
4. Nada casou: `unknown-root` com `roots` (como hoje).

**`newTarget(path, root?)`** (só o `create_project` usa):

| `path`   | `root`                 | Resultado                                                                                                                                                                                                                               |
| -------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| relativo | ausente, uma raiz      | `join(raiz, path)` (como hoje)                                                                                                                                                                                                          |
| relativo | ausente, várias raízes | `root-required` (como hoje)                                                                                                                                                                                                             |
| relativo | presente               | `join(resolveRoot(root), path)`                                                                                                                                                                                                         |
| absoluto | ausente                | o próprio caminho, se dentro de alguma raiz; senão `outside-roots` (como hoje)                                                                                                                                                          |
| absoluto | presente               | `outside-roots` se fora de todas as raízes (a segurança fala primeiro); `unknown-root` se o `root` não resolve; **`invalid-arguments`** se está dentro de outra raiz que não a indicada (léxico ou `realpath`); senão o próprio caminho |

Depois disso `resolveNew` continua igual: sobe até o ancestral existente e confere o `realpath` (link simbólico que sai das raízes dá `outside-roots`).

A descrição do campo `root` em `tools.ts` passa a dizer: "Raiz em que criar, quando há mais de uma e `path` é relativo: um dos `roots` de `list_projects`, o caminho como está no `--root` (relativo ao diretório de trabalho do cliente) ou o nome da pasta da raiz."

**M14**: `isWithin(parent, child, api = path)`, com `api: Pick<PlatformPath, 'relative' | 'sep' | 'isAbsolute'>`. O servidor nunca passa o terceiro argumento; o teste passa `path.win32`. `hasParentSegment` já trata `\` e não muda.

### 2.2 `create_project` (`mcp/createProject.ts`: M2, M10b)

Sequência nova: `mkdir(dir, { recursive: true })` → `assertInside(realpath(dir))` → `.gitignore` → `mapping.json` (atômico). Some `IMAGES_DIR` do módulo e a pasta `images/`: a app cria `images/` sob demanda ao gravar a primeira imagem, inclusive ao aplicar uma proposta (`src/storage/folder.ts`, `resolveDir(..., true)`); o `propose_changes` grava em `proposals/<id>/images/`; e `takenImageFiles` (`changes.ts`) e `get_image_file` já tratam a pasta ausente. O texto do `.gitignore` vem da função pura nova do modelo (2.7); o módulo só lê e grava.

### 2.3 Imagens novas da proposta (`mcp/proposalStore.ts`: M4)

`writeNewFile(path, data)` vira uma pequena máquina de dois caminhos, sempre sem sobrescrever:

```
temporário wx ──link──▶ pronto (rm do temporário)
       │ link falha com EPERM | ENOTSUP | ENOSYS | EXDEV
       ▼
rm do temporário ──writeFile(path, data, { flag: 'wx' })──▶ pronto
qualquer caminho: EEXIST no destino ──▶ ToolError('image-exists') (para imagem) / erro original (proposal.json)
```

O caminho `wx` perde só a atomicidade (uma queda no meio deixa o arquivo pela metade), não a garantia de não sobrescrever; e como a pasta `proposals/<id>/` é nova e removida inteira em qualquer erro (`writeNewProposal`), um arquivo pela metade só sobra se o processo morrer, caso em que a pasta fica sem `proposal.json` ou com um ilegível e aparece em `broken` (como já acontece hoje com uma queda). `docs/MCP.md` deixa de dizer "grava de forma atômica" sem ressalva.

### 2.4 Reservas de nomes em `images/` (`mcp/proposalStore.ts` e `mcp/proposals.ts`: M5, M10a)

`reservedImages(p, status = p.status)` passa a usar `changeImageFile` do modelo (some a cópia local da regra "criação ou troca de arquivo") e decide pelo que ainda pode ser aplicado:

| Estado (efetivo)       | Mudança de imagem reserva o nome se…                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`                 | não aplicada e não rejeitada (pendente ou aceita), como hoje                                                                                                                  |
| `superseded`           | não aplicada e **aceita** (as pendentes de uma substituída não podem mais ser aplicadas: `PROPOSAL-FORMAT.md`, "Estados"; e decidir só vale para `open`, `proposalReview.ts`) |
| `applied`, `withdrawn` | nunca (como hoje)                                                                                                                                                             |

No `propose` com `supersedes`, a anterior entra com `status = 'superseded'` (o estado que ela vai ter depois desta chamada), em vez de ser pulada. Hoje uma `superseded` antiga reserva também as pendentes; com a tabela, deixa de reservá-las (pergunta Q2: a alternativa conservadora é aplicar a regra `superseded` só à anterior).

### 2.5 Concorrência (`mcp/proposals.ts`: M3, M6, M7)

A ordem do `propose` não muda: listar → `prepareBatch` (lê o `mapping.json` e guarda o `baseHash`) → `buildProposal` → reler o `mapping.json` e comparar o hash (`revision-conflict`) → `writeNewProposal` → marcar a anterior (`supersede`). Duas mudanças pequenas:

- **`supersede` nunca derruba a resposta.** Hoje só `ToolError` vira o aviso `supersede-failed`; um erro de disco (`EACCES`, `ENOSPC`) vira `internal-error` **depois** de a nova proposta estar gravada, e o agente reenviaria, duplicando-a. Passa a: qualquer erro ao marcar a anterior vira `supersede-failed` (o inesperado também escreve a pilha no stderr, como `failure`). Pergunta Q3.
- **M6 e M7 ficam documentados**, sem mudança de código, numa subseção "Limites conhecidos" da seção `mcp/` de `docs/ARCHITECTURE.md`: (M6) a janela entre a releitura e o `rename` do `proposal.json` em que uma decisão gravada pela app no mesmo instante se perde, só ao mudar o `status`; (M7) gravar a nova antes de marcar a anterior: uma queda entre as duas deixa as duas `open`, com o `supersedes` da nova apontando (o `list_proposals` já mostra `supersededBy`; derivar "substituída" do `supersedes` na app fica como evolução, fora desta fase).

### 2.6 Códigos de erro (`mcp/errors.ts`: M9)

```ts
export const MCP_ERROR_CODES = ['already-exists', 'ambiguous-project', …, 'wrong-kind'] as const;
export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];
export type ToolErrorCode = McpErrorCode | ModelErrorCode;   // ModelErrorCode de src/model
export class ToolError { constructor(readonly code: ToolErrorCode, …) }
```

- `MCP_ERROR_CODES` é o registro: todo código literal de `new ToolError('…'` em `mcp/**` (hoje 47, mais `image-exists`). O `tsc` recusa um literal fora da união; o `modelToolError` continua passando o `ModelErrorCode` (coberto pelo `Record` exaustivo de `MODEL_ERROR_MESSAGES`).
- Os nomes **não mudam**, nem os que colidem com o modelo (`invalid-name`, `not-found`, `invalid-path`, `invalid-value`, `spec-already-applied`): renomear quebraria agentes que já tratam o código. A tabela explica os dois contextos onde houver.
- A tabela **completa** fica em `docs/AGENT-GUIDE.md`, seção "Erros" (o agente a lê como recurso `mapping-docs://`), com os avisos (`superseded-incomplete`, `supersede-failed`, os de repositório) e `internal-error` à parte. O "Solução de problemas" do `docs/MCP.md` continua a tabela para pessoas, com uma linha apontando a lista completa.

### 2.7 Duplicações com o modelo e o armazenamento (M10)

| Item                             | Antes                                                                                              | Depois                                                                                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) imagem de uma mudança        | `reservedImages` reimplementa a regra                                                              | `changeImageFile` (`src/model/proposalView.ts`, já exportado pelo índice do modelo)                                                                                                                                                                            |
| (b) `.gitignore`                 | predicado e montagem do texto copiados em `createProject.ts` e `src/storage/folder.ts`             | `src/model/backups.ts`: `GITIGNORE_FILE` e `gitignoreWithBackups(text): string \| null` (texto novo, ou `null` se já cobre `backups/`); os dois lados só leem e gravam. `ensureGitignore` de `folder.ts` mantém a assinatura (o `controller.ts` não muda)      |
| (c) `MAPPING_FILE`, `IMAGES_DIR` | `src/storage/types.ts`, `mcp/projects.ts`, `mcp/changes.ts`, `mcp/createProject.ts`                | definidos em `src/model/images.ts` (o `uniqueImageFile` passa a usar `IMAGES_DIR` no lugar do literal `images/`); `src/storage/types.ts` os reexporta como já faz com `BACKUPS_DIR` (nenhum importador do `storage/` muda); o `mcp/` importa de `../src/model` |
| (d) laços                        | `createdRefs` (`changes.ts`) com `some`/`find` por item; `ProposalRefs.ref` com `find` por chamada | `projectIndex(project)` em `createdRefs`; `Map` id → título montado no construtor de `ProposalRefs`                                                                                                                                                            |

### 2.8 Versão (M13)

`SERVER_VERSION = '0.3.3'` em `mcp/version.ts`, o único lugar com a versão no código. `docs/MCP.md` ("Publicar uma versão") fala `0.3.3` e `mcp-v0.3.3`. A tag e a Release ficam com o dono, depois do merge.

## 3. O que sobra e o que some

- **Somem**: `IMAGES_DIR`, `BACKUPS_DIR` e `GITIGNORE_FILE` locais de `createProject.ts`; `MAPPING_FILE` de `mcp/projects.ts` e `IMAGES_DIR` de `mcp/changes.ts` (passam a vir do modelo); `ignoresBackups` de `folder.ts`; o laço de filtro de `reservedImages`; o `code: string` livre do `ToolError`; o `if (stored.id === previous?.id) continue` do `propose`.
- **Sobram, iguais**: `writeFileAtomic`, `updateStored` (3 tentativas, `revision-conflict`), `resolveExisting`, `resolveProjectFile`, a ordem de gravação da proposta, a conferência do hash do `mapping.json`, o workflow de release.
- **Novos**: `gitignoreWithBackups`/`GITIGNORE_FILE` no modelo; `MCP_ERROR_CODES`/`ToolErrorCode`; o terceiro argumento de `isWithin`; o código `image-exists`.

## 4. Contrato com as fases vizinhas

- **8.2 (onda 2), `src/model/proposalView.ts`**: a 8.5 **não edita** esse arquivo. `changeImageFile` já é exportado (`export *` em `src/model/index.ts`); a 8.5 só o importa em `mcp/proposalStore.ts`. Contrato: a assinatura `changeImageFile(c: Change): string | null` e o significado (criação de imagem ou troca do `file`) ficam como estão; a 8.2 acrescenta `levelType`/`proposalListStatus` livremente. Se a 8.2 precisar mudar a assinatura, `tests/mcp/proposals.test.ts` (M5) acusa.
- **8.6 (onda 1), `docs/TESTING.md`**: a 8.5 **não o edita**. O teste de versão (M13) confere só `docs/MCP.md` (e `docs/AGENT-GUIDE.md`, que hoje não cita versão). O `docs/TESTING.md` fica fora da lista de propósito: hoje fixa `0.3.2` e a 8.6 o troca por "a versão em `mcp/version.ts`"; se o teste o lesse, a 8.5 ficaria vermelha até a 8.6 mergear (ou obrigaria a editar o arquivo da 8.6). Até a 8.6 mergear, o guia na `main` vai dizer `0.3.2` com o servidor em `0.3.3`; quem fechar a onda (8.7) pode acrescentar ao teste "o `docs/TESTING.md` não fixa `mcp-v<x.y.z>`" (pergunta Q4).
- **8.1 e 8.4, `src/storage/`**: a 8.5 toca `src/storage/types.ts` só nas duas primeiras linhas (as constantes viram reexportação, sem mudar nenhum importador) e `src/storage/folder.ts` só em `ensureGitignore` (passa a usar a função do modelo, mesma assinatura e mesmo resultado; `tests/storage/folder.test.ts` continua verde sem mudança). A 8.4 acrescenta `copyId` à interface em `types.ts` na onda 2, sem conflito de linhas.
- **8.1 e 8.3, `docs/ARCHITECTURE.md`**: a 8.5 só escreve na seção `### mcp/` (a subseção nova "Limites conhecidos" e a frase da gravação atômica).
- **`eslint.config.js`**: um bloco novo para `mcp/**` (ver 6.1), sem tocar nos blocos de `src/`. **`src/i18n/*`**: nada (as mensagens do MCP não são UI).

## 5. Testes

Cada achado ganha o teste que o reproduz **num commit antes** do da correção. Os de M3 são cobertura de garantias que já valem: nascem verdes, e a nota diz isso de antemão.

**Infra de teste** (commit próprio, antes dos testes): `connect(roots, { cwd, preload, env })` em `tests/mcp/workspace.ts`, e `tests/mcp/fsHooks.cjs`, carregado com `node --require` só nos testes. Ele troca funções de `node:fs/promises` no processo do servidor, guiado por uma variável de ambiente com JSON: "depois de ler o arquivo X, grave Y em Z", "a cada leitura de X, acrescente um espaço", "`link` falha com `EPERM`/`EEXIST`". Funciona porque o bundle CJS chama `import_promises.readFile(...)` pelo objeto do módulo (conferido num protótipo). Assim os testes de concorrência sobem o **bundle real por stdio** e são determinísticos, sem `sleep` nem arquivo grande. Nada disso entra no `mapping-mcp.js`.

| Achado     | Teste                                                                                                                                                                                                                                                                                                                                                                                                   | Arquivo                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| M1         | `create_project` com `root` relativo (`apps/x`), `./apps/x`, `apps/x/` e absoluto, servidor subido com `cwd` e `--root` relativo; nome ambíguo dá `unknown-root`                                                                                                                                                                                                                                        | `tests/mcp/read.test.ts` ("várias raízes")                               |
| M2         | `create_project` sem `images/` (`existsSync(join(dir, 'images')) === false`); o teste atual "cria o projeto com mapping.json, images/ e .gitignore" é **reescrito** (título e asserção), porque fixa o comportamento antigo no nome                                                                                                                                                                     | `tests/mcp/read.test.ts`                                                 |
| M3         | (a) `propose_changes` com imagem por `file`: o gancho grava um `mapping.json` novo depois de o servidor ler a imagem → `revision-conflict` e nenhuma pasta em `proposals/`; (b) `mapping.json` com `schemaVersion: 99` → `read-only` em `plan_changes` e `propose_changes`; (c) `supersedes` cuja anterior muda a cada leitura → `proposed: true`, aviso `supersede-failed`, a anterior continua `open` | `tests/mcp/proposals.test.ts`                                            |
| M3 (Q3)    | erro de disco ao marcar a anterior (gancho: `rename` do `proposal.json` anterior falha com `EIO`) → `supersede-failed`, não `internal-error`                                                                                                                                                                                                                                                            | `tests/mcp/proposals.test.ts`                                            |
| M4         | `link` com `EPERM` → a proposta grava e a imagem está em `proposals/<id>/images/`, sem `.tmp` sobrando; `link` com `EEXIST` → `image-exists` e a pasta da proposta removida                                                                                                                                                                                                                             | `tests/mcp/proposals.test.ts`                                            |
| M5         | A aceita (decisão escrita no `proposal.json`, como a app faz) com `images/tela.webp`; B substitui A e traz outra `tela.webp` → B recebe `images/tela-2.webp`. Com a mudança de A pendente, B recebe `tela.webp` (liberada)                                                                                                                                                                              | `tests/mcp/proposals.test.ts`                                            |
| M5 unidade | `reservedImages` por estado (tabela 2.4)                                                                                                                                                                                                                                                                                                                                                                | `tests/mcp/proposalStore.test.ts`                                        |
| M12        | `root` + `path` absoluto dentro de outra raiz → `invalid-arguments`; dentro da indicada → cria; fora de todas → `outside-roots`                                                                                                                                                                                                                                                                         | `tests/mcp/read.test.ts`                                                 |
| M14        | `it.each` com `path.win32`: `isWithin('C:\\a', 'c:\\A\\b')`, `('C:\\a', 'C:\\ab')`, `('C:\\a', 'D:\\a')`, UNC; `hasParentSegment('a\\..\\b')`, `('..\\x')`, `('a\\b..')`                                                                                                                                                                                                                                | `tests/mcp/paths.test.ts` (novo)                                         |
| M8         | as guardas estáticas varrem `mcp/**/*.ts` (ver 6.1)                                                                                                                                                                                                                                                                                                                                                     | `tests/mcp/staticGuards.test.ts` (novo) e `tests/mcp/noCodeRead.test.ts` |
| M9         | registro × docs e registro × código (ver 6.2)                                                                                                                                                                                                                                                                                                                                                           | `tests/mcp/errorCodes.test.ts` (novo)                                    |
| M10        | `gitignoreWithBackups` (vazio, sem `\n` final, já coberto com `/backups`, `backups`, `backups/`, `\r\n`) e as constantes                                                                                                                                                                                                                                                                                | `tests/model/backups.test.ts`, `tests/model/images.test.ts`              |
| M13        | versão × docs (ver 6.3)                                                                                                                                                                                                                                                                                                                                                                                 | `tests/mcp/version.test.ts` (novo)                                       |

`tests/storage/folder.test.ts` (`ensureGitignore`) continua como está e prova que o lado da app não mudou.

## 6. Regras automáticas

### 6.1 Guarda de escrita recursiva e nominal (M8)

`tests/mcp/staticGuards.test.ts` lê `mcp/**/*.ts` com `readdirSync(dir, { recursive: true })` (sem comentários) e afirma:

1. **Quem chama o quê**, por nome: o mapa exato `{ 'paths.ts': [rename, rm, writeFile], 'createProject.ts': [mkdir], 'proposalStore.ts': [link, mkdir, rm, writeFile] }` para as funções que alteram o disco (`writeFile`, `appendFile`, `rename`, `link`, `symlink`, `mkdir`, `mkdtemp`, `rm`, `rmdir`, `unlink`, `copyFile`, `cp`, `truncate`, `open`, `createWriteStream`, com ou sem `Sync`); qualquer outro arquivo ou outra função falha.
2. `writeFileAtomic(` só em `createProject.ts` e `proposalStore.ts`, e com `MAPPING_FILE` no argumento só em `createProject.ts`.
3. `MAPPING_FILE` ou `'mapping.json'` só em `projects.ts`, `changes.ts` (leitura) e `createProject.ts`.

O teste antigo (`proposals.test.ts`, "só o create_project e as propostas gravam…") sai de lá para este arquivo; o de `noCodeRead.test.ts` ("só os módulos conhecidos importam node:fs") passa a ser recursivo. Complemento no `eslint.config.js`: `no-restricted-imports` com `importNames` das mesmas funções de `node:fs`/`node:fs/promises` em `mcp/**`, exceto os três escritores, para o editor acusar na hora (o teste continua a regra: pega também `fs.promises.x` e importação de namespace).

**Prova no PR**: um `mcp/image/tmpWriter.ts` com `writeFile(` faz o teste novo falhar e o antigo (não recursivo) passar; a saída vai na descrição, e o arquivo não é commitado.

### 6.2 Registro de códigos (M9)

`tests/mcp/errorCodes.test.ts`: (a) cada código de `MCP_ERROR_CODES` aparece entre crases em `docs/AGENT-GUIDE.md` ou `docs/MCP.md`; (b) todo literal de `new ToolError(\s*'…'` em `mcp/**` está em `MCP_ERROR_CODES` (pega `as` e casts que o `tsc` deixaria passar); (c) todo código do registro é usado em algum `new ToolError(` (sem entrada morta). **Prova**: hoje (a) falha com os 24 códigos sem documentação (lista conferida contra o código); o commit do teste vem antes do da tabela.

### 6.3 Versão × docs (M13)

`tests/mcp/version.test.ts`: `docs/MCP.md` contém `mcp-v${SERVER_VERSION}`, e toda versão `x.y.z` da seção "Publicar uma versão" e todo `mcp-v<x.y.z>` do arquivo são `SERVER_VERSION`; o mesmo para `docs/AGENT-GUIDE.md`, se citar versão. **Prova**: subir `SERVER_VERSION` sem tocar no `docs/MCP.md` faz o teste falhar (saída na descrição).

## 7. Mudanças que o agente percebe (vão para "Decisões tomadas")

1. `root` relativo/`./`/barra final/`realpath` passa a funcionar (M1); nome de raiz repetido passa a ser erro (Q1).
2. `create_project` não cria `images/` (M2).
3. `propose_changes` funciona em sistema sem hard link; `image-exists` é código novo (M4).
4. Nome de imagem aceita da substituída continua reservado (M5); pendentes de `superseded` deixam de reservar (Q2).
5. `root` + absoluto em outra raiz é `invalid-arguments` (M12).
6. Falha de disco ao marcar a anterior vira aviso `supersede-failed` (Q3).
7. `--version` imprime `0.3.3`.

O passo correspondente do `docs/TESTING.md` (R5.x do `create_project`, se citar `images/`) é da 8.6; a 8.5 lista na descrição do PR o que o guia precisa refletir.

## 8. Perguntas ao coordenador

- **Q1** — Nome de raiz que casa com mais de uma raiz: hoje devolve a primeira em silêncio. **Proposto**: `unknown-root` com a lista e "use o caminho". Alternativa conservadora: manter a primeira.
- **Q2** — Reserva das `superseded` que não são a anterior: **proposto** aplicar a mesma tabela (só as aceitas reservam), pela coerência e porque as pendentes não podem mais ser aplicadas. Alternativa conservadora: só a anterior muda; as demais `superseded` continuam reservando pendentes e aceitas.
- **Q3** — Erro inesperado ao marcar a anterior: **proposto** virar `supersede-failed` (a nova já está gravada; `internal-error` levaria o agente a reenviar e duplicar). Fica um pouco fora da letra de M3/M7; se preferir, sai da fase.
- **Q4** — Teste de versão e `docs/TESTING.md`: **proposto** a 8.5 não o ler (contrato com a 8.6 acima), e a 8.7 acrescentar "o guia não fixa `mcp-v<x.y.z>`" depois da 8.6. Confirma?
- **Q5** — Complemento ESLint da 6.1 (`no-restricted-imports` dos escritores em `mcp/**`): **proposto** incluir. Mexe no bloco de `mcp/**` do `eslint.config.js` (compartilhado na onda).
