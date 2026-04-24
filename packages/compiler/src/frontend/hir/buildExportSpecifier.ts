import type * as AST from "../estree";
import type { ExportSpecifier } from "oxc-parser";
import { Environment } from "../../environment";
import { ExportSpecifierOp, Operation, Value } from "../../ir";
import { type Scope } from "../scope/Scope";
import { FuncOpBuilder } from "./FuncOpBuilder";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export function buildExportSpecifier(
  node: ExportSpecifier,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const localName = getLocalName(node);
  const exportedName = getExportedName(node);

  const declarationId = functionBuilder.getDeclarationId(localName, scope);
  if (declarationId === undefined) {
    throw new Error(`Export specifier local '${localName}': no declaration id found`);
  }
  // Look up the declaration's binding place directly. ExportSpecifier
  // holds a read-reference to it so DCE does not remove the declaration.
  // We use declToValues (not the declaration instruction's lval) because
  // for destructured declarations (e.g. `const { x } = obj`) the
  // StoreLocal's lval is the pattern place, not the individual binding place.
  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  if (latestDeclaration === undefined) {
    throw new Error(`Export specifier local '${localName}': no declaration place found`);
  }
  const localPlace = latestDeclaration.value;
  if (localPlace === undefined) {
    throw new Error(`Export specifier local '${localName}': binding place not found`);
  }
  const declarationInstruction = localPlace.def as Operation | undefined;
  if (declarationInstruction === undefined) {
    throw new Error(`Export specifier local '${localName}': binding place has no definer`);
  }

  const place = environment.createValue();
  const instruction = environment.createOperation(
    ExportSpecifierOp,
    place,
    localPlace,
    exportedName,
  );
  functionBuilder.addOp(instruction);

  moduleBuilder.moduleIR.exports.set(exportedName, {
    instruction,
    declaration: declarationInstruction,
  });
  return place;
}

function getSpecifierName(specifier: AST.Value | AST.Literal): string {
  if (specifier.type === "Identifier") {
    return specifier.name;
  }
  return specifier.value as string;
}

function getLocalName(node: ExportSpecifier) {
  return getSpecifierName(node.local);
}

function getExportedName(node: ExportSpecifier) {
  return getSpecifierName(node.exported);
}
