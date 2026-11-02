# Relato de teste — Mapping

- Modo: dirigido — reteste curto da etapa Exemplos enxutos (lista montada pelo dono: R15.1 a R15.12, o Enter de verdade no R15.2 e R15.3, R9.6 e R9.7, R10.7, R8.1b opcional), depois do R0 inteiro; sem interação
- Alvo: PR #273 (`epic/exemplos-enxutos` → `main`)
- Build id: 2eb2da0 · 2026-11-02 (esperado: 2eb2da0 · 2026-11-02; confere)
- Canal (como a app mostra): prévia (R15, R9, R10 e passada visual); estável no R0, que rodou na build local (ver "Forma de abrir")
- Forma de abrir:
  - **R15, R9, R10 e passada visual:** preview (`https://fabianofranca.github.io/mapping/preview/`). Ao abrir, o preview estava com `8359fc5 · 2026-11-02` (do `epic/testes-nuvem`). O testador disparou o **Deploy** do branch `epic/exemplos-enxutos` (execução `41443108573`, `workflow_dispatch`); quando terminou, a faixa **Atualizar** trouxe o `2eb2da0`.
  - **R0:** build local do `2eb2da0` (`npm run build`, canal `estável`) servida em `http://localhost:8080`; o R0.1 foi conferido de novo no preview. Os passos do R15 usam o preview em `https`, porque numa base `http` local o `PAGES` mudaria o sentido do R15.3 a R15.6.
- Navegador e versão: Chrome for Testing 153.0.8010.12 (Linux x64), janela 1600 × 1000 no Xvfb
- Sistema operacional: Linux (container do ambiente "Mapping - testes"), openbox
- DPR e viewport: DPR 1; viewport da página 1591 × 852; tema claro e escuro na passada visual, pt-BR
- Pasta de trabalho: `/home/user/work-test/` (`material3-compose/` com 105 arquivos, `material3-compose.zip`, `servidor-imagens/`, projetos `fumaca-web-2`, `remotas`, `telas`, `anexos/`)
- Passada visual pedida: Diagnóstico, Privacidade
- Ferramenta: agente Claude Code na nuvem; Chrome for Testing em Xvfb, controlado por CDP (Playwright), xdotool e AT-SPI; dialog-pilot: nenhum; MCP: não usado
- Estado prévio do navegador: perfil novo (sem projetos); Privacidade: nenhuma origem permitida, quatro interruptores desligados. Ao fim, a Privacidade voltou a esse estado e o tema voltou a **Sistema**.
- Data: 2026-11-02

## Resumo

- Passos: 31 linhas; **30 ✅** (alguns parciais, marcados na Observação), **0 ❌**, **1 não executado** (R8.1b, precisa do dono).
- Achados: bloqueia 0, alta 0, **média 1**, baixa 5 (todas do texto dos roteiros).
- Impede o uso com pessoas? **Não.** O achado médio tem contorno (sair do campo em vez de apertar Enter) e a imagem carrega mesmo com o `\n`, mas grava lixo na URL do `mapping.json`.
- **A correção do Diagnóstico funcionou:** no R15.9 a linha `http://127.0.0.1:8765/foto.png` passou de "endereço não aceito" (R15.7) para "origem sem permissão" (R15.8) e, depois de **Permitir estas**, para **"não carregou"**, na mesma linha e na mesma posição, sem duplicar.
- **Resposta à dúvida principal (o `\n` com a tecla Enter pura):**
  - **Campo de uma linha (vazio ou com até 60 caracteres): não grava `\n`.** Conferido com `xdotool type` + `xdotool key Return` à parte e com `page.keyboard.type` + `page.keyboard.press('Enter')`.
  - **Campo que já virou várias linhas (mais de 60 caracteres): grava `\n` no fim.** É o caso de toda URL `https` normal: ao confirmar, o campo troca de `INPUT` para `TEXTAREA` (`MULTILINE_MIN_LENGTH = 60`, `src/ui/FieldEditors.tsx`) e o foco vai ao `body`; dali em diante o Enter quebra a linha e, ao sair do campo, o `url` vai para o disco com `\n`. Reproduzido três vezes, sem Shift. Achado de produto (média).

## Passos

| Passo | Resultado | Observação |
| ----- | --------- | ---------- |
| R0.1 | ✅ | Build local `2eb2da0 · 2026-11-02`, canal estável; sem rolagem horizontal; **Ver os atalhos de teclado** abre a Ajuda em Atalhos e **Esc** fecha com o foco no botão **Configurações**. No preview, Sobre confere. |
| R0.2 | ✅ | `fumaca-web`: `mapping.json`, `.gitignore` (`backups/`) e `specs/notas/` completo; "Nenhuma imagem ainda" e **Pasta** na barra. Pedido de permissão aceito pelo AT-SPI ("Permitir"; esta versão do Chrome não ofereceu "em todas as visitas"). |
| R0.3 | ✅ | `cadastro.png` (484 × 450) entrou como `images/cadastro.png` (o WebP saiu maior, caso previsto). 1 container, 1 marcação, `revision` 2. Fechar volta sem perguntar; `fumaca-web` em **Projetos recentes** com **Pasta**. |
| R0.4a | ✅ | Depois do F5, **Abrir** abre sem seletor e sem pedido de permissão. A aba continuou de pé. |
| R0.4b | ✅ | Em 800 px só "Abra numa janela maior"; ao alargar o editor voltou igual, com a marcação selecionada; `markings` com 1 item. |
| R0.7 | ✅ | Pasta renomeada: aviso com **Localizar pasta…** e **Remover da lista**; depois de localizar `fumaca-web-2`, a linha mostra `fumaca-web` e `fumaca-web-2`; disco intacto. |
| R15.1 | ✅ | Servidor local; `http://127.0.0.1:8765/foto.png` mostra a imagem 96 × 96. O `servidor.log` ficou com 2 linhas: `foto.png` e `/favicon.ico` (achado 5). |
| R15.2 | ✅ | Projeto `remotas`, biblioteca aplicada (0 erros, 0 avisos), container `Tela`, **Image** pela Paleta. Depois de `Ana`, `Crop` e URL vazia: sem foto, sem faixa, `componentImages` 0, Incompletas 1; Privacidade sem origens e quatro interruptores desligados. Disco: `contentDescription` `Ana`, `contentScale` `Crop`, `url` `null`. |
| R15.3 | ✅ | **Enter de verdade, formas (a) e (b):** faixa de consentimento, foto ausente, 0 pedidos; Diagnóstico `…/foto.png: origem sem permissão` (URL inteira, não encurtada). Disco: `url` sem `\n`. Ver achado 1 para o segundo Enter. |
| R15.4 | ✅ | **Permitir estas**: foto com os quatro quadrantes, `componentImages` 1, 1 pedido; Privacidade lista `https://fabianofranca.github.io`; Sobre: "1 origens permitidas". |
| R15.5 | ✅ | Fechar e reabrir: foto sem faixa. Disco: URL como texto, sem `images/`; zip exportado com `mapping.json` e `specs/…`, 0 PNG. |
| R15.6 | ✅ | **Revogar**: "Nenhuma origem permitida neste navegador."; foto some e a faixa volta. |
| R15.7 | ✅ | Os três endereços: reservado, sem faixa, `servidor.log` com uma linha de `foto.png`; Diagnóstico "endereço não aceito" para cada. |
| R15.8 | ✅ | Interruptores http e rede local ligados: faixa "(sem criptografia, rede local)", nenhum pedido novo. O Diagnóstico já passa de "endereço não aceito" para "origem sem permissão" (achado 6). |
| R15.9 | ✅ | **Permitir estas**: um só pedido novo, sem nova tentativa; Diagnóstico passa de "origem sem permissão" para **"não carregou", na mesma linha, sem duplicar**. Nenhum pedido de rede local do Chrome. |
| R15.10 | ✅ | **Servidores sem CORS** ligado: foto aparece, um pedido novo (`origin=none`); desligado: reservado de novo. |
| R15.11 | ✅ | **Qualquer origem** ligado: foto sem faixa. `http://localhost:8765/foto.png`: faixa "(sem criptografia, rede local)"; **Agora não** esconde; log inalterado. Privacidade lista `http://127.0.0.1:8765`, não `localhost`. |
| R15.12 | ✅ | Interruptores desligados e origem revogada: Privacidade como no início; servidor parado (`ERR_CONNECTION_REFUSED`). |
| R9.1 | ✅ | Pacote aplicado em `telas`: 0 erros e 0 avisos; `specs/material3-compose/` completo. |
| R9.2 | ✅ | Lista com Personalizado, Tamanho da seleção (desabilitado) e os quatro tamanhos do pacote; nome vazio: "Dê um nome ao container." |
| R9.3 | ✅ parcial | Paleta com o nome do botão mudando com a seleção. Não contei os 50 tipos nem os selos **Container**. |
| R9.4 | ✅ parcial | Top app bar em (0, 0) e Row em (0, 100), desenhados. Não conferi **Ocultar sem anotação**. |
| R9.5 | ✅ | Os dois Buttons dentro do Row. O texto do roteiro não bate: clicar no Row vazio seleciona o container (achado 2). |
| R9.6 | ✅ parcial | Espaçamento 8; clique no título de Detalhes e `Alt+Shift+A`: botões de 136 para 87 em x 0 e 95; `Ctrl+Z` numa ação, `Ctrl+Shift+Z` refaz; **Arrumar** dos Detalhes: "Nada a arrumar". O menu de contexto do Row não foi executado (achado 2). |
| R9.7 | ✅ | Row "2 de 4"; **Mover para a frente**: "3 de 4". Button em X 80, Y 205: "Pertence a Nenhuma", "4 de 4"; **Mover para trás** duas vezes: "3 de 4" e "2 de 4", atrás do campo (achado 3). |
| R10.7 | ✅ parcial | **Adicionar à tela** põe o Button no centro de `Configurações`, selecionado, e o diálogo continua aberto. Com ele selecionado, o botão da Paleta é "Adicionar na tela Configurações" (achado 4); o novo nasce com o mesmo `rect` e `Pertence a Button`. Variante "tela fora de vista" não executada. |
| R8.1b | não executado (precisa do dono) | Opcional; sem liberação do dono. |
| Visual: Privacidade, claro e escuro | ✅ | Avisos legíveis, interruptores alinhados, sem texto cortado nem rolagem horizontal. |
| Visual: Diagnóstico, claro e escuro | ✅ | **Imagens remotas** com as URLs e os motivos, sem texto cortado. O foco do diálogo Configurações volta sempre ao botão **Configurações** (por Esc, Fechar e X), nos dois temas. |

## Achados

### 1. Enter num campo de texto já em várias linhas grava `\n` no fim da URL

- Severidade: **média** (há contorno, mas quem não leu o guia tropeça)
- Passos para reproduzir (Enter pura, sem Shift, três vezes; projetos `remotas` e `telas`):
  1. Selecionar o **Image**; em **URL da imagem** (campo de uma linha, vazio) digitar `https://fabianofranca.github.io/mapping/preview/imagens-teste/foto.png` (70 caracteres) e apertar Enter: nenhum `\n`. Mas o campo troca de `INPUT` para `TEXTAREA` e o foco vai ao `body`.
  2. Clicar no campo (agora `TEXTAREA`), `Ctrl+A`, digitar `http://127.0.0.1:8765/foto.png` e apertar Enter: o texto passa a `"http://127.0.0.1:8765/foto.png\n"` dentro do campo; o disco ainda tem a URL anterior.
  3. Clicar no título de **Detalhes** (sair do campo): o `mapping.json` grava `"url": "http://127.0.0.1:8765/foto.png\n"`.
  4. Em outra anotação: URL longa com Enter, clicar no campo, `Ctrl+End`, Enter e sair: `"…/foto.png\n"` no disco. A foto carrega mesmo assim, porque o analisador de URL descarta a quebra.
- Esperado: o Enter confirma e só Shift+Enter grava `\n` (seção 4 do guia e comentário do `CommitInput`).
- Observado: isso só vale com até 60 caracteres. Acima disso (`MULTILINE_MIN_LENGTH`), depois da primeira confirmação o campo vira várias linhas e o Enter seguinte quebra a linha. Toda URL `https` típica passa de 60 caracteres, então qualquer troca de URL pelo teclado cai nesse caso.
- Sugestão do testador: tratar o campo de URL como de uma linha, ou tirar a quebra do fim na gravação.

### 2. R9.5 e R9.6: o Row é transparente e o clique nele seleciona o container

- Severidade: **baixa** (texto do roteiro)
- Observado: clicar num trecho vazio do Row seleciona o container `Configurações`; o botão direito ali abre o menu nativo do Chrome. Texto que deveria estar lá: "Selecione o Row **pela Árvore**". O item **Arrumar** do menu de contexto não deu para executar.

### 3. R9.7: "Mover para trás" precisa de dois cliques

- Severidade: **baixa** (texto)
- Observado: o Button está "4 de 4"; um clique o leva a "3 de 4" (ainda na frente do Text field, que está em "2 de 4"); o segundo clique, "2 de 4", o põe atrás do campo.

### 4. R10.7: não existe "Adicionar dentro de Button"

- Severidade: **baixa** (texto)
- Observado: o botão da Paleta se chama "Adicionar na tela Configurações". "Adicionar dentro de X" só aparece para componente com slot (Row, Box). O novo Button cai dentro do selecionado porque nasce no centro da vista e, com o mesmo `rect`, a geometria o põe como filho.

### 5. R15.1, R15.9 a R15.11: o Chrome pede o `favicon.ico` e entra no `servidor.log`

- Severidade: **baixa** (texto; depende do ambiente)
- Observado: o log recebe também `GET /favicon.ico`; só as linhas de `foto.png` contam os pedidos da app. Texto que deveria estar lá: contar com `grep -c foto.png servidor.log` em todos os passos.

### 6. R15.8 e R15.9: falta a etapa "origem sem permissão" do Diagnóstico

- Severidade: **baixa** (texto)
- Observado: a razão é atualizada no lugar duas vezes: "endereço não aceito" (R15.7) → "origem sem permissão" (ao ligar os interruptores do R15.8) → "não carregou" (depois de **Permitir estas**).

## Regressões fora do alvo

Nenhuma (R0, R15.1 a R15.12, R9.1 a R9.7 e R10.7 sem ❌; Diagnóstico "Nenhum erro registrado" o tempo todo).

## Observações (sem severidade)

- Com a URL longa, depois do Enter o foco vai ao `body` (o campo foi trocado por um `TEXTAREA`), contra "o cursor continua no campo". Com URL curta o foco continua no `INPUT`.
- O Diagnóstico › Imagens remotas mantém a razão antiga depois que a imagem carrega (R15.10: a linha "não carregou" ficou), guarda URLs trocadas na sessão (a de prévia `https://example.com/foto.jpg`) e o **Limpar** só vale para os erros tratados; a lista só zera ao recarregar a página.
- R15.3 diz "(encurtada)", mas a URL de 70 caracteres aparece inteira no Diagnóstico.
- O painel **Detalhes** do Row tem barra de rolagem horizontal e o seletor "Alinhamento vertical" aparece cortado ("Botto…") na largura padrão. Fora da passada visual pedida.
- R0.4a: o Chrome não pediu a permissão da pasta ao reabrir depois do F5. R0.2: esta versão do Chrome oferece só **Permitir**.
- Nenhum pedido de rede local do Chrome apareceu no R15.9 e no R15.10. A imagem do Pages carregou normalmente pelo proxy do ambiente.

## O que atrapalhou

- O preview estava com o build de outro PR (`8359fc5`, do `epic/testes-nuvem`); o testador disparou o Deploy do branch e usou a faixa **Atualizar**.
- A seção 13 do `docs/TESTING-COWORK.md` não existia no `2eb2da0` (o arquivo terminava na 12); o testador usou o item 0 da seção 2.
- Ambiente: seletor GTK em inglês, "Salvar como" do Chrome acrescentando `.zip` ao nome já digitado, atalhos de painel que não agem com o foco num campo de texto, `Limpar` do Diagnóstico que não limpa as imagens, faixa "Chrome for Testing…" reduzindo a altura útil.

## Tratamento dos achados (EX4)

- **Achado 1 (corrigido):** `StringEditor` (`src/ui/FieldEditors.tsx`) tira a quebra de linha do fim ao gravar o campo de várias linhas; um Enter de sobra num texto longo, como uma URL, não vai mais ao `mapping.json`. Quebras do meio ficam; um texto só de quebras grava `null`. Testes em `tests/components/TypedFields.test.tsx`. O foco que vai ao `body` e a troca por `TEXTAREA` ficam como estão (desenho das etapas anteriores).
- **Achados 2 a 6:** textos do `docs/TESTING.md` corrigidos (Row pela Árvore, dois cliques em Mover para trás, nome do botão da Paleta no R10.7, contagem do log por `grep -c foto.png`, as duas trocas de razão do Diagnóstico e a explicação do Enter).
- **R8.1b:** continua "não executado (precisa do dono)".
