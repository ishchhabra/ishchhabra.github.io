import type { Class } from "oxc-parser";
import { Environment } from "../../../environment";
import { StoreLocalInstruction } from "../../../ir";
import { ClassExpressionInstruction } from "../../../ir/instructions/value/ClassExpression";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildClassDeclaration(
  node: Class,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  _moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  if (node.body.body.length > 0 || node.superClass != null) {
    throw new Error("Unsupported: class declarations with bodies or extends clauses");
  }

  const id = node.id;
  if (id == null || id.type !== "Identifier") {
    throw new Error("Invalid class declaration: missing id");
  }

  const declarationId = functionBuilder.getDeclarationId(id.name, scope);
  if (declarationId === undefined) {
    throw new Error(`Class declaration binding was not instantiated: ${id.name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const identifierPlace = environment.places.get(latestDeclaration.placeId);
  if (identifierPlace === undefined) {
    throw new Error(`Unable to find the place for ${id.name} (${declarationId})`);
  }

  const classPlace = environment.createPlace(environment.createIdentifier(declarationId));
  const instruction = environment.createInstruction(
    ClassExpressionInstruction,
    classPlace,
    identifierPlace,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(classPlace, instruction);

  // Explicit StoreLocal to bind the class value to the declaration place.
  const isContext = environment.contextDeclarationIds.has(declarationId);
  const storePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      storePlace,
      identifierPlace,
      classPlace,
      isContext ? ("let" as const) : ("const" as const),
      [],
    ),
  );

  functionBuilder.markDeclarationInitialized(declarationId);
  return classPlace;
}
