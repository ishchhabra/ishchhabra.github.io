import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { ExportDefaultDeclarationInstruction } from "../../../ir";
import { buildClassExpression } from "../expressions/buildClassExpression";
import { buildFunctionExpression } from "../expressions/buildFunctionExpression";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildExportDefaultDeclaration(
  nodePath: NodePath<t.ExportDefaultDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const declarationPath = nodePath.get("declaration");

  // `export default function() {}` and `export default class {}` have
  // FunctionDeclaration / ClassDeclaration nodes with id=null.  Route
  // these through the expression builders which already handle the
  // anonymous case, rather than the declaration builders which require
  // a name.
  let declarationPlace;
  if (declarationPath.isFunctionDeclaration() && declarationPath.node.id === null) {
    declarationPlace = buildFunctionExpression(
      declarationPath as unknown as NodePath<t.FunctionExpression>,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  } else if (declarationPath.isClassDeclaration() && declarationPath.node.id === null) {
    declarationPlace = buildClassExpression(
      declarationPath as unknown as NodePath<t.ClassExpression>,
      functionBuilder,
      environment,
    );
  } else {
    declarationPlace = buildNode(declarationPath, functionBuilder, moduleBuilder, environment);
  }

  if (declarationPlace === undefined || Array.isArray(declarationPlace)) {
    throw new Error("Export default declaration must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ExportDefaultDeclarationInstruction,
    place,
    nodePath,
    declarationPlace,
  );
  functionBuilder.addInstruction(instruction);

  // Named declarations register via registerDeclarationInstruction; anonymous
  // export default functions/classes only have a placeToInstruction entry.
  const declarationInstructionId = environment.getDeclarationInstruction(
    declarationPlace.identifier.declarationId,
  );
  const declaration =
    declarationInstructionId !== undefined
      ? environment.instructions.get(declarationInstructionId)
      : environment.placeToInstruction.get(declarationPlace.id);
  moduleBuilder.exports.set("default", {
    instruction,
    declaration,
  });
  return place;
}
