import {
  BinaryExpressionOp,
  IfTermOp,
  JumpTermOp,
  LiteralOp,
  LogicalExpressionOp,
  type LogicalOperator,
  Operation,
  Value,
} from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import { isDuplicable } from "../../../ir/effects/predicates";
import { FunctionPassBase } from "../../FunctionPassBase";
import type { PassResult } from "../../PassManager";

interface LogicalArm {
  readonly block: BasicBlock;
  readonly terminal: JumpTermOp;
  readonly operations: readonly Operation[];
  readonly value: Value;
}

interface LogicalMatch {
  readonly operator: LogicalOperator;
  readonly left: Value;
  readonly rightArm: LogicalArm;
}

export class LogicalExpressionReconstitutionPass extends FunctionPassBase {
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

    const thenArm = this.extractArm(term.thenBlock, fallthrough);
    const elseArm = this.extractArm(term.elseBlock, fallthrough);
    if (thenArm === undefined || elseArm === undefined) return false;

    const match = this.matchLogical(term, thenArm, elseArm);
    if (match === undefined) return false;
    if (!this.canInlineLogicalOperands(match.left, match.rightArm)) return false;

    const env = this.funcOp.moduleIR.environment;
    const result = env.createValue(resultParam.originalDeclarationId);
    const logical = env.createOperation(
      LogicalExpressionOp,
      result,
      match.operator,
      match.left,
      match.rightArm.value,
    );

    let insertionIndex = block.operations.length;
    insertionIndex = this.moveArmOperations(match.rightArm, block, insertionIndex);
    block.insertOpAt(insertionIndex, logical);

    resultParam.replaceAllUsesWith(result);
    fallthrough.params = [];
    block.replaceTerminal(new JumpTermOp(term.id, fallthrough));
    if (match.operator === "??") {
      this.removeDeadNullishTest(term.cond, block);
    }
    this.funcOp.removeBlock(thenArm.block);
    this.funcOp.removeBlock(elseArm.block);
    return true;
  }

  private matchLogical(
    term: IfTermOp,
    thenArm: LogicalArm,
    elseArm: LogicalArm,
  ): LogicalMatch | undefined {
    if (this.isPassthroughArm(thenArm, term.cond)) {
      return { operator: "||", left: term.cond, rightArm: elseArm };
    }
    if (this.isPassthroughArm(elseArm, term.cond)) {
      return { operator: "&&", left: term.cond, rightArm: thenArm };
    }

    const nullishLeft = this.matchNullishTest(term.cond);
    if (nullishLeft !== undefined && this.isPassthroughArm(thenArm, nullishLeft)) {
      return { operator: "??", left: nullishLeft, rightArm: elseArm };
    }
    return undefined;
  }

  private matchNullishTest(test: Value): Value | undefined {
    const op = test.def;
    if (!(op instanceof BinaryExpressionOp)) return undefined;
    if (op.operator !== "!=") return undefined;

    const rightDef = op.right.def;
    if (!(rightDef instanceof LiteralOp) || rightDef.value !== null) return undefined;
    return op.left;
  }

  private isPassthroughArm(arm: LogicalArm, value: Value): boolean {
    return arm.operations.length === 0 && arm.value === value;
  }

  private extractArm(block: BasicBlock, fallthrough: BasicBlock): LogicalArm | undefined {
    if (block.params.length > 0) return undefined;
    const terminal = block.terminal;
    if (!(terminal instanceof JumpTermOp)) return undefined;
    if (terminal.targetBlock !== fallthrough) return undefined;
    if (terminal.args.length !== 1) return undefined;

    const operations = [...block.operations];
    const operationSet = new Set<Operation>(operations);
    for (const op of operations) {
      if (op.place === undefined) return undefined;
      if (!isDuplicable(op, this.funcOp.moduleIR.environment)) return undefined;
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

  private moveArmOperations(arm: LogicalArm, target: BasicBlock, insertionIndex: number): number {
    while (arm.block.operations.length > 0) {
      const op = arm.block.operations[0];
      arm.block.removeOpAt(0);
      target.insertOpAt(insertionIndex, op);
      insertionIndex++;
    }
    return insertionIndex;
  }

  private removeDeadNullishTest(test: Value, block: BasicBlock): void {
    const op = test.def;
    if (!(op instanceof BinaryExpressionOp)) return;
    if (op.parentBlock !== block) return;
    if (op.place.users.size > 0) return;

    const rightDef = op.right.def;
    const index = block.operations.indexOf(op);
    if (index >= 0) {
      block.removeOpAt(index);
    }

    if (
      rightDef instanceof LiteralOp &&
      rightDef.parentBlock === block &&
      rightDef.place.users.size === 0
    ) {
      const literalIndex = block.operations.indexOf(rightDef);
      if (literalIndex >= 0) {
        block.removeOpAt(literalIndex);
      }
    }
  }

  private canInlineLogicalOperands(left: Value, rightArm: LogicalArm): boolean {
    const inlineDefs = new Set<Operation>(rightArm.operations);
    const counts = new Map<Value, number>();
    this.countInlineValueUses(left, inlineDefs, counts);
    this.countInlineValueUses(rightArm.value, inlineDefs, counts);

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
