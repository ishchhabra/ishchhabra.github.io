import { Environment } from "../../../environment";
import {
  BaseInstruction,
  BasicBlock,
  BlockId,
  CopyInstruction,
  ExpressionStatementInstruction,
  LoadLocalInstruction,
  StoreLocalInstruction,
  makeInstructionId,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { BranchTerminal, JumpTerminal } from "../../../ir/core/Terminal";
import { BindingIdentifierInstruction } from "../../../ir/instructions/BindingIdentifier";
import { ConditionalExpressionInstruction } from "../../../ir/instructions/value/ConditionalExpression";
import { DeclarationId, Place } from "../../../ir";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Collapses diamond-shaped phi patterns into conditional (ternary) expressions.
 *
 * Detects the pattern produced by SSA elimination:
 *
 * ```
 *   let $phi = init;
 *   if (test) {
 *     ... pure instructions ...
 *     $phi = consequentValue;
 *   } else {
 *     ... pure instructions ...
 *     $phi = alternateValue;
 *   }
 * ```
 *
 * And transforms it into:
 *
 * ```
 *   ... hoisted pure instructions from both branches ...
 *   const $phi = test ? consequentValue : alternateValue;
 * ```
 *
 * Conditions for the transformation:
 * - The branch block must end with a BranchTerminal
 * - Both consequent and alternate blocks must jump to the same fallthrough
 * - Both branches must end with a phi copy chain (LoadLocal → Copy → ExpressionStatement)
 *   writing to the same phi variable
 * - All non-phi-copy instructions in both branches must be pure
 */
export class PhiToTernaryPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const [blockId, block] of this.functionIR.blocks) {
      if (this.tryCollapseDiamond(blockId, block)) {
        changed = true;
      }
    }

    return { changed };
  }

  private tryCollapseDiamond(blockId: BlockId, block: BasicBlock): boolean {
    const terminal = block.terminal;
    if (!(terminal instanceof BranchTerminal)) return false;

    const consBlock = this.functionIR.blocks.get(terminal.consequent);
    const altBlock = this.functionIR.blocks.get(terminal.alternate);
    if (!consBlock || !altBlock) return false;

    // Both branches must jump to the same fallthrough
    if (
      !(consBlock.terminal instanceof JumpTerminal) ||
      !(altBlock.terminal instanceof JumpTerminal)
    )
      return false;
    if (consBlock.terminal.target !== terminal.fallthrough) return false;
    if (altBlock.terminal.target !== terminal.fallthrough) return false;

    // Extract phi copy chain from each branch (last 3 instructions)
    const consPhi = extractPhiCopyChain(consBlock);
    const altPhi = extractPhiCopyChain(altBlock);
    if (!consPhi || !altPhi) return false;

    // Both must write to the same phi variable
    if (consPhi.phiDeclarationId !== altPhi.phiDeclarationId) return false;

    // All non-phi-copy instructions must be pure
    const consOtherInstrs = consBlock.instructions.slice(0, consBlock.instructions.length - 3);
    const altOtherInstrs = altBlock.instructions.slice(0, altBlock.instructions.length - 3);

    const hoistable = (instr: BaseInstruction) => isHoistable(instr, this.environment);
    if (!consOtherInstrs.every(hoistable)) return false;
    if (!altOtherInstrs.every(hoistable)) return false;

    // Find the phi declaration (StoreLocal "let") in the parent block
    const phiDeclIndex = block.instructions.findIndex(
      (i) =>
        i instanceof StoreLocalInstruction &&
        i.type === "let" &&
        i.lval.identifier.declarationId === consPhi.phiDeclarationId,
    );
    if (phiDeclIndex === -1) return false;
    const phiDecl = block.instructions[phiDeclIndex] as StoreLocalInstruction;

    // Create the conditional expression instruction.
    // Reuse a place from the deleted branch's copy chain as the output place.
    const condId = makeInstructionId(this.functionIR.id + 90000 + blockId);
    const condInstr = new ConditionalExpressionInstruction(
      condId,
      consPhi.reusablePlace,
      undefined,
      terminal.test,
      consPhi.valuePlace,
      altPhi.valuePlace,
    );

    // Replace the phi StoreLocal("let") with a StoreLocal("const") using the conditional
    const newPhiDecl = new StoreLocalInstruction(
      phiDecl.id,
      phiDecl.place,
      phiDecl.nodePath,
      phiDecl.lval,
      condInstr.place,
      "const",
    );

    // Rebuild parent block instructions:
    // 1. Everything before the phi declaration
    // 2. Hoisted instructions from both branches
    // 3. The conditional expression instruction
    // 4. The new phi declaration (const)
    // 5. Everything after the phi declaration
    const newInstrs: BaseInstruction[] = [
      ...block.instructions.slice(0, phiDeclIndex),
      ...consOtherInstrs,
      ...altOtherInstrs,
      condInstr,
      newPhiDecl,
      ...block.instructions.slice(phiDeclIndex + 1),
    ];
    block.instructions = newInstrs;

    // Change terminal to jump directly to fallthrough
    block.terminal = new JumpTerminal(terminal.id, terminal.fallthrough);

    // Remove the branch blocks
    this.functionIR.blocks.delete(terminal.consequent);
    this.functionIR.blocks.delete(terminal.alternate);

    // Recompute CFG after structural change
    this.functionIR.recomputeCFG();

    return true;
  }
}

interface PhiCopyChainResult {
  /** The declarationId of the phi variable being written to */
  phiDeclarationId: DeclarationId;
  /** The source value place being assigned to the phi */
  valuePlace: Place;
  /** A place from the copy chain that can be reused (will be deleted with the branch) */
  reusablePlace: Place;
}

/**
 * Returns true if an instruction can be safely hoisted out of a branch.
 * BindingIdentifierInstruction is treated as hoistable (it's a name binding
 * with no side effects) even though its default isPure is false.
 */
function isHoistable(instr: BaseInstruction, environment: Environment): boolean {
  if (instr instanceof BindingIdentifierInstruction) return true;
  return instr.isPure(environment);
}

/**
 * Extracts the phi copy chain from the end of a branch block.
 *
 * The SSA eliminator inserts this pattern at the end of each predecessor block:
 *   LoadLocal(loadPlace, sourcePlace)
 *   Copy(copyPlace, phiLval, loadPlace)
 *   ExpressionStatement(exprPlace, copyPlace)
 *
 * Returns the phi's declarationId and the source value place, or null if not found.
 */
function extractPhiCopyChain(block: BasicBlock): PhiCopyChainResult | null {
  const instrs = block.instructions;
  if (instrs.length < 3) return null;

  const exprStmt = instrs[instrs.length - 1];
  const copy = instrs[instrs.length - 2];
  const load = instrs[instrs.length - 3];

  if (!(exprStmt instanceof ExpressionStatementInstruction)) return null;
  if (!(copy instanceof CopyInstruction)) return null;
  if (!(load instanceof LoadLocalInstruction)) return null;

  // Verify the chain: ExpressionStatement wraps Copy, Copy uses Load's output
  if (exprStmt.expression.identifier.id !== copy.place.identifier.id) return null;
  if (copy.value.identifier.id !== load.place.identifier.id) return null;

  return {
    phiDeclarationId: copy.lval.identifier.declarationId,
    valuePlace: load.value,
    reusablePlace: load.place,
  };
}
