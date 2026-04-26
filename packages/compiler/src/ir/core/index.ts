export { BasicBlock, makeBlockId, type BlockId } from "./Block";
export {
  getCodegenDeclarationKind,
  importNameToExportName,
  type DeclarationKind,
  type DeclarationMetadata,
  type ImportName,
} from "./Declaration";
export {
  collectDestructureTargetBindingPlaces,
  destructureTargetHasObservableWrites,
  destructureTargetResults,
  destructureTargetOperands,
  rewriteDestructureTarget,
  type ArrayDestructureTarget,
  type DestructureBindingStorage,
  type DestructureBindingTarget,
  type DestructureObjectProperty,
  type DestructureTarget,
  type ObjectDestructureTarget,
} from "./Destructure";
export type { ControlContext } from "./ControlContext";
export { Value, makeValueId, makeDeclarationId, type DeclarationId, type ValueId } from "./Value";
export { type LexicalScopeKind } from "./LexicalScope";
export { makeScopeId, type ScopeId } from "./LexicalScope";
export {
  makeCloneContext,
  makeOperationId,
  nextId,
  Operation,
  remapBlock,
  remapPlace,
  requireModuleIR,
  VerifyError,
  type CloneContext,
  type OperationId,
} from "./Operation";
export {
  assertNoSuccessorArgs,
  invalidSuccessorIndex,
  producedSuccessorArg,
  producedSuccessorValues,
  successorArgValue,
  successorArgValues,
  TermOp,
  valueSuccessorArg,
  valueSuccessorArgs,
  type CFGSuccessor,
  type SuccessorArg,
} from "./TermOp";
