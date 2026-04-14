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
  LogicalExpressionOp,
  MetaPropertyOp,
  NewExpressionOp,
  ObjectExpressionOp,
  ObjectPropertyOp,
  Place,
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
  valuePlace: Place,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Place {
  const bindingPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addOp(environment.createOperation(DeclareLocalOp, bindingPlace, "const"));
  environment.registerDeclaration(
    bindingPlace.identifier.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );
  functionBuilder.addOp(
    environment.createOperation(
      StoreLocalOp,
      environment.createPlace(environment.createIdentifier()),
      bindingPlace,
      valuePlace,
      "const",
      "declaration",
    ),
  );
  return bindingPlace;
}

export function isStablePlace(
  place: Place,
  environment: Environment,
  seen = new Set<number>(),
): boolean {
  if (seen.has(place.id)) return true;
  seen.add(place.id);

  const instruction = environment.placeToOp.get(place.id);
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

  if (instruction instanceof LogicalExpressionOp) {
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
  valuePlace: Place,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Place {
  if (isStablePlace(valuePlace, environment)) {
    return valuePlace;
  }

  return materializePlace(valuePlace, functionBuilder, environment);
}
