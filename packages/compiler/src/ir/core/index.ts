export { BasicBlock, makeBlockId, type BlockId } from "./Block";
export type { ControlContext } from "./ControlContext";
export {
  Identifier,
  makeDeclarationId,
  makeIdentifierId,
  type DeclarationId,
  type IdentifierId,
} from "./Identifier";
export { Place, type PlaceId } from "./Place";
export {
  LexicalScope,
  makeLexicalScopeId,
  type LexicalScopeId,
  type LexicalScopeKind,
} from "./LexicalScope";
export { BaseStructure, BlockStructure } from "./Structure";
export {
  BranchTerminal,
  JumpTerminal,
  ReturnTerminal,
  SwitchTerminal,
  ThrowTerminal,
  TryTerminal,
} from "./Terminal";
