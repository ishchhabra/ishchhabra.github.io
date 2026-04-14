import { Environment } from "../../environment";
import { Operation, LoadLocalOp, StoreLocalOp } from "../../ir";
import { isValueOp } from "../../ir/categories";
import { isClaimedByExportDeclaration } from "../../ir/exportClaim";
import { AwaitExpressionOp } from "../../ir/ops/call/AwaitExpression";
import { ArrowFunctionExpressionOp } from "../../ir/ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../../ir/ops/func/FunctionExpression";
import { ObjectMethodOp } from "../../ir/ops/object/ObjectMethod";
import { ClassMethodOp } from "../../ir/ops/class/ClassMethod";
import { isTerminal, Terminal } from "../../ir/ops/control";
import { FuncOp } from "../../ir/core/FuncOp";
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
    protected readonly funcOp: FuncOp,
    private readonly environment: Environment,
  ) {
    super(funcOp);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.funcOp.allBlocks()) {
      for (let i = block.operations.length - 1; i >= 0; i--) {
        const instruction = block.operations[i];
        if (!(instruction instanceof StoreLocalOp)) continue;

        const candidate = this.getInliningCandidate(block, i, instruction);
        if (!candidate) continue;

        const rewriteMap = new Map<Identifier, Place>([
          [instruction.place.identifier, instruction.value],
          [instruction.lval.identifier, instruction.value],
        ]);

        if (!this.rewriteUser(candidate.user, rewriteMap)) continue;

        block.removeOpAt(i);
        changed = true;
      }
    }

    return { changed };
  }

  private getInliningCandidate(
    block: { operations: readonly Operation[]; terminal?: Terminal },
    index: number,
    instruction: StoreLocalOp,
  ): { user: Operation | Terminal } | undefined {
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
    if (!(user instanceof Operation) && !isTerminal(user)) {
      return undefined;
    }

    // Terminal users: the store must be the last instruction in the block.
    if (isTerminal(user)) {
      if (index !== block.operations.length - 1) {
        return undefined;
      }
      return { user };
    }

    // Instruction users: must be in the same block and must be a type
    // that embeds operands as expressions (ValueInstruction, LoadLocal,
    // StoreLocal). Module/JSX/Declaration instructions need the declared
    // binding name, not an inlined expression.
    if (!isValueOp(user) && !(user instanceof StoreLocalOp) && !(user instanceof LoadLocalOp)) {
      return undefined;
    }

    const userIndex = block.operations.indexOf(user);
    if (userIndex === -1) {
      return undefined;
    }

    // An `await` expression can only appear inside an async function.
    // If the user is a non-async function expression (arrow, function,
    // object method, class method), the await would be inlined into its
    // captures and emitted inside the non-async body — a syntax error.
    if (instruction.value.identifier.definer instanceof AwaitExpressionOp) {
      if (this.isNonAsyncFunction(user)) {
        return undefined;
      }
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
  private hasMultipleDefinitions(instruction: StoreLocalOp): boolean {
    const declId = instruction.lval.identifier.declarationId;
    for (const block of this.funcOp.allBlocks()) {
      for (const instr of block.operations) {
        if (instr === instruction) continue;
        if (instr instanceof StoreLocalOp && instr.lval.identifier.declarationId === declId) {
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
    block: { operations: readonly Operation[] },
    start: number,
    end: number,
  ): boolean {
    for (let j = start + 1; j < end; j++) {
      const instr = block.operations[j];

      // A StoreLocal that's not claimed by a downstream export
      // wrapper emits a const/let/var declaration statement.
      if (instr instanceof StoreLocalOp && !isClaimedByExportDeclaration(instr)) {
        return true;
      }

      // A zero-use side-effecting value op gets flushed as an
      // expression statement by codegen.
      if (
        isValueOp(instr) &&
        instr.place.identifier.uses.size === 0 &&
        instr.hasSideEffects(this.environment)
      ) {
        return true;
      }
    }
    return false;
  }

  private isNonAsyncFunction(instruction: Operation): boolean {
    if (instruction instanceof ArrowFunctionExpressionOp) return !instruction.async;
    if (instruction instanceof FunctionExpressionOp) return !instruction.async;
    if (instruction instanceof ObjectMethodOp) return !instruction.async;
    if (instruction instanceof ClassMethodOp) return !instruction.async;
    return false;
  }

  private rewriteUser(user: Operation | Terminal, values: Map<Identifier, Place>): boolean {
    return this.rewriteInstructionUser(user, values) || this.rewriteTerminalUser(user, values);
  }

  private rewriteInstructionUser(
    user: Operation | Terminal,
    values: Map<Identifier, Place>,
  ): boolean {
    if (!(user instanceof Operation)) {
      return false;
    }

    for (const block of this.funcOp.allBlocks()) {
      const index = block.operations.indexOf(user);
      if (index === -1) continue;

      const rewritten = user.rewrite(values);
      if (rewritten === user) {
        return false;
      }

      block.replaceOp(index, rewritten);
      return true;
    }

    return false;
  }

  private rewriteTerminalUser(user: Operation | Terminal, values: Map<Identifier, Place>): boolean {
    if (!isTerminal(user)) {
      return false;
    }

    for (const block of this.funcOp.allBlocks()) {
      if (block.terminal !== user) continue;

      const rewritten = user.rewrite(values) as Terminal;
      if (rewritten === user) {
        return false;
      }

      block.replaceTerminal(rewritten);
      return true;
    }

    return false;
  }
}
