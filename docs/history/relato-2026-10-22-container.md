# Relato de teste — Mapping

- Modo: dirigido, sem interação — fases CN1 e CN2 de `docs/history/PLAN-etapa-container.md` (branch `epic/container`, PR #213): R0 inteiro e, com as dependências do guia, R9.2, R9.13 a R9.20, R10.9 e R3.8c
- Build id: b9b124c · 2026-10-22
- Canal (como a app mostra): prévia
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`); o preview já estava em 564b1e7 · 2026-10-21 e a faixa **Atualizar** trouxe o build esperado (sem Deploy)
- Navegador e versão: Chrome 155.0.0.0 (extensão Claude in Chrome)
- Sistema operacional: Windows 10/11 x64 (galaxy-book-ff)
- DPR e viewport: DPR 1,25; 1519 × 616; janela 1534 × 800
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-22-container-rodada` (repositório do branch em `…\2026-10-22-container`)
- Ferramenta: agente com extensão do navegador e shell (device_bash); dialog-pilot (versão não exposta pelo servidor); pedidos ao MCP: stdio (`scripts/testing/mcp-stdio-client.mjs`)
- Estado prévio do navegador: projetos pré-existentes (50 linhas em Projetos recentes, de rodadas anteriores, entre elas principal, telas, migracao, biblioteca, Loja, vazio); `preview:mapping.reviewResume` com decisões de revisões antigas
- MCP: mcp-v0.8.0-rc.1 (versão e sha256: ver Resumo/Observações quando conferidos)
- Data: 22/10/2026
- Tempo por roteiro: R0 ≈ 20 min, Seção 6 + R3.8c ≈ 12 min, R9 + R10 ≈ 35 min

## Resumo

- Passos: 27 no total, 27 ✅, 0 ❌, 0 não executados, 0 ainda pendentes ou em andamento.
- Achados por severidade: bloqueia 0, alta 0, média 0, baixa 0
- Impede o uso com pessoas? não

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1 | Base | ✅ | Sobre mostra b9b124c · 2026-10-22, prévia, formato 12; Ver os atalhos abre a Ajuda; Esc devolve o foco ao botão Configurações; sem barra de rolagem horizontal |
| R0.2 | Base | ✅ | Nome do projeto vazio (placeholder fumaca-web); mapping.json v12 e .gitignore com backups/ |
| R0.3 | Base | ✅ | images/cadastro.webp (484 × 450); 1 container e 1 marcação; revision 2; fechar não perguntou nada. O guia diz 'images', mas o v12 grava 'containers' |
| R0.4a | Base | ✅ | Abriu sem seletor e sem pedido de permissão (accept_permission_prompt: nenhum pedido); aba de pé |
| R0.4b | Base | ✅ | Abaixo de 900 px só o aviso; ao alargar a marcação continua selecionada; disco com 1 marcação |
| R0.7 | Base | ✅ | Aviso Pasta indisponível; Localizar pasta… com fumaca-web-2; linha mostra fumaca-web / fumaca-web-2; Remover da lista tirou a linha; disco igual |
| S6.1 | Base | ✅ | mcp-v0.8.0-rc.1 baixado do GitHub; sha256sum -c OK; --version = 0.8.0-rc.1 |
| S6.2 | Base | ✅ | repo-teste com git init, tools/mapping-mcp.js, design/mapeamentos, assets (cadastro.png e sdui.json) e .mcp.json |
| R3.8c | CN2 | ✅ | Antes de editar o disco seguia v11 (abrir não grava). Faixa 'Projeto atualizado do formato v11…' só apareceu depois da 1ª gravação (ver observação). Backup mapping.v11.20261022-095819.json igual ao v11 do preparo; novo mapping v12, revision 3, containers/containerId, sem images/imageId; images/ intacta |
| R9.1 | Base | ✅ | material3 aplicado, 0 erros / 42 avisos; specs/material3 com components (15), docs, examples, fonts |
| R9.2 | CN1 | ✅ | Lista ok; nome vazio mostra 'Dê um nome ao container.'; container criado branco e selecionado |
| R9.3 | Base | ✅ | 15 tipos com tamanhos; Card/Box/Row/Column com selo Container; Adicionar habilitado |
| R9.7 | Base | ✅ | Parcial: só adicionar/posicionar conferidos; Ordem e Mover não conferidos |
| R9.13 | CN1 | ✅ | Proposta aparece como Nova em Propostas; revisão do mapping.json inalterada (5) |
| R9.14 | CN1 | ✅ | Atual: Detalhes some; Proposto: container com Top app bar e Button; selo 'Criada pela proposta'; botão proposto selecionável (X120 Y340) |
| R9.15 | CN1 | ✅ | Aceitar tudo (5) e Aplicar aceitas ok; mapping.json revisão 6; 2 containers, segundo com file null; sem pasta images/ |
| R9.16 | CN1 | ✅ | Largura 0 recusada ('Largura e altura são números inteiros de 1 a 20000.'); 600x400 #CCCCCC criado e selecionado |
| R9.17 | CN1 | ✅ | Detalhes do container mostra '600 × 400 px' (tamanho da seleção) |
| R9.18 | CN1 | ✅ | plan_changes válido com add_container + add_blank_image; aviso deprecated-op só na antiga. Obs: add_container com width/height sem background é recusado (invalid-arguments, exige background) |
| R9.19 | CN2 | ✅ | get_container ok (file null, 360x800); get_container_file em container sem arquivo -> erro container-without-file; add_container com file (cadastro.png->webp) e com fundo válidos. Caminho do file é relativo à raiz (cadastro.png), assets/cadastro.png dá path-not-found |
| R9.20 | CN2 | ✅ | add_image e add_blank_image antigos validam; 2 avisos deprecated-op |
| R10.8 | Base | ✅ | Projeto vazio: Componentes e Paleta mostram 'Nenhuma biblioteca com componentes aplicada.' com Abrir Especializações; o botão abre o diálogo; sem erros |
| R10.9 | CN1 | ✅ | Lista só com Personalizado e Tamanho da seleção (desabilitada); Livre 500x300 #CCCCCC criado e selecionado |
| Visual: Novo container | Visual | ✅ | Sem texto cortado nem rolagem; Esc e Cancelar com o mouse devolvem o foco ao botão Novo container; sem rolagem horizontal |
| Visual: Árvore | Visual | ✅ | Árvore abre com o container Livre, sem corte |
| Visual: Detalhes | Visual | ✅ | Detalhes de container sem arquivo ok; só o id aparece com reticências (esperado, com botão copiar). Obs: rótulos 'Imagem' e 'Excluir imagem' para container sem arquivo |
| Visual: Propostas | Visual | ✅ | Lista, estado vazio e revisão sem corte nem rolagem horizontal |

## Achados

(nenhum até agora)

## Regressões fora do alvo

- (nenhuma até agora)

## Observações (sem severidade)

- R0.3, R0.7 e a seção 4 do guia ainda citam 'images' no mapping.json; o schema v12 grava 'containers'. Texto do guia desatualizado (baixa).
- Os Detalhes do container com arquivo mostram a seção 'Imagem' e 'Nome: images/cadastro.webp' (o nome do container vem do arquivo quando está sem nome); não é defeito, só conferir se é a intenção da CN2.
- R3.8c: o guia manda olhar a faixa de migração 'no topo' ao abrir, antes de editar, mas ela só aparece depois da primeira gravação (src/app/CanvasNotices.tsx mostra a faixa quando session.backupSaved != null, e o backup só é gravado no primeiro Salvo). O passo se contradiz (faixa ao abrir × 'abrir não grava'); sugiro ajustar o texto do guia: a faixa aparece depois do primeiro Salvo (baixa).
- Diálogo Especializações diz 'Uma biblioteca (versão 4 ou 5)', mas o formato atual é 6 (container presets); texto provavelmente desatualizado
- R9.18: add_container com width/height sem background é recusado (exige background); add_blank_image continua exigindo background e dá deprecated-op
- R9.19: file em add_container é relativo à raiz (cadastro.png); assets/cadastro.png dá path-not-found
- Painel Detalhes de container sem arquivo usa os rótulos 'Imagem' e 'Excluir imagem'; confirmar com o dono se é intencional

## O que atrapalhou

- A janela do Chrome tem viewport de 616 px de altura (janela 1534 × 800), pouca para a passada visual; usei resize_window quando precisei.
- git clone na pasta conectada exigiu a permissão de exclusão (travas .git/config.lock); aprovada pelo dono.
- R3.8c: o 'Tela' do passo pede a faixa logo ao abrir, e a app só a mostra depois do primeiro Salvo; medi no DOM e no código antes de concluir (não repeti a ação).
