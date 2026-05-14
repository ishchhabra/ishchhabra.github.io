# Compiler Design Docs

These docs capture the durable design decisions from the compiler rebuild
discussion and the current implementation. They are intended to guide future
changes without requiring the full Codex session transcript.

Source material:

- The local Codex rollout transcript at
  `/Users/ishchhabra/.codex/sessions/2026/05/03/rollout-2026-05-03T00-27-52-019dea0d-e6a5-73b1-a832-0ba0ff4d13b3.jsonl`
- The current `packages/compiler-core/src` implementation
- Comparison points from the POC compiler recorded in `docs/old-poc-compiler-commit.txt`

## Docs

| Doc                                                               | Purpose                                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Architecture Decisions](./architecture-decisions.md)             | Cross-cutting decisions that should stay stable unless intentionally revisited.              |
| [Comment Style](./comment-style.md)                               | JSDoc/TSDoc rules for public APIs, invariants, examples, and internal comments.              |
| [IR Model](./ir-model.md)                                         | Core IR object model, ownership, block params, terminators, effects, and op grouping.        |
| [Frontend Architecture](./frontend-architecture.md)               | Scope analysis, declaration instantiation, builders, lowering, and ECMAScript semantics.     |
| [Backend And Codegen](./backend-and-codegen.md)                   | JavaScript backend design, structured emission, ESTree/esrap usage, and Vite integration.    |
| [Passes And SSA](./passes-and-ssa.md)                             | Analysis manager, transform passes, binding promotion, SSA elimination, and copy scheduling. |
| [Testing Strategy](./testing-strategy.md)                         | What to unit test, what to snapshot, and where test utilities belong.                        |
| [Finally Completion Semantics](./finally-completion-semantics.md) | Current `try/finally` strategy and when explicit completion records become necessary.        |
| [Value Operands](./value-operands.md)                             | Current handling of function-level value operands and the future shared protocol.            |

## Documentation Policy

Design docs should explain stable architecture and why it exists. Code comments
should explain local contracts and invariants. Avoid copying implementation
history into JSDoc; put historical context here only when it changes how future
work should be done.
