import type { LogicalExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  BinaryExpressionOp,
  createOperationId,
  IfOp,
  LiteralOp,
  Region,
  Value,
  YieldOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Lower `&&` / `||` / `??` to textbook short-circuit control flow:
 *
 *   a && b  →  if a { yield b } else { yield a }
 *   a || b  →  if a { yield a } else { yield b }
 *   a ?? b  →  if a == null { yield b } else { yield a }
 *
 * Keeping the old eager `LogicalExpressionOp` miscompiled programs
 * whose RHS has side effects — DCE would remove the pure logical op
 * while the RHS call survived as a standalone statement, running
 * unconditionally. Lowering to `IfOp` makes the gating structural so
 * every downstream pass (DCE, constant-folding, LICM) sees it.
 */
export function buildLogicalExpression(
  node: LogicalExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const parentBlock = functionBuilder.currentBlock;

  const leftPlace = buildNode(node.left, scope, functionBuilder, moduleBuilder, environment);
  if (leftPlace === undefined || Array.isArray(leftPlace)) {
    throw new Error("Logical expression left must be a single place");
  }

  const testPlace = buildTestPlace(node.operator, leftPlace, functionBuilder, environment);

  const { leftArmRegion, rightArmRegion } = (() => {
    switch (node.operator) {
      case "&&":
        // Truthy → yield RHS; falsy → yield LHS.
        return {
          leftArmRegion: buildRhsArm(
            node.right,
            scope,
            functionBuilder,
            moduleBuilder,
            environment,
          ),
          rightArmRegion: buildLhsPassthroughArm(leftPlace, functionBuilder, environment),
        };
      case "||":
        // Truthy → yield LHS; falsy → yield RHS.
        return {
          leftArmRegion: buildLhsPassthroughArm(leftPlace, functionBuilder, environment),
          rightArmRegion: buildRhsArm(
            node.right,
            scope,
            functionBuilder,
            moduleBuilder,
            environment,
          ),
        };
      case "??":
        // Test is `lhs != null`. Truthy (lhs is defined) → yield lhs;
        // falsy (lhs is nullish) → yield rhs.
        return {
          leftArmRegion: buildLhsPassthroughArm(leftPlace, functionBuilder, environment),
          rightArmRegion: buildRhsArm(
            node.right,
            scope,
            functionBuilder,
            moduleBuilder,
            environment,
          ),
        };
      default: {
        const exhaustive: never = node.operator;
        throw new Error(`Unsupported logical operator: ${String(exhaustive)}`);
      }
    }
  })();

  const resultPlace = environment.createValue();
  const ifOp = new IfOp(
    createOperationId(environment),
    testPlace,
    [resultPlace],
    leftArmRegion,
    rightArmRegion,
  );
  parentBlock.appendOp(ifOp);
  functionBuilder.currentBlock = parentBlock;
  return resultPlace;
}

/**
 * Compute the branch condition:
 *   `&&` / `||` — the LHS itself (IfOp's usual truthy test).
 *   `??`         — `lhs == null` (covers both null and undefined).
 */
function buildTestPlace(
  operator: LogicalExpression["operator"],
  leftPlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  if (operator !== "??") return leftPlace;

  const nullPlace = environment.createValue();
  functionBuilder.addOp(environment.createOperation(LiteralOp, nullPlace, null));

  const testPlace = environment.createValue();
  functionBuilder.addOp(
    environment.createOperation(BinaryExpressionOp, testPlace, "!=", leftPlace, nullPlace),
  );
  return testPlace;
}

/** Build `node.right` inside a fresh region, yielding its result place. */
function buildRhsArm(
  right: LogicalExpression["right"],
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Region {
  const region = new Region([]);
  const block = environment.createBlock();
  functionBuilder.withStructureRegion(region, () => {
    functionBuilder.addBlock(block);
    functionBuilder.currentBlock = block;

    const place = buildNode(right, scope, functionBuilder, moduleBuilder, environment);
    if (place === undefined || Array.isArray(place)) {
      throw new Error("Logical expression right must be a single place");
    }

    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), [place]);
    }
  });
  return region;
}

/**
 * Region that just yields the already-built LHS value (e.g. the
 * short-circuit arm that returns the value that triggered the
 * short-circuit). The LHS's defining ops live in the parent block;
 * the yield references that value directly.
 */
function buildLhsPassthroughArm(
  leftPlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Region {
  const region = new Region([]);
  const block = environment.createBlock();
  functionBuilder.withStructureRegion(region, () => {
    functionBuilder.addBlock(block);
    functionBuilder.currentBlock = block;
    functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), [
      leftPlace,
    ]);
  });
  return region;
}
