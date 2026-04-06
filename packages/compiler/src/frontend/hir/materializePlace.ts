import { Environment } from "../../environment";
import {
  ArrayExpressionInstruction,
  AwaitExpressionInstruction,
  BinaryExpressionInstruction,
  CallExpressionInstruction,
  ClassExpressionInstruction,
  CopyInstruction,
  DeclareLocalInstruction,
  ImportExpressionInstruction,
  LiteralInstruction,
  LoadContextInstruction,
  LoadDynamicPropertyInstruction,
  LoadGlobalInstruction,
  LoadLocalInstruction,
  LoadPhiInstruction,
  LoadStaticPropertyInstruction,
  LogicalExpressionInstruction,
  MetaPropertyInstruction,
  NewExpressionInstruction,
  ObjectExpressionInstruction,
  ObjectPropertyInstruction,
  Place,
  RegExpLiteralInstruction,
  SequenceExpressionInstruction,
  StoreLocalInstruction,
  TaggedTemplateExpressionInstruction,
  TemplateLiteralInstruction,
  ThisExpressionInstruction,
  UnaryExpressionInstruction,
  YieldExpressionInstruction,
} from "../../ir";
import { ArrowFunctionExpressionInstruction } from "../../ir/instructions/value/ArrowFunctionExpression";
import { FunctionExpressionInstruction } from "../../ir/instructions/value/FunctionExpression";
import { FunctionIRBuilder } from "./FunctionIRBuilder";

export function materializePlace(
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const bindingPlace = environment.createPlace(
    environment.createIdentifier(undefined, functionBuilder.scope.allocateName()),
  );
  functionBuilder.addInstruction(
    environment.createInstruction(DeclareLocalInstruction, bindingPlace, "const"),
  );
  environment.registerDeclaration(
    bindingPlace.identifier.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      environment.createPlace(
        environment.createIdentifier(undefined, functionBuilder.scope.allocateName()),
      ),
      bindingPlace,
      valuePlace,
      "const",
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

  const instruction = environment.placeToInstruction.get(place.id);
  if (!instruction) {
    return true;
  }

  if (
    instruction instanceof DeclareLocalInstruction ||
    instruction instanceof LoadLocalInstruction ||
    instruction instanceof LoadContextInstruction ||
    instruction instanceof LoadPhiInstruction ||
    instruction instanceof LiteralInstruction ||
    instruction instanceof ThisExpressionInstruction ||
    instruction instanceof MetaPropertyInstruction
  ) {
    return true;
  }

  if (instruction instanceof UnaryExpressionInstruction) {
    return (
      !["delete", "throw"].includes(instruction.operator) &&
      isStablePlace(instruction.argument, environment, seen)
    );
  }

  if (instruction instanceof BinaryExpressionInstruction) {
    return (
      isStablePlace(instruction.left, environment, seen) &&
      isStablePlace(instruction.right, environment, seen)
    );
  }

  if (instruction instanceof LogicalExpressionInstruction) {
    return (
      isStablePlace(instruction.left, environment, seen) &&
      isStablePlace(instruction.right, environment, seen)
    );
  }

  if (instruction instanceof TemplateLiteralInstruction) {
    return instruction.expressions.every((expr) => isStablePlace(expr, environment, seen));
  }

  if (instruction instanceof SequenceExpressionInstruction) {
    return instruction.expressions.every((expr) => isStablePlace(expr, environment, seen));
  }

  if (
    instruction instanceof ArrayExpressionInstruction ||
    instruction instanceof AwaitExpressionInstruction ||
    instruction instanceof CallExpressionInstruction ||
    instruction instanceof ClassExpressionInstruction ||
    instruction instanceof CopyInstruction ||
    instruction instanceof ArrowFunctionExpressionInstruction ||
    instruction instanceof FunctionExpressionInstruction ||
    instruction instanceof ImportExpressionInstruction ||
    instruction instanceof LoadDynamicPropertyInstruction ||
    instruction instanceof LoadGlobalInstruction ||
    instruction instanceof LoadStaticPropertyInstruction ||
    instruction instanceof NewExpressionInstruction ||
    instruction instanceof ObjectExpressionInstruction ||
    instruction instanceof ObjectPropertyInstruction ||
    instruction instanceof RegExpLiteralInstruction ||
    instruction instanceof TaggedTemplateExpressionInstruction ||
    instruction instanceof YieldExpressionInstruction
  ) {
    return false;
  }

  return false;
}

export function stabilizePlace(
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  if (isStablePlace(valuePlace, environment)) {
    return valuePlace;
  }

  return materializePlace(valuePlace, functionBuilder, environment);
}
