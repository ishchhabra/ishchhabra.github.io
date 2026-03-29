import {
  CopyInstruction,
  LoadLocalInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { BaseInstruction } from "../../../ir/base";
import { Environment } from "../../../environment";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Single-use expression inlining (forward substitution).
 *
 * When `const x = <pure expr>` and `x` has exactly one use (a LoadLocal
 * in the same block), rewrites the LoadLocal to reference `<pure expr>`
 * directly. DCE then removes the dead const declaration.
 *
 * Safety conditions:
 *   1. Single use — no expression duplication
 *   2. Side-effect-free — removing the StoreLocal doesn't lose effects
 *   3. Same block — evaluation order is preserved
 *   4. No mutable operands — the expression must not read from any
 *      variable that is written to by a CopyInstruction (phi assignment),
 *      because inlining would remove the temporal capture and the code
 *      generator's transparent LoadLocal would read the overwritten value
 */
export class LateExpressionInliningPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        if (!(instr instanceof LoadLocalInstruction)) continue;

        const varId = instr.value.identifier;
        const definer = varId.definer;

        // Must be defined by a const StoreLocal with no bindings.
        if (!(definer instanceof StoreLocalInstruction)) continue;
        if (definer.type !== "const") continue;
        if (definer.bindings.length > 0) continue;

        // Must have exactly one use (this LoadLocal).
        if (varId.uses.size !== 1) continue;

        // The stored value's defining instruction must be side-effect-free.
        const valueDef = definer.value.identifier.definer;
        if (!valueDef || valueDef.hasSideEffects(this.environment)) continue;

        // Must not be a variable load — LoadLocal/LoadPhi capture a
        // variable's value at a point in time. Inlining removes the
        // capture, and the code generator's transparent LoadLocal would
        // read the variable at evaluation time instead.
        if (valueDef instanceof LoadLocalInstruction) continue;
        if (valueDef.constructor.name === "LoadPhiInstruction") continue;

        // The stored value must not BE a mutable variable (one assigned
        // by a CopyInstruction anywhere in the function). The definer
        // field is unreliable across fixpoint iterations, so check the
        // value place's declarationId directly against all Copy lvals.
        if (this.isMutableVariable(definer.value)) continue;

        // The expression must not read from any mutable variable.
        if (this.readsMutableVariable(valueDef)) continue;

        // The StoreLocal must be in the same block.
        if (!block.instructions.includes(definer as BaseInstruction)) continue;

        // Safe to inline.
        block.replaceInstruction(
          i,
          new LoadLocalInstruction(instr.id, instr.place, instr.nodePath, definer.value),
        );
        changed = true;
      }
    }

    return { changed };
  }

  /**
   * Check if a place represents a mutable variable — one that is the
   * lval of any CopyInstruction in the function. Scans all blocks.
   */
  private isMutableVariable(place: import("../../../ir").Place): boolean {
    const declId = place.identifier.declarationId;
    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        if (
          instr instanceof CopyInstruction &&
          instr.lval.identifier.declarationId === declId
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if an instruction reads from any variable that is mutated
   * by a CopyInstruction (a phi assignment). Such variables change value
   * during execution, so inlining through them is unsafe.
   */
  private readsMutableVariable(instr: BaseInstruction): boolean {
    for (const readPlace of instr.getReadPlaces()) {
      const declId = readPlace.identifier.declarationId;
      for (const user of readPlace.identifier.uses) {
        if (
          user instanceof CopyInstruction &&
          user.lval.identifier.declarationId === declId
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
