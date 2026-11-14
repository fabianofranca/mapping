# Class

Regular Kotlin class (class).

## When to use

- Services, repositories, use cases, view models and interface implementations.
- Types with identity and behavior; for pure data prefer data class.

## What not to confuse

- **Class × data class:** the data class generates `equals`, `hashCode`, `copy` and `toString` from the constructor; a regular class does not.
- **Class × object:** the object is a single instance; the class can be instantiated as many times as needed.

## Main fields

- **Name** (required): simple name of the declaration; it carries the `kotlin-type` tag, so supertypes and property types of other markings can point to it.
- **Package**, **Visibility**, **Annotations** and **Description** (KDoc), **Type parameters**.
- `modality` is `final` (default), `open` or `abstract`.
- `inner` only makes sense in a nested class that uses the outer instance.

## How a subtype is linked

Each line of `supertypes` holds the type as written in the code and, in **Mapped type** (`typeRef`), the mapped declaration with the `kotlin-type` tag. This is how a subtype is linked to the sealed class or interface: the subclasses are the declarations whose `supertypes` points to it.

## Nested declaration

A nested declaration (nested, inner or companion) is linked to its outer declaration through the **Declared in** field (`outer`, tag `kotlin-type`). The agent reads the link in `refs` (on the nested one) and `backlinks` (on the outer one). Drawing the marking inside the outer one is only an optional visual tidy-up: the canvas membership (`parent`/`members`) does not define the nesting in the code.

Example of an `inner class`: the outer class `Order` and the inner `Item`.

```kotlin
class Order {
    inner class Item(val sku: String)
}
```

1. Create the **Class** marking `Order` (Modality final).
2. Create the **Class** marking `Item`, with **Inner** = sim (yes).
3. In `Item`, fill **Declared in** = `Order` (the field accepts the `kotlin-type` tag).
4. Optional: arrange `Item` inside `Order` on the canvas, just to read it better.

## Type suggestions

When typing in the **Type** of properties and the **Return type** of functions, the basic Kotlin types appear (`String`, `Int`, `Boolean`, `List`, `Map`...). In the **Type** of properties and supertypes the mapped declarations appear too (with their kind next to them), and choosing one also fills in the **Mapped type**. It is only a help: any text is still valid, such as `String?` or `List<Address>`.

## References to properties

- Other annotations point to a line of `properties` through a `ref` field that accepts `data-field` or `kotlin-property`.
- Functions (`functions`) carry the `kotlin-function` tag.

## Example

```kotlin
@Singleton
internal open class UserRepositoryImpl<T>(
    private val api: UserApi,
) : BaseRepo<User>(api), UserRepository {
    var cache: Map<String, User> = emptyMap()

    override suspend fun find(id: String): User? = cache[id]
}
```
