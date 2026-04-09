import type { Class } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place, StoreLocalInstruction } from "../../../ir";
import { ClassExpressionInstruction } from "../../../ir/instructions/value/ClassExpression";
import { type Scope } from "../../scope/Scope";
import { buildClassBody } from "../buildClassElements";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildClassDeclaration(
  node: Class,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  if (node.decorators && node.decorators.length > 0) {
    throw new Error("Unsupported: class decorators");
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

  let superClassPlace: Place | null = null;
  if (node.superClass != null) {
    const built = buildNode(node.superClass, scope, functionBuilder, moduleBuilder, environment);
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Class superClass must be a single place");
    }
    superClassPlace = built;
  }

  const classBodyScope = functionBuilder.scopeFor(node.body);
  const elements = buildClassBody(
    node.body.body,
    classBodyScope,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  // For class declarations, the binding lives in the enclosing scope and is
  // wired up by the StoreLocal below. The class expression itself does not
  // need an inner name binding (named class expressions are only meaningful
  // when the class body references its own name from a non-enclosing scope).
  const classPlace = environment.createPlace(environment.createIdentifier(declarationId));
  const instruction = environment.createInstruction(
    ClassExpressionInstruction,
    classPlace,
    null,
    superClassPlace,
    elements,
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
