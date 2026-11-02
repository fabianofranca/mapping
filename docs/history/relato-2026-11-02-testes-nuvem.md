# Relato de teste — Mapping

- Modo: dirigido — lista de passos: R0 e R2 (TN2, fecha a lista da rodada dirigida da nuvem)
- Build id: 87aa4cb · 2026-11-02 (confere com o commit da mensagem; compilado localmente com `npm ci && npm run build`)
- Canal (como a app mostra): estável
- Forma de abrir: build local servido em `http://localhost:8080` (nada de preview)
- Navegador e versão: Google Chrome for Testing 153.0.8010.12 (`/opt/pw-browsers/chromium`)
- Sistema operacional: Linux 6.18.44 (container da nuvem), Xvfb :99 1600×1000, openbox
- DPR e viewport: DPR 1; innerWidth 1592 (janela 1600×1000)
- Pasta de trabalho: `~/mapping-testes/2026-11-02-testes-nuvem/`
- Ferramenta: Claude Code na nuvem (Xvfb, Playwright por CDP, xdotool, AT-SPI); sem MCP nesta rodada (R0 e R2 não pedem)
- Estado prévio do navegador: perfil limpo (`apoio/profile` novo)
- MCP: `dist-mcp/mapping-mcp.js --version` = 0.12.0, gerado localmente do commit 87aa4cb; sha256 n/a (sem Release)
- Data: 2026-11-02
- Tempo por roteiro: R0 ~25 min (boa parte no contorno do seletor, ver "O que atrapalhou"); R2 ~8 min

## Resumo

- Passos: 12 no total — 12 ✅, 0 ❌, 0 não executados (R0: R0.1, R0.2, R0.3, R0.4a, R0.4b, R0.7; R2: R2.1 a R2.6).
- Achados por severidade: bloqueia 0, alta 0, média 0, baixa 0.
- Impede o uso com pessoas? Não.
- Ressalvas de cobertura (não são achados): o console da aba não foi lido (sem extensão; só o Playwright); em R2.6 não medi a ordem exata "diálogo fecha depois que a linha some" (conferi o estado final 1 s depois).

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1  | —                | ✅        | Tela inicial com Começar, Novo projeto, Abrir pasta, Abrir zip; lateral com Projetos, Guia interativo, Ajuda, Configurações. Sobre: `Versão: 87aa4cb · 2026-11-02`, canal estável, formato 13; sem barra de rolagem horizontal no diálogo. "Ver os atalhos de teclado" troca Configurações pela Ajuda, na seção "Atalhos de teclado"; Esc fecha e o foco volta ao botão Configurações da lateral. |
| R0.2  | —                | ✅        | Pasta vazia `fumaca-web` pelo seletor GTK real + permissão pelo AT-SPI ("clicou Permitir"). Diálogo "Criar projeto nesta pasta?" com nome vazio → Criar. Editor com "Nenhuma imagem ainda" e **Pasta** na barra. Disco: `mapping.json`, `.gitignore` (`backups/`), `specs/notas/` (`notas.spec.json`, `components/nota.json`, `components/tabela.json`, `docs/nota.md`, `docs/tabela.md`); sem `images/`. |
| R0.3  | —                | ✅        | `cadastro.png` (484×450) pelo seletor real; marcação desenhada e **Salvo**; Fechar projeto volta à tela inicial sem perguntar e `fumaca-web` aparece em Projetos recentes com selo **Pasta**. Disco: `images/cadastro.png` (a app guardou `.png`, não `.webp`: o WebP saiu maior, permitido pela seção 4); `containers` 1, `markings` 1, `revision` 2; `containers[0].width/height` = 484/450. |
| R0.4a | —                | ✅        | Depois do F5, `fumaca-web` no topo com selo **Pasta**; **Abrir** abriu sem seletor e **sem pedido de permissão** (o AT-SPI respondeu "nenhum botão de permitir"). Aba continuou de pé; uma só aba no CDP. |
| R0.4b | —                | ✅        | Com a marcação selecionada, janela estreitada a 800 px (innerWidth 792): só o aviso "Abra numa janela maior… O projeto continua aberto e as alterações continuam sendo salvas." Delete (xdotool) não excluiu nada. Ao alargar (innerWidth 1592), o editor voltou igual com a seleção mantida. Disco: `markings` 1, `revision` 2 (inalterada). |
| R0.7  | —                | ✅        | Com o projeto fechado, `fumaca-web` → `fumaca-web-2` no disco. **Abrir** → "Pasta indisponível" ("A pasta "fumaca-web" não foi encontrada (ou não tem mais o mapping.json)…") com Cancelar, Remover da lista, Localizar pasta…. Localizar pasta… + `fumaca-web-2` + permissão → projeto abre; a linha mostra `fumaca-web` e embaixo `fumaca-web-2`. **Remover da lista** esvazia a lista ("Nenhum projeto ainda"). Disco: `fumaca-web-2` com `.gitignore`, `specs/`, `images/cadastro.png`, `mapping.json` (1 container, 1 marcação, revision 2). |
| R2.1  | —                | ✅        | Novo projeto `Local` → editor com **Neste dispositivo** e **Alterações não exportadas** na barra de status. |
| R2.2  | —                | ✅        | `cadastro.png` adicionado; **Formulário** e **Título** desenhados e nomeados; anotação `User` com par `name` = `string` na Camada 1 (Salvo). **Alterações não exportadas** continuou na barra. |
| R2.3  | —                | ✅        | Exportar › Baixar: "Local.zip está pronto." com nome e tamanho (Arquivo zip · 17,1 KB). Cancelar o "Salvar como" (`alt+c`) → o diálogo da app continuou aberto; fechado, **Alterações não exportadas** continuou. Baixar de novo e salvar em `Local.zip` → o diálogo fechou e o aviso sumiu. Na tela inicial, `Local` com selo **Neste dispositivo** e sem aviso. Zip: `mapping.json`, `images/cadastro.png`, `specs/notas/…` (12 entradas). |
| R2.4  | —                | ✅        | Abrir zip › `Local.zip`: abriu como projeto novo neste dispositivo, com a imagem, as marcações Formulário e Título e a anotação `User` (`name` = `string`). Depois de fechar, a lista mostra dois `Local` (12:22 e 12:20, distinguidos por **Último uso**). |
| R2.5  | —                | ✅        | Abri o `Local` mais recente e exportei como `Local-2.zip` (`test -e` antes). `zip-R2.3/` e `zip-R2.5/` têm os mesmos arquivos e o **mesmo md5 em todos**, inclusive o `mapping.json` (nem `revision` nem datas mudaram). |
| R2.6  | —                | ✅        | Excluir no `Local` de **Último uso** mais antigo (12:20): `alertdialog` "Excluir projeto?" ("…será apagado deste dispositivo, com todas as imagens. Isso não pode ser desfeito."); depois, só a linha de 12:22. Diálogo fechado; foco em **Abrir** da linha restante (a última); `Shift+Tab` e `Tab` mantêm o foco nesse **Abrir**, com `:focus-visible` verdadeiro. |

## Achados

Nenhum.

## Regressões fora do alvo

- nenhuma (só R0 e R2 foram executados; nada fora deles foi observado).

## Observações (sem severidade)

- Ao abrir um zip (R2.4/R2.5), o projeto aberto não mostrou **Alterações não exportadas** (o guia não diz o que esperar nesse caso; só o R2.1 e o R2.2 falam do aviso). Registro só como dado.
- O Chrome for Testing mostra a barra "destinado apenas a testes automatizados"; não atrapalhou.

## O que atrapalhou

- **Seletor GTK com lista de autocompletar (R0.7).** Ao digitar o caminho de uma pasta que **tem filhos** (`fumaca-web-2/` com `images/` e `specs/`), a lista de autocompletar abre (janela "chromium" de ~48 px) e o `alt+o` não faz nada. Pela receita 5, um `Escape` fecha só a lista, mas aqui ele **apagou o campo** do caminho. Na primeira tentativa, o `Escape` seguido de `alt+o` fez o Chrome abrir o diretório pai (home), recusado com "Não é possível abrir esta pasta porque ela contém arquivos do sistema"; clicar em **Escolher uma pasta diferente** (AT-SPI) reabriu o seletor. **Contorno que funcionou:** digitar o caminho, **clicar no botão Open do GTK por coordenada** (xdotool `mousemove`+`click`; o primeiro clique só fecha a lista e mantém o caminho no campo) e então `alt+o`. Sugestão para a receita 5: documentar esse caso (pasta com conteúdo) e o contorno.
- **`ctrl+l` fora do seletor.** Quando o seletor não estava em foco, o `ctrl+l` + `xdotool type` foram para a **barra de endereço** do Chrome (confirmado em captura); confira `xdotool search` antes de digitar.
- **`alt+s` no "Salvar como" (R2.3).** Na primeira exportação real, o `alt+s` logo depois de digitar o caminho não salvou; um segundo `alt+s` salvou. Nas demais exportações a ordem digitar → `alt+s` funcionou direto (com `sleep` de 2 s).
- **Títulos dos seletores:** o de "Abrir zip" é "Abrir arquivo" (singular), diferente do de "Adicionar imagens" ("Abrir arquivos"); a receita 5 só cita o segundo.
- **Menu "Ações do projeto":** os itens não têm `role="menuitem"` (o Playwright não os acha por esse papel); localizei pelo texto ("Fechar projeto").
- Passos R0.4b: janela estreitada com `xdotool windowsize` (o Chrome na tela virtual aceita), sem extensão.
