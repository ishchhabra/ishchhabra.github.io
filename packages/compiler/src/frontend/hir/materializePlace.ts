import { Environment } from "../../environment";
import {
  ArrayExpressionOp,
  AwaitExpressionOp,
  BinaryExpressionOp,
  CallExpressionOp,
  ClassExpressionOp,
  DeclareLocalOp,
  ImportExpressionOp,
  LiteralOp,
  LoadContextOp,
  LoadDynamicPropertyOp,
  LoadGlobalOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  MetaPropertyOp,
  NewExpressionOp,
  ObjectExpressionOp,
  ObjectPropertyOp,
  Value,
  RegExpLiteralOp,
  SequenceExpressionOp,
  StoreLocalOp,
  TaggedTemplateExpressionOp,
  TemplateLiteralOp,
  ThisExpressionOp,
  UnaryExpressionOp,
  YieldExpressionOp,
} from "../../ir";
import { ArrowFunctionExpressionOp } from "../../ir/ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../../ir/ops/func/FunctionExpression";
import { FuncOpBuilder } from "./FuncOpBuilder";

export function materializePlace(
  valuePlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  const bindingPlace = environment.createValue();
  functionBuilder.addOp(environment.createOperation(DeclareLocalOp, bindingPlace, "const"));
  environment.registerDeclaration(
    bindingPlace.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace,
  );
  functionBuilder.addOp(
    environment.createOperation(
      StoreLocalOp,
      environment.createValue(),
      bindingPlace,
      valuePlace,
      "const",
      "declaration",
    ),
  );
  return bindingPlace;
}

export function isStablePlace(
  place: Value,
  environment: Environment,
  seen = new Set<number>(),
): boolean {
  if (seen.has(place.id)) return true;
  seen.add(place.id);

  const instruction = place.definer;
  if (!instruction) {
    return true;
  }

  if (
    instruction instanceof DeclareLocalOp ||
    instruction instanceof LoadLocalOp ||
    instruction instanceof LoadContextOp ||
    instruction instanceof LiteralOp ||
    instruction instanceof ThisExpressionOp ||
    instruction instanceof MetaPropertyOp
  ) {
    return true;
  }

  if (instruction instanceof UnaryExpressionOp) {
    return (
      !["delete", "throw"].includes(instruction.operator) &&
      isStablePlace(instruction.argument, environment, seen)
    );
  }

  if (instruction instanceof BinaryExpressionOp) {
    return (
      isStablePlace(instruction.left, environment, seen) &&
      isStablePlace(instruction.right, environment, seen)
    );
  }

  if (instruction instanceof TemplateLiteralOp) {
    return instruction.expressions.every((expr) => isStablePlace(expr, environment, seen));
  }

  if (instruction instanceof SequenceExpressionOp) {
    return instruction.expressions.every((expr) => isStablePlace(expr, environment, seen));
  }

  if (
    instruction instanceof ArrayExpressionOp ||
    instruction instanceof AwaitExpressionOp ||
    instruction instanceof CallExpressionOp ||
    instruction instanceof ClassExpressionOp ||
    instruction instanceof ArrowFunctionExpressionOp ||
    instruction instanceof FunctionExpressionOp ||
    instruction instanceof ImportExpressionOp ||
    instruction instanceof LoadDynamicPropertyOp ||
    instruction instanceof LoadGlobalOp ||
    instruction instanceof LoadStaticPropertyOp ||
    instruction instanceof NewExpressionOp ||
    instruction instanceof ObjectExpressionOp ||
    instruction instanceof ObjectPropertyOp ||
    instruction instanceof RegExpLiteralOp ||
    instruction instanceof TaggedTemplateExpressionOp ||
    instruction instanceof YieldExpressionOp
  ) {
    return false;
  }

  return false;
}

export function stabilizePlace(
  valuePlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  if (isStablePlace(valuePlace, environment)) {
    return valuePlace;
  }

  return materializePlace(valuePlace, functionBuilder, environment);
}
