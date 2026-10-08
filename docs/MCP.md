# Servidor MCP do Mapping

O servidor MCP deixa um agente (Claude Code, Claude Desktop ou outro cliente MCP) **ler e alterar projetos Mapping guardados em pasta**, com as mesmas regras da app (invariantes, travas, referências, especializações). Ele roda localmente, por stdio, no Node (≥ 20), e não faz nenhuma requisição de rede.

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

Segurança: o servidor só lê e grava dentro das raízes. Recusa `..`, caminhos absolutos fora delas e links simbólicos que saem delas (`outside-roots`); não segue links ao procurar projetos; e grava de forma atômica (arquivo temporário + renomear). Ler nunca grava, nem para migrar um projeto de schema antigo: a migração só é gravada (com backup em `backups/`) no `apply_changes`. A única exceção ao "só dentro das raízes" é a conferência de **existência** de arquivos de código, que olha só metadados (`stat`) e fica confinada ao diretório de trabalho do cliente (ver "Referências de código").

## Referências

O Ctrl+C (Cmd+C) na app, com uma marcação, imagem ou anotação selecionada, copia a referência:

```
mapping://<projeto>/<m|i|a>/<código> (<caminho legível>)
```

- `<projeto>`: nome da pasta do projeto. Se houver duas pastas com o mesmo nome, o servidor devolve as candidatas e pede o caminho.
- `m` marcação, `i` imagem, `a` anotação.
- `<código>`: os 8 primeiros caracteres hexadecimais do id (12, 16… se houver colisão).
- `(<caminho legível>)`: só para leitura humana; o servidor o ignora.

Toda tool que recebe um item (`ref`) aceita a referência completa, só `m/3f2a9c1e` com `project` informado à parte, ou o id completo. Cole a referência no chat e o agente a resolve sem precisar do projeto. **Ctrl+Alt+C** copia o recorte da marcação como PNG.

## Tools

Respostas em JSON compacto, sempre com as referências `mapping://` dos itens.

| Tool                                         | O que faz                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_projects()`                            | Projetos encontrados nas raízes: nome, caminho, contagens, especializações. Um projeto ilegível aparece com o motivo.                                               |
| `create_project(path, name, …)`              | Cria a pasta (dentro de uma raiz) com `mapping.json`, `images/` e `.gitignore`. Opcionais: `root`, `firstLayerName`.                                                |
| `get_project(project)`                       | Resumo: imagens, camadas, especializações, plataformas de código, `platformRepos`, avisos de repositório, contagens e pendências.                                   |
| `list_markings(project, filtros)`            | Linhas compactas com referência e caminho. Filtros: `image`, `layer`, `annotationType`, `incomplete`, `text`; paginação `limit`/`offset`.                           |
| `get_marking(ref, { platform? })`            | Caminho, imagem, `rect` em pixels, trava, filhas, anotações por camada (próprias e herdadas), vínculos, referências, backlinks e, nas tipadas, `codeRefs` e `code`. |
| `get_code_hints(ref, platform)`              | O que implementar numa plataforma: a árvore da marcação com `symbol`, `params` traduzidos, `notes`, eventos sob a dona e `codeRefs`.                                |
| `find_by_code({ project?, path?, symbol? })` | Do código para o mapeamento: as marcações cujo `codeRef` aponta para o arquivo (inteiro ou só o final) e/ou símbolo.                                                |
| `get_annotation(ref)`, `get_image(ref)`      | Detalhe de uma anotação (com os `codeRefs` resolvidos, se tipada) ou de uma imagem.                                                                                 |
| `resolve(ref)`                               | Descobre o que a referência designa (marcação, imagem ou anotação).                                                                                                 |
| `get_specialization(project, specId)`        | O JSON completo de uma especialização aplicada, para o agente aprender os tipos.                                                                                    |
| `get_marking_image(ref, opções)`             | **Vê** a marcação: `mode` `crop` (padrão) ou `context`, `padding`, `outlineChildren` (com legenda cor → filha), `maxSize` (1568), `format`.                         |
| `get_image_file(ref, { maxSize, format })`   | A imagem inteira, reduzida se passar de `maxSize`.                                                                                                                  |
| `plan_changes(project, operations[])`        | Valida o lote **sem gravar**: erros por operação, resumo legível, contagens, pendências novas e `planId` (vale 10 min).                                             |
| `apply_changes(planId)`                      | Grava o plano de uma vez, com `revision + 1`, e devolve as referências dos itens criados.                                                                           |

As operações de `plan_changes` (camadas, especializações, imagens, marcações, anotações e repositórios por plataforma, com apelidos `$nome` entre elas) estão em [`AGENT-GUIDE.md`](AGENT-GUIDE.md), que o servidor também publica como recurso `mapping-docs://AGENT-GUIDE.md`, junto com `FORMAT.md` e `SPEC-FORMAT.md`.

### Referências de código (etapa 3b)

As especializações podem declarar **plataformas** e dizer como cada tipo de anotação vira código nelas (`code`); as instâncias guardam **onde foram implementadas** (campo `codeRef`), e o projeto guarda o repositório de cada plataforma (`platformRepos`: `urlTemplate` e `localPath`). Detalhes do formato em [`FORMAT.md`](FORMAT.md) e [`SPEC-FORMAT.md`](SPEC-FORMAT.md). O fluxo do agente está em [`AGENT-GUIDE.md`](AGENT-GUIDE.md): referência `mapping://` → `get_marking` e `get_marking_image` → `get_code_hints` → implementar → registrar o `codeRef` com `plan_changes`/`apply_changes`.

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
- `get_project` traz `platforms` (as declaradas pelas especializações aplicadas), `platformRepos` e `warnings` (`missing-repo`: plataforma usada em algum `codeRef` sem `urlTemplate` nem `localPath`). `plan_changes` repete os `warnings` do projeto resultante.

### Concorrência com a app

O `mapping.json` tem `revision`. O `apply_changes` confere o arquivo antes e depois de gravar as imagens; se mudou desde o plano, recusa com `revision-conflict` (releia e gere outro plano). A app aberta na mesma pasta percebe a mudança em poucos segundos e recarrega sozinha; se houver alterações locais ainda não gravadas, pergunta o que fazer ("Projeto alterado fora da app").

## Solução de problemas

| Sintoma                                                               | Causa e solução                                                                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O cliente não lista as tools                                          | Confira o caminho de `args` (relativo ao diretório de trabalho do cliente), a versão do Node (`node --version` ≥ 20) e se aprovou o servidor. Rode `node tools/mapping-mcp.js --help`. |
| `SyntaxError: Cannot use import statement` / `require is not defined` | O repositório declara `"type": "module"`: ponha `{"type":"commonjs"}` num `package.json` em `tools/` (veja Instalação).                                                                |
| `informe ao menos uma raiz com --root`                                | Faltou `--root` nos `args` do `.mcp.json`.                                                                                                                                             |
| `list_projects` vem vazio; `missingRoots` lista a raiz                | A pasta da raiz não existe a partir do diretório de trabalho do cliente. Crie-a ou corrija o `--root`.                                                                                 |
| `project-not-found` / `ambiguous-project`                             | Projeto não está numa raiz, ou o nome se repete: use o `path` devolvido por `list_projects`.                                                                                           |
| `outside-roots`                                                       | O caminho sai das raízes (`..`, absoluto ou link simbólico). Ponha o arquivo dentro de uma raiz.                                                                                       |
| `invalid-project`                                                     | O `mapping.json` não passa na validação (o motivo vem na resposta). Reabra o projeto na app ou corrija o arquivo.                                                                      |
| `spec-unavailable`                                                    | Falta a cópia da especialização em `specs/`. Reaplique a especialização na app ou com `apply_specialization`.                                                                          |
| `revision-conflict`                                                   | Alguém gravou o projeto desde o plano. Chame `plan_changes` de novo.                                                                                                                   |
| `plan-not-found`                                                      | O plano já foi aplicado ou passou de 10 minutos.                                                                                                                                       |
| `locked`                                                              | Item trancado: destranque (`locked: false`) no mesmo lote ou antes.                                                                                                                    |
| `unknown-platform`                                                    | A plataforma não é declarada pelas especializações aplicadas; a resposta lista as `platforms` válidas (veja `get_project`).                                                            |
| `missing-query`                                                       | `find_by_code` sem `path` nem `symbol`.                                                                                                                                                |
| `exists: null` e `localFileProblem: "outside-workdir"`                | O `localPath` leva para fora do diretório de trabalho do cliente: abra o cliente na raiz do repositório do app.                                                                        |
| `image-too-large`                                                     | Imagem de mais de 64 MB ou 100 megapixels.                                                                                                                                             |
| A app não recarrega depois do `apply_changes`                         | Só projetos abertos de **pasta** são observados. Volte o foco à janela ou espere ~3 s.                                                                                                 |

## Publicar uma versão (mantenedores)

1. Atualize `SERVER_VERSION` em `mcp/version.ts` (ex: `0.2.0`) e mescle na `main`.
2. Crie a tag `mcp-v0.2.0` na `main`: `git tag mcp-v0.2.0 && git push origin mcp-v0.2.0`.
3. O workflow `.github/workflows/mcp-release.yml` confere que a tag bate com `SERVER_VERSION`, roda lint, typecheck e testes, gera `dist-mcp/mapping-mcp.js`, o testa fora do repositório e o anexa à Release com o checksum.
