import * as t from "@babel/types";
import { toIdentifierOrStringLiteral } from "../../../../babel-utils";
import { importNameToExportName, ImportSpecifierOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateImportSpecifierOp(
  instruction: ImportSpecifierOp,
  generator: CodeGenerator,
): t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier {
  if (instruction.imported.kind === "default") {
    return generateImportDefaultSpecifier(instruction, generator);
  } else if (instruction.imported.kind === "namespace") {
    return generateImportNamespaceSpecifier(instruction, generator);
  } else {
    return generateImportSpecifier(instruction, generator);
  }
}

function generateImportDefaultSpecifier(instruction: ImportSpecifierOp, generator: CodeGenerator) {
  const local = t.identifier(instruction.local);
  const node = t.importDefaultSpecifier(local);
  generator.values.set(instruction.place.id, node);
  generator.declarationIdentifiers.set(instruction.localDeclarationId, local);
  return node;
}

function generateImportNamespaceSpecifier(
  instruction: ImportSpecifierOp,
  generator: CodeGenerator,
) {
  const local = t.identifier(instruction.local);
  const node = t.importNamespaceSpecifier(local);
  generator.values.set(instruction.place.id, node);
  generator.declarationIdentifiers.set(instruction.localDeclarationId, local);
  return node;
}

function generateImportSpecifier(instruction: ImportSpecifierOp, generator: CodeGenerator) {
  const local = t.identifier(instruction.local);
  const imported = toIdentifierOrStringLiteral(importNameToExportName(instruction.imported));
  const node = t.importSpecifier(local, imported);
  generator.values.set(instruction.place.id, node);
  generator.declarationIdentifiers.set(instruction.localDeclarationId, local);
  return node;
}
