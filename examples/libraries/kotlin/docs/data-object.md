# Data object

Data object: object com toString, equals e hashCode gerados, útil como caso sem dados de uma sealed class ou interface (data object Loading).

## Quando usar

- Casos sem dados de uma hierarquia fechada (Loading, Empty, Idle).

## O que não confundir

- **Data object × object:** só o data object tem `toString` e `equals` gerados.
- **Data object × data class:** o data object é instância única e não tem construtor.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc).
- Sem construtor nem parâmetros de tipo.
- Costuma estar dentro (geometria) da sealed a que pertence e apontar para ela em `supertypes`.

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
    data object Loading : UiState
}
```
