import { Environment } from "../../environment";
import {
  BaseInstruction,
  BinaryExpressionInstruction,
  LiteralInstruction,
  LoadContextInstruction,
  LoadDynamicPropertyInstruction,
  LoadGlobalInstruction,
  LoadLocalInstruction,
  LoadStaticPropertyInstruction,
  LogicalExpressionInstruction,
  MetaPropertyInstruction,
  RegExpLiteralInstruction,
  StoreLocalInstruction,
  TemplateLiteralInstruction,
  ThisExpressionInstruction,
  UnaryExpressionInstruction,
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
 * into the sole use of `t`, then deletes the now-dead definition.
 *
 * The pass still targets StoreLocal definitions because those are the IR
 * nodes that emit temporary declarations in codegen; the actual substituted
 * value is taken from the SSA def-use chain behind `instruction.value`.
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
    if (instruction.type !== "const") {
      return undefined;
    }

    if (instruction.bindings.length > 0) {
      return undefined;
    }

    if (!this.canInlineValue(instruction.value)) {
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

    if (user instanceof BaseInstruction) {
      if (!this.isInlinableInstructionUser(block, index, user)) {
        return undefined;
      }
    } else if (index !== block.instructions.length - 1) {
      return undefined;
    }

    return { user };
  }

  private isInlinableInstructionUser(
    block: { instructions: BaseInstruction[] },
    index: number,
    instruction: BaseInstruction,
  ): boolean {
    if (block.instructions[index + 1] !== instruction) {
      return false;
    }

    if (instruction instanceof ValueInstruction) {
      return true;
    }

    return instruction instanceof LoadLocalInstruction;
  }

  private canInlineValue(place: Place): boolean {
    const definer = place.identifier.definer;
    if (definer === undefined) {
      return true;
    }

    if (!(definer instanceof BaseInstruction)) {
      return false;
    }

    if (!definer.isPure(this.environment)) {
      return false;
    }

    return (
      definer instanceof LiteralInstruction ||
      definer instanceof LoadLocalInstruction ||
      definer instanceof LoadGlobalInstruction ||
      definer instanceof LoadContextInstruction ||
      definer instanceof LoadStaticPropertyInstruction ||
      definer instanceof LoadDynamicPropertyInstruction ||
      definer instanceof BinaryExpressionInstruction ||
      definer instanceof LogicalExpressionInstruction ||
      definer instanceof UnaryExpressionInstruction ||
      definer instanceof TemplateLiteralInstruction ||
      definer instanceof ThisExpressionInstruction ||
      definer instanceof MetaPropertyInstruction ||
      definer instanceof RegExpLiteralInstruction
    );
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
