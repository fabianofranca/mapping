# Histórico — Laboratório de componentes (seção do antigo PLAN.md)

> Fases L1 e L2 concluídas (o épico `epic/lab` foi mesclado na `main` pelo PR #160 em 2026-10-17; as partes entraram nos PRs #162, #163, #164, #165, #166, #167 e #168). Origem: a análise de 2026-10-16 e as decisões registradas abaixo. Referência atual: [`../../lab/README.md`](../../lab/README.md).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto o item de mesclar o épico (marcado `[x]`, com o PR e a data) e o item do teste com o JSON real do backend (não marcado, agora levado à fase B2 do `PLAN.md`). As etapas anteriores estão nos outros arquivos desta pasta.

---

## Etapa em andamento — Laboratório de componentes (épico `epic/lab`)

O laboratório `lab/components/` (PR [#160](https://github.com/fabianofranca/mapping/pull/160); descrição em [`lab/README.md`](../../lab/README.md)) provou o formato de componente (`mapping-component`: template de primitivas com expressões sobre os campos), o Material 3 escrito nesse formato, containers (Box, Row, Column), fontes do design system por bytes e várias telas arrastáveis no quadro. A análise de 2026-10-16 concluiu: o **motor** (formato, parser, expressões, instanciação, cena, renderizador Konva, arrumação) vai para o produto; o **editor do laboratório** (`editor.ts` e a página) não vai, porque o canvas da app já faz esse papel. No produto não existe entidade "instância": uma instância é **uma marcação com uma anotação tipada**, e o desenho é derivado (retângulo da marcação, tipo e valores da anotação, molde da especialização) e não é gravado. Uma tela sem imagem é uma **imagem sem arquivo**. O produto só ganha isso na etapa **Biblioteca** ([`docs/ROADMAP.md`](../ROADMAP.md)); estas duas fases terminam o laboratório antes de mesclar o épico.

### L1 — Visualizador embutível

**Coordenador:** Sonnet. Especificação fechada: extrair o núcleo de só leitura, build de biblioteca, invólucro React e demonstração; pouca decisão nova. **Esforço:** medium; subagentes medium (mecânicos: low).

- [x] Núcleo de só leitura, sem framework: recebe um contêiner, a biblioteca e a descrição de tela e desenha; `update` redesenha só o que mudou; expõe hover, clique e realce de seleção por callbacks; não edita.
- [x] O editor do laboratório passa a usar o núcleo para desenhar (separação verdadeira entre motor e editor).
- [x] Build de biblioteca à parte, gerando um arquivo importável (como o build do MCP); as fontes são fornecidas pelo site hospedeiro.
- [x] Invólucro React fino sobre o núcleo.
- [x] Página de demonstração em React de verdade (React como dependência de desenvolvimento só do laboratório, justificada no PR): montar, atualizar o JSON em tempo real, StrictMode e desmontar.
- [x] Entrada do visualizador: a descrição neutra de tela que o laboratório já tem (tamanho, fundo, instâncias com retângulo, tipo, valores e pai) mais a biblioteca; o hospedeiro ou a app traduzem para isso.
- [x] Observar o custo de atualizações frequentes (uma instância ≈ 1 ms, `redraw()` completo ≈ 7,5 ms; ver `viewer/` em [`lab/README.md`](../../lab/README.md)).
- [x] Observar se a API basta para o hospedeiro construir a edição para leigos por cima (basta, sem arrastar; ver `viewer/` em [`lab/README.md`](../../lab/README.md)).

### L2 — Tela a partir de um JSON sem geometria

**Coordenador:** Opus. Define formato (declaração de origem executável, dimensionamento) e a arrumação por tamanhos; decisões que o produto herda. **Esforço:** high; subagentes medium, e high nos briefings de formato e de arrumação.

- [x] Dimensionamento por componente (largura e altura: `fill`, `hug` ou px) e arrumação que calcula tamanhos além de posições, com a tela como container raiz em coluna; caso de prova: texto de apoio do cartão com altura `hug` dentro de coluna `hug`.
- [x] Declaração de origem executável no formato experimental do laboratório: chaves do nó (tipo, props, filhos), raízes da tela com âncoras e overlays, tipo externo para tipo de anotação, caminho de cada campo (aninhado, com índice), tradução de valores e slot dos filhos. O núcleo executa a declaração e nunca código vindo da especialização.
- [x] Visualizador aceitando a biblioteca mais um JSON externo; a página do laboratório deixa colar um JSON do SDUI, com `lab/components/sdui/settings.sdui.json` como exemplo embutido ao lado da tela do Material 3.
- [x] Avisos para props desconhecidas; chaves ignoradas pelo desenho não geram erro.
- [x] Cartão com slot de ações (o do laboratório não tem).
- [ ] Teste com o JSON real do backend, quando o dono tiver (até lá, o exemplo, que passa sem avisos; o teste com o real espera o dono). Risco real: se o JSON real tiver estruturas irregulares demais para uma declaração, a saída é o backend ou a ferramenta administrativa normalizarem antes, levado à fase B2 do `PLAN.md`.

### Fechamento

**Coordenador:** Sonnet. README, mesclar o épico e abrir o épico seguinte são mecânicos. **Esforço:** low; subagentes low.

- [x] README do laboratório com as conclusões.
- [x] Mesclar o épico `epic/lab` na `main` e abrir o épico "Biblioteca" (B1 a B5 em [`docs/ROADMAP.md`](../ROADMAP.md); detalhar aqui quando começar) (mesclado pelo PR #160 em 2026-10-17; o épico `epic/biblioteca` abre com o plano da etapa).

### Decisões registradas (2026-10-16)

- O motor vai para o produto; o editor do laboratório não.
- Instância no produto = marcação com anotação tipada; o desenho é derivado e não é gravado.
- Tela sem imagem = imagem sem arquivo (tela em branco com tamanho e cor de fundo); o quadro de telas reorganizáveis já existe na app (`placement`, gravado).
- Coexistência com imagens: o desenho é opcional por tipo. Projeto só com fotos e especialização sem desenhos não executa nada novo; projeto misto é possível.
- A especialização define a oferta (tipos e quais têm desenho); o projeto define o uso (especializações aplicadas, telas em branco).
- Opção de visualização por pessoa, não gravada: mostrar ou não o desenho por cima de uma foto (padrão: escondido na foto, sempre visível na tela em branco).
- Hierarquia das marcações = contenção visual (container e conteúdo).
- "Pertencer a um modelo" = anotação em outra camada na mesma marcação, herdada pelos descendentes, mais campos de referência que apontam para campos do modelo. O desenho resolve referências (um nível, com detecção de ciclo); editar o modelo redesenha os componentes que o usam.
- Borda da marcação só em hover e seleção para marcações que desenham componente; marcações sem desenho mantêm a borda sempre visível.
- Arrumação (arrange) só por ação do usuário no editor, nunca na carga, no MCP nem ao aplicar proposta sem decisão explícita (a medição de texto no Node é aproximada e no navegador é real; arrumar na carga geraria gravações e `revision` a cada abertura).
- **A decidir:** regra para conteúdo maior que o slot (a invariante exige filho dentro do pai): recortar ou recusar e avisar.
- Editar um campo no painel redesenha o componente na hora (uma ação do store, uma versão do projeto, um quadro; só a marcação mudada é re-instanciada). Vale para desfazer/refazer, alteração externa (recarga) e revisão de proposta (a visão Proposto desenha com os valores propostos).
- Pacote = pasta da especialização (especialização, componentes um por arquivo, fontes, documentos markdown por componente, exemplos nomeados); tudo o que a especialização referencia fica dentro da pasta. Nomes: **Biblioteca** (o pacote) e **Catálogo** (a tela de documentação). Aplicar a um projeto copia a pasta.
- Conteúdo maior que a tela ou o slot, no laboratório: o desenho **avisa** (`tela: conteúdo maior que a altura da tela`) e não recorta nem recusa; o produto ainda decide (item "A decidir" acima).
- **A decidir:** peso das fontes por projeto. Começar copiando; se incomodar, referenciar o pacote da pasta central só para as fontes.
- Porta aberta, não agora: um pacote de desenhos servindo a várias especializações, por caminho relativo.
- A app é só leitura da biblioteca: pacotes e pedidos de alteração são escritos por agentes. "Editor de especializações dentro da app" sai do roadmap.
- Validador em três níveis, puro e igual no navegador e no Node: (1) cada arquivo isolado, estrito, com caminho do problema; (2) coerência entre arquivos; (3) prova de desenho (instanciar cada componente com cada exemplo no tamanho inicial e no mínimo, recolhendo os avisos do motor como "aproximado"). Saída com caminho, mensagem e severidade (erro impede usar; aviso deixa usar).
- Três portas de validação: a app (ao abrir e aplicar, no Diagnóstico), o MCP (validar e servir documentos) e a skill `spec-author` (cresce para escrever a biblioteca inteira e validar antes de entregar), mais o JSON Schema do componente publicado ao lado do da especialização.
- Contrato de versão da biblioteca definido já no formato: mudança aditiva (componente novo, propriedade nova opcional) contra mudança que quebra (tipo removido, campo renomeado, obrigatório novo), com regras de migração declaradas no pacote. As ferramentas de atualização vêm numa fase depois (B4).
- Visualizador embutível para um site React (ferramenta administrativa em que o time de negócio pré-visualiza a tela antes de publicar): o motor não depende de framework; entrega = núcleo sem framework mais invólucro React fino. A ferramenta administrativa constrói a edição para leigos por cima.
- JSON do SDUI como entrada do visualizador, sem quebrar o núcleo genérico: a especialização declara uma **origem executável** (como já declara origens do Figma) e o núcleo executa a declaração sem saber o que é SDUI. Nenhum nome de plataforma ou de sistema externo no código do núcleo.
- O JSON do SDUI é uma árvore sem geometria: cada componente declara como se dimensiona sem retângulo e a arrumação calcula tamanhos. Os exemplos nos documentos de cada componente passam a ser o próprio JSON do SDUI, e a validação confere que cada exemplo passa pela declaração sem propriedade desconhecida (a biblioteca vira teste de contrato do backend).
- Mais tarde, sem data: a mesma declaração pode dar a saída tela para sistema externo, de forma determinística, e a importação de telas do SDUI para projetos (começo da migração de telas antigas).
- `lab/components/sdui/settings.sdui.json` (tela de configurações do Material 3 escrita como um backend de SDUI escreveria) é o exemplo da L2; a declaração de origem real está no `M3_SPEC` (o esboço foi apagado). O dono não consegue testar com o JSON real do backend por enquanto.
- Na B1 (recomendação do coordenador, aceita pelo dono em 2026-10-17): a declaração de origem executável da L2 reaproveitou as `sources` da `formatVersion` 3 (as mesmas das origens do Figma). Convivem sem conflito porque cada entrada tem o seu `system` e o `name` só é lido como caminho (`a.b[0].c`) quando o sistema está em `origins`. Como ainda vamos gerar projetos a partir do Figma, a B1 deve: (1) criar uma chave `path` própria para o caminho do campo em sistemas executáveis, deixando o `name` só como nome em qualquer sistema (se o Figma virar origem executável, nomes com `.` ou `[` não serão mal interpretados); (2) aceitar `slot` e `ignore` nas `sources` de tipo no schema do produto (o validador `src/model/spec.ts` é estrito e hoje os recusa), só em entradas de sistema executável. Nota: o JSON do Figma traz geometria (`absoluteBoundingBox`) e propriedades em `componentProperties`; se a geração de projetos do Figma for por declaração, precisará de uma extensão para ler o retângulo do nó em vez de calcular pela arrumação (extensão, não conflito).
- Cada fase tem um **modelo coordenador** definido (L1 e Fechamento: Sonnet; L2: Opus; B1 a B5 no [`docs/ROADMAP.md`](../ROADMAP.md)). Cada fase define também o esforço do coordenador e dos subagentes: o do coordenador é definido pelo dono ao abrir a sessão (a sessão não o confere, então a recusa é só por modelo); o dos subagentes vai explícito em cada briefing, lido daqui; sem esforço definido, `medium`. Antes de começar, a sessão confere o modelo em que roda: se for superior ao definido, não executa a fase e pede ao dono para trocar de modelo; se for inferior, avisa e só continua com a confirmação do dono. Regra completa na seção "Uso de modelos" do [`CLAUDE.md`](../../CLAUDE.md).
