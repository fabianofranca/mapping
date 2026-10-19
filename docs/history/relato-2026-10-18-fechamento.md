# Relato de teste — Mapping (Fechamento da etapa Biblioteca)

- Modo: dirigido — lista de passos: R0 inteiro; R1 inteiro (dependência do R3.1 a R3.7); R3 (R3.1 a R3.17); R9 (R9.1 a R9.15); R10 (R10.1 a R10.8); A18 (teste avançado). Passada visual: Catálogo, Biblioteca. PR #176, branch `ccr-a8bd7a2c-ayit6v` (base `epic/biblioteca`)
- Build id: 33be65a · 2026-10-18 (esperado: o mesmo; o preview abriu com c9228c0 · 2026-10-18 e a faixa **Atualizar** trouxe o esperado, sem Deploy)
- Canal (como a app mostra): prévia
- Forma de abrir: preview (https://fabianofranca.github.io/mapping/preview/), aba aberta pelo link clicado da aba de apoio
- Navegador e versão: Chrome 155.0.0.0 (userAgent)
- Sistema operacional: Windows 10/11 x64 (userAgent `Windows NT 10.0`)
- DPR e viewport: DPR 1,25; janela restaurada a 1111 × 883 pedido, viewport 1095 × 605 (a janela já veio em 1486 × 639 e em 1008 × 586 em momentos diferentes; ver "O que atrapalhou")
- Pasta de trabalho: `~/mapping-testes/2026-10-18-pr176/`; repositório do branch em `repo/` (árvore de trabalho sem `.git`)
- Ferramenta: agente com Claude in Chrome (extensão) e shell na VM do computador; dialog-pilot 2.3.1; pedidos ao MCP: stdio (`scripts/testing/mcp-stdio-client.mjs`), usado no R3.6, R9.13 a R9.15 e A18.7 a A18.9
- Estado prévio do navegador: perfil já usado; 14 projetos recentes antes da rodada (13 em pasta, 1 neste dispositivo, "Teste", com "Alterações não exportadas"). Nada apagado. Há ainda uma aba antiga do Mapping do dono
- MCP: 0.5.0-snapshot.pr176+33be65a, origem pre-release `mcp-snapshot-pr176`, sha256 conferido (`mapping-mcp.js: OK`)
- Data: 2026-10-18
- Tempo por roteiro: R0 ~25 min; R1 ~55 min; R3, R9, R10, A18 e passada visual até ~16:20 (relógio do computador)

> Os dois ❌ foram corrigidos no próprio PR #176 e confirmados no reteste: [`relato-2026-10-18-reteste.md`](relato-2026-10-18-reteste.md).

## Resumo

**Falhas (2)**

1. ❌ **R3.11** — ao reabrir o projeto, o Diagnóstico não mostra a seção "Biblioteca" (2 avisos de fonte ausente do `material3.spec.json`); só aparece logo depois de aplicar/atualizar na mesma sessão. Reproduzido 2 vezes.
2. ❌ **R10.5** — na tela "Abrir biblioteca", clicar num link do documento não leva a página ao topo (o scroll fica em 400 px) e o aviso "Destino não encontrado: mapping://nao-existe" fica fora da tela; a janela inteira rola e a página encosta na borda esquerda. Reproduzido 2 vezes.

**Passou:** R0 (6/6), R1 (24/24), R3 (16 de 17), R9 (15/15), R10 (7 de 8), A18 (10/10), passada visual (2/2). Total contado no painel: 82 passos (R1.1 a R1.9 vão numa linha só da tabela), 80 ✅ e 2 ❌, nenhum passo inteiro "não executado".

**Pontos que não foram conferidos por inteiro** (dentro de passos ✅): "Propostas antigas abrem" (A18.2), valor fora das opções por `map-values` (A18.5), `disabled` do botão Atualizar por script (A18.10), "Conferindo o pacote…" (R3), tooltips (VIS), botão Copiar do Diagnóstico (R3.11).

**Observação extra:** quando o pacote da biblioteca é válido como arquivo mas tem erro de conteúdo, a primeira linha do diálogo diz "O pacote não tem uma especialização legível: falta um .json com "format": "mapping-spec" na raiz", embora o arquivo exista (o erro real vem logo abaixo: "examples[2].values.variant deve ser uma das options"). A mensagem de cabeçalho engana.

## Passos

| Passo | Resultado | Observação |
| ----- | --------- | ---------- |
| R0.1  | ✅ | Build 33be65a · 2026-10-18 após **Atualizar** (abriu com c9228c0). Ajuda abre na seção Atalhos; Esc fecha e o foco volta ao botão **Configurações**. Sem barra de rolagem horizontal visível em Configurações (conferido em captura) |
| R0.2  | ✅ | `select_folder` aceitou a permissão. Campo "Nome do projeto" vazio, com o nome da pasta só como placeholder. Disco: `mapping.json` e `.gitignore` (`backups/`), `schemaVersion` 10, `revision` 0 |
| R0.3  | ✅ | Imagem entrou como `images/cadastro.png` (WebP maior que o PNG, previsto na seção 4), 484 × 450; 1 marcação, `revision` 2. Fechar projeto não perguntou nada; `fumaca-web` no topo dos recentes com selo Pasta |
| R0.4a | ✅ | Recarga (F5) e **Abrir** pela linha: abriu sem seletor e sem pedido de permissão. A aba não caiu |
| R0.4b | ✅ | Com 784 px, só o aviso "Abra numa janela maior". Ao alargar, o editor volta igual, marcação selecionada. Delete com a janela estreita não excluiu |
| R0.7  | ✅ | Pasta renomeada com o projeto fechado. **Abrir** deu **Pasta indisponível**; **Localizar pasta…** abriu. **Remover da lista** tirou a linha. Disco igual |
| R1.1–R1.9 | ✅ | Executados e conferidos (tela e disco) no `principal`: 6 marcações, 7 camadas; User e Classe Contato. Tabela `atributos` da Classe fica apertada no painel Detalhes estreito |
| R1.10 | ✅ | `dado` é objeto de referência nos três Inputs; `obrigatorio` = `sim` só no E-mail |
| R1.11 | ✅ | Button com `estilo` primary e `habilitado` sim já preenchidos |
| R1.12 | ✅ | "obrigatório vazio" sob `id`; ⚠ no cabeçalho, na camada, no canvas e no quadro; aparece em Incompletas |
| R1.13 | ✅ | Links "← Input …"; o clique seleciona Nome |
| R1.14 | ✅ | Chave renomeada para `nome`; o Input mostra `User.nome` |
| R1.15 | ✅ | Diálogo "Referências vão quebrar"; Desfazer: linha volta com o mesmo `_id` |
| R1.16 | ✅ | Disco: onClick, onHold (`duracaoMs` 500, número), onChange. Obs.: com o onHold aberto o painel Detalhes mostra barra horizontal (largura 365 px) |
| R1.17 | ✅ | Mensagem "Dono do onClick"; nada criado |
| R1.18 | ✅ | Endpoint gravado; 11 anotações |
| R1.19 | ✅ | Eventos ativa; as demais ocultas |
| R1.20 | ✅ | Todas visíveis; cartões conferidos (a 155% o cartão do onClick corta com "…") |
| R1.21 | ✅ | Só incompletas: só o Texto do Título |
| R1.22 | ✅ (com ressalva) | Zip conferido; imagem `.png` (a seção 4 admite) |
| R1.23 | ✅ | Converter em livre e Desfazer conferidos |
| R1.24 | ✅ | Contagens e Desfazer conferidos |
| R3.1  | ✅ | SDUI v2 com Plataformas; Modelo de dados v1; camada Telas |
| R3.2  | ✅ | Repositórios por plataforma; disco `platformRepos.android` |
| R3.3  | ✅ | Screen só com nome/rota |
| R3.4  | ✅ | Definição do Button (link Android pelo `href`; iOS só Copiar) |
| R3.5  | ✅ | Edição externa recarregou; aviso de repositório aparece e some |
| R3.6  | ✅ | Por stdio; revision 69→70 ao aplicar. stderr: EPERM ao apagar temporário em `proposals/<id>/` |
| R3.7  | ✅ | Zip com schemaVersion 10 e platformRepos |
| R3.8  | ✅ | v8 → v10 com faixa e backup (o guia falava em `schemaVersion` 9 no preparo) |
| R3.9  | ✅ | Aviso "Campos ignorados"; Screen só com nome e rota |
| R3.10 | ✅ | "0 erro(s) e 42 aviso(s)"; aplicada; disco `specs/material3/` certo. "Conferindo o pacote…" não capturado |
| R3.11 | ❌ | **Ver Achados.** Reaberto 2 vezes: o Diagnóstico só tem a seção "Componentes"; não há a seção "Biblioteca" com os 2 avisos de `material3.spec.json` |
| R3.12 | ✅ | Remover e reaplicar por zip (com e sem pasta-raiz); cada "Converter" deixou uma camada "Componentes" livre (3 no fim) |
| R3.13 | ✅ | Zip sem `components/m3-button.json`: erro e Aplicar desabilitado; `.spec.json` solto pede a pasta inteira |
| R3.14 | ✅ | mat-v2 aditiva |
| R3.15 | ✅ | mat-v3 `rename-field`; Desfazer e repetir |
| R3.16 | ✅ | mat-v4 `remove-field` com perda em destaque; Desfazer e repetir |
| R3.17 | ✅ | mat-v5 sem migração: erro de contrato, Atualizar desabilitado, nada muda |
| R9.1  | ✅ | Projeto `telas` com o pacote aplicado |
| R9.2  | ✅ | Tela em branco com validação do nome. Obs.: o erro faz o diálogo crescer e desloca o campo |
| R9.3  | ✅ | Catálogo abre na aba Componentes; Paleta com 15 tipos |
| R9.4  | ✅ | Top app bar 360 × 64 (largura da tela) e Row |
| R9.5  | ✅ | Chips como filhos do Row |
| R9.6  | ✅ | Arrumar, Desfazer numa ação, Refazer; "Nada a arrumar" |
| R9.7  | ✅ | Ordem entre irmãs ("2 de 4" → "3 de 4") |
| R9.8  | ✅ | Edição do Label redesenha; Desfazer/Refazer |
| R9.9  | ✅ | Largura mínima 40 pela edição e pela alça |
| R9.10 | ✅ | Opção de desenhar sobre a foto |
| R9.11 | ✅ | Text field no mínimo com aviso. Incompletas lista 3 (campo e os 2 chips do R9.9), não 2 como o guia dizia |
| R9.12 | ✅ | Reaberto igual; zip com tela `file: null`, sem dados de desenho |
| R9.13 | ✅ | Proposta por stdio sem gravar no projeto. EPERM no `.tmp` em `proposals/<id>/` |
| R9.14 | ✅ | Proposto desenha a tela nova; Atual não |
| R9.15 | ✅ | Aplicada; segunda proposta com `move_marking` (índice já era 0) |
| R10.1 | ✅ | Abrir biblioteca: validação e 15 componentes. Visual: conteúdo encosta na borda esquerda e a janela inteira rola |
| R10.2 | ✅ | Busca e teclado |
| R10.3 | ✅ | Página do Button com galeria desenhada |
| R10.4 | ✅ | Playground: largura auto 83 e 161 (guia ~87 e ~172), limites e Restaurar valores |
| R10.5 | ❌ | **Ver Achados.** Links navegam e destino inexistente avisa, mas a página não volta ao topo e o aviso fica fora da tela |
| R10.6 | ✅ | Abrir biblioteca não grava nada |
| R10.7 | ✅ | Adicionar à tela pelo Catálogo e pela Paleta; as duas marcações nascem no mesmo ponto (X 120, Y 380) |
| R10.8 | ✅ | Sem biblioteca: mensagem e "Abrir Especializações" |
| A18.1 | ✅ | SDUI aplicada; Button sem pendências |
| A18.2 | ✅ | Versão nova com campo obrigatório: pendência em Incompletas. "Propostas antigas abrem" não executado (sem proposta antes) |
| A18.3 | ✅ | Material 3 v1 → v2 aditiva |
| A18.4 | ✅ | v3 `rename-field` ("nada a mudar neste projeto") |
| A18.5 | ✅ | `map-values`: contrato recusa mapear só parte das opções removidas; com as duas, migra e Desfaz. Pendência `unknown-option` não executada (o contrato não deixa remover opção sem mapear) |
| A18.6 | ✅ | `remove-type` com `delete`: 3 anotações apagadas em destaque; Desfazer |
| A18.7 | ✅ | `plan_library_update` da v1 direto para `mat-v4`: recusado por migração faltando (a cadeia do `mat-v4` começa em 2) |
| A18.8 | ✅ | Da v3 para `mat-v4`: passos, perda e validação, sem gravar |
| A18.9 | ✅ | `propose_changes` com `update_specialization`; aplicada na app: v4, FAB sem `note`. Sobraram `.tmp` em `proposals/<id>/specs/` (EPERM do ambiente) |
| A18.10 | ✅ | `mat-v5` sem migração recusado; nada muda |
| VIS.1 | ✅ | Catálogo dentro do projeto e diálogo do componente sem rolagem horizontal; foco volta ao item ao fechar |
| VIS.2 | ✅ | Tela "Abrir biblioteca" sem texto cortado; ressalva: encosta na borda esquerda e a janela inteira rola (ver R10.5) |

## Achados

### ❌ R3.11 — Diagnóstico não mostra a seção "Biblioteca" ao reabrir o projeto

- Esperado (guia): ao fechar e reabrir `biblioteca` com o Material 3 v1, a seção **Biblioteca** do Diagnóstico lista os 2 avisos de fonte ausente (`material3.spec.json`, `fonts[0].file`, `fonts[1].file`).
- Observado: só a seção **Componentes**. Reproduzido 2 vezes (Fechar projeto + Abrir pelos recentes; recarregando a página e abrindo de novo).
- Contraste: logo depois de **Aplicar** (e das atualizações), na mesma sessão, a seção "Biblioteca — Material Design 3 (baseline): 0 erro(s) e 2 aviso(s)" aparece.
- Passos: aplicar a pasta `material3` no projeto `biblioteca` (R3.10) › Salvo › Fechar projeto › Abrir `biblioteca` nos recentes › aba Diagnóstico.

### ❌ R10.5 — Navegar por link no Catálogo (tela "Abrir biblioteca") não volta ao topo e esconde o erro

- Passos: Abrir biblioteca (`material3`) › abrir o Button › rolar a página até a meio do documento (scroll ~400 px) › clicar nos links do documento.
- Esperado: "Ir para o Chip" abre o Chip no topo; destino inexistente mostra o aviso visível.
- Obtido: o Chip abre, mas o scroll continua em 400 px (na 2ª tentativa 678 px); "Destino não encontrado: mapping://nao-existe" fica fora da tela. A janela inteira rola, não há área de rolagem própria (mesma causa provável do R10.1: sem margem à esquerda).
- Reproduzido 2 vezes. Dentro do projeto (diálogo Catálogo) o conteúdo rola internamente e tem margem.

## Regressões fora do alvo

Nenhuma.

## Observações (sem severidade)

- R0.3, R1.1 e R1.22: a imagem ficou `.png` no projeto e no zip (o previsto quando o WebP sai maior; vale conferir a regra com uma imagem real).
- O preview abriu com outro build (`c9228c0`); a faixa **Atualizar** resolveu na primeira vez.
- R9.11: a aba Incompletas mostrou 3 itens (o guia dizia 2).
- R9.15: `move_marking` com `index: 0` não mudou nada porque o Top app bar já era o primeiro.
- R9.12: o Chrome mostrou "este site pode conferir as edições" no lugar do "Salvar como".
- R3.12: sobraram camadas "Componentes" extras depois de "Converter em camadas livres".
- R10.7: "Adicionar à tela" duas vezes põe as duas marcações exatamente no mesmo lugar, uma sobre a outra.
- A18.5: um pacote em que a opção removida ainda aparece num exemplo é recusado; `map-values` sem cobrir todas as opções removidas é recusado pelo contrato.
- A18.7: ir da v1 direto para o `mat-v4` é recusado (a cadeia de `migrations` do `mat-v4` começa em 2), como o contrato prevê.
- A18.9: o servidor MCP deixa arquivos `.tmp` em `proposals/<id>/specs/material3/components/` quando apagar não é permitido (pasta montada deste ambiente).

## O que atrapalhou

- `git clone` direto dentro da pasta montada falha (o git não consegue apagar `.git/config.lock`); contorno: clonar fora e copiar a árvore de trabalho. O `zip` na pasta montada também falhou (rename do temporário).
- O guia manda `git init` + `git fetch pull/<n>/head`; troquei por clone do branch (mesmo commit `33be65a`).
- `cadastro.png` gerado fora da VM do computador (sem Chromium nela) e levado à pasta.
- O quadro de coordenadas da captura de tela e o tamanho da janela do Chrome mudaram entre chamadas (1486, 1008, 1095 de largura).
- `rm` na pasta montada falha; pacotes de teste foram movidos para pastas `_to_delete_*`.
