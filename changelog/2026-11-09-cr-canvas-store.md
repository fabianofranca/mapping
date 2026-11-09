# CR do canvas e do store — 2026-11-09 (épico `epic/cr-canvas-store`, PR #1238, MCP 0.28.12, schema v18)

## Corrigido

- Canvas: ao rejeitar a remoção proposta da marcação selecionada, o risco da etiqueta do nome some no mesmo quadro (antes ficava até um pan ou outra seleção), e o risco não passa mais da largura da etiqueta quando o nome é longo e aparece cortado.
- Canvas: o selo "Veio de <nome>" deixa de sair cortado no primeiro desenho (a largura passa a ser medida com a fonte do tema).
- Canvas: o clique curto do botão do meio não seleciona, não limpa a seleção nem põe o pino do Comentar.
- Canvas: soltar o Espaço com o foco num campo não deixa mais o arrasto preso no pan; o Espaço também não é cancelado em links e botões.
- Canvas: Ctrl+clique abre o menu de contexto (no macOS), sem virar um clique de seleção.
- Componentes: o texto rico com contorno (`stroke`) tem preenchimento e contorno, como o texto simples, em vez de sair oco.
- Componentes: a imagem embutida (`data:`) respeita o ajuste do preenchimento (`cover`, `contain`, `fill`; padrão `cover`) em vez de esticar, e não é decodificada de novo a cada desenho.
- Componentes: um quadro sem preenchimento nem traço mostra a sombra (ela vai para o primeiro filho).
- Catálogo: as imagens dos exemplos saem com as imagens embutidas (antes saíam com o reservado) e a galeria guarda uma imagem por exemplo, sem acumular as de épocas antigas.
- Componentes: com mais de 64 imagens remotas à vista, elas não piscam mais nem são baixadas de novo em ciclo.
- Catálogo e Playground: os avisos do desenho aparecem no idioma da app (antes saíam sempre em português); o texto e as cores da caixa de tipo sem componente vêm do tema.
- Projeto: um arquivo migrado que outro programa regrava no schema atual antes da primeira edição não gera mais um "backup do original" obsoleto nem o aviso de backup.
- Janelas: o Detalhes recolhido na janela compacta só vale na primeira visita; reaberto, não recolhe de novo ao trocar de projeto.
- Desfazer/refazer: uma falha imediata do efeito ligado à proposta (não só a assíncrona) devolve o passo e mostra o erro.
- Diagnóstico: a URL de imagem inválida (`data:`, `file:` etc.) aparece com o esquema (e só o tipo no `data:`), em vez de `null…`.
- Propostas: o Diagnóstico das propostas atualiza quando o problema muda (um arquivo quebrado que some e outro que quebra, ou o mesmo arquivo com outro erro), mesmo com o número de problemas igual.
- Propostas: uma falha de disco ao aplicar (ler a imagem ou o pacote, copiar a imagem) mostra o erro de gravação e tira as imagens já copiadas, em vez de falhar sem aviso e deixá-las soltas; se o projeto mudou durante uma gravação que falhou, as cópias que ele cita ficam.
- Comentários: a conversa escolhida (ou o rascunho de conversa nova) não volta sozinha ao clicar num item e depois no vazio; o texto não enviado continua guardado e reaparece ao abrir o rascunho no mesmo ponto.
- Comentários: ao reposicionar um rascunho de conversa já aberto (Comentar e clique em outro ponto), o foco vai ao compositor, em vez de o texto digitado ir ao canvas.
- Comentários: as marcações de "lida" não se perdem quando o Mapping está aberto em duas abas, e o aparelho guarda as 20 cópias de projeto mais recentes.
- Catálogo: a especialização cujo catálogo falhou ao carregar é tentada de novo no próximo pedido (antes ficava sem catálogo até trocar o projeto).

## Alterado

- Canvas: menos trabalho por quadro e por gesto: arrastar não recalcula mais a lista de imagens a carregar, medir o tamanho do canvas sem mudança não agenda quadro à toa, a hachura da marcação removida desenha só a parte visível e o selo de chegada não força o layout da página a cada quadro. O desenho não muda.
- Visualizador embutível (`mapping-viewer`): o `ScreenRenderer` recebe os textos da caixa de tipo ausente e dos avisos do chamador (`labels`); o `createViewer` passa os dele, em português, como antes. Quem cria um `ScreenRenderer` direto precisa passar `labels` (há `VIEWER_LABELS` para o padrão).
- Store: desfazer, refazer e cada edição notificam os painéis uma vez só; a faixa e a barra de status não recalculam os conflitos das propostas a cada edição; a conferência de arquivos externos lê imagens, propostas e conversas em paralelo; a seleção por retângulo e a troca de seleção não crescem de forma quadrática. O comportamento não muda.
- Revisão: segurar a seta para percorrer as mudanças grava o ponto de retomada no máximo uma vez por quadro (antes, a cada tecla), e a revisão fechada o grava na hora; a lista de arquivos de pacote de cada proposta é lida uma vez.
- Store: as conversas só republicam a lista quando algo mudou; o posicionamento de perspectivas confere a sobreposição de imagens uma vez por raiz; as leituras de componentes e fontes rodam em paralelo; a sincronia de fontes, o rastreio de pendências e a fila serial dos catálogos, propostas e conversas saem de helpers comuns. O comportamento não muda.
