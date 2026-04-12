import type { ExportDefaultDeclaration } from "oxc-parser";
import { Environment } from "../../../environment";
import { ExportDefaultDeclarationInstruction } from "../../../ir";
import { FunctionDeclarationInstruction } from "../../../ir/instructions/declaration/FunctionDeclaration";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { buildClassDeclaration } from "./buildClassDeclaration";
import { buildClassExpression } from "../expressions/buildClassExpression";
import { buildFunctionExpression } from "../expressions/buildFunctionExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildExportDefaultDeclaration(
  node: ExportDefaultDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const declaration = node.declaration;

  // Anonymous default function/class → expression builders. Named default
  // function is reused from scope instantiation (`emit: false`); named default
  // class uses `buildClassDeclaration` with `emit: false`.
  let declarationPlace;
  if (declaration.type === "FunctionDeclaration") {
    if (declaration.id === null) {
      declarationPlace = buildFunctionExpression(
        declaration,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
    } else {
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
    }
  } else if (declaration.type === "ClassDeclaration") {
    if (declaration.id === null) {
      declarationPlace = buildClassExpression(
        declaration,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
    } else {
      declarationPlace = buildClassDeclaration(
        declaration,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
        { emit: false },
      );
    }
  } else {
    declarationPlace = buildNode(declaration, scope, functionBuilder, moduleBuilder, environment);
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
  moduleBuilder.moduleIR.exports.set("default", {
    instruction,
    declaration: declarationInstr,
  });
  return place;
}
