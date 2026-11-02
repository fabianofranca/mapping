# Prompt do testador — Claude Code na nuvem

Prompt vivo de uma sessão do **Claude Code na nuvem**, no ambiente **"Mapping - testes"**, que executa os roteiros de [`docs/TESTING.md`](TESTING.md) num Chrome de verdade (tela virtual Xvfb), **sem o dono no computador**. Vale para todas as rodadas até ser trocado aqui. O Cowork ([`docs/TESTING-COWORK.md`](TESTING-COWORK.md)) continua para o Windows/Edge do dono e para os roteiros sob demanda.

O dono (ou o agente da última fase de um épico) manda uma mensagem pronta, com o **branch** e o **commit** a testar:

- **Dirigido por lista de passos:** "Leia `docs/TESTING-NUVEM.md` e execute no modo dirigido: R0 e R2. Branch `epic/x`, commit `abc1234`."
- **Dirigido por achados de um relato:** "… no modo dirigido: os achados 2 a 5 de `docs/history/relato-2026-10-11.md`. Branch `epic/x`, commit `abc1234`."
- **Dirigido pelas fases de um plano:** "… no modo dirigido: as fases 7.1 e 7.2 de `docs/history/PLAN-etapa-7.md`. Branch `epic/x`, commit `abc1234`."
- **Completo:** "Leia `docs/TESTING-NUVEM.md` e execute o modo completo. Branch `epic/x`, commit `abc1234`." (R0 a R17, sem o RP; a seção 5 do prompt do Cowork diz a ordem)

- **Aviso ao coordenador:** a mensagem pode terminar com "Coordenador: `session_…`" (a sessão do agente da fase). Quando o PR do relato estiver aberto, mande a essa sessão, com `send_message`, uma linha com o número do PR, o total de ✅/❌ e o caminho do relato. Sem essa linha, o coordenador não fica sabendo do PR.

A rodada é **sempre sem interação**: o dono não está, então não pergunte nada. O que faltar e impedir a rodada vai para o relato. Os roteiros sob demanda (**RP**, **RF**, **RA**) nunca rodam na nuvem e nem aparecem no relato.

## Primeiros 10 minutos

Cada item tem uma conferência; só passe ao próximo se ela bater. Todos os comandos e scripts estão no apêndice A do guia, subseção "Diálogos nativos na nuvem (Xvfb)" (`S` abaixo é a pasta `apoio/` do item 3).

1. Leia este arquivo, o apêndice A do `docs/TESTING.md` e as seções 4 a 7 do `docs/TESTING-COWORK.md`. **Confira:** você sabe o modo, o alvo, o branch e o commit da mensagem.
2. `git fetch origin` e `git switch <branch>` (o clone da sessão já é o repositório). **Confira:** `git log -1 --format=%h` é o commit da mensagem.
3. Crie a pasta de trabalho `~/mapping-testes/<AAAA-MM-DD>-<alvo>/` (fora do clone; `<alvo>` é o épico ou o assunto, sem acento) com a subpasta `apoio/` (perfil do Chrome, `env`, logs). **Confira:** `ls ~/mapping-testes/<AAAA-MM-DD>-<alvo>/apoio` responde.
4. `npm ci && npm run build` e sirva `dist/` em `http://localhost:8080` (receita 1 da nuvem). **Confira:** `curl -sI http://localhost:8080/` responde `200`.
5. `npm run build:mcp` e `node dist-mcp/mapping-mcp.js --version`. **Confira:** a versão é a de `mcp/version.ts` do commit.
6. Suba a tela virtual, o D-Bus, o AT-SPI e o Chrome (receita 2 da nuvem, nesta ordem). **Confira:** `xdotool search --onlyvisible --name 'Mapping'` acha a janela.
7. Confira a aba: `curl -s localhost:9222/json/list | grep '"url"' | grep -v 'chrome[:-]'`. **Confira:** exatamente uma linha, `http://localhost:8080/`. Com mais de uma, feche o Chrome pelo CDP e suba de novo (receita 3 da nuvem).
8. Configurações › Sobre, pelo Playwright por CDP (receita 4 da nuvem). **Confira:** o build id é `<commit> · <data>` e o commit é o da mensagem (a data é a do dia do build, não do commit). Se não for, pare: o build está velho.
9. Só então comece o R0. Antes de cada diálogo nativo, o clique na app vem primeiro e a receita depois.

**Quando algo não acontece, meça antes de repetir.** Dois cliques iguais sem efeito pedem uma captura (`import -window root`) e a lista de janelas do `xdotool`, não um terceiro clique.

## Ambiente

O ambiente é configurado **fora do repositório**, em claude.ai (configurações do ambiente), uma vez:

- **Nome:** `Mapping - testes` (o agente do épico o acha por esse nome com `list_environments`).
- **Rede:** Limitada, com `fabianofranca.github.io` e os gerenciadores de pacotes liberados.
- **Script de configuração:** `apt-get update -q && apt-get install -y -q xdotool at-spi2-core python3-pyatspi openbox imagemagick`
- **Variável de ambiente:** `LANGUAGE=pt_BR:pt` (a app abre em pt-BR; o seletor de arquivo do GTK continua em inglês: **Open**, **Cancel**, **Save**).

O Chrome é o Chrome for Testing em `/opt/pw-browsers/chromium`. Se faltar algo (ex.: `xdotool` ou `openbox` não instalados, sem `/opt/pw-browsers/chromium`), **pare, não improvise** e escreva no relato o que faltou: é erro do ambiente, não achado da app.

## Build local, não o preview

A app testada é a que você compila do commit da mensagem (`npm ci && npm run build`), servida em `http://localhost:8080`. Por quê: o commit é o certo (sem disputa pelo preview, que é um só); rodadas de épicos diferentes correm juntas; e `localhost` é contexto seguro, então o seletor de pasta, a permissão e o "Salvar como" se comportam como no Pages.

- O **R15** usa o Pages só como servidor da foto de teste: `PAGES` = `https://fabianofranca.github.io/mapping/` (a versão principal, que serve `imagens-teste/foto.png` com CORS). O servidor local do R15.1 sobe pela shell (receita 10 da nuvem).
- O que depende de `https:` (service worker, faixa "Nova versão disponível", app instalado) está nos roteiros sob demanda, que a nuvem não roda.
- Nunca dispare o Deploy nem abra o preview.

## MCP

O servidor MCP é o **compilado do mesmo commit** (`dist-mcp/mapping-mcp.js`), usado pelo cliente por stdio (`scripts/testing/mcp-stdio-client.mjs`, receita 9 da nuvem), com o workspace da seção 6 do guia apontando para esse arquivo. A release candidate (download da Release, `.sha256`, `setup.sh`) só entra quando a mensagem pedir, para conferir o artefato distribuído.

## Como agir

Siga o apêndice A do guia, subseção "Diálogos nativos na nuvem (Xvfb)": a tabela de equivalência diz qual receita faz o papel de cada ferramenta do dialog-pilot. As seções 4 (como agir), 5 (o que executar), 6 (conferir e registrar) e 7 (relato) do `docs/TESTING-COWORK.md` valem iguais, com estas diferenças:

- **Sem extensão do navegador:** a página é operada pelo Playwright por CDP (`connectOverCDP`), onde o Cowork diz "a extensão".
- **Sem dialog-pilot:** onde o Cowork diz `select_folder`, `open_file`, `save_file`, `accept_permission_prompt` ou `cancel_dialog`, use a receita equivalente da tabela do apêndice A.
- **Sem `get_device_info`**, sem pasta conectada: a pasta de trabalho é a do item 3.
- **Sem aba de apoio nem link clicado:** a aba da app é uma só e já está em foco (o Chrome roda numa tela virtual, sem o dono usando outra janela).
- **Sem pedir nada ao dono:** a lista do modo dirigido vai no começo do relato (e na conversa), sem pedir confirmação; passo que só a pessoa faria fica "não executado (precisa do dono)" e segue.
- **Sem aviso de espera:** o dono não está; escreva só o que ajuda o relato.

## Relato e PR

1. Grave o `relato.md` na pasta de trabalho **a cada roteiro concluído** (template da seção 10 do guia; seção 7 do prompt do Cowork). No cabeçalho, em **Ferramenta**: "Claude Code na nuvem (Xvfb, Playwright por CDP, xdotool, AT-SPI)", e o MCP por stdio. Capturas e `mapping.json` dos ❌ ficam em `anexos/` da pasta de trabalho.
2. No fim, volte ao clone e crie o branch `teste/<alvo>-<AAAA-MM-DD>` **a partir do branch em teste**. Copie o relato para `docs/history/relato-<AAAA-MM-DD>-<alvo>.md` e **só as capturas dos ❌** para `docs/history/anexos/relato-<AAAA-MM-DD>-<alvo>/` (ajuste os links do relato).
3. Commit, push e PR **com base no branch em teste** (o épico). Descrição: **Resumo** (total de passos, ✅, ❌, achados por severidade, se algum impede o uso com pessoas), **Como testar** (n/a: é um relato) e **Decisões** (o que decidiu sozinho, o que o ambiente impediu).
4. **Avise o coordenador** (se a mensagem trouxe o id dele): `send_message` com "PR #N aberto: X ✅, Y ❌, relato em `docs/history/…`". Não mescle o PR; quem mescla é o coordenador.
5. Mande o `relato.md` com a ferramenta de envio de arquivos da sessão, se houver, e cole o **Resumo** na conversa.

## Nunca

- **Enter** num seletor de arquivo ou de pasta, nem num "Salvar como" do GTK: ele vaza para o pedido de permissão (foco em "Não permitir") e a app recebe `AbortError`. Use `alt+o` (Open) e `alt+s` (Save).
- Registrar um listener de `filechooser` (nem `page.on('filechooser')` nem `waitForEvent('filechooser')`) ou usar `setInputFiles` como atalho: com o listener o Playwright intercepta o seletor e ele não abre de verdade. Só se o seletor real falhar **duas vezes**, e registre em "O que atrapalhou".
- Mais de uma aba da app (navegue a mesma com `page.goto`).
- `pkill -f chrome` (mata a própria shell e faz o Chrome restaurar abas); feche pelo CDP.
- Salvar por cima de um arquivo existente (o GTK sobrescreve sem perguntar): confira com `test -e` antes.
- Usar o **preview** ou o Deploy.
- Editar código do repositório: só o relato e os anexos entram no PR.
- Usar pastas fora de `~/mapping-testes/`, além do clone.
- Dar como testado o que não observou: passo que não puder ser executado fica "não executado (motivo)".
- Mandar arquivos para fora do ambiente (a app não faz rede; você também não precisa).
