import {
  ConditionalExpressionOp,
  IfTermOp,
  JumpTermOp,
  LoadLocalOp,
  Operation,
  Value,
  valueBlockTarget,
} from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import { isDuplicable } from "../../../ir/effects/predicates";
import { FunctionPassBase } from "../../FunctionPassBase";
import type { PassResult } from "../../PassManager";

interface ConditionalArm {
  readonly block: BasicBlock;
  readonly terminal: JumpTermOp;
  readonly operations: readonly Operation[];
  readonly value: Value;
}

/**
 * Reconstitute SSA diamond values back into JS conditional-expression ops.
 *
 * This is the JS analogue of phi-to-select folding in SSA compilers:
 *
 *   if c -> then/else; then jump join(a); else jump join(b); join(%x)
 *
 * becomes:
 *
 *   %x = c ? a : b
 *   jump join
 *
 * Arm operations are moved into the predecessor only when the existing
 * effect model says they are duplicable. That keeps lazy branch effects
 * (calls, property reads/getters, throws, writes) in statement form.
 */
export class ConditionalExpressionReconstitutionPass extends FunctionPassBase {
  protected step(): PassResult {
    for (const block of this.funcOp.blocks) {
      const term = block.terminal;
      if (!(term instanceof IfTermOp)) continue;
      if (this.tryReconstitute(block, term)) {
        return { changed: true };
      }
    }
    return { changed: false };
  }

  private tryReconstitute(block: BasicBlock, term: IfTermOp): boolean {
    const fallthrough = term.fallthroughBlock;
    if (fallthrough.params.length !== 1) return false;
    const resultParam = fallthrough.params[0];
    if (resultParam.users.size === 0) return false;

    const thenArm = this.extractArm(term.target(0).block, fallthrough);
    const elseArm = this.extractArm(term.target(1).block, fallthrough);
    if (thenArm === undefined || elseArm === undefined) return false;
    if (!this.canInlineConditionalOperands(term.cond, thenArm, elseArm)) return false;

    const env = this.funcOp.moduleIR.environment;
    const result = env.createValue(resultParam.originalDeclarationId);
    const conditional = env.createOperation(
      ConditionalExpressionOp,
      result,
      term.cond,
      thenArm.value,
      elseArm.value,
    );

    let insertionIndex = block.operations.length;
    insertionIndex = this.moveArmOperations(thenArm, block, insertionIndex);
    insertionIndex = this.moveArmOperations(elseArm, block, insertionIndex);
    block.insertOpAt(insertionIndex, conditional);

    resultParam.replaceAllUsesWith(result);
    fallthrough.params = [];
    block.replaceTerminal(new JumpTermOp(term.id, valueBlockTarget(fallthrough)));
    this.funcOp.removeBlock(thenArm.block);
    this.funcOp.removeBlock(elseArm.block);
    return true;
  }

  private extractArm(block: BasicBlock, fallthrough: BasicBlock): ConditionalArm | undefined {
    if (block.params.length > 0) return undefined;
    const terminal = block.terminal;
    if (!(terminal instanceof JumpTermOp)) return undefined;
    if (terminal.targetBlock !== fallthrough) return undefined;
    if (terminal.args.length !== 1) return undefined;

    const operations = [...block.operations];
    const operationSet = new Set<Operation>(operations);
    for (const op of operations) {
      if (op.place === undefined) return undefined;
      if (!this.canMoveArmOperation(op)) return undefined;
      for (const operand of op.operands()) {
        const def = operand.def;
        if (def instanceof Operation && def.parentBlock === block && !operationSet.has(def)) {
          return undefined;
        }
      }
      for (const result of op.results()) {
        for (const user of result.users) {
          if (user === terminal || operationSet.has(user)) continue;
          return undefined;
        }
      }
    }

    const value = terminal.args[0];
    const valueDef = value.def;
    if (
      valueDef instanceof Operation &&
      valueDef.parentBlock === block &&
      !operationSet.has(valueDef)
    ) {
      return undefined;
    }

    return { block, terminal, operations, value };
  }

  private moveArmOperations(
    arm: ConditionalArm,
    target: BasicBlock,
    insertionIndex: number,
  ): number {
    while (arm.block.operations.length > 0) {
      const op = arm.block.operations[0];
      arm.block.removeOpAt(0);
      target.insertOpAt(insertionIndex, op);
      insertionIndex++;
    }
    return insertionIndex;
  }

  private canMoveArmOperation(op: Operation): boolean {
    if (op instanceof LoadLocalOp && op.value === op.place) return true;
    if (op instanceof LoadLocalOp && this.isFunctionParam(op.value)) return true;
    return isDuplicable(op, this.funcOp.moduleIR.environment);
  }

  private isFunctionParam(value: Value): boolean {
    return this.funcOp.params.some((param) => param.kind === "arg" && param.value === value);
  }

  private canInlineConditionalOperands(
    test: Value,
    thenArm: ConditionalArm,
    elseArm: ConditionalArm,
  ): boolean {
    const inlineDefs = new Set<Operation>([...thenArm.operations, ...elseArm.operations]);
    const counts = new Map<Value, number>();
    this.countInlineValueUses(test, inlineDefs, counts);
    this.countInlineValueUses(thenArm.value, inlineDefs, counts);
    this.countInlineValueUses(elseArm.value, inlineDefs, counts);

    for (const [value, count] of counts) {
      if (count < 2) continue;
      const def = value.def;
      if (def === undefined) continue;
      if (!isDuplicable(def, this.funcOp.moduleIR.environment)) return false;
    }
    return true;
  }

  private countInlineValueUses(
    value: Value,
    inlineDefs: ReadonlySet<Operation>,
    counts: Map<Value, number>,
  ): void {
    counts.set(value, (counts.get(value) ?? 0) + 1);
    const def = value.def;
    if (!(def instanceof Operation) || !inlineDefs.has(def)) return;
    for (const operand of def.operands()) {
      this.countInlineValueUses(operand, inlineDefs, counts);
    }
  }
}
