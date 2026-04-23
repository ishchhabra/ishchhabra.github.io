/**
 * Control-flow ops. All are CFG terminators — they end a basic block
 * by naming successor blocks (explicit or via block-args). The old
 * region-owning structured ops have been removed in favor of flat CFG.
 */

export { JumpTermOp } from "./Jump";
export { ReturnTermOp } from "./Return";
export { ThrowTermOp } from "./Throw";

export { BranchTermOp } from "./BranchTerm";
export { IfTermOp } from "./IfTerm";
export { WhileTermOp } from "./WhileTerm";
export { ForTermOp } from "./ForTerm";
export { ForOfTermOp } from "./ForOfTerm";
export { ForInTermOp } from "./ForInTerm";
export { TryTermOp } from "./TryTerm";
export { SwitchTermOp, type SwitchCase } from "./SwitchTerm";
export { LabeledTermOp } from "./LabeledTerm";
