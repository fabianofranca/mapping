# Bibliotecas

Pacotes de biblioteca prontos para uso (formato em [`docs/SPEC-FORMAT.md`](../docs/SPEC-FORMAT.md), "Biblioteca: o pacote"). Cada pasta é um pacote: a especialização na raiz, `components/` e `docs/`.

| Pasta     | O que é                                                                                                  | Como chega ao projeto                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `notas/`  | Notas e tabelas flutuantes no canvas (post-its).                                                         | **Embutida** no build (`index.ts`) e aplicada por padrão em projeto novo.                                |
| `kotlin/` | Declarações Kotlin: os onze tipos de classe, objeto e interface, com propriedades, funções e supertipos. | **Não embutida.** Baixe a pasta (ou um zip dela) e aplique em **Especializações › Aplicar pasta…/zip…**. |

Uma pasta com `index.ts` é embutida; sem ele, a biblioteca é aplicada pela pessoa. Toda pasta daqui tem um teste que a valida (`validateLibrary`, sem erros): `tests/model/notesLibrary.test.ts` e `tests/model/kotlinLibrary.test.ts`.

## Kotlin

As propriedades de cada declaração (cada linha de **Propriedades**) são alvos de referência com as etiquetas `data-field` e `kotlin-property`: um campo `ref` de outra camada ou especialização que aceite uma delas aponta para a propriedade. As declarações se ligam entre si por campos `ref` que aceitam `kotlin-type` (**Declarada em**, **Supertipos › Tipo mapeado**, **Propriedades › Tipo mapeado**), que o agente lê em `refs` e `backlinks`. Os detalhes de cada tipo estão em `kotlin/docs/`.
