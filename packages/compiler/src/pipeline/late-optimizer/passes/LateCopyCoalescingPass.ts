import { BindingDeclOp, BindingInitOp, Operation, StoreLocalOp, type Value } from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import type { DeclarationId } from "../../../ir/core/Value";
import { FunctionPassBase } from "../../FunctionPassBase";
import type { PassResult } from "../../PassManager";

interface InitialCopy {
  readonly decl: BindingDeclOp;
  readonly store: StoreLocalOp;
  readonly storeIndex: number;
}

/**
 * Late out-of-SSA copy coalescing.
 *
 * SSA destruction introduces mutable backing cells for block params:
 *
 *   let x;
 *   x = initial;
 *
 * When the initial copy is the first write to that backing cell and
 * can be placed at the declaration without changing evaluation order,
 * coalesce the copy into the declaration:
 *
 *   let x = initial;
 *
 * This is deliberately local and conservative. General copy
 * propagation handles read substitution; this pass handles the
 * declaration/copy pair created by out-of-SSA lowering.
 */
export class LateCopyCoalescingPass extends FunctionPassBase {
  protected step(): PassResult {
    for (const block of this.funcOp.blocks) {
      const match = this.findInitialCopy(block);
      if (match === undefined) continue;

      const init = this.funcOp.moduleIR.environment.createOperation(
        BindingInitOp,
        match.decl.place,
        match.decl.kind,
        match.store.value,
      );

      block.replaceOp(match.decl, init);
      block.removeOpAt(match.storeIndex);
      return { changed: true };
    }

    return { changed: false };
  }

  private findInitialCopy(block: BasicBlock): InitialCopy | undefined {
    for (let i = 0; i < block.operations.length; i++) {
      const decl = block.operations[i];
      if (!(decl instanceof BindingDeclOp)) continue;

      const storeIndex = this.findCoalescableStore(block, i, decl.place.declarationId);
      if (storeIndex === undefined) continue;

      const store = block.operations[storeIndex];
      if (!(store instanceof StoreLocalOp)) continue;
      return { decl, store, storeIndex };
    }
    return undefined;
  }

  private findCoalescableStore(
    block: BasicBlock,
    declIndex: number,
    declarationId: DeclarationId,
  ): number | undefined {
    for (let i = declIndex + 1; i < block.operations.length; i++) {
      const op = block.operations[i];

      if (op instanceof BindingDeclOp) continue;

      if (op instanceof StoreLocalOp && isStoreToDeclaration(op, declarationId)) {
        if (op.bindings.length > 0) return undefined;
        if (op.place.users.size > 0) return undefined;
        if (readsDeclaration(op.value, declarationId)) return undefined;
        if (!this.isSafeInitializerValue(op.value)) return undefined;
        return i;
      }

      return undefined;
    }
    return undefined;
  }

  private isSafeInitializerValue(value: Value): boolean {
    const seen = new Set<Value>();
    const stack = [value];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);

      const def = current.def;
      if (!(def instanceof Operation)) continue;

      if (
        def.mayThrow(this.funcOp.moduleIR.environment) ||
        def.mayDiverge(this.funcOp.moduleIR.environment) ||
        !def.isDeterministic ||
        def.isObservable() ||
        def.getMemoryEffects(this.funcOp.moduleIR.environment).writes.length > 0
      ) {
        return false;
      }

      for (const operand of def.operands()) {
        stack.push(operand);
      }
    }

    return true;
  }
}

function isStoreToDeclaration(store: StoreLocalOp, declarationId: DeclarationId): boolean {
  return (
    store.lval.declarationId === declarationId && store.binding.declarationId === declarationId
  );
}

function readsDeclaration(value: Value, declarationId: DeclarationId): boolean {
  const seen = new Set<Value>();
  const stack = [value];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);

    if (current.declarationId === declarationId) return true;

    const def = current.def;
    if (def === undefined) continue;
    for (const operand of def.operands()) {
      stack.push(operand);
    }
  }

  return false;
}
