# Finally Completion Semantics

The compiler currently keeps ECMAScript `try` statements as structured IR through
JavaScript codegen. `TryTerminatorOp` owns the protected body, optional catch
region, optional finally region, and exit block, and the backend emits real
JavaScript `try { ... } catch { ... } finally { ... }`.

That means abrupt completions inside the protected regions are resumed by the
JavaScript runtime:

- `break` exits the target loop or switch after the finalizer runs.
- `continue` resumes the target loop after the finalizer runs.
- `return` returns the value after the finalizer runs unless the finalizer
  overrides it.
- `throw` propagates after the finalizer runs unless the finalizer overrides it.

This matches the POC compiler strategy and avoids lowering completion records
before they are needed. Optimization passes must treat `TryTerminatorOp` with a
`finallyBlock` as a structured control-effect boundary unless they explicitly
understand ECMAScript completion semantics.

If the compiler later needs a flat CFG or a non-JavaScript backend, lower
`try/finally` through explicit completion records. Each abrupt edge entering a
finally region should carry the completion kind, optional payload, and final
continuation:

- normal fallthrough target
- break target and optional label
- continue target and optional label
- return value
- thrown value

The shared finalizer can then resume by dispatching on that completion record.
