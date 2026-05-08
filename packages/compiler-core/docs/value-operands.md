# Value Operands

## Current Shape

`Operation.operands()` returns the SSA values read by executable IR nodes.
`FunctionIR.operands()` returns SSA values referenced by function-level
structure, such as parameter default initializers, computed parameter-pattern
keys, and captures.

This keeps `FunctionIR` as a container rather than making it an `Operation`,
while still giving passes and backends a direct way to discover function-level
value references.

`Value.users` includes both executable operations and structural function uses.
Code that needs block-local executable users must filter users to operations
before reading operation-specific fields such as `ownerBlock`.

## Future Direction

If more non-operation IR containers start owning values, introduce a shared
protocol:

```ts
export interface ValueOperandOwner {
  operands(): readonly Value[];
}
```

`Operation` and `FunctionIR` would implement that protocol, and IR walking
helpers would yield all value operand owners in a function:

```ts
export function* valueOperandOwners(fn: FunctionIR): Iterable<ValueOperandOwner> {
  yield fn;

  for (const block of fn.blocks) {
    for (const op of block.getAllOps()) {
      yield op;
    }
  }
}
```

That gives optimization passes one operand contract without making functions
pretend to be executable operations.
