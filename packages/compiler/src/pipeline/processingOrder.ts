import { CallExpressionOp, LoadLocalOp, StoreLocalOp } from "../ir";
import { FunctionIR, FunctionIRId } from "../ir/core/FunctionIR";
import { ModuleIR } from "../ir/core/ModuleIR";
import { ArrowFunctionExpressionOp } from "../ir/ops/func/ArrowFunctionExpression";
import { FunctionDeclarationOp } from "../ir/ops/func/FunctionDeclaration";
import { FunctionExpressionOp } from "../ir/ops/func/FunctionExpression";

/**
 * Computes a bottom-up processing order for a module's functions using
 * post-order DFS on nesting + call-graph edges, analogous to LLVM's
 * CGSCC pass manager: callees and nested children before callers/parents.
 *
 * This guarantees that when FunctionInliningPass clones a callee's
 * nested FunctionIRs, those clones copy fully-optimized final-form IR.
 */
export function computeProcessingOrder(moduleIR: ModuleIR): FunctionIR[] {
  const declToFunc = new Map<number, FunctionIRId>();
  const funcById = new Map<FunctionIRId, FunctionIR>();

  for (const funcIR of moduleIR.functions.values()) {
    funcById.set(funcIR.id, funcIR);
  }

  // Map declarationIds to FunctionIRIds for call resolution.
  for (const funcIR of moduleIR.functions.values()) {
    for (const block of funcIR.allBlocks()) {
      for (const instr of block.operations) {
        if (instr instanceof FunctionDeclarationOp) {
          declToFunc.set(instr.place.identifier.declarationId, instr.functionIR.id);
        } else if (instr instanceof StoreLocalOp) {
          const definer = instr.value.identifier.definer;
          if (
            definer instanceof FunctionExpressionOp ||
            definer instanceof ArrowFunctionExpressionOp
          ) {
            declToFunc.set(instr.lval.identifier.declarationId, definer.functionIR.id);
          }
        }
      }
    }
  }

  // Build dependency edges: function → set of functions it depends on
  // (nesting children + call targets within this module).
  const deps = new Map<FunctionIRId, Set<FunctionIRId>>();
  for (const funcIR of moduleIR.functions.values()) {
    const funcDeps = new Set<FunctionIRId>();
    deps.set(funcIR.id, funcDeps);

    // Nesting: parent depends on children.
    for (const nested of funcIR.getNestedFunctionOps()) {
      funcDeps.add(nested.functionIR.id);
    }

    // Calls: caller depends on callee (intra-module only).
    for (const block of funcIR.allBlocks()) {
      for (const instr of block.operations) {
        if (!(instr instanceof CallExpressionOp)) continue;

        const calleeInstr = moduleIR.environment.placeToOp.get(instr.callee.id);
        if (!(calleeInstr instanceof LoadLocalOp)) continue;
        const calleeId = declToFunc.get(calleeInstr.value.identifier.declarationId);
        if (calleeId !== undefined && calleeId !== funcIR.id) {
          funcDeps.add(calleeId);
        }
      }
    }
  }

  // Post-order DFS → callees/children before callers/parents.
  const order: FunctionIR[] = [];
  const visited = new Set<FunctionIRId>();
  const visiting = new Set<FunctionIRId>();

  const visit = (id: FunctionIRId) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) return; // Cycle — break it.
    visiting.add(id);

    for (const dep of deps.get(id) ?? []) {
      visit(dep);
    }

    visiting.delete(id);
    visited.add(id);
    const func = funcById.get(id);
    if (func) order.push(func);
  };

  for (const funcIR of moduleIR.functions.values()) {
    visit(funcIR.id);
  }

  return order;
}
