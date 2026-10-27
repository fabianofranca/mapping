# Annotation class

Annotation class: declara uma anotação (@Audited, @SerialName).

## Quando usar

- Declarar anotações próprias para marcar classes, funções ou propriedades.

## O que não confundir

- **Declarar × aplicar:** esta marcação declara a anotação; aplicá-la a uma declaração é o campo `annotations` desta.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc).
- As propriedades são os parâmetros do construtor, sempre `val`.
- Sem funções, supertipos nem corpo; `targets` e `retention` descrevem o alcance.

## Aninhamento

Uma declaração aninhada é uma marcação desenhada **dentro** da marcação da declaração externa; o pertencimento vem da geometria (o agente lê `parent` e `members`), não de um campo.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Esta declaração não tem funções; só as propriedades (parâmetros) são alvos.

## Exemplo

```kotlin
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Audited(
    val action: String = "",
    val level: Int = 1,
)
```
