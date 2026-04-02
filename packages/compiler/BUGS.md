# AOT Compiler Bug Report

Bugs discovered during portfolio AOT + node_modules deployment. Each bug
has a minimal reproduction fixture in `test/bugs/`.

---

## Bug 1: Pipeline skips modules not in postOrder

**Status:** Fixed (`Pipeline.ts`)

**Root cause:** The Pipeline only iterated over `projectUnit.postOrder`
(modules reachable from entry points). Modules built by `ProjectBuilder`
but not reachable via the import-graph traversal were never processed by
the SSA pipeline. The code generator still emitted code for them, producing
raw un-SSA'd IR with block-scoped variable escape bugs.

21 out of 2088 modules were affected, including `@tanstack/history`.

**Fix:** Append modules not in postOrder to the processing list after the
reverse-post-order modules.

**Fixture:** `test/bugs/pipeline-skips-modules/`

---

## Bug 2: LateCopyFolding removes StoreLocal with remaining users

**Status:** Fixed (`LateCopyFoldingPass.ts`)

**Root cause:** `foldExpressionInliningInBlock` matches the pattern
`StoreLocal(x, value); LoadLocal(tmp, x); Copy(phi, tmp)` and folds it
to `Copy(phi, value)`, removing the StoreLocal. It only checked
`LoadLocal`/`LoadPhi` instructions to verify `x` has a single reader,
but other instruction types (member expressions, call expressions) also
reference `x`'s identifier through their read places. Removing the
StoreLocal left those references dangling.

**Fix:** Guard with `store.lval.identifier.uses.size > 1`.

**Fixture:** `test/bugs/late-copy-fold-dangling-ref/`

---

## Bug 3: let/const in sibling block scopes share declaration ID

**Status:** Fixed (`buildVariableDeclarationBindings.ts`)

**Root cause:** `buildIdentifierBindings` checked
`functionScope.data[originalName] !== undefined` to skip duplicate
registrations. This guard is correct for `var` (function-scoped,
hoisted), but for `let`/`const` (block-scoped), a same-named binding
in a sibling block is a completely independent declaration that must
get its own declaration ID.

**Fix:** Only apply the guard for `declarationKind === "var"`.

**Fixture:** `test/bugs/let-const-sibling-scope/`

---

## Bug 4: Context variable captures reference stale identifiers after SSA

**Status:** Open (32 instances, worked around via deny list)

**Root cause:** When a `let` variable is captured by a closure (arrow
function, function expression) and the SSA optimization passes transform
the variable, the closure's `StoreContext`/`LoadContext` instructions
still reference the original capture parameter's identifier name. The
codegen emits this stale name, which doesn't match the outer-scope
variable's current name.

This is NOT caused by the `FunctionInliningPass` (which never fires for
these patterns). The issue is in how SSA renaming interacts with context
variables: the `contextDeclarationIds` set causes SSA to skip renaming
for these variables, but the ExpressionInliningPass or
ConstantPropagationPass may still substitute values that change the
effective binding, leaving the closure's references stale.

**Example pattern:**
```javascript
function createValue() {
  let isReset = false;
  return {
    clearReset: () => { isReset = false; },
    reset: () => { isReset = true; },
    isReset: () => isReset,
  };
}
var ctx = React.createContext(createValue());
```

After compilation, `isReset` reads correctly reference the outer variable
but writes reference a stale capture parameter identifier.

**Fixture:** `test/bugs/context-var-stale-capture/`

---

## Bug 5: Loop variable SSA versions escape block scope

**Status:** Open (8 instances, worked around via deny list)

**Root cause:** In loops with complex control flow (`while(true)` with
`break`/`continue`, nested loops with labeled `continue`), SSA creates
multiple versions of loop variables. The phi placement creates phis at
loop headers, but the codegen declares some SSA versions as `const`
inside conditional blocks within the loop body. References to these
versions from other parts of the loop (or from phi assignments) escape
the block scope.

**Example pattern:**
```javascript
function walk(node) {
  let current = node;
  while (current !== undefined) {
    if (current.skip) {
      current = current.next;
      continue;
    }
    // use current
    current = current.child;
  }
}
```

SSA creates `current_0`, `current_1`, `current_2` for each assignment.
The phi at the loop header merges them, but `current_2` (declared inside
the `if` block) is referenced by the phi outside its scope.

**Fixture:** `test/bugs/loop-var-scope-escape/`

---

## Bug 6: foldInitialValueInBlock propagates branch-local values

**Status:** Fixed (disabled in `LateCopyFoldingPass.ts`)

**Root cause:** `foldInitialValueInBlock` folds
`StoreLocal(x, init); Copy(x, value) → StoreLocal(x, value)`. This is
correct within a single block, but in a fixpoint loop combined with
`LateCopyCoalescing` and `LateCopyPropagation`, it can propagate a
branch-local value into a merge block where the value is out of scope.

**Fix:** Disabled the fold. A dominance check was added as a secondary
guard but the fold remains disabled.

**Fixture:** `test/bugs/fold-initial-value-cross-scope/`
