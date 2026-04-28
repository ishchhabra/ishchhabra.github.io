import {
  BindingInitOp,
  ConditionalExpressionOp,
  BinaryExpressionOp,
  IfTermOp,
  JumpTermOp,
  LoadLocalOp,
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

interface LoweredConditionalArm {
  readonly block: BasicBlock;
  readonly terminal: JumpTermOp;
  readonly operations: readonly Operation[];
  readonly store: StoreLocalOp;
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
    const snapshot = getBlockParamFlowSnapshot(this.funcOp);
    if (snapshot === undefined) return { changed: false };

    for (const diamond of snapshot.valueDiamonds()) {
      if (this.tryReconstitute(diamond)) {
        return { changed: true };
      }
    }
    for (const block of this.funcOp.blocks) {
      const term = block.terminal;
      if (!(term instanceof IfTermOp)) continue;
      if (this.tryReconstituteCurrentDiamond(block, term)) {
        return { changed: true };
      }
    }
    return { changed: false };
  }

  private tryReconstitute(hint: ValueDiamond): boolean {
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
    if (!this.canInlineConditionalOperands(term.cond, thenArm, elseArm)) return false;

    const env = this.funcOp.moduleIR.environment;
    const result = env.createValue(backingDecl);
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

    hint.resultParam.replaceAllUsesWith(result);
    block.replaceTerminal(new JumpTermOp(term.id, valueBlockTarget(hint.joinBlock)));
    this.removeDeadBackingDeclaration(hint.resultParam);
    this.funcOp.removeBlock(thenArm.block);
    this.funcOp.removeBlock(elseArm.block);
    return true;
  }

  private tryReconstituteCurrentDiamond(block: BasicBlock, term: IfTermOp): boolean {
    const thenStore = this.lastStore(term.thenBlock, term.fallthroughBlock);
    const elseStore = this.lastStore(term.elseBlock, term.fallthroughBlock);
    if (thenStore === undefined || elseStore === undefined) return false;
    if (thenStore.lval.declarationId !== elseStore.lval.declarationId) return false;
    if (thenStore.binding.declarationId !== elseStore.binding.declarationId) return false;

    const thenArm = this.extractArm(
      term.thenBlock,
      term.fallthroughBlock,
      thenStore.lval.declarationId,
    );
    const elseArm = this.extractArm(
      term.elseBlock,
      term.fallthroughBlock,
      thenStore.lval.declarationId,
    );
    if (thenArm === undefined || elseArm === undefined) return false;
    if (this.isLogicalAssignmentShape(term, thenArm, elseArm)) return false;
    if (!this.canInlineConditionalOperands(term.cond, thenArm, elseArm)) return false;

    const env = this.funcOp.moduleIR.environment;
    const result = env.createValue(thenStore.lval.declarationId);
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

    thenStore.lval.replaceAllUsesWith(result);
    block.replaceTerminal(new JumpTermOp(term.id, valueBlockTarget(term.fallthroughBlock)));
    this.removeDeadBackingDeclaration(thenStore.lval);
    this.funcOp.removeBlock(thenArm.block);
    this.funcOp.removeBlock(elseArm.block);
    return true;
  }

  private lastStore(block: BasicBlock, fallthrough: BasicBlock): StoreLocalOp | undefined {
    const terminal = block.terminal;
    if (!(terminal instanceof JumpTermOp)) return undefined;
    if (terminal.targetBlock !== fallthrough) return undefined;
    if (terminal.args.length !== 0) return undefined;
    const op = block.operations[block.operations.length - 1];
    if (!(op instanceof StoreLocalOp)) return undefined;
    if (op.bindings.length > 0) return undefined;
    return op;
  }

  private isLogicalAssignmentShape(
    term: IfTermOp,
    thenArm: LoweredConditionalArm,
    elseArm: LoweredConditionalArm,
  ): boolean {
    if (thenArm.operations.length === 0 && thenArm.value === term.cond) return true;
    if (elseArm.operations.length === 0 && elseArm.value === term.cond) return true;
    const testDef = term.cond.def;
    if (
      testDef instanceof BinaryExpressionOp &&
      testDef.operator === "==" &&
      elseArm.operations.length === 0 &&
      elseArm.value === testDef.left
    ) {
      return true;
    }
    return false;
  }

  private extractArm(
    block: BasicBlock,
    fallthrough: BasicBlock,
    backingDecl: Value["declarationId"],
  ): LoweredConditionalArm | undefined {
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
      if (!this.canMoveArmOperation(op)) return undefined;
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

  private moveArmOperations(
    arm: LoweredConditionalArm,
    target: BasicBlock,
    insertionIndex: number,
  ): number {
    while (arm.block.operations.length > 0 && arm.block.operations[0] !== arm.store) {
      const op = arm.block.operations[0];
      arm.block.removeOpAt(0);
      target.insertOpAt(insertionIndex, op);
      insertionIndex++;
    }
    const storeIndex = arm.block.operations.indexOf(arm.store);
    if (storeIndex >= 0) arm.block.removeOpAt(storeIndex);
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
    thenArm: LoweredConditionalArm,
    elseArm: LoweredConditionalArm,
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
      if (def instanceof BindingInitOp) continue;
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
