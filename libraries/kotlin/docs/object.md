# Object

Object: declaração de instância única (singleton), criada de forma preguiçosa.

## Quando usar

- Singletons, fábricas, mapeadores sem estado e constantes agrupadas.
- Companion object de uma classe (companion = sim).

## O que não confundir

- **Object × companion:** o companion é um object declarado dentro de uma classe; desenhe a marcação dele dentro da marcação da classe.
- **Object × data object:** o data object acrescenta `toString`, `equals` e `hashCode` legíveis.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc).
- Sem construtor e sem parâmetros de tipo; as propriedades ficam no corpo.
- Pode herdar uma classe e implementar interfaces.

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Declaração aninhada

Uma declaração aninhada (nested, inner ou companion) se liga à externa pelo campo **Declarada em** (`outer`, etiqueta `kotlin-type`). O agente lê a ligação em `refs` (na aninhada) e `backlinks` (na externa). Desenhar a marcação dentro da externa é só arrumação visual e opcional: o pertencimento do canvas (`parent`/`members`) não define o aninhamento no código.

## Sugestões de tipo

Ao digitar no **Tipo** das propriedades e o **Retorno** das funções, aparecem os tipos básicos do Kotlin (`String`, `Int`, `Boolean`, `List`, `Map`...). No **Tipo** das propriedades e dos supertipos aparecem também as declarações mapeadas (com o tipo delas ao lado), e escolher uma preenche junto o **Tipo mapeado**. É só uma ajuda: qualquer texto continua valendo, como `String?` ou `List<Endereco>`.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function`.

## Exemplo

```kotlin
internal object UserMapper : Mapper<UserDto, User> {
    private const val DEFAULT_NAME = "Sem nome"

    override fun map(dto: UserDto): User = User(dto.id, dto.name ?: DEFAULT_NAME)
}
```
