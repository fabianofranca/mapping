# Relato de teste — Mapping — etapa Imagens remotas (RI1–RI3)

- Modo: dirigido — seção 12 do TESTING-COWORK.md (roteiro **R15** do guia; o pedido dizia "R14.1 a R14.12", mas R14 é "Sugestões no campo de texto") + regressão R10.1–R10.4, R8.1b e R8.2
- Build id: 6162705 · 2026-10-31 (= último commit do branch `epic/imagens-remotas`)
- Canal (como a app mostra): prévia
- Forma de abrir: preview https://fabianofranca.github.io/mapping/preview/; o preview estava com outro build (`e2655c5`, PR #260, e depois `f034a3a`); disparei o Deploy do branch pela página do GitHub (Deploy #475, execução 41249077520). `gh workflow run` falhou (token inválido).
- Navegador e versão: Chrome 156.0.0.0 (Claude in Chrome)
- Sistema operacional: Windows (win32 x64), Claude Desktop 4.4212.0
- DPR e viewport: 1,1; 1531 × 786
- Pasta de trabalho: C:\Users\fabia\mapping-testes\2026-10-31-imagens-remotas
- Ferramenta: agente com extensão Claude in Chrome, dialog-pilot (versão não informada) e shell `device_bash` (**VM Linux, não o Windows**); sem MCP, sem Claude Code
- Estado prévio do navegador: perfil já usado; Privacidade: "Nenhuma origem permitida neste navegador." e os quatro interruptores desligados (Mostrar setas ligado; Mostrar componentes sobre fotos desligado). Projetos recentes de rodadas anteriores (Sugestões Kotlin, espaco, principal, Loja ×3, Telas…).
- Data: 2026-10-31

## Falhas e pendências (no topo)

| #   | Passo                        | Situação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | R15.8, R15.9, R15.10, R15.11 | **Não executados (servidor local inalcançável).** O `python3 -m http.server` do R15.1 roda na VM da shell; o Chrome do Windows não alcança o `127.0.0.1` dela (sonda de imagem deu erro; log sem linhas novas). Subir o servidor no Windows pelo controle do PC não foi possível (terminais são "só clique"). Pedi a você que subisse; não subiu até o fim. **Estes são exatamente os passos de segurança da rede local / CORS: ficam pendentes e precisam de nova rodada.** |
| 2   | Capturas R15.10 e R15.11     | Não existem (passos não executados).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Nenhuma falha de segurança observada nos passos executados: **nenhum pedido a `foto.png` sem consentimento** (R15.3 e R15.7 conferidos pela medição de recursos do Chrome — 0 pedidos — e, no R15.7, pelo estado `data-component-images` 0); nada de imagem gravada no projeto ou no zip (R15.5).

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1 | | ✅ | Build id em Configurações › Sobre; atalhos → Ajuda; Esc devolve o foco; sem barra horizontal. |
| R0.2 | | ✅ | `fumaca-web`: mapping.json, .gitignore (backups/), specs/notas/ completo. |
| R0.3 | | ✅ | images/cadastro.webp; 1 container, 1 marcação, revision 2; fechar sem perguntar; selo Pasta. |
| R0.4a | | ✅ | Reabriu sem seletor e sem pedido de permissão. |
| R0.4b | | ✅ | 713 px: aviso "Abra numa janela maior"; ao alargar a marcação continua selecionada; disco com 1 marcação. |
| R0.7 | | ✅ | Aviso Pasta indisponível, Localizar pasta → `fumaca-web-2`; Remover da lista. |
| R15.1 | RI1 | ✅ (com ressalva) | Servidor local 200, image/png, sem ACAO; curl ao Pages = 403 do proxy (previsto; o R15.4 prova a imagem). **O servidor ficou numa VM** (ver falhas). |
| R15.2 | RI1 | ✅ | Avatar com reservado cinza e "Ana"; sem faixa; `data-component-images` 0; Privacidade inicial; `specs/pessoas/` no disco, `nome` = Ana. Obs.: no disco o valor `foto` aparece `null` (o guia diz "não há foto"). |
| R15.3 | RI1 | ✅ | Faixa com a origem, "Agora não" / "Permitir estas"; reservado; 0 pedidos; Diagnóstico com "origem sem permissão". Captura anexa. |
| R15.4 | RI1 | ✅ | Faixa some, foto redonda de 4 quadrantes, `data-component-images` 1, 1 pedido; Privacidade lista a origem; Sobre "1 origens permitidas". Captura anexa. |
| R15.5 | RI1 | ✅ | Reaberto sem faixa. Disco: URL como texto em `foto`; sem `images/` nem PNG; zip (`remotas-export.zip`, 8141 bytes) só com mapping.json e specs/. |
| R15.6 | RI1 | ✅ | Revogar → "Nenhuma origem permitida"; foto some, reservado, `data-component-images` 0, faixa volta. |
| R15.7 | RI2 | ✅ (com ressalva) | Os três endereços → reservado, sem faixa, `data-component-images` 0, Diagnóstico "endereço não aceito". **A prova pelo `servidor.log` não vale** (servidor inalcançável); usei a medição de recursos do Chrome (0 pedidos a `127.0.0.1`/`192.168.0.10`). |
| R15.8 | RI2 | não executado (servidor local inalcançável) | |
| R15.9 | RI2 | não executado (servidor local inalcançável) | |
| R15.10 | RI3 | não executado (servidor local inalcançável) | |
| R15.11 | RI3 | não executado (servidor local inalcançável) | |
| R15.12 | RI1–RI3 | ✅ (parcial) | Quatro interruptores desligados, "Nenhuma origem permitida", projeto fechado, idioma Português. Porta 8765 do Windows nunca foi aberta; a da VM foi encerrada. |
| R10.1 | | ✅ | Abrir biblioteca → Catálogo "Material Design 3 (baseline)", "0 erro(s) e 42 aviso(s)", 15 componentes. |
| R10.2 | | ✅ | Busca `chip` / `zzz` / vazio e setas conferidos. |
| R10.3 | | ✅ | Button: documento, propriedades (4 linhas), código ("Nenhuma plataforma declarada…"), origens, galeria. |
| R10.4 | | ✅ | Label "Confirmar compra", Variant `outlined`; Largura 1000 → 240 e 10 → 48; Altura 500 → 80 e 5 → 40; dica "Tamanho de 48 × 40 a 240 × 80."; com 48 × 40 aparece "conteúdo maior que a caixa" (esperado); **Restaurar valores** → Label, filled, 83 × 40 e a imagem volta exatamente à de antes (data URL de 5230 caracteres). |
| R8.1b | | ✅ | Loja "Neste dispositivo" (revisão de rodada anterior, não do R4 desta rodada): Continuar, "Somente leitura", selos, Conflito `Topo`/Nome, Banner promoção hachurado, Botão Pagar com avisos de item trancado; tudo legível no tema escuro. O sistema já usa tema escuro; o R8.1a (Claro → Escuro, marcação `Teste R8`) não era do alvo e não foi feito. |
| R8.2 | | ✅ | English (US): Configurações, Privacidade, Sobre, revisão, botões ("Continue", "Exit review", "Apply accepted") e faixa de consentimento ("This project has images from…", "Not now" / "Allow these") sem português. Em português ficam só dados (nomes Loja/Topo/Botão Pagar, rótulos da biblioteca "pessoas"). Voltei para Português. |

## Regressões fora do alvo

Nenhuma encontrada.

## Observações (sem severidade)

1. `foto` fica `null` no `mapping.json` quando vazio; o guia diz "não há `foto`" (R15.2).
2. O Diagnóstico mantém a linha "origem sem permissão" da URL depois de ela ser permitida (R15.4), até a lista ser limpa.
3. Campo Foto: Enter confirmou no R15.3, mas no R15.7 inseriu quebra de linha; só Tab confirmou. Inconsistência.
4. A faixa de consentimento em janela estreita quebra o texto em muitas linhas (origem `https://fabianofranca.github.io` quebrada no meio).
5. O Avatar vem com Nome "Ana Souza" por padrão; o guia diz `Ana` (digitado, sem problema).
6. Aviso do export zip tem diálogo titulado "Aviso".

## O que atrapalhou

- O pedido citava "R14.1 a R14.12"; no guia as Imagens remotas são R15.1–R15.12 (R14 é Sugestões no campo de texto). Executei o R15.
- **R15.1 pressupõe a shell no computador do dono**; aqui `device_bash` é uma VM e o `127.0.0.1` dela não é o do Windows. Isso derrubou R15.8–R15.11 e enfraqueceu a prova do R15.7 (log do servidor). O guia deveria dizer como subir o servidor no Windows (ou aceitar um servidor Node/PowerShell iniciado pela pessoa como [pessoa]).
- Terminais são "só clique" no computer use; não dá para digitar o comando.
- A prévia estava com outro build; sem token do `gh`, o Deploy só saiu pela página do GitHub.
- `Ctrl+=` é bloqueado pela ferramenta (usei `KeyboardEvent` sintético); curl ao Pages dá 403 do proxy.
- O guia (R8.1b) pressupõe a revisão do R4 da mesma rodada; usei a Loja de 24/10.
- R0.1 não cita os botões "Abrir projeto de exemplo" e "Abrir biblioteca" da tela inicial.

## Tempo por roteiro

Preparo do ambiente e pasta (cloning, Deploy) ≈ longo (várias paradas por pedido de acesso); R0 ≈ 20 min; R15.1–R15.7 ≈ 40 min; R10 ≈ 15 min; R8 ≈ 10 min; espera do servidor ≈ 20 min sem resultado.

## Resumo

- Executados: 29 passos ✅ (2 com ressalva), 0 ❌, 4 não executados (R15.8–R15.11).
- Achados: 0 altos, 0 médios; 6 observações; 1 pendência de ambiente (servidor local no Windows).
- Impede uso? Não, nos passos executados. **A cobertura de segurança da rede local e do CORS (RI2/RI3) continua por testar.**

## Resíduos na pasta de trabalho

`_clone-incompleto-ignorar/` (clone que falhou), `servidor-imagens/servidor.log` (1 linha, do `curl` do R15.1), `remotas/`, `fumaca-web-2/`, `remotas-export.zip`. Aba extra do GitHub (Deploy) aberta no Chrome.
