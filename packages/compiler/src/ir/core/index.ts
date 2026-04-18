export { BasicBlock, makeBlockId, type BlockId } from "./Block";
export {
  getCodegenDeclarationKind,
  type DeclarationKind,
  type DeclarationMetadata,
} from "./Declaration";
export {
  collectDestructureTargetBindingPlaces,
  destructureTargetHasObservableWrites,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
  type ArrayDestructureTarget,
  type DestructureBindingStorage,
  type DestructureBindingTarget,
  type DestructureObjectProperty,
  type DestructureTarget,
  type ObjectDestructureTarget,
} from "./Destructure";
export type { ControlContext } from "./ControlContext";
export {
  Value,
  makeValueId,
  makeDeclarationId,
  type DeclarationId,
  type User,
  type ValueId,
} from "./Value";
export { type LexicalScopeKind } from "./LexicalScope";
export {
  makeCloneContext,
  makeOperationId,
  nextId,
  Operation,
  remapBlockId,
  remapPlace,
  requireModuleIR,
  Trait,
  VerifyError,
  type CloneContext,
  type OperationId,
} from "./Operation";
export { Region } from "./Region";
