import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { ExportDefaultDeclarationInstruction } from "../../../ir";
import { FunctionDeclarationInstruction } from "../../../ir/instructions/declaration/FunctionDeclaration";
import { type Scope } from "../../scope/Scope";
import { buildClassExpression } from "../expressions/buildClassExpression";
import { buildFunctionExpression } from "../expressions/buildFunctionExpression";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildExportDefaultDeclaration(
  node: ESTree.ExportDefaultDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const declaration = node.declaration;

  // `export default function() {}` and `export default class {}` have
  // FunctionDeclaration / ClassDeclaration nodes with id=null.  Route
  // these through the expression builders which already handle the
  // anonymous case, rather than the declaration builders which require
  // a name.
  let declarationPlace;
  if (declaration.type === "FunctionDeclaration" && declaration.id === null) {
    declarationPlace = buildFunctionExpression(
      declaration as unknown as ESTree.FunctionExpression,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (declaration.type === "ClassDeclaration" && declaration.id === null) {
    declarationPlace = buildClassExpression(
      declaration as unknown as ESTree.ClassExpression,
      scope,
      functionBuilder,
      environment,
    );
  } else if (declaration.type === "FunctionDeclaration" && declaration.id != null) {
    // Named function declarations are already built during scope
    // instantiation. Reuse the existing declaration node directly.
    const name = declaration.id.name;
    const declarationId = functionBuilder.getDeclarationId(name, scope);
    if (declarationId !== undefined) {
      const declarationInstructionId = environment.getDeclarationInstruction(declarationId);
      const declarationInstruction =
        declarationInstructionId !== undefined
          ? environment.instructions.get(declarationInstructionId)
          : undefined;
      if (declarationInstruction instanceof FunctionDeclarationInstruction) {
        declarationInstruction.emit = false;
        declarationPlace = declarationInstruction.place;
      }
    }
  } else {
    declarationPlace = buildNode(
      declaration as ESTree.Node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  if (declarationPlace === undefined || Array.isArray(declarationPlace)) {
    throw new Error("Export default declaration must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ExportDefaultDeclarationInstruction,
    place,
    declarationPlace,
  );
  functionBuilder.addInstruction(instruction);

  // Named declarations register via registerDeclarationInstruction; anonymous
  // export default functions/classes only have a placeToInstruction entry.
  const declarationInstructionId = environment.getDeclarationInstruction(
    declarationPlace.identifier.declarationId,
  );
  const declarationInstr =
    declarationInstructionId !== undefined
      ? environment.instructions.get(declarationInstructionId)
      : environment.placeToInstruction.get(declarationPlace.id);
  moduleBuilder.exports.set("default", {
    instruction,
    declaration: declarationInstr,
  });
  return place;
}
