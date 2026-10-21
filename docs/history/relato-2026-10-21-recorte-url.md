# Relato de teste — Mapping

> Rodada dirigida do Cowork sobre o épico `epic/recorte-url` (build `564b1e7 · 2026-10-21`, MCP 0.7.0-rc.1): R0, R1, seção 6, R5.1, R5.1a e os extras E1 e E2 do prompt do coordenador. Arquivo histórico: o relato como o testador o entregou, sem alterações. Leitura do coordenador: 35 ✅, nenhum achado; a ressalva do E1 (`image/png`) era erro do prompt, porque a imagem do `principal` é WebP; o contorno do R5.1a (a `url` morre com o processo do cliente stdio) virou a conferência da `url` embutida no próprio cliente stdio (`urlCheck`), descrita no apêndice A do guia.

- Modo: dirigido — lista de passos: R0, R1, seção 6 do guia com a pre-release `mcp-v0.7.0-rc.1`, R5.1 e R5.1a; extras E1 e E2 (achado de origem "0.7.0"). Passada visual: nenhuma.
- Build id: 564b1e7 · 2026-10-21
- Canal (como a app mostra): prévia
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`), aba aberta pelo link clicado; o preview tinha `dee8666 · 2026-10-20` e a faixa **Atualizar** trouxe o build esperado (sem Deploy).
- Navegador e versão: Chrome 155.0.0.0 (Windows NT 10.0, x64)
- Sistema operacional: Windows (win32 x64), máquina galaxy-book-ff
- DPR e viewport: DPR 1,25; 1514 × 695 na aba de apoio; 1516 × 616 na aba do app; janela restaurada
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-21-recorte-url-rodada\` (clone do branch `epic/recorte-url` em `…\2026-10-21-recorte-url\`)
- Ferramenta: agente com extensão do navegador (Claude in Chrome) e shell numa VM com a pasta montada; dialog-pilot (versão não exposta pelas ferramentas); pedidos ao MCP: stdio (`scripts/testing/mcp-stdio-client.mjs`)
- Estado prévio do navegador: perfil usado em rodadas anteriores. Recentes já existentes: importacao (2×), antiga (neste dispositivo), migracao, migracao10, principal (2×), telas (2×), principal-reparo, Loja (3×), vazio e outros. `localStorage['preview:mapping.reviewResume']` = `{"v":2,"seen":[…]}` (lista longa de propostas já vistas).
- MCP: `0.7.0-rc.1` (`node tools/mapping-mcp.js --version`); origem: pre-release `mcp-v0.7.0-rc.1` do GitHub (`mapping-mcp.js` e `.sha256` baixados por `curl`); sha256 conferido: sim (`sha256sum -c` → OK; `294efde5…0391f`). Node v22.23.2.
- Data: 2026-10-21
- Tempo: ≈ 35 min no total (00:00–00:35, relógio local); não medi por roteiro.

## Resumo

- **Falhas: nenhuma.** Nenhum passo ❌, nenhum achado com severidade.
- Passos: 35 no total, 35 ✅ (R0: 6; R1: 24; seção 6: 1; R5.1, R5.1a, E1, E2), 0 ❌, 0 não executados. **E1 é ✅ com ressalva:** lida ao pé da letra, a expectativa (`Content-Type: image/png`, baixar um PNG) não bate, porque a imagem do projeto é `cadastro.webp` e o servidor serve `image/webp`. Julguei defeito do texto do roteiro, não do servidor; a decisão de reclassificar é sua.
- Achados por severidade: bloqueia 0, alta 0, média 0, baixa 0.
- Impede o uso com pessoas? Não.
- Build `564b1e7 · 2026-10-21` confirmado no preview. MCP `0.7.0-rc.1`, sha256 OK. Console sem erros e Diagnóstico sem erros ao fim do R5.1.

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1  |                  | ✅        | Esc na Ajuda devolve o foco ao botão **Configurações** (com clique real; com `.click()` de script o foco foi para "Dispensar", artefato do método). Sem rolagem horizontal no diálogo. Build `564b1e7 · 2026-10-21`. |
| R0.2  |                  | ✅        | `select_folder` com `permissionButton: "Permitir"`; campo "Nome do projeto" vazio (nome só como placeholder); disco: `mapping.json` (revision 0, schema 11) e `.gitignore` com `backups/`; sem `images/`. |
| R0.3  |                  | ✅        | Imagem entrou como `images/cadastro.webp` (484 × 450); 1 marcação `rect` {31,155,358,36}; revision 2. Fechar volta à tela inicial, `fumaca-web` no topo com selo **Pasta**. |
| R0.4a |                  | ✅        | Reabriu direto, **sem pedido de permissão**; aba de pé. |
| R0.4b |                  | ✅        | 787 px de largura: aviso "Abra numa janela maior"; ao alargar (1516), marcação continua e selecionada; disco com 1 marcação. |
| R0.7  |                  | ✅        | Aviso **Pasta indisponível** com o texto esperado; **Localizar pasta…** + `select_folder` em `fumaca-web-2`; linha mostra `fumaca-web` / `fumaca-web-2`; **Remover da lista** tirou a linha; disco: `mapping.json` (1 imagem, 1 marcação), `.gitignore`, `images/cadastro.webp`. |
| R1.1  |                  | ✅        | Passo conferido na tela e no disco. |
| R1.2  |                  | ✅        | Passo conferido na tela e no disco. |
| R1.3  |                  | ✅        | Passo conferido na tela e no disco. |
| R1.4  |                  | ✅        | Passo conferido na tela e no disco. |
| R1.5  |                  | ✅        | Passo conferido na tela e no disco. |
| R1.6  |                  | ✅        | Passo conferido na tela e no disco. |
| R1.7  |                  | ✅        | Passo conferido na tela e no disco. |
| R1.8  |                  | ✅        | Passo conferido na tela e no disco. O seletor **Marcação pai** só lista o pai depois que o rect está contido nele; ao desenhar, o pai não vinculou sozinho e foi definido manualmente. |
| R1.9  |                  | ✅        | Passo conferido na tela e no disco. |
| R1.10 |                  | ✅        | Passo conferido na tela e no disco. |
| R1.11 |                  | ✅        | Passo conferido na tela e no disco. |
| R1.12 |                  | ✅        | Passo conferido na tela e no disco. |
| R1.13 |                  | ✅        | Foi clicado o link de **Idade** (← Input input_idade). Conferido na tela e no disco. |
| R1.14 |                  | ✅        | Passo conferido na tela e no disco. |
| R1.15 |                  | ✅        | Passo conferido na tela e no disco. Diálogo de remover linha é `role=alertdialog` ("Referências vão quebrar"). |
| R1.16 |                  | ✅        | Button **Cadastrar**: onClick (`submit`, `/usuarios`, parâmetro `origem`=`cadastro`) e onHold (`track`, duração 500 vinda por padrão). Input **E-mail**: onChange (`validate`, regra `email`). Disco (revision 64): as 3 anotações na camada Eventos, com `parentAnnotationId` da anotação do dono. |
| R1.17 |                  | ✅        | Em **Idade**, camada Eventos, **+** › onClick: diálogo "Dono do onClick" com o texto "…esta marcação precisa de um dono que aceite onClick (Button ou Image)…"; nada criado (camada continua "Nenhuma anotação nesta camada"). |
| R1.18 |                  | ✅        | Formulário › Endpoints › Endpoint: `metodo` POST, `path` /v1/usuarios, `request` User, `response` User, `timeoutMs` 10000 (padrão). Disco conferido. |
| R1.19 |                  | ✅        | Eventos ativa, as outras 5 desmarcadas, **Ocultar sem anotação**: ficam visíveis só E-mail, Cadastrar e o contorno do Formulário (selecionado); Título, Nome e Idade somem. |
| R1.20 |                  | ✅        | **Mostrar todas**, camadas reativadas, texto no canvas ligado. A ferramenta do navegador recusa `Ctrl+=` ("zoom de página não suportado"); disparei o `keydown` (`ctrlKey`, `=`) por script e o zoom do canvas foi de 46% para 58%. Registro como limitação da ferramenta. |
| R1.21 |                  | ✅        | Lista › **Só incompletas**: só o **Título** (Componentes › Text, `id` vazio); a aba Incompletas mostra 1. |
| R1.22 |                  | ✅        | Exportar › Baixar com `save_file` (`principal.zip` 18,3 KB; arquivo de 18 768 bytes) em `zip-R1.22.zip`; descompactado em `zip-R1.22/`: `mapping.json` (revision 64, igual ao disco no momento, 11 anotações, 7 camadas), `images/cadastro.webp`, `specs/sdui.json`, `specs/modelo-dados.json`. |
| R1.23 |                  | ✅        | Remover Modelo de dados › Converter em camadas livres: resumo "2 anotação(ões) afetada(s): Classes 1, Endpoints 1" e "1 referência(s) de outras anotações vão ficar quebradas". Disco (revision 65): Classes e Endpoints com `type: null` e `entries`; sem `specs/modelo-dados.json`. **Desfazer**: voltou tipado, `specs/modelo-dados.json` de volta (revision 66). |
| R1.24 |                  | ✅        | Remover SDUI › Apagar dados: "8 anotação(ões) afetada(s): Componentes 5, Eventos 3". Disco (revision 67): camadas só Camada 1, Model, Classes, Endpoints; sem `sdui.json`. **Desfazer**: 7 camadas, Componentes 5 e Eventos 3 de volta, `sdui.json` de volta (revision 68). |
| Seção 6 |               | ✅        | Pre-release `mcp-v0.7.0-rc.1` baixada do GitHub (`mapping-mcp.js`, 4 019 398 bytes, e `.sha256`); `sha256sum -c` → OK; `node mapping-mcp.js --version` → `0.7.0-rc.1`. Repositório de teste em `…\rodada\repo-mcp\` (`git init`, `tools/mapping-mcp.js`, `design/mapeamentos/principal`, `assets/` com `cadastro.png` e `sdui.json`, `.mcp.json` com `--root design/mapeamentos --root assets`). |
| R5.1  |                  | ✅        | **Tela:** o `principal` foi aberto como pasta dentro de `design/mapeamentos/` (**Abrir pasta** + `select_folder`); `Ctrl+C` na marcação **Nome**: aviso "Referência copiada" e, colado num campo temporário, `mapping://principal/m/73e98371 (cadastro.webp › Formulário › Nome)` (`cadastro.webp`, como a app guardou); sem pedido de permissão do navegador e Diagnóstico "Nenhum erro registrado". **Cliente stdio:** `list_projects` traz o `principal` (revision 68); `resolve` reconhece a marcação Nome (rect 32,154,348×29); `get_marking` traz o caminho legível e o Input `input_nome`; o recorte veio (`get_marking_image` crop, 348×29). **Disco:** `mapping.json` idêntico antes e depois (`cmp`), revision 68. |
| R5.1a |                  | ✅        | `get_marking_image` crop: resposta com `url` (`http://127.0.0.1:37245/…png`) e `markdown`. `curl -sI` → 200, `Content-Type: image/png`, 882 bytes; o PNG baixado (348×29) abre e é byte a byte igual ao `.png` gravado pelo cliente. Nada gravado no projeto (sem `crops/`; só `.gitignore`, `images/`, `mapping.json`, `specs/`); mesma revision. App normal, sem aviso de projeto alterado, sem erro no console. (O `curl` foi feito por um gancho numa cópia do cliente, ver "O que atrapalhou".) |
| E1    | 0.7.0            | ✅ com ressalva | `get_image_file` da imagem Cadastro: resposta com `url` (`http://127.0.0.1:33091/…webp`) e `markdown`. `curl -sI` → 200, mas `Content-Type: image/webp` (a expectativa fala em `image/png`); o arquivo baixado é WebP válido (13 128 bytes, o mesmo tamanho do `images/cadastro.webp`). Token trocado (primeiro caractere do primeiro trecho do caminho) → **404**. Nada gravado na pasta do projeto; `mapping.json` idêntico. A ressalva: a imagem do projeto é `.webp`, então o tipo `image/png` esperado não se aplica; leitura literal = não bate. |
| E2    | 0.7.0            | ✅        | `--no-http` acrescentado aos `args` no `.mcp.json`; `get_marking_image` crop repetido: a resposta vem **sem `url` e sem `markdown`** e a imagem continua vindo (o cliente grava o PNG 348×29, 882 bytes, em `IMGDIR`). `.mcp.json` restaurado (cópia de segurança; `cmp` igual). |

## Achados

Nenhum.

## Regressões fora do alvo

Nenhuma.

## Observações (sem severidade)

- A pasta do R0.7 foi renomeada pela shell com `mv` dentro da pasta conectada (funcionou).
- Selo **Modelo de d…** truncado na lista Camadas quando ela fica estreita.
- Ao desenhar uma marcação dentro de outra, o pai não é vinculado automaticamente: o seletor **Marcação pai** só lista o pai depois que o rect está contido nele.
- O layout de Detalhes desloca quando as mensagens de erro de campo somem (ex.: R1.16, R1.18); clique por coordenada antes da conferência por captura errou o alvo uma vez (sem efeito).
- O servidor MCP ignora a extensão na `url` (trocar `.png` por `.pna` ainda responde 200); o que protege é o token do caminho (trocá-lo dá 404).
- O cliente stdio grava sempre `<ferramenta>-<n>.png`, mesmo quando a imagem é WebP (`get_image_file` devolve WebP com extensão `.png`).
- A lista de recentes mantém entradas antigas de mesmo nome (`principal` 2×); o `principal` novo convive com elas.

## O que atrapalhou

- A mensagem não trouxe número de PR nem existia clone com `docs/` em `~/mapping-testes`: clonei o repositório inteiro (`git clone`) e fiz checkout de `origin/epic/recorte-url` (HEAD `564b1e7`), em vez do `git fetch … pull/<n>/head` do item 0 da seção 2. A permissão de exclusão foi pedida porque o primeiro clone ficou com `.lock` que a VM não apaga.
- O `cadastro.png` foi gerado com Chromium headless (1×) fora da máquina e copiado com `device_commit_files`; o arquivo gravado tem sha256 e tamanho (17 257 bytes) diferentes do original da VM (11 487 bytes), mas é um PNG válido de 484 × 450 e a app o aceitou.
- **E1:** o texto pede `image/png` e `cadastro.png`, mas o projeto guarda `images/cadastro.webp`; o passo só bate se a imagem do `principal` for PNG. Sugestão: dizer "`image/webp` (ou o tipo do arquivo em `images/`)".
- **R5.1 / R5.1a:** o texto diz que o `curl` roda depois do pedido, mas o cliente stdio encerra o servidor ao fim das chamadas (e a `url` morre com ele). Usei uma cópia do cliente, `…\rodada\client-curl.mjs`, que roda `curl -sI` e o download dentro do processo, com o servidor vivo; a lógica de chamada é a do original.
- **R1.20:** a extensão do Chrome recusa `Ctrl+=` (zoom de página); o guia já prevê o contorno por `keydown` por script, que usei.
- **R5.1 (referência copiada):** o clipboard do sistema não estava acessível sem ligar o computer use; colei num `textarea` temporário injetado na página (removido depois) e li o valor.
- **Ambiente:** a pre-release não pôde ser baixada pela VM de nuvem (GitHub só por proxy, sem acesso ao repositório); baixei pelo shell da máquina com `curl`.
- Pastas de trabalho que ficam: `repo-mcp\`, `img-out\`, `img-out-nohttp\`, `mcp-dl\`, `zip-R1.22*`, `mapping-antes-R5.json`.
