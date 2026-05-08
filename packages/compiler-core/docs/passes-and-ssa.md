# Passes And SSA

## Analyses

Analyses are pure readers. They compute cached facts for a `FunctionIR` or
`ModuleIR` and must not mutate IR.

`AnalysisManager` lazily computes and caches analysis results. Transform passes
must invalidate cached results after mutation through `PreservedAnalyses`.

| Analysis | Purpose |
| --- | --- |
| `DominatorTreeAnalysis` | Computes reachability, immediate dominators, and dominance frontiers for one function. |
| `PromotableBinding` analysis | Determines which declaration-backed bindings are safe to promote. |

Use interface-based analysis keys exported as const objects. Avoid a class
hierarchy unless analyses need shared base behavior.

## Passes

Passes mutate IR in place and return `PassResult`.

| Pass type | Use |
| --- | --- |
| `FunctionPass` | Mutates one function body. |
| `ModulePass` | Mutates module-level structure or cross-function metadata. |

Passes live under `src/ir/passes`. Optimizations should also live there, with
subdirectories when a family needs shared helpers.

## Binding SSA Model

Compiler-2 uses scalar SSA for JavaScript values. Operation results, function
parameters, and block parameters are already `Value` objects; each `Value` is
defined once.

Source bindings are different. A source binding such as `let x` is a mutable
ECMAScript storage location identified by a `DeclarationId`. Frontend lowering
starts in memory form:

```txt
v0 = ConstantOp(0)
InitializeBindingOp(x, v0)

v1 = ConstantOp(1)
StoreBindingOp(x, v1)

v2 = LoadBindingOp(x)
CallOp(console.log, [v2])
```

In this form, `LoadBindingOp(x)` says which source binding to read, but it does
not say which write reaches the read. Optimizations would need memory-form
reaching-definition analysis to know that `v2` is the value written by
`StoreBindingOp(x, v1)`.

The desired post-SSA form makes binding dataflow explicit:

```txt
v0 = ConstantOp(0)
x0 = InitializeBindingOp(x, v0)

v1 = ConstantOp(1)
x1 = StoreBindingOp(x, v1)

v2 = LoadBindingOp(x, x1)
CallOp(console.log, [v2])
```

`x0` and `x1` are compiler `Value`s, not source names and not JavaScript
temporaries. They represent the value currently stored in the source binding
after each write. A load consumes the reaching binding value, so scalar passes
can forward facts through binding ops without scanning memory writes.

| Concept | Representation |
| --- | --- |
| Source binding identity | `DeclarationId` |
| Runtime value being stored | `value: Value` |
| Binding value after a write | `bindingValue: Value`, exposed as the write op's single result |
| Runtime value read by a load | `LoadBindingOp.result` |
| Reaching binding value read by a load | `LoadBindingOp.bindingValue` after SSA construction |

`StoreBindingOp` must not use its result for JavaScript assignment completion.
Assignment expressions evaluate to the RHS or computed value; lowering returns
that value directly. The store result is reserved for `bindingValue`.

For example:

```js
y = (x = compute());
```

should lower conceptually as:

```txt
v0 = CallOp(compute)
x0 = StoreBindingOp(x, v0)
y0 = StoreBindingOp(y, v0)
```

Both stores use `v0`. The inner assignment expression returns `v0`, not `x0`.

## Binding Promotion

`BindingPromotionPass` is the JavaScript binding equivalent of mem2reg. It
promotes declaration-backed binding storage into scalar SSA values when the
binding storage is not observably needed.

Before:

```txt
entry:
  v0 = ConstantOp(1)
  InitializeBindingOp(x, v0)
  v1 = LoadBindingOp(x)
  ReturnTerminatorOp(v1)
```

After:

```txt
entry:
  v0 = ConstantOp(1)
  ReturnTerminatorOp(v0)
```

At joins, the pass inserts block params instead of phi ops:

```txt
then:
  JumpTerminatorOp(join(v1))
else:
  JumpTerminatorOp(join(v2))
join(x):
  ReturnTerminatorOp(x)
```

The pass should receive `declarations`, not compute promotability itself. The
caller must exclude captured bindings, imports, globals, unproven TDZ cases,
and bindings observed through dynamic scope.

Bindings that are not promotable should still participate in binding SSA. Their
storage operations remain for codegen and observable semantics, but each write
has a fresh `bindingValue`, and each load is connected to the reaching
`bindingValue`. That keeps scalar optimization passes value-based.

## Binding Promotion Algorithm

| Step | Purpose |
| --- | --- |
| Collect definition blocks | Find blocks that write each promoted declaration. |
| Place block params | Insert phi-equivalent params at dominance-frontier merge points. |
| Compute dominator children | Build a preorder traversal from immediate dominators. |
| Rename blocks | Walk the dominator tree with one stack per declaration. |
| Replace loads | Replace each promoted load result with the current reaching value. |
| Replace writes | Push the written value onto the declaration stack and remove the storage op. |
| Rewrite successor arguments | Pass current reaching values to inserted block params. |

`computeDominatorChildren` turns immediate dominators into a parent-to-children
map. If `A` immediately dominates `B` and `C`, and `B` immediately dominates
`D`, the tree is:

```txt
A
  B
    D
  C
```

Renaming follows that tree so every reaching value on the stack dominates the
block currently being rewritten.

## Full SSA Construction

The full enter-SSA phase is a hybrid:

| Part | Algorithmic family | Why |
| --- | --- | --- |
| Block-param placement for binding joins | Cytron et al. | The pass computes dominance frontiers and inserts phi-equivalent block params before renaming. |
| Rename walk | Cytron et al. | The pass walks the dominator tree with one stack per declaration. |
| Fresh binding values allocated during lowering | Compiler-2 frontend convention | Each write op owns a result from the start so def-use links can be maintained by normal IR ownership APIs. |
| Load resolution | SSA construction rename step | Unresolved `LoadBindingOp(x)` is rewritten to read the reaching binding value or removed when the binding is promoted. |

This is not Braun et al.'s lazy/backward SSA construction. Braun-style SSA
would build SSA on demand from variable reads, recursively searching
predecessors and creating phis lazily. Compiler-2 instead lowers explicit
binding write ops, then runs an explicit dominator-frontier placement and
rename pass.

It is also not a general MemorySSA design. Binding values are scalar `Value`s
for source declarations. Heap, property, global, and unknown effects remain in
`OperationEffects` and should use alias/effect analyses when needed.

## SSA Elimination

`SSAEliminationPass` converts promoted binding block params into explicit edge
copies before JavaScript emission.

It should not demote every block param. Produced params from structured control
such as for-of and catch are part of the terminator's runtime semantics and are
left in block-param form for structured codegen.

Before:

```txt
then:
  JumpTerminatorOp(join(v1))
else:
  JumpTerminatorOp(join(v2))
join(x):
  ReturnTerminatorOp(x)
```

After:

```txt
then:
  CopyValueOp(x, v1)
  JumpTerminatorOp(join)
else:
  CopyValueOp(x, v2)
  JumpTerminatorOp(join)
join:
  ReturnTerminatorOp(x)
```

Copies are inserted before a jump terminator because edge copies conceptually
execute on the predecessor edge after the predecessor's value computations and
before control transfers. Inserting them at the start of the successor would
run them after the control transfer and can be wrong when multiple predecessors
enter the same block.

## Parallel Copies

SSA elimination must schedule parallel copies safely.

Example:

```txt
a <- b
b <- a
```

A naive sequential lowering overwrites one source before the other copy reads
it. Use `ParallelCopyScheduler` and a temporary value when cycles exist.

`CopyValueOp` is an IR operation because codegen needs an explicit,
side-effect-free value materialization step after SSA elimination. It is not a
source binding write and should not be represented as `StoreBindingOp`.

## Naming

| Name | Use |
| --- | --- |
| `BindingPromotionPass` | Promotes declaration-backed binding storage to SSA. |
| `SSAEliminationPass` | Lowers selected SSA block params to executable copies before JS emission. |
| `CopyValueOp` | Assigns or materializes one IR value from another IR value. |
| `ParallelCopyScheduler` | Orders edge copies without clobbering sources. |

Avoid naming the inverse of promotion as "binding demotion"; the pass operates
on block params and edge copies, not source binding storage.
