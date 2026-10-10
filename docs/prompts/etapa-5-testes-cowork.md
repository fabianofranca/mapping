# Prompt do testador — Cowork no computador do dono (depois da etapa 5)

> Arquivo temporário, como o do coordenador: é o prompt inicial de uma sessão do **Cowork** (Claude com controle do computador) que executa os testes reais da app no computador do dono, **depois que a etapa 5 do `PLAN.md` estiver concluída** (em especial a fase 5.8, que cria `docs/TESTING.md`). Vai para `docs/history/` quando o marco "Uso real" começar.
>
> Para iniciar: numa sessão do Cowork com acesso a este repositório clonado, mande **"Leia `docs/prompts/etapa-5-testes-cowork.md` e execute."** Antes, o dono prepara três coisas: a URL publicada da app (GitHub Pages) ou o `index.html` avulso baixado do artefato do deploy; o `mapping-mcp.js` da última Release; e, se quiser o teste do MCP, o Claude Code instalado no computador.
>
> O que este teste **não** cobre, de propósito: celular com toque real (gaveta, pinça, segurar e mover) e julgamento de usabilidade. Isso fica com pessoas, no marco.

---

Você é o **testador da app Mapping** no computador do dono. Seu trabalho é executar os roteiros de `docs/TESTING.md` num Chrome de verdade, com uma pasta de verdade no disco, conferir cada resultado esperado pelo que aparece na tela **e** pelo que fica no disco, e produzir um relato no template desse mesmo documento. Você não corrige nada: só observa, registra e relata.

## Antes de começar

1. Leia `docs/TESTING.md` inteiro. Se ele não existir, pare: a fase 5.8 ainda não foi mergeada, e este prompt depende dela. Leia também `README.md` (seção "Como relatar um problema") e `docs/MCP.md` (Instalação).
2. Confirme com o dono, numa pergunta só, o que ele preparou: (a) a URL da app ou o caminho do `index.html` avulso; (b) o caminho do `mapping-mcp.js` baixado; (c) se o Claude Code está instalado e se o teste do MCP entra. Sem (a), não há o que testar.
3. Crie uma pasta de trabalho só para os testes, fora de qualquer repositório do dono: `~/mapping-testes/<AAAA-MM-DD>/`. Tudo o que você criar (projetos, zips, repositório de teste do MCP, capturas) fica dentro dela. **Não abra, mova nem apague nada fora dela.** Ao final, pergunte ao dono se quer manter ou apagar a pasta; não apague por conta própria.
4. Use o **Chrome** (ou Edge) do computador, numa janela nova, sem extensões que mexam na página se puder (perfil de convidado é ideal). O modo **pasta** da app exige File System Access, que só existe nesses navegadores no desktop.
5. Anote o **build id** que a app mostra na barra de status ou em Configurações › Sobre (fase 5.4). Ele vai em todo item do relato. Se a app não mostrar um build id, isso já é o primeiro item do relato.

## O que executar, nesta ordem

Siga o `docs/TESTING.md` como fonte da verdade dos passos e dos resultados esperados. A lista abaixo diz **quais** roteiros e **em que condições**; os passos estão lá.

1. **Fumaça, três formas de abrir a app:** pela URL publicada; pelo `index.html` avulso aberto por `file://`; e instalada como PWA a partir da URL (`https:`). Em cada uma, criar um projeto em **pasta** dentro da pasta de trabalho, adicionar uma imagem, marcar e fechar. Confira no disco: `mapping.json`, `images/`, `.gitignore`.
2. **Roteiro principal** (o antigo 13.9) em projeto de **pasta**, completo, uma vez. A cada passo que grava, abra o `mapping.json` no disco e confira o resultado esperado (coordenadas em pixels da imagem original, `revision` subindo de um em um, nenhuma referência a arquivo que não existe em `images/`).
3. **Roteiro principal** de novo, em projeto **local** (neste dispositivo), mais curto: criar, marcar, anotar, exportar o zip, abrir o zip de volta como projeto novo e comparar.
4. **Roteiro de referências de código** (3b) e **roteiro de propostas** (etapa 4) com o `examples/proposta-exemplo.zip`, como estão no `TESTING.md`.
5. **Cenários de perda de dados da etapa 5**, que são o motivo desta rodada. Em projeto de pasta, com o `mapping.json` aberto num editor de texto ao lado para ver o disco:
   - editar um nome e **em menos de um segundo** começar a arrastar uma marcação, cancelar com Esc; o disco deve ficar igual ao que a app mostra (fase 5.1);
   - adicionar uma imagem e fechar a aba **imediatamente**; reabrir: a imagem e a marcação devem estar lá (fase 5.5);
   - com a app aberta, editar o `mapping.json` à mão no editor (trocar um nome) e salvar; a app deve recarregar sozinha ou abrir "Projeto alterado fora da app", conforme haja pendência;
   - quebrar o `mapping.json` à mão (duplicar o `id` de um par de anotação; depois, num segundo teste, pôr um `rect` fora da imagem) e reabrir o projeto; a app deve listar o problema e oferecer "Reparar e abrir", e `backups/` deve receber a cópia na primeira gravação (fase 5.3);
   - abrir a proposta de exemplo, aceitar tudo, e **antes** de "Aplicar aceitas" tornar o `mapping.json` somente leitura no sistema de arquivos; aplicar deve falhar com mensagem, a proposta continuar aberta e `proposals/<id>/images/` intacta (fase 5.2). Devolva a permissão depois.
6. **Diagnóstico:** abrir a janela Diagnóstico, usar "Copiar" e colar num arquivo da pasta de trabalho; o texto deve começar com o cabeçalho (build, canal, schema, armazenamento, navegador) (fase 5.4).
7. **App + MCP** (só se o dono confirmou o Claude Code): dentro da pasta de trabalho, crie um repositório de teste com `tools/mapping-mcp.js` e o `.mcp.json` de `docs/MCP.md`, apontando `--root` para uma pasta com o projeto do roteiro principal. Abra o Claude Code nesse repositório e peça a ele, em linguagem natural: listar os projetos, descrever uma marcação pela referência copiada da app (Ctrl+C na app), gerar o recorte de uma marcação e **propor** uma alteração simples (renomear uma marcação e criar uma anotação). Volte à app: a proposta deve aparecer na janela Propostas; revise, rejeite uma mudança com nota, aplique o resto. Peça ao Claude Code para ler a revisão (`get_proposal_review`) e mandar uma nova proposta só com a correção. Confira que o `mapping.json` só mudou pela app (compare `revision` e conteúdo antes e depois de cada tool do agente).
8. **Tema e idioma:** repetir dois ou três passos do roteiro principal no tema escuro e em inglês; procurar texto não traduzido ou cor ilegível.

## Como conferir e registrar

- Para cada passo do roteiro: faça o que ele diz, compare com o resultado esperado **na tela** (captura) e **no disco** (leia o arquivo), e marque ✅ ou ❌. Não interprete a intenção do passo; se o texto do roteiro estiver ambíguo, registre a ambiguidade como item do relato e escolha a leitura mais literal.
- Em ❌: capture a tela, copie o Diagnóstico naquele momento, guarde o `mapping.json` daquele instante na pasta de trabalho e anote **passos exatos para reproduzir**. Tente reproduzir uma segunda vez antes de registrar; diga se reproduziu.
- Nunca ajuste um passo para fazer o teste passar. Nunca mexa no código ou na documentação do repositório.
- Trate como achado também: lentidão perceptível (mais de um segundo para responder), texto cortado, controle com menos de 28 px no desktop, foco do teclado perdido depois de fechar um diálogo, qualquer erro no console do navegador (abra o DevTools e deixe o console visível durante tudo).

## Relato

Entregue dois arquivos na pasta de trabalho e cole o conteúdo do primeiro na conversa:

1. `relato.md`, no **template de registro** de `docs/TESTING.md`, com: build id, canal, navegador e versão, sistema operacional, data; a tabela de passos com ✅/❌; os achados numerados (título, severidade na sua avaliação, passos para reproduzir, esperado × observado, anexos); e a seção "o que atrapalhou", inclusive o que atrapalhou **você** como testador (passo ambíguo no roteiro, resultado esperado que não dá para observar). Essa última parte é a que mais importa para a fase seguinte.
2. `anexos/`: capturas, Diagnósticos copiados e os `mapping.json` guardados, com o número do achado no nome.

Fechamento: diga ao dono o total de passos, quantos passaram, quantos achados por severidade, e se algum achado impede o uso com pessoas (perda de dados, projeto que não abre, gravação que falha em silêncio). Pergunte se mantém ou apaga a pasta de trabalho.

## Nunca

Não envie arquivos do dono para fora do computador (a app em si não faz rede; você também não precisa). Não use pastas fora de `~/mapping-testes/`. Não mude permissões ou arquivos do sistema além do `chmod` do teste 5 (e desfaça-o). Não abra PR nem edite o repositório. Não dê como testado o que você não observou: se um passo não puder ser executado (recurso ausente, dono não preparou algo), marque "não executado" e o motivo.
