# Servidor MCP do Mapping

O servidor MCP deixa um agente (Claude Code, Claude Desktop ou outro cliente MCP) **ler projetos Mapping guardados em pasta e propor alterações a eles**, com as mesmas regras da app (invariantes, travas, referências, especializações). O agente **nunca grava o `mapping.json`**: toda alteração chega como uma **proposta** em `proposals/`, que o usuário revisa na app (aceita ou rejeita em qualquer nível, com notas) e aplica. Ele roda localmente, por stdio, no Node (≥ 20), e não faz nenhuma requisição de rede.

Só projetos **em pasta** ficam ao alcance do MCP; projetos guardados no navegador, não. Para usar o servidor, crie ou abra o projeto na app como **pasta**.

## Instalação

1. Baixe `mapping-mcp.js` da [última Release `mcp-v*`](../../../releases) (há também um `mapping-mcp.js.sha256` para conferir: `sha256sum -c mapping-mcp.js.sha256`).
2. Copie o arquivo para `tools/` no repositório do app. Ele é autocontido (dependências, WebAssembly de imagem e documentação embutidos): não precisa de `npm install`.
3. Registre o servidor num `.mcp.json` na raiz do repositório:

   ```json
   {
     "mcpServers": {
       "mapping": {
         "command": "node",
         "args": ["tools/mapping-mcp.js", "--root", "design/mapeamentos"]
       }
     }
   }
   ```

4. Abra o Claude Code (ou outro cliente) no repositório e aprove o servidor `mapping`. As tools aparecem como `mcp__mapping__…`.

> **Repositório com `"type": "module"` no `package.json`:** o arquivo é CommonJS. Coloque ao lado dele, em `tools/`, um `package.json` com `{"type":"commonjs"}`; sem isso o `node` o lê como módulo ES e falha.

Teste fora do cliente: `node tools/mapping-mcp.js --version` e `--help`.

## Raízes

`--root <pasta>` define onde o servidor pode ler e gravar; repita para mais de uma. Caminhos relativos valem a partir do diretório de trabalho do cliente (o repositório, quando o `.mcp.json` é do projeto). O servidor procura projetos (pastas com `mapping.json`) em qualquer profundidade dentro das raízes.

Segurança: o servidor só lê e grava dentro das raízes. Recusa `..`, caminhos absolutos fora delas e links simbólicos que saem delas (`outside-roots`); não segue links ao procurar projetos; e grava de forma atômica (arquivo temporário + renomear). O que ele grava: o projeto vazio do `create_project` e a pasta `proposals/` (propostas e as imagens delas). **O `mapping.json`, as cópias de `specs/` e `images/` só a app grava**, ao aplicar uma proposta. Ler nunca grava, nem para migrar um projeto de schema antigo: a migração (com backup em `backups/`) é da app, na primeira gravação; a proposta é calculada sobre o projeto migrado em memória. A única exceção ao "só dentro das raízes" é a conferência de **existência** de arquivos de código, que olha só metadados (`stat`) e fica confinada ao diretório de trabalho do cliente (ver "Referências de código").

## Referências

O Ctrl+C (Cmd+C) na app, com uma marcação, imagem ou anotação selecionada, copia a referência:

```
mapping://<projeto>/<m|i|a|p>/<código> (<caminho legível>)
```

- `<projeto>`: nome da pasta do projeto. Se houver duas pastas com o mesmo nome, o servidor devolve as candidatas e pede o caminho.
- `m` marcação, `i` imagem, `a` anotação, `p` **proposta** (a que `propose_changes` e `list_proposals` devolvem).
- `<código>`: os 8 primeiros caracteres hexadecimais do id (12, 16… se houver colisão).
- `(<caminho legível>)`: só para leitura humana; o servidor o ignora.

Toda tool que recebe um item (`ref`) aceita a referência completa, só `m/3f2a9c1e` com `project` informado à parte, ou o id completo. Cole a referência no chat e o agente a resolve sem precisar do projeto. Nas tools de proposta, `ref` é `mapping://projeto/p/3f2a9c1e`, `p/3f2a9c1e` (com `project`) ou o id da proposta; o código é único entre as propostas do projeto. **Ctrl+Alt+C** copia o recorte da marcação como PNG.

## Tools

Respostas em JSON compacto, sempre com as referências `mapping://` dos itens.

| Tool                                                    | O que faz                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_projects()`                                       | Projetos encontrados nas raízes: nome, caminho, contagens, especializações. Um projeto ilegível aparece com o motivo.                                                                                                                                                                                   |
| `create_project(path, name, …)`                         | Cria a pasta (dentro de uma raiz) com `mapping.json`, `images/` e `.gitignore`. Opcionais: `root`, `firstLayerName`.                                                                                                                                                                                    |
| `get_project(project)`                                  | Resumo: imagens, camadas, especializações, plataformas de código, `platformRepos`, avisos de repositório, contagens e pendências.                                                                                                                                                                       |
| `list_markings(project, filtros)`                       | Linhas compactas com referência e caminho. Filtros: `image`, `layer`, `annotationType`, `incomplete`, `text`; paginação `limit`/`offset`.                                                                                                                                                               |
| `get_marking(ref, { platform? })`                       | Caminho, imagem, `rect` em pixels, trava, filhas, anotações por camada (próprias e herdadas), vínculos, referências, backlinks e, nas tipadas, `codeRefs` e `code`.                                                                                                                                     |
| `get_code_hints(ref, platform)`                         | O que implementar numa plataforma: a árvore da marcação com `symbol`, `params` traduzidos, `notes`, eventos sob a dona e `codeRefs`.                                                                                                                                                                    |
| `find_by_code({ project?, path?, symbol? })`            | Do código para o mapeamento: as marcações cujo `codeRef` aponta para o arquivo (inteiro ou só o final) e/ou símbolo.                                                                                                                                                                                    |
| `get_annotation(ref)`, `get_image(ref)`                 | Detalhe de uma anotação (com os `codeRefs` resolvidos, se tipada) ou de uma imagem.                                                                                                                                                                                                                     |
| `resolve(ref)`                                          | Descobre o que a referência designa (marcação, imagem ou anotação).                                                                                                                                                                                                                                     |
| `get_specialization(project, specId)`                   | O JSON completo de uma especialização aplicada, para o agente aprender os tipos.                                                                                                                                                                                                                        |
| `get_marking_image(ref, opções)`                        | **Vê** a marcação: `mode` `crop` (padrão) ou `context`, `padding`, `outlineChildren` (com legenda cor → filha), `maxSize` (1568), `format`.                                                                                                                                                             |
| `get_image_file(ref, { maxSize, format })`              | A imagem inteira, reduzida se passar de `maxSize`.                                                                                                                                                                                                                                                      |
| `plan_changes(project, operations[])`                   | **Prévia, sem gravar nada** (nem proposta): erros por operação, resumo legível, contagens, pendências novas, referências dos itens a criar e quantas mudanças o usuário teria de revisar.                                                                                                               |
| `propose_changes(project, título, …, operations[])`     | Valida como o `plan_changes`, calcula as mudanças e grava `proposals/<id>/proposal.json` para o usuário revisar. Devolve a referência `mapping://<projeto>/p/<código>`, um resumo por nível e as referências definitivas dos itens criados. Opcionais: `description`, `origin`, `author`, `supersedes`. |
| `list_proposals(project, status?)`                      | As propostas do projeto (abertas e fechadas): título, origem, autor, data, estado, progresso da revisão, conflitos e a relação de substituição. Pastas ilegíveis aparecem em `broken`.                                                                                                                  |
| `get_proposal(ref, { state?, limit?, offset? })`        | A proposta: progresso (`progress.complete` = nada pendente nem aceito sem aplicar), níveis (Projeto e imagens), as mudanças com o estado de cada uma (`pending`, `accepted`, `rejected`, `applied`), conflitos, aviso de item trancado e as notas.                                                      |
| `get_proposal_review(ref)`                              | Só o que importa para a próxima rodada: as mudanças rejeitadas (com as notas), as notas gerais, os conflitos e se a revisão terminou (`ready`).                                                                                                                                                         |
| `withdraw_proposal(ref)`                                | O agente retira uma proposta **aberta** (`withdrawn`). O que já foi aplicado continua no projeto.                                                                                                                                                                                                       |
| `find_by_source({ project?, system, id })`              | Imagens e marcações cuja origem (`source`) é `system` + `id`; também lista (`proposed`) as propostas abertas que ainda vão criar um elemento com essa origem.                                                                                                                                           |
| `find_types_by_source({ project, system, id?, name? })` | Os tipos de anotação das especializações aplicadas que declaram o elemento de origem (`sources`), pelo `id` (mais forte) ou `name`, com as propriedades de origem dos campos.                                                                                                                           |
| `validate_specialization({ path? \| text? })`           | Valida uma especialização (arquivo dentro das raízes ou texto JSON) **sem aplicar a projeto algum**: os mesmos erros da importação da app, com o caminho exato, e avisos.                                                                                                                               |

As operações de `plan_changes` e `propose_changes` (camadas, especializações, imagens, marcações, anotações e repositórios por plataforma, com apelidos `$nome` entre elas) estão em [`AGENT-GUIDE.md`](AGENT-GUIDE.md), que o servidor também publica como recurso `mapping-docs://AGENT-GUIDE.md`, junto com `FORMAT.md` e `SPEC-FORMAT.md`.

### Referências de código (etapa 3b)

As especializações podem declarar **plataformas** e dizer como cada tipo de anotação vira código nelas (`code`); as instâncias guardam **onde foram implementadas** (campo `codeRef`), e o projeto guarda o repositório de cada plataforma (`platformRepos`: `urlTemplate` e `localPath`). Detalhes do formato em [`FORMAT.md`](FORMAT.md) e [`SPEC-FORMAT.md`](SPEC-FORMAT.md). O fluxo do agente está em [`AGENT-GUIDE.md`](AGENT-GUIDE.md): referência `mapping://` → `get_marking` e `get_marking_image` → `get_code_hints` → implementar → registrar o `codeRef` com `propose_changes`.

Cada entrada de `codeRef` volta resolvida (em `get_marking`, `get_annotation`, `get_code_hints` e `find_by_code`):

```json
{
  "field": "implementacao",
  "id": "c1",
  "platform": "android",
  "path": "app/src/main/java/com/app/cadastro/CadastroScreen.kt",
  "symbol": "CadastroScreen",
  "line": null,
  "url": "https://github.com/org/app-android/blob/main/app/src/main/java/com/app/cadastro/CadastroScreen.kt",
  "localFile": "app/src/main/java/com/app/cadastro/CadastroScreen.kt",
  "exists": true
}
```

- `url`: do `urlTemplate` da plataforma (`null` sem ele).
- `localFile`: o `localPath` da plataforma (relativo à pasta do projeto) mais o `path`, **relativo ao diretório de trabalho do cliente** (o do processo do servidor; no Claude Code, o repositório). `exists` diz se o arquivo está lá. Sem `localPath`, os dois são `null`.
- **O servidor nunca lê nem grava arquivos de código**: só monta o caminho e confere a existência (`stat`), o que é coberto por teste. O agente lê o arquivo com as próprias ferramentas.
- **Limite de segurança**: o `localPath` pode subir pastas (`../../..`) e o `path` vem de um arquivo que outras pessoas podem editar. Por isso a conferência só olha **dentro do diretório de trabalho do cliente**, também depois de seguir links simbólicos. Se o caminho calculado sai dele, a resposta traz `localFile: null`, `exists: null` e `localFileProblem: "outside-workdir"` (sem tocar no disco); um link simbólico que leva para fora vale `exists: false`. Para o `localFile` aparecer, abra o cliente na raiz do repositório do app (o que o `.mcp.json` do projeto já faz).
- `get_project` traz `platforms` (as declaradas pelas especializações aplicadas), `platformRepos` e `warnings` (`missing-repo`: plataforma usada em algum `codeRef` sem `urlTemplate` nem `localPath`). `plan_changes` e `propose_changes` repetem os `warnings` do projeto resultante.

### Propostas (etapa 4)

Toda alteração feita pelo agente chega como uma **proposta**, uma espécie de pull request dentro da ferramenta. O formato do arquivo e as regras da revisão estão em [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md); o fluxo do agente, em [`AGENT-GUIDE.md`](AGENT-GUIDE.md).

```
meu-projeto/
├── mapping.json                 # só a app grava
├── images/
└── proposals/
    └── 8c1f2d9e-…/              # id da proposta (referência: mapping://<projeto>/p/8c1f2d9e)
        ├── proposal.json
        └── images/              # imagens novas ou trocadas, até serem aceitas
            └── checkout.webp
```

- **`propose_changes`** aplica as operações a uma cópia do projeto (o mesmo código do `plan_changes`, só com as operações puras do `src/model/`), compara o antes e o depois entidade por entidade, campo por campo (`buildProposal`) e grava a proposta: uma mudança por criação, por remoção e por campo alterado, com o valor antes (`from`) e depois (`to`) e os **ids definitivos** dos itens criados. Um lote inválido não grava nada; um lote que não altera nada é recusado (`no-changes`: a reexportação coincide com o projeto).
- **Imagens** novas ou trocadas esperam em `proposals/<id>/images/` (já otimizadas, como na app) e só vão para `images/` quando o usuário aceita e aplica. O nome do arquivo não colide com `images/` nem com o de outras propostas ainda abertas. O conteúdo `base64` das operações não é copiado para o `proposal.json` (que guarda as operações só para referência).
- **O `mapping.json` nunca é alterado pelo agente** (nem a migração de um schema antigo, nem `specs/`): a revisão, a aplicação das aceitas e a gravação do projeto são da app, que usa as mesmas funções puras do modelo (`applyAccepted`). Há teste de integração por stdio que confere o hash do arquivo depois de cada tool.
- **Revisão do usuário**: decisões (aceita, rejeitada, sem decisão) em quatro níveis (proposta, imagem, item, mudança) e notas, gravadas pela app no próprio `proposal.json`. O arquivo tem `revision` própria, com a mesma conferência do `mapping.json`: quando o servidor atualiza uma proposta (substituída ou retirada), relê o arquivo imediatamente antes de gravar, tenta de novo se a app gravou no meio e grava `revision + 1`; se o arquivo não para de mudar, recusa com `revision-conflict`.
- **Substituir** (`supersedes`): a proposta anterior passa a `superseded` e mantém as decisões e notas. Se a revisão dela ainda tinha mudanças **sem decisão ou aceitas sem aplicar**, a resposta traz o aviso `superseded-incomplete`, com as contagens e o que a proposta nova repete (`same`), altera (`different`) ou deixa de fora (`missing`). Uma anterior já `applied` continua `applied`.
- **Conflitos e trava**: o `get_proposal` recalcula cada mudança contra o projeto **atual**: se o valor atual não bate com o `from`, a mudança vem com `conflict` (e o valor atual); mudanças de geometria ou remoção num item trancado vêm com `locked`. Aceitar sobrescreve o valor atual; rejeitar o mantém.
- **Na app**, a proposta aparece na janela **Propostas** (Ctrl+Shift+7; no celular, menu Painéis) e abre no modo revisão: o canvas mostra o projeto como ficaria, o projeto fica somente leitura e as decisões e notas são gravadas na própria proposta. "Aplicar aceitas" é o único caminho para as mudanças entrarem no `mapping.json`. Para testar a revisão sem um agente, abra `examples/proposta-exemplo.zip` na app.

### Concorrência com a app

O `mapping.json` tem `revision`, mas o agente não o grava. A proposta guarda a `revision` sobre a qual foi calculada (`baseRevision`); o `propose_changes` confere que o `mapping.json` não mudou enquanto calculava e, se mudou, recusa com `revision-conflict` (envie de novo). Se o projeto mudar **depois** da proposta, nada é perdido: as mudanças afetadas aparecem como **conflito** na revisão, com o valor atual, o antes e o depois, sem perder as decisões já tomadas. A app aberta na mesma pasta percebe a proposta nova (a pasta é conferida junto com o `mapping.json`); se houver alterações locais ainda não gravadas, pergunta o que fazer ("Projeto alterado fora da app") quando o arquivo do projeto mudar.

## Solução de problemas

| Sintoma                                                               | Causa e solução                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O cliente não lista as tools                                          | Confira o caminho de `args` (relativo ao diretório de trabalho do cliente), a versão do Node (`node --version` ≥ 20) e se aprovou o servidor. Rode `node tools/mapping-mcp.js --help`.                                                            |
| `SyntaxError: Cannot use import statement` / `require is not defined` | O repositório declara `"type": "module"`: ponha `{"type":"commonjs"}` num `package.json` em `tools/` (veja Instalação).                                                                                                                           |
| `informe ao menos uma raiz com --root`                                | Faltou `--root` nos `args` do `.mcp.json`.                                                                                                                                                                                                        |
| `list_projects` vem vazio; `missingRoots` lista a raiz                | A pasta da raiz não existe a partir do diretório de trabalho do cliente. Crie-a ou corrija o `--root`.                                                                                                                                            |
| `project-not-found` / `ambiguous-project`                             | Projeto não está numa raiz, ou o nome se repete: use o `path` devolvido por `list_projects`.                                                                                                                                                      |
| `outside-roots`                                                       | O caminho sai das raízes (`..`, absoluto ou link simbólico). Ponha o arquivo dentro de uma raiz.                                                                                                                                                  |
| `invalid-project`                                                     | O `mapping.json` não passa na validação (o motivo vem na resposta; dados inconsistentes trazem a lista em `reason.issues`). Reabra na app (que repara o que é mecânico) ou corrija o arquivo.                                                     |
| `spec-unavailable`                                                    | Falta a cópia da especialização em `specs/`. Reaplique a especialização na app ou com `apply_specialization`.                                                                                                                                     |
| `revision-conflict`                                                   | `propose_changes`: o `mapping.json` mudou enquanto a proposta era calculada (envie de novo). Ao substituir ou retirar: o `proposal.json` não parava de mudar (a app está gravando decisões); tente de novo.                                       |
| `no-changes`                                                          | `propose_changes`: as operações não alteram nada no projeto (reexportação idêntica). Não há o que propor.                                                                                                                                         |
| `proposal-not-found` / `ambiguous-ref`                                | A proposta não existe no projeto, ou o código curto casa com mais de uma: use `list_proposals` e a referência completa.                                                                                                                           |
| `not-open`                                                            | `withdraw_proposal`: só uma proposta aberta pode ser retirada (a resposta traz o estado).                                                                                                                                                         |
| `invalid-arguments`                                                   | `validate_specialization` precisa de exatamente um de `path` ou `text`.                                                                                                                                                                           |
| `locked`                                                              | Item trancado: destranque (`locked: false`) no mesmo lote ou antes.                                                                                                                                                                               |
| `unknown-platform`                                                    | A plataforma não é declarada pelas especializações aplicadas; a resposta lista as `platforms` válidas (veja `get_project`).                                                                                                                       |
| `missing-query`                                                       | `find_by_code` sem `path` nem `symbol`.                                                                                                                                                                                                           |
| `exists: null` e `localFileProblem: "outside-workdir"`                | O `localPath` leva para fora do diretório de trabalho do cliente: abra o cliente na raiz do repositório do app.                                                                                                                                   |
| `image-too-large`                                                     | Imagem de mais de 64 MB ou 100 megapixels.                                                                                                                                                                                                        |
| A proposta não aparece na app                                         | Só projetos abertos de **pasta** são observados. Volte o foco à janela, espere ~3 s ou use "Verificar a pasta agora" na janela Propostas (Ctrl+Shift+7). Confira também com `list_proposals` que a proposta foi gravada na pasta que a app abriu. |

## Publicar uma versão (mantenedores)

1. Atualize `SERVER_VERSION` em `mcp/version.ts` (hoje `0.3.0`) e mescle na `main`.
2. Crie a tag `mcp-v0.3.0` na `main`: `git tag mcp-v0.3.0 && git push origin mcp-v0.3.0`.
3. O workflow `.github/workflows/mcp-release.yml` confere que a tag bate com `SERVER_VERSION`, roda lint, typecheck e testes, gera `dist-mcp/mapping-mcp.js`, o testa fora do repositório e o anexa à Release com o checksum.
