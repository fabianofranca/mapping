# Relato de teste — Mapping

> Rodada dirigida do Cowork sobre as fases C1 a C3 do épico `epic/instanciacao` (build `dee8666 · 2026-10-20`, MCP 0.6.0-rc.1). Arquivo histórico: o relato como o testador o entregou, sem alterações. A leitura do achado 1 pelo coordenador está no fechamento da etapa ([`PLAN-etapa-instanciacao.md`](PLAN-etapa-instanciacao.md)); em resumo: o executor foi o cliente stdio, que não mostrava as instruções do servidor ao agente, e as respostas de `get_specialization` e `get_project` não levavam o conceito; e o `urlTemplate` citado nas respostas é o `repo.urlTemplate` da especialização (continua no formato; o que saiu foi o do projeto).

## Falha no topo

**R3.6a reprovou, duas vezes.** A pergunta de conceito do épico não foi respondida do jeito esperado: nenhuma das respostas diz que o `code` é o código com que se **cria uma instância** do Button, nem que o `path` serve para **ler a assinatura**. Ambas descrevem o `code` como "como o componente é implementado" e o `path` como "onde achar a implementação", e a 2ª ainda cita `urlTemplate`, conceito que saiu do formato na C1. Atenção: o executor foi um agente limpo com o cliente stdio, **não o Claude Code** (`claude -p` indisponível na VM). O resultado vale como indício; a conferência fiel precisa de uma sessão limpa do Claude Code (**[pessoa]**).

- Modo: dirigido — fases C1 a C3 do épico `epic/instanciacao` (lista da seção 10 do TESTING-COWORK)
- Build id: dee8666 · 2026-10-20
- Canal (como a app mostra): prévia
- Forma de abrir: preview (https://fabianofranca.github.io/mapping/preview/)
- Navegador e versão: Chrome 155.0.0.0 (extensão Claude in Chrome)
- Sistema operacional: Windows NT 10.0
- DPR e viewport: DPR 1,25; 1514 × 698 (janela restaurada; 1527 × 634 antes do R0.4b)
- Pasta de trabalho: ~/mapping-testes/2026-10-20-instanciacao (C:\Users\fabia\mapping-testes\2026-10-20-instanciacao)
- Ferramenta: agente com extensão do navegador e shell; dialog-pilot; pedidos ao MCP: stdio (`mcp-stdio-client.mjs`), não o Claude Code
- Estado prévio do navegador: a janela Mapping já estava aberta; a lista de recentes tinha projetos de rodadas anteriores (principal, telas, importacao, principal-reparo, Loja…). Os projetos desta rodada foram criados novos, em pastas novas
- MCP: 0.6.0-rc.1 (`node tools/mapping-mcp.js --version`), origem Release (rc.1), sha256 conferido: sim
- Data: 2026-10-20 (hora local 2026-10-19 noite)
- Tempo por roteiro: não medido por roteiro (rodada contínua, com interrupção para o preview ser republicado no R3.5)

## Resumo

- Passos: 55 (9 preparatórios + 2 da seção 6 + R0 ×6 + R1 ×24 + R3 ×11, contando R3.6a + R5 ×3, mais 2 da passada visual, que o painel conta à parte) — 54 ✅, 1 ❌ (R3.6a), 0 não executados.
- Achados: bloqueia 0, alta 1, média 0, baixa 0.
- Impede o uso com pessoas? Não pela app (nenhuma falha de tela ou de disco). A pergunta de conceito (R3.6a) precisa ser refeita no Claude Code e, se reprovar lá também, o texto do `code`/`path` nas descrições do MCP precisa ser revisto antes de os agentes usarem a etapa.

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| P1 |  | ✅ | Primeiros 10 minutos |
| P2 |  | ✅ | Primeiros 10 minutos |
| P3 |  | ✅ | Primeiros 10 minutos |
| P4 |  | ✅ | Primeiros 10 minutos |
| P5 |  | ✅ | Primeiros 10 minutos |
| P6 |  | ✅ | Primeiros 10 minutos |
| P7 |  | ✅ | Primeiros 10 minutos |
| P8 |  | ✅ | Primeiros 10 minutos |
| P9 |  | ✅ | Primeiros 10 minutos (a faixa Atualizar trouxe o build; antes 8145368 · 2026-10-19) |
| S6.1 |  | ✅ | MCP 0.6.0-rc.1 baixado, sha256 conferido, `--version` imprime 0.6.0-rc.1 |
| S6.2 |  | ✅ | workspace montado (assets/, design/mapeamentos/, tools/, .mcp.json); login.png criado depois, para o R5 |
| R3.6a | C2 | ❌ | achado 1 (reprovou nas duas execuções) |
| R0.1 |  | ✅ | Sobre sem barra horizontal; Esc devolve o foco ao botão Configurações |
| R0.2 |  | ✅ | `select_folder`; mapping.json schema 11, `.gitignore` com `backups/` |
| R0.3 |  | ✅ | imagem ficou `images/cadastro.png`; revision 2 |
| R0.4a |  | ✅ | reabriu sem seletor e sem pedido de permissão |
| R0.4b |  | ✅ | resize 800×700: aviso de janela pequena; marcação preservada |
| R0.7 |  | ✅ | Localizar pasta com `select_folder`; Remover da lista |
| R1.1 a R1.24 |  | ✅ | 24/24; ver observações (R1.12, R1.20) |
| R3.1 | C1 | ✅ | SDUI v3 com Android/iOS/BFF; Modelo de dados v1; camada Telas |
| R3.2 | C1 | ✅ | repos da SDUI em leitura; só caminho local; Esc apaga o x, 2º Esc fecha; disco `platformRepos.android` só com `localPath` |
| R3.3 | C1 | ✅ | Screen só com `nome` e `rota`; sem Definição |
| R3.4 | C1 | ✅ | 3 hrefs conferidos por DOM; Copiar caminho `app/src/main/java/com/app/ds/DSButton.kt` |
| R3.5 | C1 | ✅ | refeito na build dee8666 (1ª tentativa invalidada, ver Observações); Android vazio ao apagar a entrada; link Definição intacto; voltou `../../..` |
| R3.6 | C2, C3 | ✅ | stdio: `get_code_hints`, `find_by_code`, `set_platform_repo` numa proposta (`mapping://principal/p/d0096142`); revision 56 → 57 só ao Aplicar aceitas; disco `platformRepos.ios.localPath` = `../../../app-ios`, sem `urlTemplate` (executor: cliente stdio, não o Claude Code) |
| R3.7 | C1 | ✅ | zip: schemaVersion 11, `platformRepos` {android:`../../..`, ios:`../../../app-ios`} sem `urlTemplate` |
| R3.8 | C1 | ✅ | ver passos abaixo: faixa v8 só após a 1ª escrita, backup v8 idêntico, Screen só `nome`/`rota`; faixa não volta |
| R3.8b | C1 | ✅ | Diagnóstico `open.migration` com os 2 endereços; Android `../app`, iOS vazio; backup v10 mantém `urlTemplate` |
| R3.9 | C1 | ✅ | aviso `Campos ignorados: screen.implementacao.`; Screen só com `nome` e `rota` (conferido na interface; projeto no navegador, sem disco) |
| R5.2 | C3 | ✅ | `create_project` + `propose_changes` (stdio); disco revision 0, sem images/; 25 mudanças Criada |
| R5.2b | C3 | ✅ | caminho `Cadastro › Formulário › Nome` |
| R5.3 | C3 | ✅ | 20 aceitas, 3 rejeitadas, 2 sem decisão; aplicar: 2 webp + sdui.json; Ctrl+Z limpa images/, Ctrl+Shift+Z devolve |

## Achados

### 1. R3.6a: a resposta do agente não diz que o `code` cria uma instância nem que o `path` serve para ler a assinatura

- Severidade: alta
- Build id e data: dee8666 · 2026-10-20 (MCP 0.6.0-rc.1)
- Passos para reproduzir: (1) workspace com `assets/sdui.json` (formatVersion 5) e o servidor mapping 0.6.0-rc.1; (2) sessão limpa de agente (aqui: subagente com o cliente stdio, não o Claude Code); (3) perguntar: "O que é o `code` do tipo Button desta especialização, para que serve o `path` e onde está esse arquivo?"
- Esperado: o `code` é o código com que se cria uma instância do Button na plataforma (o `symbol` é o que se chama); o `path` é o arquivo que define esse símbolo, para ler a assinatura; o arquivo está no repositório `repo.url` da especialização ou no clone local (`localPath`).
- Observado: nas duas execuções (1ª sem projeto; 2ª com `principal` e `localPath` do Android) a resposta fala em "como o componente é escrito/implementado" e em "achar a implementação"; não menciona criar instância nem ler a assinatura; a 1ª e a 2ª citam `urlTemplate`; a 2ª não cita `localPath`.
- Reproduziu de novo? sim (as duas execuções)
- Anexos: respostas literais abaixo (e em `anexos/`).

#### Resposta literal — execução 1 (workspace sem projeto)

Executor: agente limpo (subagente, modelo Sonnet 5.5) usando o cliente stdio; NÃO foi o Claude Code (`claude -p` "not enabled in this environment" na VM).
Pergunta: O que é o `code` do tipo Button desta especialização, para que serve o `path` e onde está esse arquivo?

Fabiano, na especialização SDUI (assets/sdui.json, versão 3) o tipo Button tem um bloco `code` por plataforma. Esse bloco diz como o componente é escrito em código em cada alvo:

- Android (Kotlin): o `code` é o símbolo `com.app.ds.DSButton`, o componente do design system.
  - O `path` é `app/src/main/java/com/app/ds/DSButton.kt`.
  - Os campos do Button viram parâmetros: texto vira `text`, estilo vira `style` e habilitado vira `enabled`.
  - Os valores também são traduzidos: primary vira `ButtonStyle.Primary`, secondary vira `ButtonStyle.Secondary` e text vira `ButtonStyle.Text`. Já sim/não viram `true`/`false`.
  - A nota diz para usar o modifier de testTag com o valor do campo `id`.
- iOS (Swift): o símbolo é `DSButton` e o `path` é `App/DesignSystem/DSButton.swift`.
  - Os parâmetros são `title`, `style` e `isEnabled`.
  - Os valores de estilo são `.primary`, `.secondary` e `.text`.
- BFF (Kotlin): o símbolo é a função `com.app.bff.sdui.button` e o `path` é `src/main/kotlin/com/app/bff/sdui/Components.kt`.
  - Os parâmetros são `id`, `label`, `variant` e `enabled`.
  - A nota diz que a função devolve o nó do componente no JSON da tela.

O `code` é o "o quê" (classe, componente ou função, mais o mapeamento de parâmetros e valores). O `path` é o "onde": o caminho do arquivo que define esse símbolo, relativo à raiz do repositório da plataforma. Ele serve para o Mapping e para quem usa o MCP (por exemplo a tool `find_by_code`, que busca por `path` ou `symbol`) ligarem a marcação ao arquivo certo. Também serve para montar o link no GitHub, a partir do `urlTemplate` da plataforma.

O arquivo não está neste repositório de testes. Os `path` apontam para os repositórios de cada plataforma, que ficam fora daqui:
- Android: https://github.com/org/app-android/blob/v3/app/src/main/java/com/app/ds/DSButton.kt
- iOS: https://github.com/org/app-ios/blob/v3/App/DesignSystem/DSButton.swift
- BFF: https://github.com/org/bff/blob/v3/src/main/kotlin/com/app/bff/sdui/Components.kt

Não verifiquei se esses arquivos existem nesses repositórios (o `ws/` não tem a pasta `app/`). A referência é a tag `v3`.

Também não há nenhum projeto de mapeamento em `design/mapeamentos`, que está vazio. Por isso `list_projects` volta vazio e `find_by_code` responde "nenhum projeto nas raízes configuradas". Só consegui responder lendo a própria especialização, não uma marcação aplicada.

Consultado: tool list do cliente stdio; list_projects (vazio); find_by_code symbol=com.app.ds.DSButton (project-not-found); ws/assets/sdui.json; ws/.mcp.json.

#### Resposta literal — execução 2 (com `principal`)

Executor: agente limpo (subagente) usando o cliente stdio; NÃO foi o Claude Code (`claude -p` indisponível na VM).
Pergunta: O que é o `code` do tipo Button desta especialização, para que serve o `path` e onde está esse arquivo?

Fabiano, no tipo Button da especialização SDUI (id `sdui`, versão 3, aplicada ao projeto `principal`) não existe um único `code`. `code` é um objeto com uma entrada por plataforma, e cada entrada diz como esse componente é implementado naquela plataforma.

O que vale para cada plataforma:
- `symbol`: o nome do componente no código.
- `path`: o caminho do arquivo que contém esse componente, relativo à raiz do repositório da plataforma.
- `params`: o mapa entre os campos do Button no Mapping e os parâmetros do código.
- `values`: o mapa entre os valores dos campos e os valores do código.
- `notes`: orientação extra, quando existe.

Valores do Button:

| Plataforma | symbol | path | params |
|---|---|---|---|
| Android (Kotlin) | `com.app.ds.DSButton` | `app/src/main/java/com/app/ds/DSButton.kt` | texto→`text`, estilo→`style`, habilitado→`enabled` |
| iOS (Swift) | `DSButton` | `App/DesignSystem/DSButton.swift` | texto→`title`, estilo→`style`, habilitado→`isEnabled` |
| BFF (Kotlin) | `com.app.bff.sdui.button` | `src/main/kotlin/com/app/bff/sdui/Components.kt` | id→`id`, texto→`label`, estilo→`variant`, habilitado→`enabled` |

Valores mapeados (Android e iOS):
- `estilo`: Android usa `ButtonStyle.Primary`, `ButtonStyle.Secondary` e `ButtonStyle.Text`. iOS usa `.primary`, `.secondary` e `.text`.
- `habilitado`: sim vira `true` e não vira `false`.

Notas:
- Android: use o modifier de testTag com o valor do campo `id`.
- BFF: a função devolve o nó do componente no JSON da tela.

Para que serve o `path`: ele aponta o arquivo do componente dentro do repositório de cada plataforma. Com ele dá para achar a implementação sem procurar, e é a base do link para o código na plataforma. Os repositórios declarados na especialização são:
- Android: `https://github.com/org/app-android`, ref `v3`.
- iOS: `https://github.com/org/app-ios`, ref `v3`.
- BFF: `https://github.com/org/bff`, ref `v3`.
- Cada um tem `urlTemplate` no formato `.../blob/v3/{path}`.

Onde está o arquivo: não está neste workspace. Procurei `DSButton*` e `Components.kt` no workspace e não achei nada. O `path` é relativo ao repositório da plataforma, na ref `v3`. Por exemplo, o do Android seria `https://github.com/org/app-android/blob/v3/app/src/main/java/com/app/ds/DSButton.kt`, montado pelo template.

Não consegui verificar: se esses repositórios existem de fato; se os arquivos existem nesses caminhos; `get_code_hints` não foi chamado com uma marcação real de Button; `list_components` retorna 0 componentes na `sdui`.

Consultado: list; list_projects; get_project (principal); get_specialization (sdui, modelo-dados); list_components; get_code_hints (falhou, faltou ref/platform); ls/find no workspace.

## Regressões fora do alvo

- Nenhuma.

## Observações (sem severidade)

- **Preview sobrescrito no meio da rodada.** Durante o R3.5 a barra de status passou de `dee8666` para `d9aca24` (schema v10, outro branch): o projeto ficou "versão incompatível" (`open-failed:unsupported-version`). Parei, avisei, o dono republicou e a rodada seguiu em `dee8666`. A 1ª tentativa do R3.5 foi **invalidada** e refeita do zero (nela eu tinha apagado a chave `platformRepos` inteira em vez da entrada `android`: erro meu). O mapping.json antes da 2ª tentativa está em `principal-pre-R3.5.json`.
- **R1.20:** a ferramenta bloqueia `Ctrl+=`; o keydown foi disparado por script (162% mostrou Nome; 263% mostrou Cadastrar com parâmetros).
- **R1.12:** `Ctrl+Shift+5` com foco num campo digita "5"; com foco fora do campo abre Incompletas (corrigido o texto).
- **migracao10 copiada de migracao** (antes das edições v8), em vez de refeita pelo app como o preparo do guia diz; o `project.name` ficou "migracao" nos dois. Os arquivos externos (schemaVersion 10 + `platformRepos` com `urlTemplate`) seguiram o guia.
- **R3.8:** em duas aberturas (recentes e Abrir pasta) a barra mostrava `schema v11` e não havia faixa, com o disco ainda em schema 8 e sem `backups/`; a faixa e o backup só vieram na primeira escrita. Bate com o guia ("Ao abrir, ainda não há faixa").
- **R3.8:** `specs/sdui.json` do projeto migrado segue o antigo (com `implementacao`); o guia não pede para mexer nele.
- **R3.9:** projeto `antiga` criado como "Neste dispositivo" (não em pasta); só a interface foi observada (não li `values` em disco).
- **R5.3:** o check da linha "Imagem Cadastro criada" aceita só essa mudança (1 aceita); a frase "mudou(aram) junto, pelas dependências" só aparece com **Aceitar imagem** de Detalhes (11 aceitas + 2 junto). O guia só diz "Aceitar imagem".
- **Passada visual (Detalhes, Configurações):** tema escuro e claro legíveis em Configurações (Repositórios de código com o `repo` em leitura e o link; campos de caminho local acinzentados na revisão, que é somente leitura) e em Detalhes na revisão (marcador, popover Rejeitar/Aceitar/Limpar, nota com foco, "Outras mudanças"). Nada fora do lugar. Tema devolvido a Escuro.
- **R3.5:** o toast "Projeto atualizado por fora." é passageiro e não foi capturado; a mudança foi vista nos dois sentidos.

## O que atrapalhou

- O preview publicado ser trocado por outro branch no meio da rodada (R3.5).
- `claude -p` indisponível na VM: R3.6a, R3.6 e R5 rodaram pelo cliente stdio, e a pergunta de conceito (R3.6a) depende do Claude Code real.
- O guia diz "Aceitar imagem" no R5.3 sem distinguir o botão de Detalhes do check da linha.
- O guia pede `login.png` só no R5; precisei gerá-lo (script) porque não havia.
- Cliente stdio: o `propose_changes` exige `rect` com `width/height` (eu usei `w/h` na 1ª tentativa); a mensagem de validação é clara.
- Coordenadas fixas e `find` por referência mudam entre telas; precisei de `find` a cada menu (Ações do projeto › Fechar projeto).

## Fixtures usadas (na pasta de trabalho)

- `projeto-v8-mapping.json`, `projeto-v10-mapping.json`, `principal-pre-R3.5.json`, `principal-R1.22.zip`, `principal-R3.7.zip`, `anexos/`, `relato-parts/`.

## Passos detalhados (R3.8 a R5.3)

### R3.8 — Migração v8 → v11 (OK, com observação)

- Preparo: migracao criado no app (cadastro.png, marcação, SDUI normal, Screen nome=Cadastro rota=/cadastro, Salvo, fechado); fora do app: schemaVersion 8, `implementacao` (android, CadastroScreen.kt) nos values, specs/sdui.json trocado por sdui-antigo.json. Cópia: projeto-v8-mapping.json.
- 1ª abertura (pela lista de recentes) e 2ª (Abrir pasta): barra mostrou `schema v11` e SEM banner, enquanto o disco seguia em schema 8, revision 6, sem backups/. Os values do Screen já apareciam só com nome/rota. Isto bate com o guia ("Ao abrir, ainda não há faixa"): a migração só é gravada e anunciada na primeira escrita.
- Renomeei a marcação (Formulario2), Enter: banner "Projeto atualizado do formato v8; uma cópia do original foi guardada." apareceu após o Salvo.
- Disco: schemaVersion 11, revision 7, Screen values = {nome, rota}; backups/mapping.v8.20261019-234922.json idêntico ao projeto-v8 (com implementacao, schema 8).
- Observação: specs/sdui.json no projeto continua o antigo (com campo implementacao); o guia não pede para mudar.
- Dispensar, fechar, reabrir via Abrir pasta: banner não voltou. OK.

### R3.8b — Migração v10 → v11 (OK)

- Preparo: migracao10 foi COPIADA de migracao (antes das edições v8) em vez de refeita no app (desvio, ver relato); fora do app: schemaVersion 10 e platformRepos com urlTemplate (android ../app, ios localPath null). Cópia: projeto-v10-mapping.json. O project.name continua "migracao".
- Abrir pasta: barra `schema v11`; Diagnóstico (Ctrl+Shift+6) com `open.migration` às 23:50:31 citando os dois endereços descartados (https://github.com/org/app/blob/main/{path} e .../app-ios/blob/main/{path}).
- Configurações › Repositórios de código: Android `../app`, iOS vazio (BFF vazio).
- Renomear marcação (Formulario2) → Salvo; banner "Projeto atualizado do formato v10; uma cópia do original foi guardada."
- Disco: schemaVersion 11, revision 7, platformRepos {android:{localPath:"../app"}} sem ios e sem urlTemplate; backups/mapping.v10.20261019-235103.json idêntico ao projeto-v10 (mantém urlTemplate).

### R3.9 — SDUI antigo com `codeRef` (OK, observado na interface)

- Projeto `antiga` criado pelo app como "Neste dispositivo" (Novo projeto, não pasta), cadastro.png + 1 marcação; Aplicar especialização com ws/assets/sdui-antigo.json (guia: sdui.json + campo screen.implementacao tipo codeRef).
- Resultado: `"SDUI" aplicada: 3 camada(s) criada(s).` + aviso âmbar: `Campos ignorados: screen.implementacao. O tipo de campo "codeRef" saiu do formato; a especialização foi aplicada sem eles. Remova-os do arquivo.`
- Criei Screen (nome=Cadastro, rota=/cadastro): o formulário mostra só `nome` e `rota`; Salvo. Os values em disco NÃO foram lidos (projeto no navegador, sem pasta) — só a interface foi observada.

### R5.2 / R5.2b / R5.3 — Propostas (OK)

- Prep: `login.png` gerado por script (PIL, 484×450, título, e-mail, senha, Entrar) em ws/assets. `create_project` (importacao, raiz design/mapeamentos) e `propose_changes` (13 operações: apply_specialization sdui.json, 2 add_image, 10 create_marking com annotation) pelo cliente stdio (não o Claude Code). 1ª tentativa de propose_changes: rejeitada pela validação (`rect.width/height` em vez de `w/h`), erro meu de montagem; nada gravado. Proposta 6fe65ae7.
- R5.2 disco: importacao/ com mapping.json (revision 0), .gitignore, sem images/; proposals/6fe65ae7…/proposal.json. Tela: 25 mudanças todas Criada/sem decisão; Proposto lista Cadastro e Login; Atual: "Nenhuma imagem ainda.".
- R5.2b: Camadas lista Componentes/Eventos/Telas (SDUI); caminho `Cadastro › Formulário › Nome`, status "Nome".
- R5.3: 1º clique (check da linha "Imagem Cadastro criada") aceitou só 1 mudança; o botão **Aceitar imagem** de Detalhes aceitou 11 + "2 mudou(aram) junto, pelas dependências". Login: Aceitar imagem (9 mudanças), Senha rejeitada + nota "A senha fica para a próxima.", marcador do Button de Entrar → Rejeitar → "Criação rejeitada", campo de nota vazio e focado, nota "O Entrar é um link, não um botão." Resultado: 20 aceitas, 3 rejeitadas, 2 sem decisão (Eventos e Telas). Notas no proposal.json.
- Aplicar aceitas: disco images/cadastro.webp e login.webp, specs/sdui.json, revision 1 (9 marcações, 7 anotações). Ctrl+Z: images/ vazia, revision 2. Ctrl+Shift+Z: duas imagens de volta, revision 3.
- Pergunta de redação: "mudaram junto" só aparece com o botão Aceitar imagem de Detalhes; o check da linha aceita só a linha (comportamento esperado, mas o guia fala só em "Aceitar imagem").
