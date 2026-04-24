import { CallExpressionOp, LoadLocalOp, StoreLocalOp } from "../ir";
import { FuncOp, FuncOpId } from "../ir/core/FuncOp";
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
 * nested FuncOps, those clones copy fully-optimized final-form IR.
 */
export function computeProcessingOrder(moduleIR: ModuleIR): FuncOp[] {
  const declToFunc = new Map<number, FuncOpId>();
  const funcById = new Map<FuncOpId, FuncOp>();

  for (const funcIR of moduleIR.functions.values()) {
    funcById.set(funcIR.id, funcIR);
  }

  // Map declarationIds to FuncOpIds for call resolution.
  for (const funcIR of moduleIR.functions.values()) {
    for (const block of funcIR.allBlocks()) {
      for (const instr of block.operations) {
        if (instr instanceof FunctionDeclarationOp) {
          declToFunc.set(instr.place.declarationId, instr.funcOp.id);
        } else if (instr instanceof StoreLocalOp) {
          const definer = instr.value.def;
          if (
            definer instanceof FunctionExpressionOp ||
            definer instanceof ArrowFunctionExpressionOp
          ) {
            declToFunc.set(instr.lval.declarationId, definer.funcOp.id);
          }
        }
      }
    }
  }

  // Build dependency edges: function → set of functions it depends on
  // (nesting children + call targets within this module).
  const deps = new Map<FuncOpId, Set<FuncOpId>>();
  for (const funcIR of moduleIR.functions.values()) {
    const funcDeps = new Set<FuncOpId>();
    deps.set(funcIR.id, funcDeps);

    // Nesting: parent depends on children.
    for (const nested of funcIR.getNestedFunctionOps()) {
      funcDeps.add(nested.funcOp.id);
    }

    // Calls: caller depends on callee (intra-module only).
    for (const block of funcIR.allBlocks()) {
      for (const instr of block.operations) {
        if (!(instr instanceof CallExpressionOp)) continue;

        const calleeInstr = instr.callee.def;
        if (!(calleeInstr instanceof LoadLocalOp)) continue;
        const calleeId = declToFunc.get(calleeInstr.value.declarationId);
        if (calleeId !== undefined && calleeId !== funcIR.id) {
          funcDeps.add(calleeId);
        }
      }
    }
  }

  // Post-order DFS → callees/children before callers/parents.
  const order: FuncOp[] = [];
  const visited = new Set<FuncOpId>();
  const visiting = new Set<FuncOpId>();

  const visit = (id: FuncOpId) => {
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
