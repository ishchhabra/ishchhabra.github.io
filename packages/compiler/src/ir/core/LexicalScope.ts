/**
 * Simulated opaque type for LexicalScopeId to prevent using normal numbers as ids
 * accidentally.
 */
const opaqueLexicalScopeId = Symbol();
export type LexicalScopeId = number & { [opaqueLexicalScopeId]: "LexicalScopeId" };

export function makeLexicalScopeId(id: number): LexicalScopeId {
  return id as LexicalScopeId;
}

/**
 * The kind of lexical scope, corresponding to the ECMAScript construct
 * that creates the scope's LexicalEnvironment.
 *
 *   - `program`  — §16.1.7  ScriptEvaluation / §16.2.1.5.2 ModuleEvaluation
 *   - `function` — §10.2.11 FunctionDeclarationInstantiation
 *   - `block`    — §14.2.2  BlockDeclarationInstantiation
 *   - `switch`   — §14.12.2 CaseBlock creates a single shared environment
 *   - `for`      — §14.7.4  for(let/const ...) creates a per-iteration scope
 *   - `catch`    — §14.15.2 CatchClauseEvaluation
 *   - `class`    — §15.7.14 ClassDefinitionEvaluation
 */
export type LexicalScopeKind = "program" | "function" | "block" | "switch" | "for" | "catch" | "class";

/**
 * A lexical scope in the IR.
 *
 * Represents a source-level construct that creates a new
 * LexicalEnvironment (per the ECMAScript spec). The scope tree is
 * first-class in the IR: every {@link BasicBlock} carries a `scopeId`
 * indicating which scope its instructions execute in. The codegen uses
 * scope transitions between blocks to decide when to emit `{ }`.
 *
 * The scope tree is built during HIR construction (from the frontend's
 * scope analysis) and carried through the pipeline unchanged. It is
 * intentionally minimal — binding resolution, mutation tracking, and
 * other analysis data are ephemeral frontend concerns, not part of
 * the IR.
 */
export class LexicalScope {
  constructor(
    public readonly id: LexicalScopeId,
    public readonly parent: LexicalScopeId | null,
    public readonly kind: LexicalScopeKind,
  ) {}
}
