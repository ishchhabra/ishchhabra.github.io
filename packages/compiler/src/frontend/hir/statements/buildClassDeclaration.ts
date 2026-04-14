import type { Class } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place, StoreLocalOp } from "../../../ir";
import { ClassDeclarationOp } from "../../../ir/ops/class/ClassDeclaration";
import { ClassExpressionOp } from "../../../ir/ops/class/ClassExpression";
import { type Scope } from "../../scope/Scope";
import { buildClassBody } from "../buildClassElements";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildClassDeclaration(
  node: Class,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
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

  // Context (`let`) class bindings must stay as expression + assignment — there
  // is no `let class Foo {}` form in JS.
  const isContext = environment.contextDeclarationIds.has(declarationId);
  if (isContext) {
    const classPlace = environment.createPlace(environment.createIdentifier(declarationId));
    const instruction = environment.createOperation(
      ClassExpressionOp,
      classPlace,
      null,
      superClassPlace,
      elements,
    );
    functionBuilder.addOp(instruction);
    environment.registerDeclarationOp(classPlace, instruction);

    const storePlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addOp(
      environment.createOperation(
        StoreLocalOp,
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

  const classDecl = environment.createOperation(
    ClassDeclarationOp,
    identifierPlace,
    superClassPlace,
    elements,
  );
  functionBuilder.addOp(classDecl);
  environment.registerDeclarationOp(identifierPlace, classDecl);
  functionBuilder.markDeclarationInitialized(declarationId);

  return identifierPlace;
}
