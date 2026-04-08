import type * as AST from "../estree";
import { Environment } from "../../environment";
import { ExportSpecifierInstruction, Place } from "../../ir";
import { type Scope } from "../scope/Scope";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export function buildExportSpecifier(
  node: AST.ExportSpecifier,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const localName = getLocalName(node);
  const exportedName = getExportedName(node);

  const declarationId = functionBuilder.getDeclarationId(localName, scope);
  if (declarationId === undefined) {
    throw new Error(`Export specifier local '${localName}': no declaration id found`);
  }
  const declarationInstructionId = environment.getDeclarationInstruction(declarationId)!;
  const declarationInstruction = environment.instructions.get(declarationInstructionId)!;

  // Use the declaration's binding place directly so that ExportSpecifier
  // holds a read-reference to it, preventing DCE from removing the declaration.
  // We look up via declToPlaces rather than the declaration instruction's lval,
  // because for destructured declarations (e.g. `const { x } = obj`) the
  // StoreLocal's lval is the pattern place, not the individual binding place.
  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  if (latestDeclaration === undefined) {
    throw new Error(`Export specifier local '${localName}': no declaration place found`);
  }
  const localPlace = environment.places.get(latestDeclaration.placeId);
  if (localPlace === undefined) {
    throw new Error(`Export specifier local '${localName}': binding place not found`);
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ExportSpecifierInstruction,
    place,
    localPlace,
    exportedName,
  );
  functionBuilder.addInstruction(instruction);

  moduleBuilder.exports.set(exportedName, {
    instruction,
    declaration: declarationInstruction,
  });
  return place;
}

function getSpecifierName(specifier: AST.Identifier | AST.Literal): string {
  if (specifier.type === "Identifier") {
    return specifier.name;
  }
  return specifier.value as string;
}

function getLocalName(node: AST.ExportSpecifier) {
  return getSpecifierName(node.local);
}

function getExportedName(node: AST.ExportSpecifier) {
  return getSpecifierName(node.exported);
}
