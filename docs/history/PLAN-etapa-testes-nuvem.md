# Histórico — Etapa Testes na nuvem (seção do antigo PLAN.md)

> Fases TN1 e TN2 concluídas no épico `epic/testes-nuvem` (TN1 no PR #280, TN2 nos #281, #283 e #284; o épico é o PR #279). Origem: pedido do dono em 2026-11-02. Sem schema (v13), formato de especialização, de proposta ou de componente novos e sem MCP novo (0.12.0).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes (marcados ao fechar a etapa). Depois dela vêm as decisões consolidadas dos PRs, a rodada e o que ficou para depois.

---

## Etapa — Testes na nuvem (épico `epic/testes-nuvem`)

- **Objetivo:** o dono decidiu (2026-11-02) que as rodadas dirigidas do testador, que hoje rodam no Cowork (Windows do dono, extensão Claude in Chrome e dialog-pilot), rodem também numa sessão do Claude Code na nuvem, no ambiente **"Mapping - testes"**, sem o dono no computador, e que o fluxo de épico dispare a rodada sozinho depois do merge da última fase.
- **Validado antes (sessão de 2026-11-02):** num Chrome com janela de verdade (Chrome for Testing em `/opt/pw-browsers/chromium`, tela virtual Xvfb), sem imitar `showDirectoryPicker`: o R0.2 no build local e no preview, o "Salvar como" de Exportar › Baixar e o seletor de arquivo de Adicionar imagens (R0.3).
- **Versões:** sem schema, formato de especialização, de proposta ou de componente novos, e sem MCP novo (o `CHANGELOG.md` diz "MCP sem mudança"; sem o rótulo `mcp-rc`).
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md)); a coluna Testador é nova (decisão 8):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                          | Testador      |
| ---- | ----------- | ---------------------- | --------------------------------------------------- | ------------- |
| TN1  | Opus        | high                   | Sonnet medium (documentos e testes); Haiku low      | —             |
| TN2  | Sonnet      | medium                 | Sonnet medium; Haiku low                            | Sonnet medium |

### Decisões

1. **Sem dialog-pilot nem servidor MCP novo na nuvem:** o agente opera os diálogos nativos (seletor GTK de pasta e de arquivo, "Salvar como", pedido de permissão do Chrome) pelas receitas em texto do apêndice A do `docs/TESTING.md`, com `xdotool`, AT-SPI e Playwright por CDP. Script auxiliar pequeno (`scripts/testing/`) só se a validação mostrar que a receita em texto falha, justificado no PR.
2. **Prompt próprio, `docs/TESTING-NUVEM.md`:** o `docs/TESTING-COWORK.md` é quase todo Windows, extensão, dialog-pilot, pastas do dispositivo e dono por perto; na nuvem as ferramentas são outras e o dono nunca está. O prompt novo é curto e remete às seções do prompt do Cowork que valem igual (o que executar, conferir e registrar, relato), com as diferenças. O Cowork continua valendo (Windows/Edge, roteiros sob demanda); a nuvem é mais um meio aceito para os passos [pessoa].
3. **Os roteiros não mudam:** o apêndice A ganha a subseção "Diálogos nativos na nuvem (Xvfb)", com as receitas e uma tabela que liga cada ferramenta do dialog-pilot (`select_folder`, `save_file`, `open_file`, `accept_permission_prompt`, `cancel_dialog`) à receita da nuvem; a convenção [pessoa] da seção 8 cita a receita equivalente.
4. **Sempre build local:** o testador compila a app do commit da rodada (`npm ci && npm run build`) e a serve em `http://localhost:8080` (contexto seguro: seletor, permissão e "Salvar como" iguais aos do Pages). Não há disputa pelo preview, e rodadas de épicos diferentes podem correr juntas. A validação da TN1 tirou a exceção prevista: o R15 só usa o Pages como **servidor da foto de teste** (`PAGES` = `https://fabianofranca.github.io/mapping/`, a versão principal, que tem a foto com CORS), e a política de URL e os interruptores são da app, iguais em qualquer origem; o aviso de rede local do Chrome não apareceu nem no preview neste Chromium. O que depende de `https:` (service worker, faixa "Nova versão disponível", app instalado) está só nos roteiros sob demanda, que a nuvem não roda. O build id local é `<commit> · <data do build>`: confere-se o commit.
5. **MCP do mesmo commit:** o testador compila o servidor (`npm run build:mcp`) e confere `--version`. A release candidate (`mcp-rc`) continua no fluxo dos épicos que mudam o MCP (Cowork, dono, estável); a rodada da nuvem só a usa quando a mensagem pedir, para conferir o artefato distribuído (Release, `.sha256`, `setup.sh`), se a rede do ambiente alcançar o download (validado na TN1).
6. **Fluxo do épico (regra no `CLAUDE.md`):** a última fase lista no `PLAN.md` os roteiros da rodada dirigida e põe na seção "Como testar" do PR dela a **mensagem pronta** para o testador (ex.: "Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: R3, R9 e R12. Branch `epic/x`, commit `abc1234`."). O agente da fase acompanha o PR (`subscribe_pr_activity`); depois do merge no épico, acha o ambiente "Mapping - testes" pelo nome (`list_environments`) e cria a sessão do testador (`create_session`) com essa mensagem. Se não sair (sessão arquivada ou sem acompanhar o PR), o dono abre um chat no ambiente e cola a mensagem.
7. **Relato:** a pasta de trabalho fica fora do clone (`~/mapping-testes/<AAAA-MM-DD>-<alvo>/`); ao fim, o testador copia o relato para `docs/history/relato-<AAAA-MM-DD>-<alvo>.md` e abre um PR curto para o épico. Capturas entram no repositório só para os ❌, em `docs/history/anexos/<relato>/`.
8. **Modelo e esforço do testador** definidos por fase no `PLAN.md` (coluna Testador; padrão Sonnet, medium).
9. **Ambiente "Mapping - testes"** (configurado fora do repositório, documentado no `docs/TESTING-NUVEM.md`): rede Limitada com `fabianofranca.github.io` e os gerenciadores de pacotes; script de configuração `apt-get update -q && apt-get install -y -q xdotool at-spi2-core python3-pyatspi openbox imagemagick`; variável `LANGUAGE=pt_BR:pt` (a app abre em pt-BR; o seletor GTK continua em inglês).

### Fora (de propósito)

- Dialog-pilot ou servidor MCP de diálogos para Linux.
- Mudar o texto dos roteiros (só a convenção [pessoa] e o apêndice A).
- Servir o build local por `https` com certificado próprio (exige flag do Chrome que muda o comportamento de segurança testado) e usar o preview nas rodadas da nuvem.
- Rodar na nuvem os roteiros sob demanda (RP, RF, RA).

### Fases

#### TN1 — Prompt do testador da nuvem, receitas e regra do fluxo

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet medium (documentos e testes), Haiku low. Decisões 1 a 9.

**Toca em:** `docs/TESTING-NUVEM.md` (novo), `docs/TESTING.md` (seção 8, apêndice A), `docs/TESTING-COWORK.md`, `README.md`, `CLAUDE.md`, `PLAN.md`, `tests/tooling/testingGuide.test.ts`.

- [x] Receitas validadas neste ambiente antes de escritas: subir a tela virtual e o Chrome, Playwright por CDP, build local servido em `localhost` e o build id, seletor de pasta e de arquivo (Open/Save pelo atalho Alt, sem geometria), "Salvar como" (limpar o nome sem sair `.zip.zip`), permissão pelo AT-SPI (ao criar e ao reabrir pelos recentes), cancelar, reiniciar o Chrome com uma aba só, MCP por stdio, download de um asset de Release e o R15 sem o preview
- [x] `docs/TESTING-NUVEM.md`: primeiros 10 minutos com uma conferência por item, modos e mensagens prontas, ambiente, build local e a exceção do preview, relato e PR, e o "Nunca" (Enter no seletor, listener de `filechooser`, mais de uma aba)
- [x] Apêndice A (subseção da nuvem e tabela de equivalência) e convenção [pessoa] da seção 8 do `docs/TESTING.md`; ponteiros no `docs/TESTING-COWORK.md` e no `README.md`
- [x] Regra do fluxo no `CLAUDE.md` (fluxo de trabalho e roteiros de teste) e a coluna Testador
- [x] Testes em `tests/tooling/testingGuide.test.ts`: o prompt existe com o "Nunca", o apêndice A tem as receitas e a tabela, `README.md` e `CLAUDE.md` apontam para ele
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### TN2 — O fluxo de verdade (última fase)

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low. **Testador:** Sonnet, medium. Decisões 6 e 7.

- [x] Rodada dirigida da nuvem, lista fechada: **R0 inteiro** (seletor de pasta, permissão da pasta, seletor de arquivo) **e R2** ("Salvar como" salvo e cancelado, "Abrir zip" pelo seletor de arquivo). Mensagem pronta em "Como testar" do PR da TN2
- [x] Depois do merge da TN2 no épico, a sessão do testador criada no ambiente "Mapping - testes" pelo agente da fase; relato em `docs/history/relato-*.md` por PR para o épico
- [x] Fechamento: histórico em `docs/history/PLAN-etapa-testes-nuvem.md`, `CHANGELOG.md` (data do merge), `CLAUDE.md` e `docs/ROADMAP.md`
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

## Decisões consolidadas dos PRs

- **TN1 (PR #280):** receitas validadas no ambiente (Chrome for Testing 153, Xvfb, openbox) antes de escritas. Seletor de pasta e de arquivo: `ctrl+l`, o caminho e **Alt+O** (o clique por geometria variava e o Enter vazava para o pedido de permissão). Permissão: script Python pelo AT-SPI, com a ação chamada pelo nome (`press`). "Salvar como": Home, Shift+End, BackSpace, o caminho completo e Alt+S (o `ctrl+a` gerava `nome.zip.zip`); a lista de autocompletar segura o Alt+S e fecha com um Escape; **o GTK sobrescreve arquivo existente sem confirmar**, então o testador confere com `test -e`. Cancelar: Alt+C. Reiniciar o Chrome com uma aba só: fechar pelo CDP (`Browser.close`) e apagar `Default/Sessions` (o `pkill -f chrome` mata a própria shell). Sempre build local: a exceção do preview prevista para o R15 caiu. Sem script auxiliar em `scripts/`. O bullet [pessoa] da seção 8 foi encurtado para caber nos 600 caracteres.
- **TN2 (PR #281):** a rodada dirigida ficou em **R0 inteiro e R2** (o R0 cobre seletor de pasta, permissão e seletor de arquivo; o R2, "Salvar como" salvo e cancelado e "Abrir zip"). Sem rótulo `mcp-rc`.
- **TN2, aviso e merge (PR #284):** o agente da fase não era avisado do PR do relato (a inscrição no PR da fase acaba no merge e nada avisa de PR novo). A mensagem do testador passou a terminar com "Coordenador: `session_…`"; o testador avisa por `send_message` ao abrir o PR do relato e não mescla; **sem ❌ e com o CI verde, o agente da fase mescla o PR do relato no épico**. O PR do épico para a `main` continua do dono. Regra no `CLAUDE.md` e teste em `tests/tooling/testingGuide.test.ts`.

## Rodada da nuvem

Dirigida (R0 e R2), commit `87aa4cb` do `epic/testes-nuvem`, build local `87aa4cb · 2026-11-02` (Chrome for Testing 153 em Xvfb, Playwright por CDP, xdotool e AT-SPI), sessão do testador Sonnet medium criada pelo agente da fase: 12 passos, 12 ✅, 0 ❌, 0 não executados; nenhum achado, sem regressão. Relato em [`relato-2026-11-02-testes-nuvem.md`](relato-2026-11-02-testes-nuvem.md). Ressalvas: o console da aba não foi lido e a ordem exata "o diálogo fecha depois que a linha some" (R2.6) não foi medida.

## O que ficou para depois

Sugestões do testador para as receitas do apêndice A do `docs/TESTING.md` (sem decisão do dono para virar PR; ficam aqui):

- **Receita 5, seletor GTK com pasta que tem conteúdo (R0.7):** a lista de autocompletar bloqueia o `alt+o`, e o `Escape` pode apagar o campo do caminho. Contorno que funcionou: digitar o caminho, clicar no botão **Open** por coordenada (o primeiro clique só fecha a lista) e então `alt+o`.
- **`alt+s` do "Salvar como":** na primeira exportação, o `alt+s` logo depois de digitar o caminho não salvou; o segundo salvou.
- **`ctrl+l` fora do seletor** vai para a barra de endereço do Chrome: conferir com `xdotool search` antes de digitar.
- **Títulos dos seletores:** "Abrir arquivo" (Abrir zip) e "Abrir arquivos" (Adicionar imagens); a receita só cita o segundo.
- **Menu "Ações do projeto":** os itens não têm `role="menuitem"`; o Playwright os acha pelo texto.
- **Guia:** ao abrir um zip, o projeto não mostra **Alterações não exportadas**, e o guia não diz o que esperar.
- Recebimento do aviso do testador (`send_message`) ainda não foi exercitado numa rodada de verdade: a primeira rodada que traga "Coordenador: `session_…`" valida o fluxo.
