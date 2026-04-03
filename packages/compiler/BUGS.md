# Compiler Bugs

## Bug 1: `@iframe-resizer/core` — var hoisting conflicts with const in same scope

**Status:** Open (workaround: deny list in aot-prebuild.mjs)

**Pattern:** CJS interop idiom where a comma expression assigns to a `var`-hoisted
variable that the compiler also emits as `const`:

```js
// Original source
const Q = (ee = e, ee?.__esModule ? ee.default : ee);
var ee;
```

```js
// Compiled output (broken)
const $414733_0 = $416904_0;
var $414733_0 = undefined;   // ← cannot redeclare const with var
```

**Root cause:** The compiler emits a `const` for the comma expression result (since
the variable is used before the `var` declaration), then emits a hoisted `let` for the
`var ee` declaration, both targeting the same identifier. The `var` hoisting and `const`
emission don't coordinate — they independently claim the same `declarationId`.

**Minimal reproduction:** Not yet created. The pattern requires a comma expression that
assigns to a forward-declared `var`, combined with a `const` binding of the same name
in the same scope.

---

## Bug 2: `let`/`const` in sibling block scopes share declarationId

**Status:** Fixed (commit 582dca8 lost the fix during merge; re-fixed and staged)

**Pattern:** Same-named `const` declarations in sibling block scopes get the same
`declarationId`, causing the second declaration to be emitted as a bare assignment:

```js
// Input
function f(a) {
  if (a) {
    const x = a.foo;
    return x;
  }
  const x = a.bar;
  return x;
}
```

```js
// Output (broken)
function f($1_0) {
  if ($1_0) {
    const $2_0 = $1_0.foo;   // declared here
    return $2_0;
  }
  $2_0 = $1_0.bar;           // ← ReferenceError: no declaration
  return $2_0;
}
```

**Root cause:** `buildVariableDeclarationBindings` checks
`functionScope.data[originalName]` to skip duplicate registrations. This guard is
correct for `var` (function-scoped, same binding across blocks) but wrong for
`let`/`const` (block-scoped, independent bindings per block). The first `const x`
sets `functionScope.data["x"]`, and the second `const x` in a sibling scope finds
it already set and skips registration — so it never gets its own `declarationId`.

**Fix:** Wrap the guard in `if (declarationKind === "var")` so `let`/`const`
declarations always get registered regardless of name collisions across scopes.

**Test fixture:** `test/frontend/variable-declaration/let-const-sibling-scope/`
