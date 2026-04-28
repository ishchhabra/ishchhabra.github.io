import {
  BinaryExpressionOp,
  IfTermOp,
  JumpTermOp,
  LiteralOp,
  type LogicalOperator,
  LogicalExpressionOp,
  Operation,
  StoreLocalOp,
  Value,
  valueBlockTarget,
} from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import { isDuplicable } from "../../../ir/effects/predicates";
import {
  getBlockParamFlowSnapshot,
  type ValueDiamond,
} from "../../analysis/BlockParamFlowSnapshot";
import { FunctionPassBase } from "../../FunctionPassBase";
import type { PassResult } from "../../PassManager";
import { getPhiLoweringResult } from "../../ssa/PhiLoweringResult";

interface LogicalArm {
  readonly block: BasicBlock;
  readonly terminal: JumpTermOp;
  readonly operations: readonly Operation[];
  readonly store: StoreLocalOp;
  readonly value: Value;
}

interface LogicalDiamond extends ValueDiamond {
  readonly operator: LogicalOperator;
  readonly left: Value;
  readonly rightBlock: BasicBlock;
  readonly rightValue: Value;
}

export class LogicalExpressionReconstitutionPass extends FunctionPassBase {
  protected step(): PassResult {
    const snapshot = getBlockParamFlowSnapshot(this.funcOp);
    if (snapshot === undefined) return { changed: false };

    for (const diamond of snapshot.valueDiamonds()) {
      const logical = matchLogicalDiamond(diamond);
      if (logical === undefined) continue;
      if (this.tryReconstitute(logical)) {
        return { changed: true };
      }
    }
    return { changed: false };
  }

  private tryReconstitute(hint: LogicalDiamond): boolean {
    const block = hint.header;
    const term = block.terminal;
    if (!(term instanceof IfTermOp)) return false;
    if (term.cond !== hint.test) return false;
    if (term.thenBlock !== hint.thenBlock) return false;
    if (term.elseBlock !== hint.elseBlock) return false;
    if (term.fallthroughBlock !== hint.joinBlock) return false;

    const backingDecl = getPhiLoweringResult(this.funcOp)?.backingForParam.get(hint.resultParam);
    if (backingDecl === undefined) return false;

    const thenArm = this.extractArm(term.thenBlock, hint.joinBlock, backingDecl);
    const elseArm = this.extractArm(term.elseBlock, hint.joinBlock, backingDecl);
    if (thenArm === undefined || elseArm === undefined) return false;
    const rightArm = hint.rightBlock === thenArm.block ? thenArm : elseArm;
    if (rightArm.value !== hint.rightValue) return false;
    if (!this.isCurrentPassthrough(hint, thenArm, elseArm)) return false;
    if (!this.canInlineLogicalOperands(hint.left, rightArm)) return false;

    const env = this.funcOp.moduleIR.environment;
    const result = env.createValue(backingDecl);
    const logical = env.createOperation(
      LogicalExpressionOp,
      result,
      hint.operator,
      hint.left,
      rightArm.value,
    );

    let insertionIndex = block.operations.length;
    insertionIndex = this.moveArmOperations(rightArm, block, insertionIndex);
    block.insertOpAt(insertionIndex, logical);

    this.removeArmStore(thenArm);
    this.removeArmStore(elseArm);
    hint.resultParam.replaceAllUsesWith(result);
    block.replaceTerminal(new JumpTermOp(term.id, valueBlockTarget(hint.joinBlock)));
    this.removeDeadBackingDeclaration(hint.resultParam);
    if (hint.operator === "??") {
      this.removeDeadNullishTest(term.cond, block);
    }
    this.funcOp.removeBlock(thenArm.block);
    this.funcOp.removeBlock(elseArm.block);
    return true;
  }

  private extractArm(
    block: BasicBlock,
    fallthrough: BasicBlock,
    backingDecl: Value["declarationId"],
  ): LogicalArm | undefined {
    if (block.params.length > 0) return undefined;
    const terminal = block.terminal;
    if (!(terminal instanceof JumpTermOp)) return undefined;
    if (terminal.targetBlock !== fallthrough) return undefined;
    if (terminal.args.length !== 0) return undefined;

    const operations = [...block.operations];
    const store = operations[operations.length - 1];
    if (!(store instanceof StoreLocalOp)) return undefined;
    if (store.lval.declarationId !== backingDecl) return undefined;
    if (store.binding.declarationId !== backingDecl) return undefined;
    if (store.bindings.length > 0) return undefined;

    const prefix = operations.slice(0, -1);
    const operationSet = new Set<Operation>(operations);
    for (const op of prefix) {
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
          if (user === store || user === terminal || operationSet.has(user)) continue;
          return undefined;
        }
      }
    }

    const value = store.value;
    const valueDef = value.def;
    if (
      valueDef instanceof Operation &&
      valueDef.parentBlock === block &&
      !operationSet.has(valueDef)
    ) {
      return undefined;
    }

    return { block, terminal, operations: prefix, store, value };
  }

  private moveArmOperations(arm: LogicalArm, target: BasicBlock, insertionIndex: number): number {
    while (arm.block.operations.length > 0 && arm.block.operations[0] !== arm.store) {
      const op = arm.block.operations[0];
      arm.block.removeOpAt(0);
      target.insertOpAt(insertionIndex, op);
      insertionIndex++;
    }
    return insertionIndex;
  }

  private removeArmStore(arm: LogicalArm): void {
    const index = arm.block.operations.indexOf(arm.store);
    if (index >= 0) arm.block.removeOpAt(index);
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

  private isCurrentPassthrough(
    hint: LogicalDiamond,
    thenArm: LogicalArm,
    elseArm: LogicalArm,
  ): boolean {
    switch (hint.operator) {
      case "||":
        return thenArm.operations.length === 0 && thenArm.value === hint.left;
      case "&&":
        return elseArm.operations.length === 0 && elseArm.value === hint.left;
      case "??":
        return thenArm.operations.length === 0 && thenArm.value === hint.left;
    }
  }

  private removeDeadBackingDeclaration(value: Value): void {
    if (value.users.size !== 0) return;
    for (const block of this.funcOp.blocks) {
      const index = block.operations.findIndex((op) => op.results().includes(value));
      if (index >= 0) {
        block.removeOpAt(index);
        return;
      }
    }
  }
}

function matchLogicalDiamond(diamond: ValueDiamond): LogicalDiamond | undefined {
  if (diamond.thenValue === diamond.test) {
    return {
      ...diamond,
      operator: "||",
      left: diamond.test,
      rightBlock: diamond.elseBlock,
      rightValue: diamond.elseValue,
    };
  }
  if (diamond.elseValue === diamond.test) {
    return {
      ...diamond,
      operator: "&&",
      left: diamond.test,
      rightBlock: diamond.thenBlock,
      rightValue: diamond.thenValue,
    };
  }

  const nullishLeft = matchNullishTest(diamond.test);
  if (nullishLeft !== undefined && diamond.thenValue === nullishLeft) {
    return {
      ...diamond,
      operator: "??",
      left: nullishLeft,
      rightBlock: diamond.elseBlock,
      rightValue: diamond.elseValue,
    };
  }
  return undefined;
}

function matchNullishTest(test: Value): Value | undefined {
  const op = test.def;
  if (!(op instanceof BinaryExpressionOp)) return undefined;
  if (op.operator !== "!=") return undefined;

  const rightDef = op.right.def;
  if (!(rightDef instanceof LiteralOp) || rightDef.value !== null) return undefined;
  return op.left;
}
