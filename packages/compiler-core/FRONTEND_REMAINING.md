# Compiler Frontend Remaining Work

Compared against the old POC frontend at the commit recorded in `docs/old-poc-compiler-commit.txt` and the current `packages/compiler-core/src/frontend` implementation.

## Current Compiler Coverage

- [x] Parse a module with Oxc.
- [x] Build a `ModuleIR` with one entry function.
- [x] Allocate stable IR ids through `IRIdAllocator`.
- [x] Collect module, block, function, class, import, var, lexical, and parameter declarations for the currently supported statement forms.
- [x] Resolve identifier references for the currently supported expression forms.
- [x] Lower empty statements.
- [x] Lower block statements as a nested declaration-instantiation boundary.
- [x] Lower expression statements only as value computation.
- [x] Lower `var`, `let`, and `const` declarations for simple identifier bindings.
- [x] Lower function declarations enough to create nested `FunctionIR` and hoist the binding.
- [x] Lower simple identifier function parameters.
- [x] Lower literals except RegExp.
- [x] Lower identifiers to binding loads.
- [x] Lower unary expressions except `delete`.
- [x] Lower binary expressions for the currently accepted operator set.
- [x] Lower function expressions.
- [x] Lower arrow function expressions.
- [x] Preserve async/generator flags on lowered function bodies.
- [x] Lower return statements.

## Frontend Infrastructure

- [ ] Add a frontend fixture test runner equivalent to the old POC frontend fixtures.
- [ ] Add compiler frontend fixtures for every syntax node as support is added.
- [ ] Add an IR snapshot printer or structured test serializer for frontend output.
- [ ] Add source locations to declarations, values, operations, and diagnostics.
- [ ] Add structured frontend diagnostics instead of plain `Error` strings.
- [ ] Add a verifier pass that validates frontend IR invariants after lowering.
- [ ] Add a single frontend API that returns parse result, scope graph, declaration table, instantiation plan, module IR, and diagnostics.
- [ ] Add support for script mode vs module mode.
- [ ] Add project-level frontend building comparable to `ProjectBuilder`.
- [ ] Add module path resolution comparable to `resolveModulePath`.
- [ ] Decide and implement the replacement for compiler-1 `Environment` without reintroducing a god object.

## Scope And Declaration Analysis

- [ ] Complete scope collection for all statements supported by compiler-1.
- [ ] Complete reference resolution for all expressions supported by compiler-1.
- [ ] Add global/unresolved reference handling with an explicit global binding model.
- [ ] Model ECMAScript lexical TDZ with created-but-uninitialized bindings.
- [ ] Model function declaration instantiation ordering and Annex B behavior where applicable.
- [ ] Model class declaration instantiation and class-name inner binding semantics.
- [ ] Model import declaration instantiation.
- [ ] Model catch parameter scope.
- [ ] Model parameter environments for default parameters.
- [ ] Model function-name bindings for named function expressions.
- [ ] Model class-name bindings for named class expressions.
- [ ] Model `var` hoisting across nested blocks, loops, switches, and function bodies.
- [ ] Model lexical declarations in switch cases.
- [ ] Model duplicate declaration early errors.
- [ ] Model import/export declaration conflicts.
- [ ] Model private names for classes.
- [ ] Add declaration table queries needed by codegen and later analysis.

## Binding And Pattern Lowering

- [ ] Lower destructuring variable declarations.
- [ ] Lower destructuring assignment targets.
- [ ] Lower array binding patterns.
- [ ] Lower object binding patterns.
- [ ] Lower rest binding elements.
- [ ] Lower assignment patterns/default initializers.
- [ ] Lower holes in array patterns.
- [ ] Lower parameter destructuring.
- [ ] Lower rest parameters.
- [ ] Lower default parameters.
- [ ] Lower TypeScript parameter properties or reject them at a clear frontend boundary.
- [ ] Add explicit pattern initialization operations or helper lowering utilities.
- [ ] Add tests for var/let/const destructuring, nested patterns, defaults, and rest.

## Expression Lowering

- [x] Literal expressions except RegExp.
- [x] Identifier expressions.
- [x] Unary expressions except `delete`.
- [x] Binary expressions for the supported operator set.
- [ ] RegExp literals.
- [ ] BigInt literal edge cases.
- [ ] Parenthesized expressions.
- [ ] TypeScript wrapper expressions that should erase before IR.
- [ ] Logical expressions.
- [ ] Assignment expressions.
- [ ] Update expressions.
- [ ] Conditional expressions.
- [ ] Sequence expressions.
- [ ] Member expressions.
- [ ] Optional member expressions.
- [ ] Call expressions.
- [ ] Optional call expressions.
- [ ] New expressions.
- [ ] Import expressions.
- [ ] Await expressions.
- [ ] Yield expressions.
- [ ] This expressions.
- [ ] Super expressions.
- [ ] Meta properties.
- [ ] Array expressions.
- [ ] Object expressions.
- [ ] Object methods.
- [ ] Object properties.
- [ ] Spread elements.
- [x] Function expressions.
- [x] Arrow function expressions.
- [ ] Class expressions.
- [ ] Template literals.
- [ ] Tagged template expressions.
- [ ] `delete` expressions with property and binding semantics.
- [ ] Private property access.
- [ ] Add materialization rules for expressions whose values must be preserved for ordering.

## Statement And Control-Flow Lowering

- [x] Empty statements.
- [x] Block statements.
- [x] Variable declarations for simple identifier bindings.
- [x] Function declarations as declaration-instantiation work.
- [ ] Expression statements that preserve intentional expression evaluation.
- [x] Return statements.
- [ ] Throw statements.
- [ ] If statements.
- [ ] Switch statements.
- [ ] While statements.
- [ ] Do-while statements.
- [ ] For statements.
- [ ] For-in statements.
- [ ] For-of statements.
- [ ] Break statements.
- [ ] Continue statements.
- [ ] Labeled statements.
- [x] Try statements.
- [x] Catch clauses.
- [x] Finally clauses.
- [ ] Debugger statements.
- [ ] Class declarations.
- [ ] Import declarations.
- [ ] Export named declarations.
- [ ] Export default declarations.
- [ ] Export-all declarations.
- [ ] Add terminator ops for jumps, branches, returns, throws, loops, switches, and exceptional edges.
- [x] Add control-context tracking for `break`, `continue`, and labels.
- [ ] Model abrupt completions through `finally` explicitly.
  - Current compiler keeps `TryTerminatorOp` structured and delegates resume
    semantics to JS `try/finally` codegen, matching the POC compiler.
  - Future lowering should introduce completion records before flattening
    try/finally or targeting a non-JS backend.
- [ ] Add block-argument/SSA edge values for control-flow joins.
- [ ] Add tests for every control-flow construct.

## Function Lowering

- [x] Create nested `FunctionIR` for function declarations.
- [x] Lower simple identifier parameters.
- [x] Preserve async/generator flags on `FunctionIR`.
- [ ] Lower function declaration bodies with returns and control flow.
- [x] Lower function expressions.
- [x] Lower arrow function expressions.
- [x] Lower async function body flags.
- [x] Lower generator function body flags.
- [x] Lower async generator function body flags.
- [ ] Model `this` binding mode.
- [ ] Model `arguments`.
- [ ] Model `super` inside methods/derived constructors.
- [ ] Model captures explicitly.
- [ ] Model function names for diagnostics and codegen.
- [ ] Handle expression-bodied arrow functions.
- [ ] Handle parameter defaults and rest parameters.
- [ ] Add call graph metadata needed by later analysis.

## Class Lowering

- [ ] Lower class declarations.
- [ ] Lower class expressions.
- [ ] Lower constructors.
- [ ] Lower methods.
- [ ] Lower static methods.
- [ ] Lower fields.
- [ ] Lower static fields.
- [ ] Lower computed class element keys.
- [ ] Lower private fields.
- [ ] Lower private methods.
- [ ] Lower accessors.
- [ ] Lower decorators or reject them at a clear frontend boundary.
- [ ] Lower `super` property access.
- [ ] Lower `super()` calls.
- [ ] Add class element ordering tests.

## Module Lowering

- [ ] Lower static imports.
- [ ] Lower default imports.
- [ ] Lower namespace imports.
- [ ] Lower named imports.
- [ ] Lower side-effect-only imports.
- [ ] Lower dynamic imports.
- [ ] Lower named exports.
- [ ] Lower default exports.
- [ ] Lower re-exports.
- [ ] Lower export-all declarations.
- [ ] Add `ModuleIR` import/export records or equivalent module-linking IR.
- [ ] Add module summary output comparable to compiler-1 `ModuleSummary`.
- [ ] Add CommonJS export collection or a cleaner replacement.
- [ ] Add tests for cross-module binding behavior.

## JSX Lowering

- [ ] Lower JSX elements.
- [ ] Lower JSX fragments.
- [ ] Lower JSX opening elements.
- [ ] Lower JSX closing elements.
- [ ] Lower JSX attributes.
- [ ] Lower JSX spread attributes.
- [ ] Lower JSX expression containers.
- [ ] Lower JSX text.
- [ ] Lower JSX identifiers.
- [ ] Lower JSX member expressions.
- [ ] Lower JSX namespaced names.
- [ ] Decide whether JSX lowers to dedicated IR ops or directly to calls.
- [ ] Add tests covering React-style JSX output expectations.

## IR Ops Required By Frontend

- [x] `ConstantOp`.
- [x] `LoadBindingOp`.
- [x] `InitializeBindingOp`.
- [x] `StoreBindingOp`.
- [x] `BinaryOp`.
- [x] `UnaryOp`.
- [x] `CreateFunctionOp`.
- [ ] Expression/evaluation statement op.
- [ ] RegExp constant or RegExp literal op.
- [ ] Load global op or global binding model.
- [ ] Load property ops.
- [ ] Store property ops.
- [ ] Delete property op.
- [ ] Call op.
- [ ] Construct op.
- [ ] Await op.
- [ ] Yield op.
- [ ] Array/object creation ops.
- [ ] Spread op.
- [ ] Template literal ops.
- [ ] Function return terminator.
- [x] Throw terminator.
- [ ] Jump terminator.
- [ ] Branch terminator.
- [ ] Switch terminator.
- [ ] Loop/control-flow support ops.
- [x] Structured try/catch/finally terminator.
- [ ] Explicit completion-record lowering for flattened try/finally.
- [ ] Import/export ops or module metadata records.
- [ ] Class creation and class element ops.
- [ ] JSX ops if JSX remains explicit in IR.

## Tests To Port Or Recreate From Compiler-1

- [ ] `big-int-literal`.
- [ ] `call-expression`.
- [ ] `conditional-expression`.
- [ ] `empty-statement`.
- [ ] `for-statement`.
- [ ] `labeled-statement`.
- [ ] `member-expression`.
- [ ] `null-literal`.
- [ ] `optional-chaining`.
- [ ] `regexp-literal`.
- [ ] `while-statement`.
- [ ] `buildAssignmentExpression.test.ts`.
- [ ] `buildBinaryExpression.test.ts`.
- [ ] `buildCallExpression.test.ts`.
- [ ] `buildIdentifier.test.ts`.
- [ ] `buildLogicalExpression.test.ts`.
- [ ] `buildMemberExpression.test.ts`.
- [ ] `buildUnaryExpression.test.ts`.
- [ ] `buildVariableDeclaration.test.ts`.

## Recommended Implementation Order

- [ ] Preserve expression statements with a dedicated evaluation op.
- [ ] Add return statements and function body output.
- [ ] Add assignment expressions.
- [ ] Add member expressions and property effects.
- [ ] Add call and new expressions.
- [ ] Add logical and conditional expressions.
- [ ] Add if/branch CFG support.
- [ ] Add loops, break, continue, and labels.
- [ ] Add destructuring and pattern initialization.
- [ ] Add complete function parameters.
- [ ] Add object and array literals.
- [ ] Add modules/imports/exports.
- [ ] Add classes.
- [ ] Add try/catch/finally.
- [ ] Add JSX.
