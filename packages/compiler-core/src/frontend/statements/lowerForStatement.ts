import { ForStatement, type VariableDeclaration, type VariableDeclarator } from "oxc-parser";

import { blockTarget } from "../../ir/core/TerminatorOp";
import { Value } from "../../ir/core/Value";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { BranchTerminatorOp } from "../../ir/ops/control/BranchTerminatorOp";
import {
  ForTerminatorOp,
  type ForHeaderDeclarator,
  type ForHeaderInit,
} from "../../ir/ops/control/ForTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { DestructureBindingOp } from "../../ir/ops/patterns/DestructureBindingOp";
import { lowerExpression } from "../expressions/lowerExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerBindingPatternTarget } from "../patterns/lowerBindingPatternTarget";
import { StatementLoweringOptions } from "./loweringOptions";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers a for loop to explicit control flow with a structured loop owner.
 *
 * The initializer runs before the loop host. The host enters the test block.
 * The test branches to body or exit. A normally completing body jumps to the
 * update block, and a normally completing update jumps back to the host.
 */
export function lowerForStatement(
  builder: FunctionIRBuilder,
  statement: ForStatement,
  options: StatementLoweringOptions = {},
): void {
  const initBlock = statement.init === null ? null : builder.createBlock();
  const loopBlock = builder.createBlock();
  const testBlock = builder.createBlock();
  const bodyBlock = builder.createBlock();
  const updateBlock = builder.createBlock();
  const completionBlock = builder.createBlock();
  let headerInit: ForHeaderInit = { kind: "none" };

  builder.terminate(
    new JumpTerminatorOp(builder.operationId(), blockTarget(initBlock ?? loopBlock)),
  );

  if (initBlock !== null && statement.init !== null) {
    builder.setCurrentBlock(initBlock);
    headerInit = lowerForHeaderInit(builder, statement.init);

    if (!builder.currentBlock.isTerminated) {
      builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)));
    }
  }

  const control = {
    kind: "loop" as const,
    label: options.label ?? null,
    breakTarget: completionBlock,
    continueTarget: updateBlock,
  };

  builder.setCurrentBlock(loopBlock);
  builder.terminate(
    new ForTerminatorOp(
      builder.operationId(),
      initBlock === null ? null : blockTarget(initBlock),
      headerInit,
      blockTarget(testBlock),
      bodyBlock,
      updateBlock,
      completionBlock,
      options.label ?? null,
    ),
  );

  builder.setCurrentBlock(testBlock);
  const condition =
    statement.test === null
      ? emitConstant(builder, true)
      : lowerExpression(builder, statement.test);

  builder.terminate(
    new BranchTerminatorOp(
      builder.operationId(),
      condition,
      blockTarget(bodyBlock),
      blockTarget(completionBlock),
    ),
  );

  builder.pushControl(control);
  try {
    builder.setCurrentBlock(bodyBlock);
    lowerStatement(builder, statement.body);
  } finally {
    builder.popControl(control);
  }

  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(updateBlock)));
  }

  builder.setCurrentBlock(updateBlock);
  if (statement.update !== null) {
    lowerExpression(builder, statement.update);
  }
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)));
  }

  builder.setCurrentBlock(completionBlock);
}

function emitConstant(builder: FunctionIRBuilder, value: boolean | undefined): Value {
  const result = builder.createValue();
  builder.emit(new ConstantOp(builder.operationId(), value, result));
  return result;
}

function lowerForHeaderInit(builder: FunctionIRBuilder, init: ForStatement["init"]): ForHeaderInit {
  if (init === null) return { kind: "none" };

  if (init.type !== "VariableDeclaration") {
    return { kind: "expression", value: lowerExpression(builder, init) };
  }

  return lowerForHeaderDeclaration(builder, init);
}

function lowerForHeaderDeclaration(
  builder: FunctionIRBuilder,
  declaration: VariableDeclaration,
): ForHeaderInit {
  if (declaration.kind !== "var" && declaration.kind !== "let" && declaration.kind !== "const") {
    throw new Error(`Unsupported for header declaration kind: ${declaration.kind}`);
  }

  const declarators = declaration.declarations.map((declarator) =>
    lowerForHeaderDeclarator(builder, declaration, declarator),
  );

  return {
    kind: "declaration",
    declarationKind: declaration.kind,
    declarators,
  };
}

function lowerForHeaderDeclarator(
  builder: FunctionIRBuilder,
  declaration: VariableDeclaration,
  declarator: VariableDeclarator,
): ForHeaderDeclarator {
  const initializer = initializerValue(builder, declaration, declarator);
  const target = lowerBindingPatternTarget(builder, declarator.id);

  if (initializer === null) {
    return { target, initializer, bindingValue: null };
  }

  if (target.kind !== "binding") {
    builder.emit(
      new DestructureBindingOp(
        builder.operationId(),
        target,
        initializer,
        declaration.kind === "var" ? "store" : "initialize",
      ),
    );

    return { target, initializer, bindingValue: null };
  }

  const bindingValue = builder.createValue(target.declarationId);

  if (declaration.kind === "var") {
    builder.emit(
      new StoreBindingOp(builder.operationId(), target.declarationId, initializer, bindingValue),
    );
  } else {
    builder.emit(
      new InitializeBindingOp(
        builder.operationId(),
        target.declarationId,
        initializer,
        bindingValue,
      ),
    );
  }

  return { target, initializer, bindingValue };
}

function initializerValue(
  builder: FunctionIRBuilder,
  declaration: VariableDeclaration,
  declarator: VariableDeclarator,
): Value | null {
  if (declarator.init !== null) {
    return lowerExpression(builder, declarator.init);
  }

  if (declaration.kind === "var") {
    return null;
  }

  if (declaration.kind === "const") {
    throw new Error("Const declaration in for header requires an initializer");
  }

  return emitConstant(builder, undefined);
}
