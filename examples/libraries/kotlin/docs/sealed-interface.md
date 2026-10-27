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

## Aninhamento

Uma declaração aninhada é uma marcação desenhada **dentro** da marcação da declaração externa; o pertencimento vem da geometria (o agente lê `parent` e `members`), não de um campo.

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
