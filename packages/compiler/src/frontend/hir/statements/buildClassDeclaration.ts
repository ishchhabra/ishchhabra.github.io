import type { Class } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place, StoreLocalInstruction } from "../../../ir";
import { ClassDeclarationInstruction } from "../../../ir/instructions/declaration/ClassDeclaration";
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
  options: { emit?: boolean } = {},
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

  const emit = options.emit !== false;

  // Context (`let`) class bindings must stay as expression + assignment — there
  // is no `let class Foo {}` form in JS.
  const isContext = environment.contextDeclarationIds.has(declarationId);
  if (isContext) {
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

    const storePlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreLocalInstruction,
        storePlace,
        identifierPlace,
        classPlace,
        "let",
        "declaration",
        [],
      ),
    );
    functionBuilder.markDeclarationInitialized(declarationId);
    return classPlace;
  }

  const classDecl = environment.createInstruction(
    ClassDeclarationInstruction,
    identifierPlace,
    superClassPlace,
    elements,
    emit,
  );
  functionBuilder.addInstruction(classDecl);
  environment.registerDeclarationInstruction(identifierPlace, classDecl);
  functionBuilder.markDeclarationInitialized(declarationId);

  return identifierPlace;
}
