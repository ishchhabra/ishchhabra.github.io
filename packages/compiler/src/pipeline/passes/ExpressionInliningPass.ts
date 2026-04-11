import { Environment } from "../../environment";
import {
  BaseInstruction,
  LoadLocalInstruction,
  StoreLocalInstruction,
  ValueInstruction,
} from "../../ir";
import { BaseTerminal } from "../../ir/base";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { Identifier } from "../../ir/core/Identifier";
import { Place } from "../../ir/core/Place";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";

/**
 * SSA expression inlining via single-use forward substitution.
 *
 * Rewrites a single-use SSA local binding:
 *
 *   const t = expr
 *   use(t)
 *
 * into:
 *
 *   use(expr)
 *
 * then deletes the now-dead definition.
 *
 * For pure values, inlining is safe when the user is the immediately next
 * instruction. For impure values (calls, await, etc.), inlining is also
 * safe when no side-effecting statement would be emitted between the store
 * and its sole use — JavaScript's left-to-right evaluation order within
 * the composed expression preserves the original ordering.
 *
 * The pass processes instructions in reverse order so that inner single-use
 * stores are inlined first, naturally shrinking the gap for outer stores.
 */
export class ExpressionInliningPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      for (let i = block.instructions.length - 1; i >= 0; i--) {
        const instruction = block.instructions[i];
        if (!(instruction instanceof StoreLocalInstruction)) continue;

        const candidate = this.getInliningCandidate(block, i, instruction);
        if (!candidate) continue;

        const rewriteMap = new Map<Identifier, Place>([
          [instruction.place.identifier, instruction.value],
          [instruction.lval.identifier, instruction.value],
        ]);

        if (!this.rewriteUser(candidate.user, rewriteMap)) continue;

        block.removeInstructionAt(i);
        changed = true;
      }
    }

    return { changed };
  }

  private getInliningCandidate(
    block: { instructions: BaseInstruction[]; terminal?: BaseTerminal },
    index: number,
    instruction: StoreLocalInstruction,
  ): { user: BaseInstruction | BaseTerminal } | undefined {
    // Only inline const-typed stores (not assignments to mutable variables).
    if (instruction.type !== "const") {
      return undefined;
    }

    // Destructuring stores have complex binding semantics.
    if (instruction.bindings.length > 0) {
      return undefined;
    }

    // The lval must be truly single-definition. After SSA destruction, a
    // `let` variable might have multiple StoreLocals sharing the same
    // declarationId (initial declaration + loop updates). The type check
    // above catches reassignments (type "assignment"), but the initial
    // declaration has type "const" — we must verify no other StoreLocal
    // targets the same declarationId.
    if (this.hasMultipleDefinitions(instruction)) {
      return undefined;
    }

    const uses = new Set([
      ...instruction.place.identifier.uses,
      ...instruction.lval.identifier.uses,
    ]);
    if (uses.size !== 1) {
      return undefined;
    }

    const [user] = uses;
    if (!(user instanceof BaseInstruction) && !(user instanceof BaseTerminal)) {
      return undefined;
    }

    // Terminal users: the store must be the last instruction in the block.
    if (user instanceof BaseTerminal) {
      if (index !== block.instructions.length - 1) {
        return undefined;
      }
      return { user };
    }

    // Instruction users: must be in the same block and must be a type
    // that embeds operands as expressions (ValueInstruction, LoadLocal,
    // StoreLocal). Module/JSX/Declaration instructions need the declared
    // binding name, not an inlined expression.
    if (
      !(user instanceof ValueInstruction) &&
      !(user instanceof StoreLocalInstruction) &&
      !(user instanceof LoadLocalInstruction)
    ) {
      return undefined;
    }

    const userIndex = block.instructions.indexOf(user);
    if (userIndex === -1) {
      return undefined;
    }

    // Check that no side-effecting statement would be emitted between
    // the store and its use. If one exists, removing the store would
    // delay the value's execution past that statement, reordering
    // observable side effects.
    if (this.hasInterveningSideEffect(block, index, userIndex)) {
      return undefined;
    }

    return { user };
  }

  /**
   * Returns true if another StoreLocal in the function writes to the same
   * declarationId. This catches loop-carried variables where the initial
   * `const`-typed declaration is followed by an `assignment`-typed update
   * to the same declaration.
   */
  private hasMultipleDefinitions(instruction: StoreLocalInstruction): boolean {
    const declId = instruction.lval.identifier.declarationId;
    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        if (instr === instruction) continue;
        if (
          instr instanceof StoreLocalInstruction &&
          instr.lval.identifier.declarationId === declId
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true if any instruction between indices (start, end) exclusive
   * would produce a side-effecting statement in the output.
   */
  private hasInterveningSideEffect(
    block: { instructions: BaseInstruction[] },
    start: number,
    end: number,
  ): boolean {
    for (let j = start + 1; j < end; j++) {
      const instr = block.instructions[j];

      // A StoreLocal with emit emits a const/let/var declaration.
      if (instr instanceof StoreLocalInstruction && instr.emit) {
        return true;
      }

      // A zero-use side-effecting ValueInstruction gets flushed as an
      // expression statement by codegen.
      if (
        instr instanceof ValueInstruction &&
        instr.place.identifier.uses.size === 0 &&
        instr.hasSideEffects(this.environment)
      ) {
        return true;
      }
    }
    return false;
  }

  private rewriteUser(
    user: BaseInstruction | BaseTerminal,
    values: Map<Identifier, Place>,
  ): boolean {
    return this.rewriteInstructionUser(user, values) || this.rewriteTerminalUser(user, values);
  }

  private rewriteInstructionUser(
    user: BaseInstruction | BaseTerminal,
    values: Map<Identifier, Place>,
  ): boolean {
    if (!(user instanceof BaseInstruction)) {
      return false;
    }

    for (const block of this.functionIR.blocks.values()) {
      const index = block.instructions.indexOf(user);
      if (index === -1) continue;

      const rewritten = user.rewrite(values);
      if (rewritten === user) {
        return false;
      }

      block.replaceInstruction(index, rewritten);
      return true;
    }

    return false;
  }

  private rewriteTerminalUser(
    user: BaseInstruction | BaseTerminal,
    values: Map<Identifier, Place>,
  ): boolean {
    if (!(user instanceof BaseTerminal)) {
      return false;
    }

    for (const block of this.functionIR.blocks.values()) {
      if (block.terminal !== user) continue;

      const rewritten = user.rewrite(values);
      if (rewritten === user) {
        return false;
      }

      block.replaceTerminal(rewritten);
      return true;
    }

    return false;
  }
}
