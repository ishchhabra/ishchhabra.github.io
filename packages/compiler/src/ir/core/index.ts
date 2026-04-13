export { BasicBlock, makeBlockId, type BlockId } from "./Block";
export {
  getCodegenDeclarationKind,
  type DeclarationKind,
  type DeclarationMetadata,
} from "./Declaration";
export {
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
  Identifier,
  makeDeclarationId,
  makeIdentifierId,
  type DeclarationId,
  type IdentifierId,
} from "./Identifier";
export {
  LexicalScope,
  makeLexicalScopeId,
  type LexicalScopeId,
  type LexicalScopeKind,
} from "./LexicalScope";
export {
  makeCloneContext,
  makeOperationId,
  nextId,
  Operation,
  remapBlockId,
  remapPlace,
  Trait,
  VerifyError,
  type CloneContext,
  type OperationId,
} from "./Operation";
export { Place, type PlaceId } from "./Place";
export { Region } from "./Region";
