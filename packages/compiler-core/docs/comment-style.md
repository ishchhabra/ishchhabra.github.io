# Comment Style

Use TSDoc-style comments for TypeScript APIs. Types describe shape; comments
describe semantics, ownership, invariants, side effects, and non-obvious
compiler contracts.

## What Gets JSDoc

| Target | Rule |
| --- | --- |
| Exported opaque id types | Explain the identity domain and what ordering it does not imply. |
| Exported classes and interfaces | Explain the semantic role and ownership boundary. |
| Public mutation methods | Explain ownership, def-use, CFG, or analysis invalidation effects. |
| Public query methods with compiler meaning | Explain what is computed and whether it is authoritative or derived. |
| Complex exported unions | Explain each semantic variant, preferably with small JavaScript examples. |
| Internal underscore APIs | Use `@internal` and explain who maintains the invariant. |
| Complex private algorithms | Use short comments when the algorithm would otherwise require compiler background. |

## What Does Not Get JSDoc

| Target | Rule |
| --- | --- |
| Private brand symbols | The exported opaque type owns the documentation. |
| Obvious getters | Skip comments that only restate the name or TypeScript type. |
| Simple constructors | Skip unless construction enforces ownership or graph invariants. |
| Implementation history | Put durable rationale in docs, not in source comments. |
| Temporary unsupported behavior | Prefer clear thrown errors; do not write "currently unsupported" JSDoc for final APIs. |

## Opaque Id Template

```ts
declare const opaqueBlockId: unique symbol;

/**
 * Stable identity of a basic block within an IR graph.
 *
 * Block ids are for diagnostics, maps, and serialization. They are not
 * ordering keys; block order is defined by the owning function or region.
 */
export type BlockId = number & {
  readonly [opaqueBlockId]: "BlockId";
};
```

Use `readonly [opaqueName]: "TypeName"` rather than `__brand`. The unique
symbol prevents accidental structural compatibility without exposing a fake
runtime property.

## Invariant Comments

Keep invariant comments when the invariant spans multiple methods or files.
Do not list obvious facts that are already enforced by a single type.

Good:

```ts
/**
 * Basic block in a function control-flow graph.
 *
 * A block is a linear sequence of operations with one control-flow exit.
 * The terminator, when present, is the final operation.
 *
 * Block parameters model SSA values supplied by predecessor edges. They are
 * the block-argument form of phi nodes.
 */
export class BasicBlock {}
```

Avoid:

```ts
/**
 * The operations array stores operations.
 */
```

## Examples

Use `@example` when a JavaScript syntax example clarifies a semantic union or
operation. Keep examples small and label the exact form being demonstrated in
the prose before the example.

Good:

```ts
/**
 * Object binding property whose source key and binding target may differ.
 *
 * @example
 * ```js
 * const { source: target } = obj;
 * ```
 */
export interface ObjectBindingProperty {}
```

Avoid a single complex example that demonstrates every feature at once. Prefer
several simple examples when the syntax has independent cases, such as shorthand
properties, renamed properties, computed keys, and rest elements.

## Internal APIs

TypeScript `#private` members cannot be accessed by related IR classes, so
def-use maintenance uses public methods with an underscore and `@internal`.

```ts
/**
 * Registers an IR object as a user of this value.
 *
 * @internal
 */
public _addUser(user: ValueUser): void {}
```

Use this only for invariants maintained by other IR objects. Normal consumers
should use public read-only views such as `users`, `definer`, `operations`, and
`params`.
