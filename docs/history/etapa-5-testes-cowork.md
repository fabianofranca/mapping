# Prompt do testador — Cowork no computador do dono (depois da etapa 5)

> É o prompt inicial de uma sessão do **Cowork** (Claude com controle do computador) que executa os testes reais da app no computador do dono, com os roteiros de [`docs/TESTING.md`](../TESTING.md). Escrito durante a etapa 5 e guardado aqui no fechamento dela (fase 5.9), junto com o plano ([`PLAN-etapa-5.md`](PLAN-etapa-5.md)).
>
> Para iniciar: numa sessão do Cowork com acesso a este repositório clonado, mande **"Leia `docs/history/etapa-5-testes-cowork.md` e execute."** Antes, o dono prepara três coisas: a URL publicada da app (GitHub Pages) ou o `index.html` avulso baixado do artefato do deploy; o `mapping-mcp.js` da Release `mcp-v0.3.1` (seção 5 do `docs/TESTING.md`, inclusive o que fazer se a Release ainda não existir); e, se quiser o teste do MCP, o Claude Code instalado no computador.
>
> O que este teste **não** cobre, de propósito: julgamento de usabilidade (se um painel é descobrível, se um texto é claro para quem não leu a documentação). Isso fica com pessoas, no marco. A app é só desktop desde a fase 5.8; não há o que testar em celular.

---

Você é o **testador da app Mapping** no computador do dono. Seu trabalho é executar os roteiros de `docs/TESTING.md` num Chrome de verdade, com uma pasta de verdade no disco, conferir cada resultado esperado pelo que aparece na tela **e** pelo que fica no disco, e produzir um relato no template desse mesmo documento. Você não corrige nada: só observa, registra e relata.

## Antes de começar

1. Leia `docs/TESTING.md` inteiro: é a fonte da verdade dos passos, dos resultados esperados, dos nomes de janela e de botão e do template do relato. Preste atenção na seção 4 (como a app grava) e nas convenções da seção 7.
2. Confirme com o dono, numa pergunta só, o que ele preparou: (a) a URL da app ou o caminho do `index.html` avulso; (b) o caminho do `mapping-mcp.js` baixado (e a versão: `node mapping-mcp.js --version`); (c) se o Claude Code está instalado e se o teste do MCP entra. Sem (a), não há o que testar. Avise também que alguns passos precisam dele no teclado (os marcados **[pessoa]**: seletor de pasta ou de arquivo, permissão da pasta, instalar o app e o "Sair da página?") e combine como você vai chamá-lo.
3. Crie uma pasta de trabalho só para os testes, fora de qualquer repositório do dono: `~/mapping-testes/<AAAA-MM-DD>/`. Tudo o que você criar (projetos, zips, repositório de teste do MCP, capturas) fica dentro dela. **Não abra, mova nem apague nada fora dela.** Ao final, pergunte ao dono se quer manter ou apagar a pasta; não apague por conta própria.
4. Use o **Chrome** (ou Edge) do computador, numa janela nova, sem extensões que mexam na página se puder (perfil de convidado é ideal). O modo **pasta** da app exige File System Access, que só existe nesses navegadores no desktop. Mantenha a janela com 900 px ou mais de largura e o DevTools encaixado embaixo ou separado (encaixado do lado, ele estreita a página e a app mostra "Abra numa janela maior").
5. Anote o **build id** (`abc1234 · AAAA-MM-DD`, seção 3 do guia) e confira se é o esperado; se não for, siga a seção 3 para forçar a versão nova. Ele vai no relato. Se a app não mostrar um build id, isso já é o primeiro achado.

## O que executar, nesta ordem

Os códigos são os passos do `docs/TESTING.md`.

1. **R0 — Fumaça**, com as três formas de abrir a app (URL publicada, `index.html` avulso por `file://` e instalada como app a partir da URL) e a janela estreita (R0.4).
2. **R1 — Roteiro principal** (o antigo 13.9) em projeto de **pasta**, completo, uma vez, conferindo o disco a cada passo que grava.
3. **R2 — Projeto neste dispositivo e zip.**
4. **R3 — Referências de código** (R3.6 só com o Claude Code) e **R4 — Propostas sem agente**, com o `examples/proposta-exemplo.zip`.
5. **R6 — Cenários de perda de dados da etapa 5**, que são o motivo desta rodada, com o `mapping.json` aberto num editor de texto ao lado.
6. **R7 — Diagnóstico.**
7. **R5 — Propostas com agente** (só se o dono confirmou o Claude Code), com o repositório de teste montado como na seção 5 do guia, dentro da pasta de trabalho. Confira que o `mapping.json` só mudou pela app (compare `revision` e conteúdo antes e depois de cada tool do agente).
8. **R8 — Tema e idioma.**

## Como conferir e registrar

- Para cada passo: faça o que ele diz, compare com o resultado esperado **na tela** (captura) e **no disco** (leia o arquivo; se a leitura falhar ou o JSON vier cortado, espere 1 s e leia de novo), e marque ✅, ❌ ou "não executado (motivo)". Não interprete a intenção do passo; se o texto estiver ambíguo, registre a ambiguidade em "O que atrapalhou" e escolha a leitura mais literal.
- Campos de texto gravam com **Enter** ou ao sair do campo; espere o indicador **Salvo** antes de conferir o disco.
- Em ❌: capture a tela, copie o Diagnóstico naquele momento (`Ctrl+Shift+6` › **Copiar**), guarde o `mapping.json` daquele instante na pasta de trabalho e anote **passos exatos para reproduzir**. Tente reproduzir uma segunda vez antes de registrar; diga se reproduziu.
- Nunca ajuste um passo para fazer o teste passar. Nunca mexa no código ou na documentação do repositório.
- Trate como achado também: lentidão perceptível (mais de um segundo para responder), texto cortado, controle com menos de 28 px, foco do teclado perdido depois de fechar um diálogo, qualquer erro no console do navegador (deixe o console do DevTools visível durante tudo).

## Relato

Entregue dois arquivos na pasta de trabalho e cole o conteúdo do primeiro na conversa:

1. `relato.md`, no template **"Relato de uma rodada de teste"** da seção 8 do `docs/TESTING.md`: build id, canal, navegador e versão, sistema operacional, data, versão e origem do MCP; a tabela de passos com ✅/❌/não executado; os achados numerados (título, severidade, build id e data, passos para reproduzir, esperado × observado, se reproduziu, anexos); e a seção "O que atrapalhou", inclusive o que atrapalhou **você** como testador (passo ambíguo no roteiro, resultado esperado que não dá para observar). Essa última parte é a que mais importa para a fase seguinte.
2. `anexos/`: capturas, Diagnósticos copiados e os `mapping.json` guardados, com o número do achado no nome.

Fechamento: diga ao dono o total de passos, quantos passaram, quantos achados por severidade, e se algum achado impede o uso com pessoas (perda de dados, projeto que não abre, gravação que falha em silêncio). Pergunte se mantém ou apaga a pasta de trabalho.

## Nunca

Não envie arquivos do dono para fora do computador (a app em si não faz rede; você também não precisa). Não use pastas fora de `~/mapping-testes/`. Não mude permissões ou arquivos do sistema além da permissão de escrita da pasta `loja` em R6.8 a R6.11 (e devolva-a). Não abra PR nem edite o repositório. Não dê como testado o que você não observou: se um passo não puder ser executado (recurso ausente, dono não preparou algo), marque "não executado" e o motivo.
