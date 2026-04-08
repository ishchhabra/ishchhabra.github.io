import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import {
  BinaryExpressionInstruction,
  DeclareLocalInstruction,
  LiteralInstruction,
  LoadLocalInstruction,
  Place,
  StoreContextInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { throwTDZAccessError } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildMemberExpressionUpdate } from "./buildMemberExpression";

export function buildUpdateExpression(
  node: AST.UpdateExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const argument = node.argument;
  if (argument.type === "MemberExpression") {
    return buildMemberExpressionUpdate(
      node,
      argument,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (argument.type !== "Identifier") {
    throw new Error(`Unsupported argument type: ${argument.type}`);
  }

  const declarationId = functionBuilder.getDeclarationId(argument.name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${argument.name}`);
  }

  if (functionBuilder.isDeclarationInTDZ(declarationId)) {
    throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? argument.name);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId)!;
  const originalPlace = environment.places.get(latestDeclaration.placeId);
  if (originalPlace === undefined) {
    throw new Error(`Unable to find the place for ${argument.name} (${declarationId})`);
  }

  // For postfix operations, snapshot the original value into a temporary
  // so that codegen emits a distinct variable for the pre-increment value.
  // Without this, in loops with phi nodes the original place gets reassigned
  // before codegen can read the pre-increment value.
  let oldValLoadPlace = originalPlace;
  if (!node.prefix) {
    const oldValBinding = environment.createIdentifier();
    const oldValBindingPlace = environment.createPlace(oldValBinding);
    functionBuilder.addInstruction(
      environment.createInstruction(DeclareLocalInstruction, oldValBindingPlace, "const"),
    );
    const oldValStorePlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreLocalInstruction,
        oldValStorePlace,
        oldValBindingPlace,
        originalPlace,
        "const",
      ),
    );
    oldValLoadPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(LoadLocalInstruction, oldValLoadPlace, oldValBindingPlace),
    );
  }

  let lvalPlace: Place;
  if (environment.contextDeclarationIds.has(declarationId)) {
    lvalPlace = originalPlace;
  } else {
    const lvalIdentifier = environment.createIdentifier(declarationId);
    lvalPlace = environment.createPlace(lvalIdentifier);
  }

  // Build the binary expression inline instead of creating a synthetic path.
  // Load the argument value.
  const argLoadIdentifier = environment.createIdentifier(declarationId);
  const argLoadPlace = environment.createPlace(argLoadIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(LoadLocalInstruction, argLoadPlace, originalPlace),
  );

  // Create literal 1
  const onePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(environment.createInstruction(LiteralInstruction, onePlace, 1));

  // Compute value +/- 1
  const isIncrement = node.operator === "++";
  const valuePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      BinaryExpressionInstruction,
      valuePlace,
      isIncrement ? "+" : "-",
      argLoadPlace,
      onePlace,
    ),
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const isContext = environment.contextDeclarationIds.has(declarationId);
  const instruction = isContext
    ? environment.createInstruction(
        StoreContextInstruction,
        place,
        lvalPlace,
        valuePlace,
        "let",
        "assignment",
      )
    : environment.createInstruction(StoreLocalInstruction, place, lvalPlace, valuePlace, "const");
  functionBuilder.addInstruction(instruction);
  environment.registerDeclaration(declarationId, functionBuilder.currentBlock.id, lvalPlace.id);

  if (node.prefix) {
    // For prefix (++i), return a LoadLocal of the stored value so codegen
    // references the named variable ($0_1) instead of re-emitting the
    // binary expression.
    const loadIdentifier = environment.createIdentifier(declarationId);
    const loadPlace = environment.createPlace(loadIdentifier);
    functionBuilder.addInstruction(
      environment.createInstruction(LoadLocalInstruction, loadPlace, lvalPlace),
    );
    return loadPlace;
  }
  return oldValLoadPlace;
}
