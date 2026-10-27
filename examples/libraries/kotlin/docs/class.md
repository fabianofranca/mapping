# Class

Classe Kotlin comum (class).

## Quando usar

- Serviços, repositórios, casos de uso, view models e implementações de interface.
- Tipos com identidade e comportamento; para dados puros prefira data class.

## O que não confundir

- **Class × data class:** a data class gera `equals`, `hashCode`, `copy` e `toString` a partir do construtor; a class comum não.
- **Class × object:** o object é instância única; a class se instancia quantas vezes for preciso.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc), **Parâmetros de tipo**.
- `modality` é `final` (padrão), `open` ou `abstract`.
- `inner` só faz sentido numa classe aninhada que usa a instância da externa.

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Declaração aninhada

Uma declaração aninhada (nested, inner ou companion) se liga à externa pelo campo **Declarada em** (`outer`, etiqueta `kotlin-type`). O agente lê a ligação em `refs` (na aninhada) e `backlinks` (na externa). Desenhar a marcação dentro da externa é só arrumação visual e opcional: o pertencimento do canvas (`parent`/`members`) não define o aninhamento no código.

Exemplo de `inner class`: a classe externa `Pedido` e a inner `Item`.

```kotlin
class Pedido {
    inner class Item(val sku: String)
}
```

1. Crie a marcação **Class** `Pedido` (Modalidade final).
2. Crie a marcação **Class** `Item`, com **Inner** = sim.
3. Em `Item`, preencha **Declarada em** = `Pedido` (o campo aceita a etiqueta `kotlin-type`).
4. Opcional: arrume `Item` dentro de `Pedido` no canvas, só para ler melhor.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function`.

## Exemplo

```kotlin
@Singleton
internal open class UserRepositoryImpl<T>(
    private val api: UserApi,
) : BaseRepo<User>(api), UserRepository {
    var cache: Map<String, User> = emptyMap()

    override suspend fun find(id: String): User? = cache[id]
}
```
