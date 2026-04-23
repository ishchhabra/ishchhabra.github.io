# Destructuring in SSA, without MLIR

How do you represent `[a, b, ...rest] = arr` in an SSA IR when you also need to emit **the same destructuring syntax back out** as JavaScript? This doc walks the design space.

---

## The constraint

JavaScript destructuring has two properties that shape the IR:

1. **It binds many variables in one syntactic construct.** Classical single-result SSA ("every op defines exactly one value") needs to bend to accommodate this.
2. **Its semantics are not equivalent to N independent property loads.** `[a, b] = arr` invokes `arr[Symbol.iterator]()` and steps through it — it is not `a = arr[0]; b = arr[1]`. Object destructuring with rest (`{x, ...rest} = obj`) computes `rest` as "everything in obj except keys already consumed," which requires knowing the full pattern as one unit.

So any representation that fragments destructuring into independent operations must either (a) rebuild the iterator/rest scaffolding in the IR (ugly, and the emitted JS grows), or (b) keep a grouping mechanism that preserves the original shape.

The emitted-JS constraint is the pointed one. If we split `[a, b] = arr` into loads + stores in the IR and then reassemble at codegen, we have to get the reassembly right in every case. If we keep it grouped, codegen is trivial but the IR has a multi-def op.

---

## Two approaches

### Approach A — One op, many defs (what we do today)

Treat the destructure pattern as a single `Operation` with one operand (the RHS) and a tree of binding targets. The op exposes its N defined values through a wider-than-usual `getDefs()`, while the `.place` slot inherited from `Operation` carries a single nominal "primary" output that no one reads.

```ts
class ArrayDestructureOp extends Operation {
  readonly place: Value;                              // vestigial
  readonly elements: Array<DestructureTarget | null>; // tree of bindings
  readonly value: Value;                              // the RHS operand

  override getDefs(): Value[] {
    return [this.place, ...collectBindingPlaces(this.elements)];
  }
}
```

SSA correctness rides on every pass reading `getDefs()` rather than `.place`. The single-result world view (`op.place` is the only definition) is wrong for this op — a pass that only walks `.place` will miss every destructured binding.

**Example.** `let [a, b, ...rest] = arr;`

```
%arr      = load_global arr
%_unused  = array_destructure %arr
              [
                binding(%a, local),
                binding(%b, local),
                rest(binding(%rest, local)),
              ]
              {kind = declaration}

      // getDefs() = [%_unused, %a, %b, %rest]
```

**Codegen.** Trivial: the op already carries the pattern shape. Walk `elements`, render each target in its pattern slot, emit `let [a, b, ...rest] = <rhs>;`.

**Pros.**
- **JS output is one-to-one with the op.** No reassembly logic, no pattern matching at codegen.
- **Semantics are self-contained.** The op's memory effects describe the full iterator + property-access story at one point in the pipeline.
- **Short IR.** Deeply nested patterns are one op deep, not a forest.

**Cons.**
- **Hybrid SSA.** `Operation.place` promises one output per op; destructure ops violate that promise and route around it with `getDefs()`. Any pass that forgets to ask `getDefs()` silently loses definitions.
- **Dead `place` slot.** Every destructure op carries an unused `Value` just to satisfy the base class signature.
- **Uniformity hole.** "Does this op's `place` matter?" becomes per-op knowledge instead of an invariant.

---

### Approach B — Lower to single-result ops, preserve the pattern as a group

Keep the "one op, one result" invariant by splitting the destructure into individual definitions — one SSA op per binding. Tag them with a shared pattern so codegen can reassemble.

Two sub-shapes, depending on where the grouping lives:

#### B1 — Inline group with a shared marker

Emit N single-result ops back-to-back, each with a shared `patternId`. Codegen looks for consecutive ops with the same `patternId` and reassembles the pattern:

```
%arr      = load_global arr
%a        = destructure_element %arr {pattern = $P1, slot = array[0],   storage = local}
%b        = destructure_element %arr {pattern = $P1, slot = array[1],   storage = local}
%rest     = destructure_element %arr {pattern = $P1, slot = array[...], storage = local}
          store_local_group    %arr {pattern = $P1, kind = declaration}
```

Each op has one output (`%a`, `%b`, `%rest`). SSA is uniform. The `pattern` field + ordering reconstruct the syntactic tree.

**Pros.**
- **Uniform single-result SSA.** `getDefs()` is always `[place]`. No hybrid.
- **Passes that don't care about destructuring see ordinary defs and uses.** Dead-code elimination on `%b` "just works" — though see the caveat below.

**Cons.**
- **Codegen now has pattern-reassembly logic.** Walking the op list, finding matching `patternId`s, rebuilding the tree, checking that ordering wasn't disturbed by other passes.
- **Passes must treat a group as atomic.** You can't DCE `%b` without also dropping the `b` slot from the pattern — but the pattern lives across N ops. Hoisting / reordering passes have to respect the group boundary. Now every pass needs group-awareness; we've just moved the hybrid invariant from "look at getDefs()" to "look at patternId and keep groups contiguous."
- **The grouping is a convention, not a type.** An optimizer bug that splits a group produces invalid IR that only fails at codegen.
- **Semantics aren't actually split.** The iterator protocol for arrays and the rest-computation for objects are still atomic — splitting into per-element ops is notational, not operational. The fused op is the truthful representation.

#### B2 — Nested region (an IR-level "group" construct)

Give the grouping a first-class container — a `DestructurePatternOp` whose body is a sequence of per-binding sub-ops. Structured IR, but without MLIR's full region machinery.

```
%arr = load_global arr
destructure_pattern %arr {kind = declaration} {
  %a    = take_array_element   %arr, 0
  %b    = take_array_element   %arr, 1
  %rest = take_array_rest      %arr, from = 2
}
```

**Pros.**
- **Grouping is explicit in the IR type system.** Passes that want to look inside opt in; passes that don't treat the whole block as one op.
- **Uniform single-result SSA inside.**

**Cons.**
- **You've reinvented nested IR.** This is a region in everything but name — an op that contains a block of ops. If you accept this, you're a short step from MLIR-style regions.
- **Codegen still needs to recognize the pattern shape** and map the per-element ops back onto JS destructuring syntax. It's more structured than B1's "contiguous marker" but no simpler.
- **Two IR shapes for the same concept.** Assignment destructuring (`[a,b] = arr;` as an expression statement) and declaration destructuring (`let [a,b] = arr;`) already differ; now each has an inner structure too.

---

## Worked example: `let [a, { x, y: yy }, ...rest] = src;`

**Approach A (current).** One op, one tree.

```
%src = load_global src
%_   = array_destructure %src [
         binding(%a, local),
         object([
           { key: "x", value: binding(%x, local) },
           { key: "y", value: binding(%yy, local) },
         ]),
         rest(binding(%rest, local)),
       ] {kind = declaration}

// getDefs() = [%_, %a, %x, %yy, %rest]
// codegen walks elements → `let [a, { x, y: yy }, ...rest] = src;`
```

**Approach B1 (inline group).** Four single-result ops + a pattern footer.

```
%src     = load_global src
%a       = destructure_element %src {pattern=$P1, slot=array[0]}
%x       = destructure_element %src {pattern=$P1, slot=array[1].object("x")}
%yy      = destructure_element %src {pattern=$P1, slot=array[1].object("y")}
%rest    = destructure_element %src {pattern=$P1, slot=array[...], from=2}
           end_pattern            %src {pattern=$P1, kind=declaration}

// codegen: scan for pattern=$P1, build
//   tree: array[ a, object[x, yy], rest ]
// emit:   let [a, { x, y: yy }, ...rest] = src;
```

Identical emitted JS. The IR is flatter but the codegen-side reassembly is nontrivial. Every pass that moves or deletes ops has to keep the `$P1` run contiguous — if `%yy` gets hoisted out, the pattern is broken.

---

## Does this require MLIR?

No. All three shapes fit in a plain SSA framework:

- **Approach A** needs: ops can define more than one value. Represent with `getDefs(): Value[]`.
- **Approach B1** needs: ops carry metadata (`patternId`, `slot`) and passes respect contiguity. That is just a convention enforced by a verifier.
- **Approach B2** needs: one op can have a body — an ordered list of child ops with their own scope. That is a nested IR, and it *is* what MLIR calls a region. You can build this without depending on MLIR; you just have to accept the same conceptual overhead.

What MLIR gives you for free that you'd write yourself in B2: uniform APIs for walkers, printers, verifiers, and pass rewriters across nested structures. If you build B2 in a plain framework, expect to reinvent those.

---

## Recommendation for this codebase

**Keep Approach A**, but stop pretending it's single-result SSA.

Two concrete cleanups that don't add a region system:

1. **Make `Operation.place` optional.** Have a `ValueProducingOp` marker (or `place: Value | null`) and let void-typed ops (stores, destructures) stop carrying a dead `place`.
2. **Treat `getDefs()` as the canonical definition list, not a fallback.** Audit passes that read `op.place` and switch them to `getDefs()` where a destructure op could appear.

This preserves:
- One-to-one emitted JS for every destructure pattern.
- Correct iterator + rest semantics at a single well-defined point.
- Simple codegen.

And it fixes:
- The dead-`place` smell.
- The "did this pass remember to call `getDefs()`?" footgun.

The JS-emitting compiler isn't LLVM. Stores and destructures are *effect ops*, not value ops, and trying to force them into a single-result mold either wastes a slot (A) or distributes the grouping across ops and asks every pass to keep it together (B1/B2). Honesty about op shape — "this op produces these N defs; some ops produce zero" — is the cheaper invariant.
