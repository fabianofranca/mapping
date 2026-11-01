# Relato de teste — Mapping — Imagens remotas, rodada dirigida de rede local, http: e CORS (R15.1, R15.2, R15.8–R15.12)

- Modo: dirigido — seção 12 do TESTING-COWORK.md (roteiro **R15**): R0.1 (só o build id), R15.1 (versão nova, servidor no computador do Chrome), R15.2, R15.8, R15.9, R15.10, R15.11 e R15.12. Os demais passos do R15 já tinham passado na rodada de 2026-10-31 (`relato-2026-10-31-imagens-remotas.md`) e não foram refeitos.
- Build id: 6162705 · 2026-10-31 (= o esperado)
- Canal (como a app mostra): prévia
- Forma de abrir: preview https://fabianofranca.github.io/mapping/preview/, aberto pelo link clicado na aba de apoio. O preview já estava no build esperado (não precisei de Deploy); a faixa "Nova versão disponível" ficou o tempo todo e **não** foi usada.
- Repositório testado: PR #264 (`pull/264/head`), commit `68bcb7f` ("R15.1: servidor de imagens Node no computador do Chrome"); `scripts/servidor-imagens.mjs` existe.
- Navegador e versão: Chrome (extensão Claude in Chrome); número da versão não medido nesta rodada (a anterior registrou 156.0.0.0)
- Sistema operacional: Windows (win32 x64), Claude Desktop 4.4212.0, Node presente no Windows (o `.cmd` rodou; versão não medida) (o `device_bash` é uma VM Linux com Node 22; o servidor rodou no Windows, pelo `.cmd`)
- DPR e viewport: DPR 1,1; innerWidth 1531 (janela do Chrome na largura da tela)
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-31-rede-local` (`servidor-imagens/`, `remotas/`, `repo/`, `anexos/`)
- Ferramenta: agente com extensão Claude in Chrome; dialog-pilot (versão não informada); controle do computador (Explorador de Arquivos, nível "click"); shell `device_bash` (VM); sem MCP, sem Claude Code
- Estado prévio do navegador: perfil já usado. **Privacidade antes de começar: "Nenhuma origem permitida neste navegador." e os quatro interruptores desligados** (qualquer origem, http, rede local, servidor sem CORS); Mostrar setas ligado; Mostrar componentes sobre fotos desligado. Projetos recentes de rodadas anteriores (remotas de 31/10 20:01, Loja ×vários, Sugestões Kotlin, espaco, principal, Telas…). `preview:mapping.reviewResume` existia (v2, lista `seen` longa). Nada foi limpo.
- Data: 2026-10-31
- Tempo por roteiro: preparo (repo, guias, acesso ao computador) ≈ 12 min; R15.1 ≈ 8 min (inclui a navegação pelo Explorer); R15.2 ≈ 8 min; R15.8–R15.12 ≈ 15 min (o R15.9 custou a repetição)

## Falhas e pendências (no topo)

**Nenhum passo ❌ e nenhum achado ALTO.** Nenhuma das quatro condições de "pare e avise" ocorreu (ver Resumo). Há **uma ressalva que o dono precisa ler**:

| #   | Passo         | Situação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | R15.9         | **A primeira tentativa não gerou a 2ª linha no `servidor.log`** (achado 1, RI3, média). Ao clicar em **Permitir estas**, o Chrome abriu o aviso de acesso à rede local do próprio Chrome ("fabianofranca.github.io quer…"); o pedido da imagem ficou parado até a app desistir aos **20 004 ms** (status 0, nunca chegou ao servidor, que eu provei vivo com um `/ping`). Aceitei o aviso, mas a app **não tenta de novo** nesse endereço: o Diagnóstico ficou sem "não carregou" e a foto não veio. Refiz o passo (recarreguei a app com a permissão do Chrome já concedida): aí o servidor recebeu **um** pedido com `origin=https://fabianofranca.github.io`, sem nova tentativa, e o Diagnóstico mostrou "não carregou". O comportamento de segurança está correto; o que **não** observei é a transição exata "clicar em Permitir estas → 1 pedido" sem o aviso do Chrome no meio (a repetição entrou pelo projeto reaberto com a origem já permitida). |
| 2   | Estado do Chrome | Aceitei o aviso do Chrome de acesso à rede local para `fabianofranca.github.io` (o guia manda aceitar). **Essa permissão do Chrome continua concedida** (não é a da Privacidade da app, que voltou ao estado inicial). Se quiser desfazer, é nas configurações do site no Chrome. |

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1 | — | ✅ | Configurações › Sobre: `Versão: 6162705 · 2026-10-31`, Canal: prévia, formato 13, "Imagens remotas: 0 origens permitidas". (Só o build id, como pedido.) |
| R15.1 | RI1 | ✅ | Servidor subiu **no Windows**: copiei `servidor-imagens.mjs` e `foto.png` (conferido com `cmp`) para `servidor-imagens/` e criei `iniciar-servidor.cmd` (`node servidor-imagens.mjs`, CRLF). Duplo clique no Explorer pelo controle do computador abriu o "Prompt de Comando". No Chrome, `http://127.0.0.1:8765/foto.png` mostrou a imagem de quatro quadrantes (título "foto.png (96×96)"). `servidor.log`: **1 linha** `GET /foto.png origin=none` (mais uma `GET /favicon.ico origin=none`, do próprio Chrome, que não conta no `grep foto.png`). O `curl -sI` do Pages **não foi rodado** (o proxy da shell barra com 403; o R15.11 mostrou a foto do Pages carregando, status 200). |
| R15.2 | RI1 | ✅ | Pasta nova `remotas`, projeto criado, **Pessoas** aplicada ("1 camada(s) criada(s)"), container `Tela` 360 × 800 `#FFFFFF`, Avatar da aba **Paleta**, Nome `Ana`. Reservado (círculo cinza + "Ana"); sem faixa; `data-component-images` `0`; 0 pedidos a `foto.png`; Privacidade inicial. Disco: `specs/pessoas/` e `specs/notas/`; no `mapping.json`: `"nome": "Ana"`, `"foto": null` (o guia diz "não há `foto`"; observação 1). |
| R15.8 | RI2 | ✅ | `Foto` = `http://127.0.0.1:8765/foto.png` (com os interruptores desligados: sem faixa, 0 pedidos). Liguei **http** e **rede local**: apareceu a faixa "Este projeto tem imagens de http://127.0.0.1:8765 (sem criptografia, rede local)…", `data-component-images` `0`, 0 pedidos no Chrome e **`servidor.log` continuou com 1 linha** (esperado). Captura: `anexos/R15.8-faixa-http-rede-local.jpg`. |
| R15.9 | RI3 | ✅ (com ressalva — ver falha 1) | Final: reservado (`data-component-images` `0`), **2 linhas** (a nova `GET /foto.png origin=https://fabianofranca.github.io`), **um só pedido** e nenhuma nova tentativa depois de 7 s; Chrome registra o pedido com status 0 em 8 ms (CORS recusado); Diagnóstico: `http://127.0.0.1:8765/foto.png: não carregou`. Capturas: `anexos/R15.9-reservado-nao-carregou.jpg` (e `R15.9-tentativa1-diagnostico.jpg`, da tentativa que ficou presa). |
| R15.10 | RI3 | ✅ | **Mostrar imagens de servidores sem CORS** ligado: foto redonda com os quatro quadrantes (vermelho/verde em cima, azul/amarelo embaixo, em zoom 156%), `data-component-images` `1`, **3 linhas** (a nova `origin=none`, a tentativa sem `crossOrigin`; nenhuma além dela). Desligado de novo: o reservado voltou (`0`) e o log ficou em 3. Captura: `anexos/R15.10-foto-aparecendo.jpg`. |
| R15.11 | RI3 | ✅ | `Foto` = Pages + `imagens-teste/foto.png`: faixa do Pages (nada pedido). Com **qualquer origem** ligado a foto do Pages apareceu **sem faixa** (`data-component-images` `1`, 1 pedido, 200). `Foto` = `http://localhost:8765/foto.png`: **faixa com "sem criptografia, rede local"** (a rede local continuou pedindo o consentimento próprio, mesmo com "qualquer origem" ligado); **Agora não** escondeu a faixa, reservado, 0 pedidos a `localhost`, **log continuou em 3 linhas**. Privacidade: lista `http://127.0.0.1:8765` e **não** lista `localhost`. Captura: `anexos/R15.11-faixa-localhost.jpg`. |
| R15.12 | RI1–RI3 | ✅ | Desliguei qualquer origem, http e rede local (o de CORS já estava desligado) e revoguei `http://127.0.0.1:8765`: "Nenhuma origem permitida neste navegador.", quatro interruptores desligados, Sobre "0 origens permitidas"; projeto fechado. `http://127.0.0.1:8765/parar` mostrou "parado" (log: `GET /parar`) e `http://127.0.0.1:8765/foto.png` passou a dar página de erro do Chrome. |

## Achados

### 1. Pedido de rede local do Chrome estoura os 20 s da app e a imagem não tenta de novo

- Achado de origem: RI3
- Severidade: média (sugestão; o dono decide) — não expõe nada e o consentimento continua valendo, mas deixa a foto ausente até recarregar
- Build id e data: 6162705 · 2026-10-31
- Passos para reproduzir:
  1. Servidor local sem CORS de pé em `http://127.0.0.1:8765`; projeto com Avatar, `Foto` = `http://127.0.0.1:8765/foto.png`; interruptores **http** e **rede local** ligados; a permissão de rede local do Chrome ainda **não** concedida a `fabianofranca.github.io`.
  2. Clicar em **Permitir estas** na faixa.
  3. O Chrome abre "fabianofranca.github.io quer…"; levei mais de ~20 s para aceitar (cada passo meu tem latência de segundos).
  4. Ler `performance.getEntriesByType('resource')` e o `servidor.log`.
- Esperado: depois de aceitar o aviso do Chrome, a app pede a imagem (ou mostra um motivo claro) e o log ganha a linha.
- Observado: a entrada de recurso do Chrome tem duração 20 004 ms, status 0, e o servidor **não** recebeu nada (só o `/ping` de prova chegou). Aceitar o aviso depois não dispara novo pedido; **Revogar** e **Permitir estas** de novo também não (sem entrada nova de recurso); o Diagnóstico não registrou "não carregou". Só ao **reabrir o projeto** (com a origem ainda permitida) saiu um pedido novo, que chegou ao servidor.
- Reproduziu de novo? Parcial: o travamento aconteceu uma vez (único momento em que o aviso do Chrome apareceu); a ausência de nova tentativa depois de Revogar/Permitir de novo reproduziu (1 vez).
- Anexos: `anexos/R15.9-tentativa1-diagnostico.jpg`

## Regressões fora do alvo

Nenhuma encontrada (esta rodada só cobriu os passos de segurança; R10, R8 e os demais do R15 ficaram de fora de propósito).

## Observações (sem severidade)

1. `foto` fica `null` no `mapping.json` quando vazio; o guia (R15.2) diz "não há `foto`" (repete a observação da rodada anterior).
2. O Diagnóstico mantém linhas velhas depois de a causa sumir: "endereço não aceito" (R15.8 em diante, mesmo com os interruptores ligados), "origem sem permissão" da URL do Pages mesmo depois de "qualquer origem" a ter mostrado, e "não carregou" para a URL que o R15.10 já mostrava. Sugere-se limpar a linha quando a foto aparece (repete a observação 2 da rodada anterior).
3. A URL `http://127.0.0.1:8765/foto.png` ficou "não carregou" no Diagnóstico mesmo no cenário esperado (R15.9); o texto não diz que o motivo é falta de CORS. Seria mais claro para quem ligar o interruptor depois.
4. Com a origem já permitida, **abrir o projeto** dispara o pedido na hora (foi assim que o R15.9 fechou); só o que o guia descreve como "Permitir estas → 1 pedido" não coincide com isso quando o projeto é reaberto.
5. O localizador do Chrome ("find") devolveu "(on)" para um interruptor que estava desligado (R15.10); conferi pelo estado real antes de clicar. Ruído da ferramenta, não da app.
6. A faixa do preview "Nova versão disponível. Atualizar" ficou o tempo todo, apesar de o build já ser o esperado (6162705). Pode ser só um build mais novo do preview; não cliquei.

## O que atrapalhou

- **O duplo clique no `.cmd` funcionou.** O Explorer fica em nível "click" (só clique), então não dá para digitar o caminho: naveguei por cliques (pasta fixada `2026-10-23-epic-marcacoes` → subir para `mapping-testes` → rolar → `2026-10-31-rede-local` → `servidor-imagens`), ~6 ações. Duplo clique em pasta e em arquivo funcionaram. O "Prompt de Comando" abriu; o `/parar` encerrou o servidor (não conferi se a janela do prompt fechou sozinha).
- **O R15.1 novo ficou claro**, com duas lacunas: (a) não diz como chegar à pasta no Explorer sem digitar (sugestão: pedir a pasta de trabalho num atalho/fixada, ou abrir o `iniciar-servidor.cmd` com `computer_open_application`/atalho); (b) o `curl -sI` do Pages não faz sentido nesta shell (403 do proxy) e o guia já prevê, mas a "Esperado" mistura isso com a prova da imagem.
- **O controle do computador precisou de duas rodadas**: primeiro "ainda não ligado" (o dono ligou e confirmou), depois o `resolve` devolveu duas entradas com o mesmo `bundleId` e a primeira tentativa de `request_access` foi recusada por "entrada não resolvida"; passei só a entrada com o nome exato (`File Explorer`) e funcionou. Ao pedir acesso, o Chrome e outros apps são **escondidos** até liberar o controle (`computer_release_lock`); o guia podia avisar.
- **O seletor de pasta só abriu depois do truque do link outra vez**: ao fechar a aba do servidor (`foto.png`), o Chrome devolveu o foco à aba de apoio, e o `select_folder` respondeu "Nenhum diálogo apareceu". Fechei a aba antiga do app e reabri pelo link clicado (conforme o apêndice A). Dica para o guia: no R15.1, abrir `foto.png` na **mesma** aba do app ou fechar a aba do servidor antes e refazer o truque.
- **Dois cliques reais em Configurações, no começo, não abriram o diálogo**; o `click()` programático abriu (`isTrusted: false`) e, depois, os cliques reais funcionaram. Medi `elementFromPoint` (era o botão) e o foco (`hasFocus` true); a causa não ficou clara. Registro por transparência.
- **Aviso do Chrome de rede local**: não consegui ler o texto dele (`inspect_dialog` não achou diálogo em 3 s); aceitei com `accept_permission_prompt` como o guia manda, supondo ser o de acesso à rede local. O aviso só apareceu na primeira tentativa do R15.9 e nunca mais (a permissão ficou concedida).
- **Pacing do agente × 20 s da app**: a latência entre eu clicar e aceitar o aviso do Chrome já estoura o limite da app (achado 1). Em quem testa à mão isso também pode acontecer.
- Passo ambíguo no R15.11: "ligue qualquer origem… depois ponha a Foto em localhost… **Agora não**": o guia não diz que a faixa do Pages aparece **antes** de ligar o interruptor; conferi isso extra, não atrapalhou.
- Dica: o `grep -c foto.png` exclui o `favicon.ico` que o Chrome pede ao abrir `foto.png` em aba (a linha extra do log do R15.1).

## Resumo

- Passos: 8 (R0.1, R15.1, R15.2, R15.8, R15.9, R15.10, R15.11, R15.12): **8 ✅** (o R15.9 com ressalva), **0 ❌**, 0 não executados (o `curl` do Pages dentro do R15.1 não foi rodado; ver passo).
- Achados por severidade: bloqueia 0, alta 0, média 1 (achado 1, RI3), baixa 0; 6 observações.
- Condições de achado ALTO: **nenhuma ocorreu** — (1) nenhum pedido a `foto.png` sem consentimento (R15.8: 0 pedidos e log em 1 linha; R15.11 `localhost`: log em 3 linhas); (2) a rede local não foi aceita sem o consentimento próprio da origem (faixa "rede local" nos dois endereços, 127.0.0.1 e localhost); (3) nenhuma imagem de servidor sem CORS apareceu com o interruptor desligado (R15.9: reservado, `0`); (4) "qualquer origem" ligado **não** liberou a rede local (o `localhost` ainda pediu consentimento e não ganhou pedido).
- Impede o uso com pessoas? Não. Só o achado 1 merece decisão do dono (resposta do app quando o aviso do Chrome demora).

## Resíduos

- Na pasta de trabalho: `servidor-imagens/` (com o `servidor.log` de 6 linhas e o `.cmd`), `remotas/` (projeto de teste com o `mapping.json` e `specs/`), `repo/` (clone do PR #264; os avisos de `.lock` do git não afetaram a leitura) e `anexos/` (capturas).
- Em **Projetos recentes** da app (preview) ficou mais uma entrada `remotas` (a desta rodada).
- Permissão do Chrome de rede local concedida a `fabianofranca.github.io` (falha 2).
- Todas as abas do grupo do teste foram fechadas; servidor parado.
