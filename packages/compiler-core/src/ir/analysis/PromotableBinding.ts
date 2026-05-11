import { type DeclarationId, type FunctionIR, type Operation } from "../core";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { StoreBindingOp } from "../ops/bindings/StoreBindingOp";
import { CreateFunctionOp } from "../ops/functions/CreateFunctionOp";
import { JSXElementOp, type JSXName } from "../ops/jsx/JSXElementOp";
import { ExportDefaultValueOp } from "../ops/modules/ExportDefaultValueOp";
import { DestructureBindingOp } from "../ops/patterns/DestructureBindingOp";
import { AnalysisManager } from "./AnalysisManager";
import { ModulePromotabilityAnalysis } from "./ModulePromotability";

export interface PromotableBindings {
  readonly declarations: ReadonlySet<DeclarationId>;
}

/**
 * Finds declaration-backed bindings that can be erased into SSA values.
 *
 * This analysis is intentionally conservative. A declaration is promotable only
 * when all observed reads and writes are local binding operations in this
 * function. Captured bindings, imports, exports, globals, and dynamic-scope
 * observed bindings must remain memory-backed.
 */
export const PromotableBindingsAnalysis = {
  name: "promotable-bindings",

  run(fn: FunctionIR, analyses: AnalysisManager): PromotableBindings {
    if (fn.ownerModule === null) {
      throw new Error(`Function#${fn.id} is not attached to a module`);
    }

    const modulePromotability = analyses.getModule(
      ModulePromotabilityAnalysis,
      fn.ownerModule,
    );

    const candidates = new Set<DeclarationId>();
    const rejected = new Set<DeclarationId>(
      modulePromotability.nonPromotableDeclarations,
    );

    for (const param of fn.params) {
      if (param.kind === "capture") {
        rejected.add(param.declarationId);
        continue;
      }

      if (param.value.declarationId !== null) {
        rejected.add(param.value.declarationId);
      }
    }

    for (const block of fn.blocks) {
      for (const op of block.operations) {
        collectBindingCandidate(op, candidates);
        rejectNonPromotableOperation(op, rejected);
      }
    }

    for (const declaration of rejected) {
      candidates.delete(declaration);
    }

    return { declarations: candidates };
  },
};

function collectBindingCandidate(
  op: Operation,
  candidates: Set<DeclarationId>,
): void {
  if (op instanceof InitializeBindingOp || op instanceof StoreBindingOp) {
    candidates.add(op.declarationId);
  }
}

function rejectNonPromotableOperation(
  op: Operation,
  rejected: Set<DeclarationId>,
): void {
  if (op instanceof CreateFunctionOp) {
    for (const declarationId of op.captures) {
      rejected.add(declarationId);
    }
  }

  if (op instanceof DestructureBindingOp) {
    rejectPatternDeclarations(op, rejected);
  }

  if (op instanceof JSXElementOp) {
    rejectJSXNameDeclarations(op.name, rejected);
  }

  if (op instanceof ExportDefaultValueOp) {
    for (const operand of op.operands()) {
      if (operand.declarationId !== null) {
        rejected.add(operand.declarationId);
      }
    }
  }
}

function rejectJSXNameDeclarations(
  name: JSXName,
  rejected: Set<DeclarationId>,
): void {
  switch (name.kind) {
    case "intrinsic":
    case "namespace":
      return;

    case "reference":
      if (name.value.declarationId !== null) {
        rejected.add(name.value.declarationId);
      }
      return;

    case "member":
      rejectJSXNameDeclarations(name.object, rejected);
      return;
  }
}

function rejectPatternDeclarations(
  op: DestructureBindingOp,
  rejected: Set<DeclarationId>,
): void {
  for (const result of op.results) {
    if (result.declarationId !== null) {
      rejected.add(result.declarationId);
    }
  }
}
