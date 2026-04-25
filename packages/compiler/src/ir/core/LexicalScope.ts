const opaqueScopeId = Symbol();
export type ScopeId = number & { [opaqueScopeId]: "ScopeId" };

export function makeScopeId(id: number): ScopeId {
  return id as ScopeId;
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
 *
 * The former `LexicalScope` class, `LexicalScopeId` opaque type,
 * `makeLexicalScopeId`, and `Environment.scopes` registry have been
 * deleted. Scope identity no longer needs to survive past frontend
 * building: the MLIR-style region tree carries scope KIND on each
 * the function body, and the function inliner walks
 * `FuncOp.parentFuncOpId` for visibility checks.
 */
export type LexicalScopeKind =
  | "program"
  | "function"
  | "block"
  | "switch"
  | "for"
  | "catch"
  | "class";
