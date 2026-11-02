# Relato de teste — Mapping

- Modo: dirigido — reteste curto da etapa Exemplos enxutos (lista montada pelo dono: R15.1 a R15.12, o Enter de verdade no R15.2 e R15.3, R9.6 e R9.7, R10.7, R8.1b opcional), depois do R0 inteiro; sem interação
- Alvo: PR #273 (`epic/exemplos-enxutos` → `main`)
- Build id: 2eb2da0 · 2026-11-02 (esperado: 2eb2da0 · 2026-11-02; confere)
- Canal (como a app mostra): prévia (R15, R9, R10 e passada visual); estável no R0, que rodou na build local (ver "Forma de abrir")
- Forma de abrir:
  - **R15, R9, R10 e passada visual:** preview (`https://fabianofranca.github.io/mapping/preview/`). Ao abrir, o preview estava com `8359fc5 · 2026-11-02` (do `epic/testes-nuvem`). Disparei o **Deploy** do branch `epic/exemplos-enxutos` (execução `41443108573`, `workflow_dispatch`, `branch=epic/exemplos-enxutos`); quando terminou, a faixa **Atualizar** trouxe o `2eb2da0`. Registro: "preview publicado pelo testador, execução 41443108573".
  - **R0:** enquanto o Deploy rodava, o dono liberou uma versão local. Compilei o `2eb2da0` (`npm run build`, que traz `2eb2da0 · 2026-11-02` e canal `estável`) e servi `dist/` em `http://localhost:8080` (`secure context`; o R0.1 conferido de novo no preview depois). Os passos do R15 usam o preview em `https`, onde a URL da imagem (`PAGES` = o preview) é `https`; numa base `http` local o `PAGES` mudaria o sentido do R15.3 a R15.6.
- Navegador e versão: Chrome for Testing 153.0.8010.12 (Linux x64), janela 1600 × 1000 no Xvfb
- Sistema operacional: Linux (container do ambiente "Mapping - testes"), openbox
- DPR e viewport: DPR 1; viewport da página 1591 × 852 (a faixa "Chrome for Testing…" ocupa a parte de cima); tema claro e escuro na passada visual, pt-BR
- Pasta de trabalho: `/home/user/work-test/` (`material3-compose/` com 105 arquivos, `material3-compose.zip`, `servidor-imagens/`, projetos `fumaca-web-2`, `remotas`, `telas`, `anexos/`)
- Passada visual pedida: Diagnóstico, Privacidade
- Ferramenta: agente Claude Code na nuvem (ambiente Mapping - testes); Chrome for Testing em Xvfb, controlado por CDP (Playwright), xdotool e AT-SPI; dialog-pilot: nenhum; MCP: não usado
- Estado prévio do navegador: perfil novo (sem projetos); **Privacidade: nenhuma origem permitida, quatro interruptores desligados** (conferido antes do R15.2); nada foi limpo. Ao fim, a Privacidade voltou a esse estado e o tema voltou a **Sistema**.
- MCP: não usado
- Data: 2026-11-02
- Tempo por roteiro: não cronometrado. O R15 levou cerca de 12 min pelo relógio do `servidor.log` (12:22 a 12:35); o R0, o R9 e o R10.7 mais ou menos o mesmo cada um.

## Resumo

- Passos: 31 linhas; **30 ✅** (alguns parciais, marcados na Observação), **0 ❌**, **1 não executado** (R8.1b, precisa do dono).
- Achados por severidade: bloqueia 0, alta 0, **média 1**, baixa 5 (todas do texto dos roteiros; ver "Achados").
- Impede o uso com pessoas? **Não.** O achado médio tem contorno (sair do campo em vez de apertar Enter) e a imagem carrega mesmo com o `\n`, mas grava lixo na URL do `mapping.json`.
- **A correção do Diagnóstico funcionou:** no R15.9 a linha `http://127.0.0.1:8765/foto.png` passou de "endereço não aceito" (R15.7) para "origem sem permissão" (R15.8, depois de ligar os interruptores) e, depois de **Permitir estas**, para **"não carregou"**, **na mesma linha e na mesma posição, sem duplicar**.
- **Resposta à dúvida principal (o `\n` com a tecla Enter pura).** Depende do tipo de campo em que o Enter cai:
  - **Campo de uma linha (vazio ou com valor de até 60 caracteres): não grava `\n`.** Conferi pelas duas formas pedidas: (a) clique no campo, `xdotool type` da URL (sem `\n`), `xdotool key Return` à parte; (b) `page.keyboard.type` da URL e `page.keyboard.press('Enter')` à parte. Nas duas, o `url` no `mapping.json` ficou `"https://fabianofranca.github.io/mapping/preview/imagens-teste/foto.png"`, sem `\n`.
  - **Campo que já virou várias linhas (valor atual com mais de 60 caracteres): grava `\n` no fim.** É o caso de **toda URL `https` normal**: ao confirmar uma URL longa, o campo troca de `INPUT` para `TEXTAREA` (`MULTILINE_MIN_LENGTH = 60`, `src/ui/FieldEditors.tsx`) e o foco vai ao `BODY`. Dali em diante, o Enter **quebra a linha** ("Enter quebra a linha, sair do campo grava", comentário do `MultilineEditor`), e ao sair do campo o `url` vai para o disco com `\n`. **Reproduzi três vezes, com Enter pura, sem Shift** (sequência exata no achado 1). É **achado de produto** (média).

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1 | | ✅ | Build local: Configurações › Sobre `2eb2da0 · 2026-11-02`, canal estável; sem rolagem horizontal; **Ver os atalhos de teclado** abre a Ajuda em Atalhos e **Esc** a fecha com o foco no botão **Configurações**. No preview, Sobre confere (`2eb2da0`, canal prévia). |
| R0.2 | | ✅ | `fumaca-web`: `mapping.json`, `.gitignore` (`backups/`) e `specs/notas/` (`notas.spec.json`, `components/nota.json`, `components/tabela.json`, `docs/nota.md`, `docs/tabela.md`); editor com "Nenhuma imagem ainda" e **Pasta** na barra. Pedido de permissão aceito pelo AT-SPI ("Permitir"; esta versão do Chrome não ofereceu "em todas as visitas"). |
| R0.3 | | ✅ | `cadastro.png` (484 × 450) entrou como `images/cadastro.png` (o WebP saiu maior, caso previsto na seção 4). 1 container, 1 marcação, `revision` 2 (depois do **Salvo**). Fechar volta sem perguntar e `fumaca-web` aparece em **Projetos recentes** com **Pasta**. |
| R0.4a | | ✅ | Depois do F5, **Abrir** abre sem seletor e **sem pedido de permissão** (o caso "não pediu"). A aba continuou de pé. |
| R0.4b | | ✅ | Janela em 800 px: só "Abra numa janela maior". Alarguei: o editor voltou igual, com a marcação **selecionada**; `markings` continua com 1 item. |
| R0.7 | | ✅ | Com a pasta renomeada: "A pasta "fumaca-web" não foi encontrada…" com **Localizar pasta…** e **Remover da lista**; depois de localizar `fumaca-web-2`, a linha mostra `fumaca-web` e embaixo `fumaca-web-2`; **Remover da lista** tira a linha; disco com `mapping.json` (1 e 1), `.gitignore`, `specs/notas/`, `images/cadastro.png`. |
| R15.1 | | ✅ | Servidor (`node servidor-imagens.mjs` em segundo plano); `http://127.0.0.1:8765/foto.png` mostra a imagem 96 × 96. O `curl` do Pages traz `access-control-allow-origin: *` (o proxy deixou passar). **Roteiro:** o `servidor.log` ficou com **2 linhas**, `GET /foto.png origin=none` e `GET /favicon.ico origin=none` (o Chrome pede o favicon quando abre a aba); a de `foto.png` é uma (achado 5). |
| R15.2 | | ✅ | Projeto `remotas`, biblioteca aplicada (0 erros, 0 avisos), container `Tela` (360 × 800, `#FFFFFF`), **Image** pela Paleta com a faixa de `https://example.com`. Depois de `Ana` (Enter), `Crop` e **URL da imagem** vazia: sem foto, **sem faixa**, `componentImages` `0`, **Incompletas 1** ("URL da imagem: obrigatório vazio"); **Privacidade**: "Nenhuma origem permitida neste navegador.", quatro interruptores desligados. Disco: `specs/material3-compose/`; `contentDescription` `Ana`, `contentScale` `Crop`, `url` `null`. |
| R15.3 | | ✅ | **Enter de verdade, forma (a):** URL digitada com `xdotool type` e `xdotool key Return`: faixa com o texto esperado ("Este projeto tem imagens de https://fabianofranca.github.io. …", **Agora não**, **Permitir estas**), foto ausente, `componentImages` `0`, **0 pedidos** a `foto.png`; Diagnóstico: `…/foto.png: origem sem permissão` (a URL aparece inteira; o roteiro diz "encurtada"). Disco: `url` **sem `\n`**. **Forma (b):** idem, sem `\n`. Ver achado 1 para o que acontece com o segundo Enter. |
| R15.4 | | ✅ | **Permitir estas**: faixa some; foto com os quatro quadrantes (vermelho, verde, azul, amarelo), preenchendo a caixa; `componentImages` `1`; **1** pedido a `foto.png`. **Privacidade** lista `https://fabianofranca.github.io`; **Sobre**: "Imagens remotas: 1 origens permitidas neste navegador". |
| R15.5 | | ✅ | Fechar e reabrir `remotas` (sem pedido de permissão): foto sem faixa. Disco: `mapping.json` guarda a URL como texto; **não existe `images/`** nem PNG na pasta. Zip exportado: só `mapping.json` e `specs/…`, **0 PNG**, nada de `images/`. O "Salvar como" gravou `remotas-export.zip.zip` (receita do ambiente; renomeei). |
| R15.6 | | ✅ | **Revogar https://fabianofranca.github.io** (nome acessível; o texto visível é só "Revogar"): "Nenhuma origem permitida neste navegador."; foto some (`componentImages` `0`) e a faixa volta com a origem. |
| R15.7 | | ✅ | Os três endereços (`http://127.0.0.1:8765/foto.png`, `https://192.168.0.10/foto.png`, `isto não é um endereço`): reservado, **sem faixa**, `componentImages` `0`; `servidor.log` com **uma** linha de `foto.png` (a do R15.1). Diagnóstico: cada um "endereço não aceito". Na primeira URL usei o Enter de verdade no `TEXTAREA` (achado 1); as outras duas, digitando e saindo do campo. |
| R15.8 | | ✅ | Com a URL em `http://127.0.0.1:8765/foto.png`, ligar **Permitir imagens sem criptografia (http)** e **Permitir imagens da rede local**: faixa "…imagens de http://127.0.0.1:8765 (sem criptografia, rede local)…", **nenhum pedido novo** (continua 1). O Diagnóstico dessa linha já passa de "endereço não aceito" para **"origem sem permissão"** (a etapa do meio, que o roteiro não cita; achado 6). |
| R15.9 | | ✅ | **Permitir estas**; espera de 3 s e mais 4 s: reservado (`componentImages` `0`); **um só** pedido novo, `GET /foto.png origin=https://fabianofranca.github.io` (2 linhas de `foto.png` no log, sem nova tentativa depois). **Diagnóstico: a linha passa de "origem sem permissão" para "não carregou", na mesma linha e na mesma posição da lista, sem duplicar** (captura em `anexos/r15-9-diagnostico-nao-carregou.png`). Nenhum pedido de rede local do Chrome apareceu. |
| R15.10 | | ✅ | **Mostrar imagens de servidores sem CORS**: foto aparece com os quatro quadrantes, `componentImages` `1`; **um** pedido novo (3 linhas de `foto.png`; a nova é `origin=none`). Desligado: o reservado volta (`componentImages` `0`). |
| R15.11 | | ✅ | **Qualquer origem** ligado, URL do Pages: foto sem faixa (`componentImages` `1`). `http://localhost:8765/foto.png`: faixa "(sem criptografia, rede local)"; **Agora não** esconde a faixa, reservado, `servidor.log` continua com 3 linhas de `foto.png`. **Privacidade** lista `http://127.0.0.1:8765` (do R15.9) e não `localhost`. |
| R15.12 | | ✅ | Quatro interruptores desligados e origem revogada: **Privacidade** volta a "Nenhuma origem permitida neste navegador." e quatro desligados. `/parar` mostra "parado"; `http://127.0.0.1:8765/foto.png` dá `ERR_CONNECTION_REFUSED`; processo encerrado. |
| R9.1 | R9 (pré-requisito do R9.6) | ✅ | Pacote aplicado em `telas`: "0 erro(s) e 0 aviso(s)"; `specs/material3-compose/` com `docs/`, `components/`, `fonts/` e o `.spec.json`. |
| R9.2 | R9 (pré-requisito do R9.6) | ✅ | A lista traz **Personalizado**, **Tamanho da seleção** (desabilitado) e, sob "Material 3 (Compose)", Celular · 360 × 800, Celular grande · 412 × 915, Tablet · 800 × 1280 e Desktop · 1440 × 900. `Configurações` 360 × 800 `#FFFFFF`, sem arquivo. Nome vazio: "Dê um nome ao container." e nada criado. |
| R9.3 | R9 (pré-requisito) | ✅ parcial | Paleta com os botões habilitados e o nome mudando com a seleção ("Adicionar na tela Configurações", "Adicionar dentro de Row"). Não contei os 50 tipos nem os selos **Container**. |
| R9.4 | R9 (pré-requisito) | ✅ parcial | Top app bar em (0, 0) e Row em (0, 100), desenhados (barra com "Início", menu, busca e três pontos). Não conferi o filtro **Ocultar sem anotação**. |
| R9.5 | R9 (pré-requisito) | ✅ | Os dois Buttons ficaram dentro do Row (`parentId` = o Row; "Salvar", lado a lado). **O texto do roteiro não bate:** clicar num trecho vazio do Row não o seleciona (achado 2); selecionei o Row pela Árvore. |
| R9.6 | | ✅ parcial | Espaçamento `8` (Enter); **clique no título de Detalhes** (foco em `SECTION`, fora do campo) e **`Alt+Shift+A`**: "Arrumado"; botões de 136 para 87 de largura em x 0 e 95 (8 de espaço). `Ctrl+Z` volta os dois botões **numa ação**; `Ctrl+Shift+Z` arruma de novo. O botão **Arrumar** dos Detalhes: "Nada a arrumar". **O item do menu de contexto do Row no canvas não executei:** o clique direito na parte vazia do Row caiu no container e o Chrome mostrou o menu nativo (achado 2). |
| R9.7 | | ✅ | `Text field` (X 40, Y 220) e `Button` (X 120, Y 340). **Ordem** do Row "2 de 4"; **Mover para a frente**: "3 de 4" e a Árvore acompanhou (Top app bar, Text field, Row, Button). Button em X 80, Y 205 (atravessa a borda do campo): "Pertence a Nenhuma", Ordem "4 de 4". **Mover para trás**: "3 de 4" (ainda **na frente** do campo); **mais uma vez**: "2 de 4", agora **atrás** do campo (capturas em `anexos/r9-7-*`). O texto do roteiro precisa dos dois cliques (achado 3). |
| R10.7 | | ✅ parcial | Catálogo › **Componentes** › **Biblioteca** `Material 3 (Compose)` › **Button** abre o diálogo; **Adicionar à tela** põe um Button no centro da tela `Configurações`, desenhado e selecionado, e **o diálogo continua aberto**; **Fechar** fecha. Com esse Button selecionado, o botão da Paleta **não se chama "Adicionar dentro de Button"**: chama-se "Adicionar na tela Configurações" (achado 4); mesmo assim o novo Button nasce com o mesmo `rect` e `Pertence a Button`. Disco: duas marcações novas com a anotação **Button**. Não executei a variante "tela fora de vista". |
| R8.1b | | não executado (precisa do dono) | Opcional; sem liberação do dono. |
| Visual: Privacidade (claro) | | ✅ | Avisos legíveis, interruptores alinhados, sem texto cortado e sem rolagem horizontal. `anexos/visual-privacidade-claro.png`. |
| Visual: Privacidade (escuro) | | ✅ | Idem no escuro (fundo `rgb(28, 32, 39)`, contraste bom). `anexos/visual-privacidade-escuro.png`. |
| Visual: Diagnóstico (claro) | | ✅ | **Imagens remotas** com as URLs e os motivos, sem texto cortado. `anexos/visual-diagnostico-claro.png`. |
| Visual: Diagnóstico (escuro) | | ✅ | Idem no escuro. `anexos/visual-diagnostico-escuro.png`. **Foco** do diálogo Configurações (que abriga a Privacidade): fechado por **Esc**, por **Fechar** e pelo **X**, o foco volta sempre ao botão **Configurações**, nos dois temas, nunca ao `body`. |

## Achados

### 1. Enter num campo de texto já em várias linhas grava `\n` no fim da URL

- Severidade: **média** (há contorno, mas quem não leu o guia tropeça)
- Build id e data: 2eb2da0 · 2026-11-02 (preview; o Image do pacote `material3-compose`)
- Passos para reproduzir (Enter pura, sem Shift, três vezes; projetos `remotas` e `telas`):
  1. Selecionar o **Image**; em **URL da imagem** (campo de uma linha, vazio) digitar `https://fabianofranca.github.io/mapping/preview/imagens-teste/foto.png` (70 caracteres) e apertar Enter. **Nenhum `\n`** (forma (a), `xdotool key Return`, e forma (b), `page.keyboard.press('Enter')`). **Mas** o campo troca de `INPUT` para `TEXTAREA` na hora e o **foco vai ao `body`**.
  2. Clicar no campo (agora `TEXTAREA`), selecionar tudo (`Ctrl+A`), digitar `http://127.0.0.1:8765/foto.png` e apertar Enter (com `xdotool key Return`, como uma pessoa, e também com `page.keyboard.press('Enter')`). O texto passa a `"http://127.0.0.1:8765/foto.png\n"` dentro do campo; o disco ainda tem a URL anterior.
  3. Clicar no título de **Detalhes** (sair do campo). O `mapping.json` grava `"url": "http://127.0.0.1:8765/foto.png\n"` (`revision` 11 para 12).
  4. O mesmo em outra anotação: confirmar a URL longa com Enter, clicar no campo, `Ctrl+End`, Enter e sair: `"…/foto.png\n"` no disco. A foto **carrega mesmo assim** (`componentImages` `1`), porque o analisador de URL descarta a quebra de linha; fica só o `\n` sujo no arquivo.
- Esperado: o roteiro (Preparo do R15 e R15.3) diz que o Enter confirma e que só Shift+Enter grava `\n`; "**Enter grava e o cursor continua no campo**" (seção 4 do guia e comentário do `CommitInput`).
- Observado: isso só vale enquanto o texto tem até 60 caracteres. Acima disso (`MULTILINE_MIN_LENGTH = 60`, `src/ui/FieldEditors.tsx`), depois da primeira confirmação o campo vira várias linhas, o foco cai no `body` e o Enter seguinte **quebra a linha**; sair do campo grava o `\n`. Toda URL `https` típica passa de 60 caracteres, então **qualquer troca de URL pelo teclado (clicar no campo, selecionar, digitar, Enter) cai nesse caso**; o R15.7, o R15.8 e o R15.11 trocam a URL assim.
- Reproduziu de novo? **sim** (três vezes, em dois projetos).
- Anexos: `anexos/telas-mapping.json` (último `url` com `\n`), `anexos/remotas-mapping.json`, `anexos/servidor.log`. Sugestão: tratar o campo de URL como de uma linha (sem a troca por `TEXTAREA`, ou o Enter confirma e o `trim()` tira a quebra do fim na gravação).

### 2. Roteiro R9.5 e R9.6: o Row é transparente e o clique nele seleciona o container

- Severidade: **baixa** (texto do roteiro; produto conforme o R9.4, que diz que o Row é transparente)
- Build id e data: 2eb2da0 · 2026-11-02
- Passos para reproduzir: no `telas`, com os dois Buttons no Row, selecionar o Row pela Árvore e clicar num trecho vazio dele no canvas (a direita dos botões); repetir com o botão direito.
- Esperado (R9.5): "Clique num trecho vazio do Row (a direita) para selecioná-lo de novo". R9.6: "com o botão direito sobre o Row no canvas, em **Arrumar**".
- Observado: o clique seleciona o **container** `Configurações` (Detalhes mostra "Configurações", 360 × 800 px), não o Row; o botão direito não abre o menu do canvas e o Chrome abre o seu menu nativo. Texto que deveria estar lá: "Selecione o Row **pela Árvore** (o Row é transparente: clicar nele no canvas seleciona o container)". O item "**Arrumar** no menu de contexto" não deu para executar; o relato anterior diz que o menu respondeu "Nada a arrumar", e não reproduzi (se o menu tem como alvo outra marcação, o roteiro precisa dizer qual).
- Reproduziu de novo? sim (3 cliques esquerdos e 2 direitos).
- Anexos: `anexos/r9-5-clique-no-row-seleciona-container.png` (container selecionado depois do clique no Row) e `anexos/r9-6-menu-nativo-no-lugar-do-menu-da-app.png`.

### 3. Roteiro R9.7: "Mover para trás o põe atrás do campo" precisa de dois cliques

- Severidade: **baixa** (texto)
- Build id e data: 2eb2da0 · 2026-11-02
- Passos para reproduzir: seguir o R9.4 a R9.7 num projeto novo; **Mover para a frente** no Row ("3 de 4"); Button solto em X 80, Y 205; **Mover para trás**.
- Esperado: o texto diz que **Mover para trás** "o põe atrás do campo".
- Observado: o Button está "4 de 4" (na frente de tudo); **um** clique o leva a "3 de 4" e ele **continua na frente** do Text field (que está em "2 de 4"); o **segundo** clique ("2 de 4") o põe atrás do campo. Texto que deveria estar lá: "**Mover para trás** até a **Ordem** do Button ficar menor que a do campo (dois cliques, depois do **Mover para a frente** do Row)".
- Reproduziu de novo? sim. Anexos: `anexos/r9-7-botao-3de4.png` e `anexos/r9-7-botao-2de4.png`.

### 4. Roteiro R10.7: não existe "Adicionar dentro de Button"

- Severidade: **baixa** (texto)
- Build id e data: 2eb2da0 · 2026-11-02
- Passos para reproduzir: no `telas`, **Adicionar à tela** o Button pelo Catálogo e fechar o diálogo; com esse Button selecionado, ver o botão do **Button** na aba **Paleta**.
- Esperado: o texto manda usar "**Adicionar dentro de Button**" e diz que a Paleta cria o novo botão "DENTRO do selecionado".
- Observado: o botão da Paleta se chama "**Adicionar na tela Configurações**" (também na dica). "Adicionar dentro de X" só aparece quando o selecionado desenha um componente **com slot** (Row, Box; `componentTarget`, `slotTargetName`). O Button não tem slot. O novo botão cai **dentro** do selecionado porque nasce no centro da vista (que a Árvore centraliza no selecionado) e, com o mesmo `rect`, a geometria o põe como filho (`Pertence a Button`; repeti com o Button solto em (80, 205): `rect` igual, `parentId` o selecionado). Texto que deveria estar lá: "Com esse Button selecionado, na aba **Paleta**, **Adicionar na tela Configurações** o **Button**: o botão nasce no centro da vista, que está sobre o selecionado, e fica **dentro** dele pela geometria (mesmo `rect`; Detalhes: Pertence a Button)".
- Reproduziu de novo? sim (duas vezes). Anexos: nenhum.

### 5. Roteiro R15.1, R15.9 a R15.11: o Chrome pede o `favicon.ico` e entra no `servidor.log`

- Severidade: **baixa** (texto; depende do ambiente: no relato anterior, no Windows, o log teve uma linha)
- Build id e data: 2eb2da0 · 2026-11-02
- Passos para reproduzir: R15.1, abrir `http://127.0.0.1:8765/foto.png` numa aba nova do Chrome.
- Esperado: "`servidor.log` tem **uma** linha, `GET /foto.png origin=none`"; mais adiante "2 linhas", "3 linhas".
- Observado: o log recebe também `GET /favicon.ico origin=none` (2 linhas), e só as linhas de `foto.png` contam os pedidos da app. Texto que deveria estar lá: contar com `grep -c foto.png servidor.log` em todos os passos (o R15.7 já faz assim), e no R15.1 dizer "`servidor.log` tem uma linha de `foto.png` (o Chrome pode somar uma de `/favicon.ico`)".
- Reproduziu de novo? sim (a aba de `foto.png` pede o favicon sempre que abre). Anexos: `anexos/servidor.log`.

### 6. Roteiro R15.8 e R15.9: falta a etapa "origem sem permissão" do Diagnóstico

- Severidade: **baixa** (texto)
- Build id e data: 2eb2da0 · 2026-11-02
- Passos para reproduzir: R15.7 (`http://127.0.0.1:8765/foto.png` com tudo desligado), depois ligar os dois interruptores do R15.8 e ler o Diagnóstico; depois **Permitir estas** (R15.9).
- Esperado (R15.9): "no R15.7 era 'endereço não aceito'; a razão é atualizada no lugar" para "não carregou".
- Observado: a razão é de fato atualizada no lugar, mas **duas vezes**: "endereço não aceito" (R15.7) → "**origem sem permissão**" (assim que os interruptores do R15.8 são ligados) → "**não carregou**" (depois de **Permitir estas**). Texto que deveria estar lá, no R15.8: "o **Diagnóstico** troca a razão dessa linha para 'origem sem permissão'".
- Reproduziu de novo? sim (ver os dois estados lidos no Diagnóstico em sequência na tela e no teste). Anexos: `anexos/r15-9-diagnostico-nao-carregou.png`.

## Regressões fora do alvo

- nenhuma (R0, R15.1 a R15.12, R9.1 a R9.7 e R10.7 sem ❌; `erro tratado` do Diagnóstico: "Nenhum erro registrado" o tempo todo).

## Observações (sem severidade)

- **Foco depois do Enter numa URL longa:** com a URL longa, depois do Enter o foco vai ao `body` (o campo foi trocado por um `TEXTAREA`), contra "o cursor continua no campo" (seção 4 do guia, `CommitInput`). Com URL curta (`http://127.0.0.1:8765/foto.png`), o foco **continua** no `INPUT`.
- **Diagnóstico "Imagens remotas" mantém a razão antiga:** no R15.10 a foto carregou (`componentImages` `1`), mas a linha `http://127.0.0.1:8765/foto.png: não carregou` continuou na lista (o título é "não foram mostradas nesta sessão"). A lista também guarda URLs trocadas durante a sessão (a de prévia `https://example.com/foto.jpg` do R15.2) e o **Limpar** só vale para os erros tratados (desabilitado nas imagens); a lista só zera ao recarregar a página.
- **R15.3 diz "(encurtada)":** a URL de 70 caracteres aparece inteira no Diagnóstico.
- **Detalhes do Row (visual, fora da lista):** o painel **Detalhes** do Row tem **barra de rolagem horizontal** e o seletor "Alinhamento vertical" (Top, CenterVertically, Bottom) aparece cortado ("Botto…"), com o painel na largura padrão. Fora da passada visual pedida; vale olhar numa próxima.
- **R0.4a:** o Chrome não pediu a permissão da pasta ao reabrir depois do F5 (o caso "se não pedir, siga").
- **R0.2:** esta versão do Chrome oferece só **Permitir** (sem "Permitir em todas as visitas").
- **Container no tema escuro:** o container `Configurações` continua branco (`#FFFFFF`, o dado do projeto); só a interface troca de tema.
- **Pedido de rede local do Chrome (R15.9):** nenhum apareceu (o AT-SPI foi consultado três vezes); o R15.9 e o R15.10 passaram sem ele.
- **Imagem remota do Pages:** carregou normalmente pelo proxy do ambiente (HTTP/2 200, `access-control-allow-origin: *`).

## O que atrapalhou

- **Preview com o build de outro PR:** abri o preview com `8359fc5` (`epic/testes-nuvem`). Disparei o Deploy do branch (execução `41443108573`), esperei o fim com um monitor de `curl` no `index.html` do preview e usei a faixa **Atualizar**. Enquanto o Deploy rodava, o dono liberou a build local, e fiz o R0 nela. O seguinte pede escolha de ambiente: a base local é `http`, então o `PAGES` do R15 ficaria `http` (consentimento e política de URL diferentes); por isso o R15 e o resto foram no preview `https`.
- **Seção 13 inexistente:** o pedido cita o "preparo da seção 13 do `docs/TESTING-COWORK.md`", mas o arquivo no commit `2eb2da0` termina na seção 12 (Imagens remotas). Usei o item 0 da seção 2 (montar a pasta e trazer o branch).
- **Ambiente (não são achados):** seletor GTK em inglês (Open/Save/Cancel) com os botões em posição fixa depois de `ctrl+l` (cliquei no centro do botão, nunca Enter); o "Salvar como" do Chrome acrescentou `.zip` ao nome já digitado (`remotas-export.zip.zip`); o `getByText('Row')` do Playwright pegou o texto do Catálogo e depois a dica "Ações de Button" em vez do item da Árvore (selecionar por `.tree-label`); `Ctrl+,` e os atalhos de painel não agem com o foco num campo de texto (usei o botão da engrenagem e cliquei no fundo antes); o `Limpar` do Diagnóstico não limpa as imagens (recarreguei a página); a faixa "Chrome for Testing…" reduz a altura útil (viewport 852 px).
- **Erros meus no caminho:** um `xdotool type` com o campo sem foco digitou no corpo da página (sem efeito: o `mapping.json` não mudou); um clique na Árvore que atingiu a dica "Ações de Button" deixou o Row selecionado e editei o Row (X/Y/ordem) em vez do Button; desfiz (Y 100 e **Mover para a frente**) e refiz no Button certo. Nada disso entra nos passos como achado.
- **Textos de roteiro que ficaram ambíguos:** R9.5 (clicar no Row transparente), R9.6 (menu de contexto do Row), R9.7 (quantos "Mover para trás"), R10.7 (nome do botão), R15.1/R15.9 (linhas do log com o favicon) e o Preparo do R15 sobre o Enter (só vale para campo de uma linha). As correções sugeridas estão nos achados 1 a 6.
