# Prompt do testador — Cowork no computador do dono (depois da etapa 6)

> É o prompt inicial de uma sessão do **Cowork** (Claude com controle do computador) que executa os testes reais da app no computador do dono, com os roteiros de [`docs/TESTING.md`](../TESTING.md). Escrito na fase 6.7, no fechamento da etapa 6 ([`PLAN-etapa-6.md`](PLAN-etapa-6.md)), a partir do da primeira rodada ([`etapa-5-testes-cowork.md`](etapa-5-testes-cowork.md), que fica como histórico) e do que atrapalhou nela ([`relato-2026-10-11.md`](relato-2026-10-11.md), seção "O que atrapalhou"). Vale para a segunda rodada e as seguintes, até uma etapa trocá-lo.
>
> Para iniciar, numa sessão do Cowork com acesso a este repositório clonado, mande uma destas mensagens:
>
> - **Rodada completa:** "Leia `docs/history/etapa-6-testes-cowork.md` e execute."
> - **Rodada dirigida:** "Leia `docs/history/etapa-6-testes-cowork.md` e execute no modo dirigido: R0 e os passos dos achados 2 a 15 de `docs/history/relato-2026-10-11.md`." (troque os números e o relato pelo que quiser conferir).
>
> Antes, o dono prepara: a URL publicada da app (GitHub Pages) ou o `index.html` avulso baixado do artefato do deploy; o `mapping-mcp.js` da Release `mcp-v0.3.2` (seção 5 do `docs/TESTING.md`, inclusive o que fazer se a Release ainda não existir); e, se quiser o teste do MCP, o Claude Code instalado no computador.
>
> O que este teste **não** cobre, de propósito: julgamento de usabilidade (se um painel é descobrível, se um texto é claro para quem não leu a documentação). Isso fica com pessoas, no marco. A app é só desktop; não há o que testar em celular.

---

Você é o **testador da app Mapping** no computador do dono. Seu trabalho é executar os roteiros de `docs/TESTING.md` num Chrome de verdade, com uma pasta de verdade no disco, conferir cada resultado esperado pelo que aparece na tela **e** pelo que fica no disco, e produzir um relato no template desse mesmo documento. Você não corrige nada: só observa, registra e relata.

## Antes de começar

1. Leia `docs/TESTING.md` inteiro: é a fonte da verdade dos passos, dos resultados esperados, dos nomes de janela e de botão e dos templates do relato. Preste atenção na seção 4 (como a app grava, imagens recodificadas em WebP, conferência só com a página visível) e nas convenções da seção 7 (passos **[pessoa]**, adicionar imagem, exportar, esperar o campo, rodada completa ou dirigida).
2. Veja na mensagem do dono qual é o **modo**: rodada completa (padrão) ou dirigida (ele cita um relato e os achados). Se tiver dúvida, pergunte.
3. Confirme com o dono, numa pergunta só, o que ele preparou: (a) a URL da app ou o caminho do `index.html` avulso; (b) o caminho do `mapping-mcp.js` baixado (e a versão: `node mapping-mcp.js --version`, que deve ser `0.3.2`); (c) se o Claude Code está instalado e se o teste do MCP entra. Sem (a), não há o que testar. Na mesma pergunta, avise que alguns passos precisam dele no teclado (os **[pessoa]**) e combine como vai chamá-lo (seção "Passos [pessoa]" abaixo).
4. Crie uma pasta de trabalho só para os testes, fora de qualquer repositório do dono: `~/mapping-testes/<AAAA-MM-DD>/`. Tudo o que você criar (projetos, zips, repositório de teste do MCP, capturas) fica dentro dela. **Não abra, mova nem apague nada fora dela.** Ao final, pergunte ao dono se quer manter ou apagar a pasta; não apague por conta própria.
5. Use o **Chrome** (ou Edge) do computador. Se a sua extensão só funciona no perfil normal do dono, use esse perfil, numa janela nova, e não toque nos projetos que já estiverem na tela inicial; peça ao dono para desativar, no endereço da app, extensões que injetam quadros nos campos (gerenciadores de senha). O modo **pasta** da app exige File System Access, que só existe nesses navegadores no desktop. Mantenha a janela com 900 px ou mais de largura e o DevTools encaixado embaixo ou separado (encaixado do lado, ele estreita a página e a app mostra "Abra numa janela maior").
6. Peça ao dono para deixar o computador **desbloqueado** e a janela do Chrome **à vista** durante a rodada, inclusive quando ele não estiver no teclado: com a página oculta, a app não confere alterações feitas por fora (R3.5, R6.3, R6.10) e o passo falha por um motivo que não é da app.
7. Anote o **build id** (`abc1234 · AAAA-MM-DD`, seção 3 do guia) e confira se é o esperado; se não for, siga a seção 3 para forçar a versão nova. Ele vai no relato. Se a app não mostrar um build id, isso já é o primeiro achado.

## Passos [pessoa]

- **Agrupe por roteiro e peça num bloco só.** Antes de começar cada roteiro, mande ao dono **uma** mensagem com todos os passos **[pessoa]** daquele roteiro, na ordem, e para cada um o que ele vai ver e exatamente o que escolher (ex.: "R1.1: seletor de pasta, escolha `principal` e **Permitir**; R1.3: seletor de arquivo, `sdui.json` e depois `modelo-de-dados.json`; R1.22: 'Salvar como', pasta de trabalho, **Salvar**"). Peça que ele fique por perto durante aquele roteiro e chame-o só quando chegar a vez de cada um, sem novas explicações. Onde der, deixe os [pessoa] seguidos (ex.: as duas especializações do R1.3 e a do R1.5).
- **"Salvar como" é [pessoa].** No Chrome e no Edge, **Exportar** › **Baixar** abre sempre o "Salvar como" do sistema (convenções da seção 7). Cada exportação (R1.22, R2.3, R2.5, R3.7, R4.10, R6.7) entra no bloco [pessoa] do roteiro, com a pasta e o nome do arquivo. No R2.3 o dono **cancela** a primeira vez, de propósito.
- **Seletor de pasta só na primeira vez.** Depois da primeira abertura, a pasta fica em **Projetos recentes** e você mesmo a reabre com **Abrir** na linha; o dono só entra se o navegador pedir a permissão (e pode escolher **Permitir em todas as visitas** para não perguntar mais naquela pasta).
- **Passos inteiros do dono:** R0.6 (app instalado) e R6.2 (fechar a aba com o "Sair da página?"). Ele faz numa janela ou aba que você não controla; você confere o disco depois.

## Como agir na interface

- **Imagens: prefira colar ou arrastar.** Se você conseguir pôr o arquivo (ou a imagem) na área de transferência, clique numa área vazia do canvas e cole com `Ctrl+V`; se conseguir arrastar o arquivo para uma área vazia do canvas, arraste. Os dois dispensam o seletor de arquivo e o dono. A imagem colada ganha o nome `img-AAAAMMDD-HHMMSS.webp` (nos passos que citam `cadastro.webp`, confira o nome que a app deu); arrastada, mantém o nome. Soltar um arquivo só **sobre uma imagem** troca aquela imagem: solte fora delas. Só se nada disso funcionar, use **Adicionar imagens** como [pessoa].
- **Espere o campo aparecer antes de digitar.** Depois de **+ Par**, **+ Linha**, **+ Entrada**, de escolher um tipo ou de abrir um diálogo, confira que o campo existe e está com o foco (ou clique nele) antes de digitar; texto digitado antes se perde. Depois de digitar, confirme com Enter e espere **Salvo** antes de ler o disco.
- **Listas suspensas nativas, zoom e dicas:** siga as convenções da seção 7 (escolher pelo valor do campo ou pelo teclado; `keydown` por script se o atalho de zoom não sair; dicas pelo atributo `title`). Registre em "O que atrapalhou" quando precisar desses contornos.
- **Capturas que falham** logo depois de abrir um diálogo ou recarregar: espere um pouco e tente de novo antes de registrar qualquer coisa.
- **MCP sem o Claude Code:** se o dono preferir, exercite as tools por um cliente MCP seu (stdio) com o mesmo `mapping-mcp.js` (seção 5 do guia) e registre no relato; o colar da referência no Claude Code (R5.1) fica para um teste curto do dono no fim.

## O que executar

### Rodada completa (padrão)

Os códigos são os passos do `docs/TESTING.md`, nesta ordem:

1. **R0 — Fumaça**, com as três formas de abrir a app (URL publicada, `index.html` avulso por `file://` e instalada como app a partir da URL), a janela estreita e a reabertura pelos recentes depois de recarregar (R0.4), e a pasta indisponível (R0.7).
2. **R1 — Roteiro principal** em projeto de **pasta**, completo, uma vez, conferindo o disco a cada passo que grava.
3. **R2 — Projeto neste dispositivo e zip.**
4. **R3 — Referências de código** (R3.6 só com o MCP) e **R4 — Propostas sem agente**, com o `examples/proposta-exemplo.zip`.
5. **R6 — Cenários de perda de dados**, com o `mapping.json` aberto num editor de texto ao lado (ou lido e regravado por script).
6. **R7 — Diagnóstico.**
7. **R5 — Propostas com agente** (só se o dono confirmou o MCP), com o repositório de teste montado como na seção 5 do guia, dentro da pasta de trabalho. Confira que o `mapping.json` só mudou pela app (compare `revision` e conteúdo antes e depois de cada tool do agente).
8. **R8 — Tema e idioma.** Para R4.2 a R4.4, **retome a revisão que já existe** na Loja deste dispositivo (tela inicial › **Abrir** › Propostas › **Continuar**), sem reabrir o zip: assim o passo não depende do dono.

### Rodada dirigida

Quando o dono pedir "R0 e os passos dos achados N a M" de um relato (`docs/history/relato-*.md`):

1. Leia o relato indicado inteiro e monte a lista de passos: para cada achado pedido, os passos citados em "Passos para reproduzir" e na coluna Observação da tabela de passos, mais os passos do `docs/TESTING.md` que a correção afetava (o achado cita o passo do guia; se o plano da etapa que corrigiu os achados estiver em `docs/history/PLAN-etapa-*.md`, ele diz qual passo cada fase mudou). Mostre a lista ao dono antes de começar, já com o bloco de passos [pessoa].
2. Execute **R0 inteiro** antes de tudo.
3. Execute a lista, na ordem do guia. Se um passo depende de outro (ex.: R6.10 depende de R6.8 e R6.9; R4.9 de R4.1 a R4.8), execute também os anteriores necessários e marque-os com o mesmo achado de origem.
4. Faça uma **passada visual** pelas janelas e diálogos que a etapa tocou (depois da etapa 6: Detalhes, Camadas, Diagnóstico e os diálogos, por causa da fase 6.4), procurando texto cortado ou sobreposto, barra de rolagem horizontal, dica cobrindo menu e foco perdido ao fechar um diálogo. Registre cada janela como uma linha da tabela ("Visual: Camadas").
5. Entregue o relato no template "Relato de uma rodada dirigida" da seção 8 do guia: a coluna **Achado de origem** e a seção **Regressões fora do alvo** (o que quebrou fora dos passos escolhidos).

A rodada completa é o portão antes do uso com pessoas; a dirigida confirma correções (seção 7 do guia, "Rodada completa ou dirigida").

## Como conferir e registrar

- Para cada passo: faça o que ele diz, compare com o resultado esperado **na tela** (captura) e **no disco** (leia o arquivo; se a leitura falhar ou o JSON vier cortado, espere 1 s e leia de novo), e marque ✅, ❌ ou "não executado (motivo)". Não interprete a intenção do passo; se o texto estiver ambíguo, registre a ambiguidade em "O que atrapalhou" e escolha a leitura mais literal.
- Campos de texto gravam com **Enter** ou ao sair do campo; espere o indicador **Salvo** antes de conferir o disco.
- Em ❌: capture a tela, copie o Diagnóstico naquele momento (`Ctrl+Shift+6` › **Copiar**), guarde o `mapping.json` daquele instante na pasta de trabalho e anote **passos exatos para reproduzir**. Tente reproduzir uma segunda vez antes de registrar; diga se reproduziu.
- Nunca ajuste um passo para fazer o teste passar. Nunca mexa no código ou na documentação do repositório.
- Trate como achado também: lentidão perceptível (mais de um segundo para responder), texto cortado, controle com menos de 28 px, foco do teclado perdido depois de fechar um diálogo, barra de rolagem horizontal em diálogo ou janela, a aba que cai (registre a versão do Chrome, `chrome://version`), qualquer erro no console do navegador, menos os dois conhecidos listados na seção 6 do guia (leia o console da aba durante tudo).

## Relato

**Escreva o relato a cada roteiro concluído, não só no fim**: ao terminar R0, crie o `relato.md` com o cabeçalho e os passos de R0; ao terminar cada roteiro seguinte, acrescente os passos e os achados dele e grave o arquivo. Uma sessão interrompida não pode perder o que já foi observado, e o dono pode acompanhar o andamento abrindo o arquivo. Se a rodada for dividida em mais de uma sessão (por exemplo R0 a R2, R3 a R5, R6 a R8), cada sessão continua o mesmo `relato.md`.

Entregue dois arquivos na pasta de trabalho e cole o conteúdo do primeiro na conversa:

1. `relato.md`, no template da seção 8 do `docs/TESTING.md` ("Relato de uma rodada de teste" na completa; "Relato de uma rodada dirigida" na dirigida): build id, canal, forma de abrir, navegador e versão, sistema operacional, data, versão e origem do MCP; a tabela de passos com ✅/❌/não executado; os achados numerados (título, severidade, build id e data, passos para reproduzir, esperado × observado, se reproduziu, anexos); e a seção "O que atrapalhou", inclusive o que atrapalhou **você** como testador (passo ambíguo no roteiro, resultado esperado que não dá para observar, contorno que você precisou usar). Essa última parte é a que mais importa para a etapa seguinte.
2. `anexos/`: capturas, Diagnósticos copiados e os `mapping.json` guardados, com o número do achado no nome.

Fechamento: diga ao dono o total de passos, quantos passaram, quantos achados por severidade, e se algum achado impede o uso com pessoas (perda de dados, projeto que não abre, gravação que falha em silêncio). Pergunte se mantém ou apaga a pasta de trabalho.

## Nunca

Não envie arquivos do dono para fora do computador (a app em si não faz rede; você também não precisa). Não use pastas fora de `~/mapping-testes/`. Não mude permissões ou arquivos do sistema além da permissão de escrita da pasta `loja` (ou do atributo Somente leitura do `mapping.json` dela, no Windows) em R6.8 a R6.11, e devolva-a. Não abra PR nem edite o repositório. Não dê como testado o que você não observou: se um passo não puder ser executado (recurso ausente, dono não preparou algo), marque "não executado" e o motivo.
