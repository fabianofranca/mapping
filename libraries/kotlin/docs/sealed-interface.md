# Sealed interface

Sealed interface: interface fechada; os implementadores diretos são conhecidos na compilação (when exaustivo) e ficam no mesmo módulo e pacote.

## Quando usar

- Estados e eventos com um conjunto fechado de casos de formas diferentes.

## O que não confundir

- **Sealed interface × sealed class:** a interface não tem construtor e deixa os subtipos escolherem a superclasse.
- **Sealed interface × enum:** o enum tem constantes de mesma forma.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc), **Parâmetros de tipo**.
- Os subtipos são as declarações cujo `supertypes` aponta para ela (coluna `typeRef`).
- Os implementadores diretos ficam no mesmo módulo e pacote.

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Declaração aninhada

Uma declaração aninhada (nested, inner ou companion) se liga à externa pelo campo **Declarada em** (`outer`, etiqueta `kotlin-type`). O agente lê a ligação em `refs` (na aninhada) e `backlinks` (na externa). Desenhar a marcação dentro da externa é só arrumação visual e opcional: o pertencimento do canvas (`parent`/`members`) não define o aninhamento no código.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function`.

## Exemplo

```kotlin
sealed interface UiState {
    val isLoading: Boolean get() = false

    data object Loading : UiState
    data class Content(val items: List<Item>) : UiState
}
```
