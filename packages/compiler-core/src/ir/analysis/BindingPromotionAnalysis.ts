import type { BindingPatternTarget } from "../core/DestructurePattern";
import type { FunctionIR } from "../core/FunctionIR";
import type { Operation } from "../core/Operation";
import type { DeclarationId, Value } from "../core/Value";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../ops/bindings/LoadBindingOp";
import { StoreBindingOp } from "../ops/bindings/StoreBindingOp";
import { ConstantOp } from "../ops/constants/ConstantOp";
import { JSXElementOp, type JSXName } from "../ops/jsx/JSXElementOp";
import { DestructureBindingOp } from "../ops/patterns/DestructureBindingOp";
import type { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";
import { BindingEscapeAnalysis } from "./BindingEscapeAnalysis";

export interface BindingPromotionInfo {
  readonly promotableDeclarations: ReadonlySet<DeclarationId>;
}

/**
 * Finds declaration-backed bindings whose storage can be erased after SSA construction.
 *
 * This analysis combines module-level binding escapes with local binding usage. It is
 * conservative: unsupported binding constructs are rejected rather than rewritten.
 */
export const BindingPromotionAnalysis: FunctionAnalysis<BindingPromotionInfo> = {
  name: "binding-promotion",

  run(fn: FunctionIR, analyses: AnalysisManager): BindingPromotionInfo {
    const candidates = new Set<DeclarationId>();
    const rejected = new Set<DeclarationId>();

    if (fn.ownerModule === null) {
      throw new Error(`Cannot analyze Function#${fn.id}: function is not attached to a module`);
    }

    const escape = analyses.getModule(BindingEscapeAnalysis, fn.ownerModule);
    for (const declaration of escape.escapingDeclarations) {
      rejected.add(declaration);
    }

    rejectFunctionParameterDeclarations(fn, rejected);
    rejectNestedPatternExpressionDeclarations(fn, rejected);

    for (const block of fn.blocks) {
      for (const op of block.operations) {
        collectCandidate(op, candidates);
        rejectOperation(op, rejected);
      }
    }

    for (const declaration of rejected) {
      candidates.delete(declaration);
    }

    return { promotableDeclarations: candidates };
  },
};

function collectCandidate(op: Operation, candidates: Set<DeclarationId>): void {
  if (op instanceof InitializeBindingOp || op instanceof StoreBindingOp) {
    candidates.add(op.declarationId);
  }
}

function rejectFunctionParameterDeclarations(fn: FunctionIR, rejected: Set<DeclarationId>): void {
  for (const param of fn.params) {
    if (param.kind === "argument" || param.kind === "rest") {
      for (const declaration of bindingPatternDeclarations(param.target)) {
        rejected.add(declaration);
      }
    }
  }
}

function rejectNestedPatternExpressionDeclarations(
  fn: FunctionIR,
  rejected: Set<DeclarationId>,
): void {
  for (const nested of fn.ownerModule?.functions ?? []) {
    if (nested.parentFunction !== fn || nested.kind !== "pattern-expression") {
      continue;
    }

    for (const block of nested.blocks) {
      for (const op of block.operations) {
        rejectPatternExpressionOperation(op, rejected);
      }
    }
  }
}

function rejectPatternExpressionOperation(op: Operation, rejected: Set<DeclarationId>): void {
  if (
    op instanceof InitializeBindingOp ||
    op instanceof LoadBindingOp ||
    op instanceof StoreBindingOp
  ) {
    rejected.add(op.declarationId);
  }

  if (op instanceof DestructureBindingOp) {
    for (const declaration of bindingPatternDeclarations(op.target)) {
      rejected.add(declaration);
    }
  }
}

function rejectOperation(op: Operation, rejected: Set<DeclarationId>): void {
  if (
    op instanceof LoadBindingOp &&
    op.bindingValue !== null &&
    isUninitializedSeed(op.bindingValue)
  ) {
    rejected.add(op.declarationId);
  }

  if (op instanceof DestructureBindingOp) {
    for (const declaration of bindingPatternDeclarations(op.target)) {
      rejected.add(declaration);
    }

    for (const operand of op.operands()) {
      if (operand.declarationId !== null) {
        rejected.add(operand.declarationId);
      }
    }
  }

  if (op instanceof JSXElementOp) {
    rejectJSXName(op.name, rejected);
    for (const attribute of op.attributes) {
      if (attribute.kind === "attribute") {
        rejectJSXName(attribute.name, rejected);
      }
    }
  }
}

function isUninitializedSeed(value: Value): boolean {
  const definer = value.definer;

  return definer instanceof ConstantOp && definer.value === undefined;
}

function bindingPatternDeclarations(target: BindingPatternTarget): readonly DeclarationId[] {
  switch (target.kind) {
    case "binding":
      return [target.declarationId];

    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : bindingPatternDeclarations(element),
      );

    case "object":
      return target.properties.flatMap((property) => bindingPatternDeclarations(property.target));

    case "rest":
    case "default":
      return bindingPatternDeclarations(target.target);
  }
}

function rejectJSXName(name: JSXName, rejected: Set<DeclarationId>): void {
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
      rejectJSXName(name.object, rejected);
      return;
  }
}
