# Histórico — Etapa 3b, referências de código (seção do antigo PLAN.md)

> Fases 3b.1 a 3b.5 concluídas. Referência atual: [`../SPEC-FORMAT.md`](../SPEC-FORMAT.md), [`../FORMAT.md`](../FORMAT.md), [`../MCP.md`](../MCP.md) e [`../AGENT-GUIDE.md`](../AGENT-GUIDE.md).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo (exceto os checkboxes da 3b.5, marcados ao fechar a etapa). As seções 1 a 13 estão em [`PLAN-etapas-1-2.md`](PLAN-etapas-1-2.md); as etapas seguintes, nos outros arquivos desta pasta.

---

## Fases pendentes — Etapa 3b: referências de código

### Objetivo

Ligar o mapeamento ao código. Uma especialização declara as **plataformas** e como cada tipo vira código em cada uma (ex: o Button vira `DSButton` no Android). As instâncias guardam **onde foram implementadas** (ex: a tela Checkout está em `CheckoutScreen.kt`). Assim, um agente implementa telas usando os componentes certos do design system em código e registra onde implementou; um dev encontra o código a partir do mapeamento, e o mapeamento a partir do código.

### Princípio

O núcleo continua genérico. Plataformas, linguagens e componentes de código entram **só pelas especializações**. Nenhum nome de plataforma ("Android", "Compose", "SDUI") aparece no código do núcleo, nem em `src/` nem em `mcp/`.

### Especialização `formatVersion` 2

A importação aceita `formatVersion` 1 e 2. Uma especialização v1 é tratada como v2 sem plataformas e sem `code`. As cópias em `specs/` mantêm a versão de formato com que foram aplicadas.

```json
{
  "format": "mapping-spec",
  "formatVersion": 2,
  "id": "sdui",
  "name": "SDUI",
  "version": 2,
  "platforms": [
    { "id": "android", "name": "Android", "language": "kotlin" },
    { "id": "ios", "name": "iOS", "language": "swift" },
    { "id": "bff", "name": "Contrato SDUI", "language": "json" }
  ],
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": ["onClick", "onHold"],
          "fields": [
            { "key": "id", "type": "string", "required": true },
            { "key": "texto", "type": "string", "required": true },
            { "key": "estilo", "type": "enum", "options": ["primary", "secondary", "text"], "default": "primary" }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.DSButton",
              "params": { "texto": "text", "estilo": "style" },
              "values": { "estilo": { "primary": "ButtonStyle.Primary", "secondary": "ButtonStyle.Secondary", "text": "ButtonStyle.Text" } },
              "notes": "Use o modifier de testTag com o valor do campo id."
            },
            "ios": { "symbol": "DSButton", "params": { "texto": "title", "estilo": "style" } },
            "bff": { "symbol": "button", "params": { "id": "id", "texto": "label", "estilo": "variant" } }
          }
        }
      ]
    },
    {
      "id": "telas",
      "name": "Telas",
      "color": "#00897B",
      "annotationTypes": [
        {
          "id": "screen",
          "name": "Screen",
          "labelField": "nome",
          "fields": [
            { "key": "nome", "type": "string", "required": true },
            { "key": "rota", "type": "string" },
            { "key": "implementacao", "label": "implementação", "type": "codeRef" }
          ]
        }
      ]
    }
  ]
}
```

- **`platforms`** (opcional, na raiz): `id` no formato `[a-z0-9-]+`, único na especialização; `name` exibido; `language` informativo (ajuda o agente).
- **`code`** (opcional, em cada tipo de anotação), por id de plataforma declarada:
  - `symbol` (obrigatório): componente ou tipo que implementa o tipo naquela plataforma;
  - `params` (opcional): chave do campo do tipo → nome do parâmetro no código. Campos fora de `params` não são passados;
  - `values` (opcional): chave do campo → tradução valor no mapping → valor no código (só para `enum`). Valor sem tradução é passado como está;
  - `notes` (opcional): orientação livre para o agente.
- **Tipo de campo `codeRef`**: onde a instância foi implementada. Opcional `platforms: [...]` no campo, restringindo a um subconjunto das plataformas declaradas (padrão: todas). Não é permitido em colunas de `table` nem como `default`.
- **Validação nova**: `code` e `codeRef` só em especializações com `platforms`; ids de `code` e de `platforms` do campo precisam estar em `platforms`; chaves de `params` e `values` precisam ser campos do tipo; `values` só para campos `enum`, com chaves que existam em `options`.

### Projeto: schema v7

**Valor de um campo `codeRef`** (dentro de `values` da anotação tipada): lista de entradas, cada uma com id estável (como as linhas de tabela).

```json
"implementacao": [
  { "_id": "c1", "platform": "android", "path": "app/src/main/java/com/app/checkout/CheckoutScreen.kt", "symbol": "CheckoutScreen", "line": null },
  { "_id": "c2", "platform": "android", "path": "app/src/main/java/com/app/checkout/CheckoutViewModel.kt", "symbol": "CheckoutViewModel", "line": null },
  { "_id": "c3", "platform": "ios", "path": "App/Checkout/CheckoutView.swift", "symbol": "CheckoutView", "line": 12 }
]
```

- `path` relativo à raiz do repositório da plataforma, com `/`. Pode haver mais de uma entrada por plataforma.
- `symbol` e `line` opcionais (`null` quando vazios).

**Repositórios por plataforma** (nível do projeto, não da especialização, porque a mesma especialização serve a produtos diferentes):

```json
"platformRepos": {
  "android": { "urlTemplate": "https://github.com/org/app-android/blob/main/{path}#L{line}", "localPath": "../../.." },
  "ios": { "urlTemplate": "https://github.com/org/app-ios/blob/main/{path}#L{line}", "localPath": null }
}
```

- **`urlTemplate`** genérico, com `{path}` e `{line}` (GitHub, GitLab, Bitbucket, servidor interno). Se a entrada não tiver `line`, o trecho a partir do último `#` que contém `{line}` é removido.
- **`localPath`** (opcional): caminho da raiz do repositório da plataforma, relativo à pasta do projeto. Usado pelo MCP para devolver caminhos locais ao agente (os mapeamentos ficam dentro do repositório do app).
- Plataformas com o **mesmo id** em especializações diferentes são a mesma plataforma e usam a mesma configuração.
- **Migração v6 → v7**: `platformRepos: {}` (com o backup que já existe). Nada mais muda nos dados.

**Pendências novas**
- Entrada de `codeRef` com plataforma não declarada (ou fora do `platforms` do campo): conta como **incompleta**.
- Entrada sem `path`: conta como **incompleta**.
- Plataforma usada em algum `codeRef` sem repositório configurado: **aviso** (não incompleta), mostrado na configuração de repositórios e no `get_project` do MCP.

**Funções puras no `src/model/`** (sem APIs de navegador, testadas, reutilizadas pela app e pelo MCP)
- `codeLink(project, entry)`: URL a partir do `urlTemplate`, ou `null`.
- `codeBlueprint(project, markingId, platformId)`: árvore espelhando a hierarquia da marcação e das descendentes; em cada marcação, as anotações tipadas com `code` para a plataforma (tipo, `symbol`, parâmetros com os valores já traduzidos, `notes`), as anotações vinculadas (ex: eventos) sob a dona, os valores de `ref` resolvidos pelo rótulo do alvo (ex: `User.name`) e os `codeRef` existentes. Tipos sem `code` naquela plataforma entram com `symbol: null`, para o agente saber que falta mapeamento.
- `findByCode(project, { path?, symbol? })`: entradas de `codeRef` que casam. `path` casa por igualdade ou por sufixo de segmentos inteiros (ex: `CheckoutScreen.kt` casa com `app/.../CheckoutScreen.kt`); `symbol` por igualdade.
- Pendências novas em `getAnnotationIssues` e o aviso de repositório ausente.

### App

- **Editor do campo `codeRef`**: lista de entradas com plataforma (seleção entre as permitidas), caminho, símbolo e linha; adicionar, remover e reordenar, como as linhas de tabela.
- **Exibição**:
  - Detalhes e Lista: uma linha por entrada, ex: "Android · CheckoutScreen.kt", com o caminho completo no tooltip e as ações "Abrir no repositório" (quando houver `urlTemplate`) e "Copiar caminho";
  - zoom semântico: só o resumo, ex: "implementação: Android, iOS".
- **Abrir no repositório**: link comum (`target="_blank"`, `rel="noopener"`), sem nenhuma requisição de rede feita pela app; compatível com a CSP e com `file://`.
- **Repositórios por plataforma**: no diálogo de configurações do projeto, uma linha por plataforma declarada pelas especializações aplicadas, com `urlTemplate`, `localPath` e o aviso de plataforma usada sem repositório.
- **Diálogo de especializações**: mostra as plataformas de cada especialização.
- **Ajuda**: seção sobre plataformas, `code` e `codeRef`; Atalhos, se houver atalho novo.
- Interface só com componentes do design system 2.0 (artifact citado no `docs/redesign/HANDOFF.md`). Se faltar um componente, a fase descreve a necessidade no PR em vez de inventar visual.

### MCP

- **`get_marking`**: inclui os `codeRef` resolvidos (`platform`, `path`, `symbol`, `line`, `url`, `localFile`) e, por anotação tipada, o `code` das plataformas. Parâmetro opcional `platform` para filtrar.
  - `localFile`: caminho relativo ao diretório de trabalho do cliente, calculado com o `localPath`, e `exists` (se o arquivo existe).
  - O servidor **nunca lê nem grava arquivos de código**: só monta o caminho e confere a existência.
- **`get_code_hints(ref, platform)`**: devolve o `codeBlueprint`.
- **`find_by_code({ project?, path?, symbol? })`**: marcações que apontam para um arquivo ou símbolo, com as referências `mapping://`. Sem `project`, procura em todos os projetos das raízes.
- **`get_project`**: inclui as plataformas, os `platformRepos` e os avisos de repositório ausente.
- **`plan_changes`**: operações novas `set_platform_repo` e `remove_platform_repo`. Valores de `codeRef` entram pelas operações de anotação existentes (`create_annotation`, `update_annotation`).
- **`docs/AGENT-GUIDE.md`**: fluxo "receber a referência `mapping://` → `get_marking` e `get_marking_image` → `get_code_hints` → implementar → registrar o `codeRef` com `plan_changes`/`apply_changes`".

### Exemplos

- `examples/specs/sdui.json` vai para `formatVersion` 2: plataformas `android`, `ios` e `bff`; `code` em todos os tipos existentes (componentes e eventos); camada **Telas** com o tipo **Screen** (`nome`, `rota`, `implementacao`), como no exemplo acima.
- `examples/specs/modelo-de-dados.json` **continua em `formatVersion` 1**, para os testes cobrirem as duas versões juntas no mesmo projeto.

### Decisões a confirmar

1. Chave `platformRepos` no nível do `mapping.json` e `_id` em cada entrada de `codeRef`.
2. `platforms` opcional no campo `codeRef`, restringindo o subconjunto de plataformas.
3. `values` só traduz `enum`; `table` e `ref` vão ao blueprint com o valor do mapping (o `ref` pelo rótulo do alvo).
4. Plataforma com o mesmo id em duas especializações com `name` ou `language` diferentes: vale a da primeira aplicada, sem erro.
5. `findByCode` casando caminho por sufixo de segmentos inteiros.
6. Remoção do trecho `#…{line}` do `urlTemplate` quando a entrada não tem linha.
7. O MCP confere a existência do arquivo local mas nunca lê código.
8. Plataforma sem repositório configurado é aviso, não incompleta.

### Roteiro de teste manual da 3b

Use o projeto do roteiro 13.9 ([`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md)) numa pasta dentro de um repositório git.

1. Atualize a SDUI aplicada para o `examples/specs/sdui.json` v2 (Especializações → Atualizar versão). Confira a camada **Telas** nova, as plataformas no diálogo e que o Modelo de dados (v1) continua funcionando.
2. Nas configurações do projeto, configure `android` com um `urlTemplate` do GitHub e `localPath` para a raiz do repositório; deixe `ios` vazio.
3. Na marcação **Formulário**, crie um **Screen** `Cadastro`, com `rota: /cadastro` e duas entradas Android em `implementacao` (`CadastroScreen.kt` e `CadastroViewModel.kt`, uma com linha) e uma iOS (`CadastroView.swift`). Confira o aviso "iOS sem repositório" e a exibição nos Detalhes, na Lista e no zoom semântico.
4. "Abrir no repositório" abre a URL certa, com e sem linha; "Copiar caminho" copia o caminho.
5. Uma entrada com plataforma `web` (editando o JSON por fora) aparece como incompleta.
6. Pelo Claude Code, com o MCP:
   - `get_code_hints` do Formulário em `android` traz os Inputs e o Button com `symbol` e parâmetros traduzidos, o onClick sob o Button e os `dado` resolvidos (`User.name` etc.);
   - `get_marking` do Formulário traz os `codeRef` com `url`, `localFile` e `exists`;
   - `find_by_code` com `CadastroScreen.kt` (só o nome do arquivo) encontra o Screen `Cadastro`;
   - um lote `plan_changes` que adiciona uma entrada ao `codeRef` e configura o `ios` é aplicado, e a app aberta recarrega mostrando a mudança.
7. Exporte o zip e confira `platformRepos`, os `_id` das entradas e `schemaVersion: 7`.

### Fases

#### 3b.1 — Formato da especialização v2 (modelo)
- [x] Tipos e schema zod do `formatVersion` 2 (`platforms`, `code`, campo `codeRef`), aceitando o 1, com mensagens de erro por caminho
- [x] `docs/spec.schema.json` e teste de consistência com o zod
- [x] `examples/specs/sdui.json` v2 (o `modelo-de-dados.json` fica v1) + testes de validação
- [x] `docs/SPEC-FORMAT.md` e a Ajuda (resumo) atualizados; teste de consistência da Ajuda continua verde

**Aceite**: os dois exemplos validam; arquivos com cada erro novo da validação são rejeitados com o caminho correto; especializações v1 continuam abrindo.

#### 3b.2 — Schema v7, pendências e funções puras (modelo)
- [x] Schema v7 (`platformRepos`, valor de `codeRef` com `_id`) + migração v6 → v7
- [x] Operações do modelo: configurar e remover repositório; criar, alterar, remover e reordenar entradas de `codeRef`
- [x] `codeLink`, `codeBlueprint`, `findByCode` + testes
- [x] Pendências e aviso novos
- [x] `docs/FORMAT.md` (v7, com "Como um agente lê" os `codeRef`)

**Aceite**: testes da migração, das três funções (inclusive blueprint com hierarquia, eventos vinculados, `ref` resolvido e tipo sem `code`), das pendências e do round-trip pelo zip com um projeto usando SDUI v2 e Modelo de dados v1.

#### 3b.3 — App
- [x] Editor do `codeRef` e exibição nos Detalhes, na Lista e no zoom semântico
- [x] "Abrir no repositório" e "Copiar caminho"
- [x] Repositórios por plataforma nas configurações do projeto, com o aviso
- [x] Plataformas no diálogo de especializações; Ajuda; textos pt-BR/en-US
- [x] e2e cobrindo os passos 1 a 5 do roteiro

**Aceite**: passos 1 a 5 do roteiro no desktop e no celular, nos dois temas.

#### 3b.4 — MCP
- [x] `get_marking` e `get_project` com os dados novos
- [x] `get_code_hints` e `find_by_code`
- [x] `set_platform_repo` e `remove_platform_repo` no lote
- [x] Testes de integração por stdio sobre o projeto de teste
- [x] `docs/MCP.md` e `docs/AGENT-GUIDE.md`

**Aceite**: passo 6 do roteiro coberto por testes de integração; o servidor não abre nenhum arquivo de código (teste garantindo que só há verificação de existência).

#### 3b.5 — Documentação final e release
- [x] `README.md`, `docs/ARCHITECTURE.md` e `docs/ROADMAP.md` atualizados (3b concluída)
- [x] Roteiro completo executado e registrado no PR
- [x] Instrução da release no PR: o dono cria a tag `mcp-v<versão>` (ex: `git tag mcp-v0.2.0 && git push origin mcp-v0.2.0`) e o workflow anexa o `mapping-mcp.js` à Release

**Aceite**: roteiro da 3b completo; o `mapping-mcp.js` da Release funciona copiado para `tools/` de um repositório de teste.

> **Ordem e paralelismo**: 3b.1, depois 3b.2. Depois, em paralelo, 3b.3 (app) e 3b.4 (MCP). Por último, 3b.5.
