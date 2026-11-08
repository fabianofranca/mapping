# v9 da Mapping DS: desenhos dos 43 tipos sem componente

Cada grupo trabalha **só** na própria pasta `v9/<grupo>/` e entrega três arquivos. Ninguém edita `lib.mjs`, `build-spec.mjs`, `shots/*`, `v9/preview.mjs`, `especializacoes/`, `projetos/` nem o repositório `C:/Pessoal/mapping/repo` (só leitura). Precisou mudar algo compartilhado: diga no relatório, com o trecho.

## Contexto

- A biblioteca `mapping-ds` é o design system do app Mapping (Preact) escrito como especialização do Mapping. Gerada por `ferramentas/mapping-ds/lib.mjs` (desenhos) e `build-spec.mjs` (tipos, `code`, versão). Leia `ferramentas/mapping-ds/HANDOFF.md` (decisões do dono e limitações do motor) e o fim do `lib.mjs` (Revisão 6 e 7) para o estilo.
- Formato: componente `formatVersion` 4, especialização 15. Leia o `docs/COMPONENT-FORMAT.md` da versão do MCP em uso (`git show mcp-v0.28.2:docs/COMPONENT-FORMAT.md`, ou o recurso `mapping-docs://COMPONENT-FORMAT.md` do servidor) inteiro (é o da 0.28.1) antes de desenhar.
- **App medido = 0.25.0** (`ferramentas/mapping-ds/app25/`, código em `git show mcp-v0.25.0:<arquivo>`; CSS em `src/theme/*.css`, tokens em `src/theme/tokens.ts`). **Prévia = app 0.28.1** (`ferramentas/mapping-ds/app/`).
- A fixture (`shots/fixture/`) é o projeto aberto no app medido: containers Editor, Janela Comentários etc., conversas de teste e uma **proposta aberta** "Revisão de teste: botões e pinos" (7 mudanças: valores e nome do botão Salvar, deslocamento, trava do Campo E-mail, botão Cancelar criado, pino removido, dois pinos envolvidos, camada "Camada 1" renomeada para "Rascunhos").

## Decisões do dono (valem para todo grupo)

1. **Cada item visível é uma marcação.** Compostos (painel, diálogo, janela, linha de lista, barra) desenham **só a moldura** (fundo, borda, raio, sombra, divisórias, e no máximo o título que é dado do próprio composto); textos, ícones, botões, selos e campos dentro deles são marcações filhas dos tipos que já existem (Texto `text`, Ícone `icon`, Button, IconButton, Selo `badge`, Caixa `box`, TextField, Select, Choice, Segmented/Opção, Tabs/Aba…). Um **átomo** (selo de tipo de mudança, marcador, decisão, flag) desenha tudo.
2. **Layout medido do app real**, nunca de memória: medidas do CSS do repositório na tag `mcp-v0.25.0` e conferidas na captura real.
3. **Biblioteca sem avisos:** `validate_library` com 0 erros e 0 avisos.
4. **Conferir visualmente** (`out/real-*.png` contra `out/preview-*.png`) antes de dar por pronto.

## O que entregar em `v9/<grupo>/`

### `lib.mjs`: `export function build(h) { return { COMPONENTS, DOCS, EXAMPLES, NEW_FIELDS, STRUCTURAL } }`

- `COMPONENTS[id] = h.base(id, nome, descrição, size, minSize, sizing, preview, template)`; o `lib.mjs` força o formato 4.
- `NEW_FIELDS[id] = [{ key, label, type, options?, default? }]`: os 43 tipos **não têm campos**; acrescente os que o desenho pede, **todos opcionais** (sem `required`), booleanos como `enum` `['sim','não']`. Chaves em `[A-Za-z0-9_]`, sem acento.
- `DOCS[id]`: markdown (quando usar, o que o desenho mostra, quais filhos esperar, o que não é desenhado). `EXAMPLES[id] = [{ name, values }]` opcional.
- `STRUCTURAL`: ids que só agrupam e não desenham nada (sem fundo nem borda no app): sem `COMPONENTS[id]`.
- Helpers em `h` (veja `HELPERS` no `lib.mjs`): `C` (cores como `{ $token }`: `bg surface border control text muted accent accentText selection selectionMuted danger dangerBg warning warningBg success successBg tooltip tooltipText none`), `tok('color-hover')` para qualquer token de `src/theme/tokens.ts` (cores `color-*`/`cv-*`, `shadow-popup-color`, `opacity-disabled`), `SHADOW_POPUP`, `OPACITY_DISABLED`, `eq`, `sw`, `fr(nome, props, filhos)`, `text(nome, valor, cor, fonte, extra)`, `font(tamanho, peso, alturaDeLinha, extra)` (fonte do tema; monoespaçada: `{ ...h.font(12,400,18), family: h.tok('font-mono') }`), `fieldText(chave, padrão)`, `NONE`, `YES(chave)`, `ESTILOS` (t-*), `iconNode('chevronDown', cor, extra)` (nó `icon` do conjunto, 16 px) e `iconFromField('icone', padrão)`.
- Cuidados do motor (já custaram caro): texto de uma linha que pode passar da caixa → `width: 'hug'` (com `wrap: 'none'` e largura fixa o Konva corta a letra inteira); reticências só com `font: { wrap: 'none', ellipsis: true }` e largura definida; `stroke.dash` não aceita expressão; `stroke.sides` com os quatro lados perde o raio; `fill` no eixo principal de um quadro `hug` vale 0.

### `rules.mjs`: `export const rules = [ fn, … ]`

Regras do extrator para os tipos do grupo, rodando no DOM do app medido. Cada `fn(el, cs, h)` devolve `'stop'` (marcou um átomo; não desce), `'group'` (marcou uma moldura; desce nos filhos) ou `undefined` (não é seu). **São serializadas** (`String(fn)`): nada de variáveis de fora da função. `h` tem `push(tipo, el, valores, nome, rect?)` (devolve `false` se recortado), `textOf`, `iconOf(svg)` (chave camelCase do ícone), `near(cor, h.cor|h.fundo|h.borda)`, `sn(bool)` (`'sim'`/`'não'`), `directText`, `shown`, `boxOf`, `nameOf`, `clip`, `textStyle`, `walk(el)`. As regras do grupo rodam **antes** das do `shots/extractor.mjs` (leia a função `walk` dele para saber o que já é reconhecido: Button, IconButton, Select, TextField, Choice, Tabs/Aba, Segmented/Opção, Selo, Ícone, Caixa, Texto…). Os valores precisam caber nos campos (opção de `enum` que existe).

### `screens.mjs`: `export const screens = [{ name, rootSel, rootIsItem?, background?, viewport?, open: async (page) => {…} }]`

As telas (viram containers novos no projeto `comentarios`). `open` recebe a página já com a fixture aberta no editor (1440 × 900) e leva o app até a tela; `rootSel` é a raiz medida (a última que casa); `rootIsItem: true` mede a própria raiz como item (sem ele, só os filhos). Nomes de tela únicos e descritivos (ex.: "Revisão — Editor 1440 × 900").

## Ciclo

`node v9/preview.mjs <grupo> [tela]` (na pasta `ferramentas/mapping-ds`): monta o pacote só com o grupo em `out/pkg`, valida (deve sair `valid=true erros=0 avisos=0`), mede as telas no 0.25.0 (`out/real-<tela>.png`, `out/extracted.json`) e desenha a prévia no 0.28.1 a 100% (`out/preview-<tela>.png`). Abra as duas imagens (Read) e compare; repita até bater. `DM=dark` desenha a prévia no escuro (os tokens têm os dois modos: confira que nada ficou claro).

## Relatório final (curto)

Por tipo: o que desenha, campos novos, de onde saíram as medidas (arquivo CSS), o que difere do app e por quê (limite do motor ou decisão). As telas medidas. Resultado da validação. Qualquer coisa que precise mudar fora da pasta do grupo.
