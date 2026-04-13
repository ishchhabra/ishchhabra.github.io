import * as t from "@babel/types";
import {
  ExportDefaultDeclarationOp,
  ExportNamedDeclarationOp,
  ExportSpecifierOp,
  ImportDeclarationOp,
  ImportSpecifierOp,
} from "../../../../ir";
import type { ModuleOp } from "../../../../ir/categories";
import { ExportAllOp } from "../../../../ir/ops/module/ExportAll";
import { ExportFromOp } from "../../../../ir/ops/module/ExportFrom";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateExportAllOp } from "./generateExportAll";
import { generateExportDefaultDeclarationOp } from "./generateExportDefaultDeclaration";
import { generateExportFromOp } from "./generateExportFrom";
import { generateExportNamedDeclarationOp } from "./generateExportNamedDeclaration";
import { generateExportSpecifierOp } from "./generateExportSpecifier";
import { generateImportDeclarationOp } from "./generateImportDeclaration";
import { generateImportSpecifierOp } from "./generateImportSpecifier";

export function generateModuleOp(
  instruction: ModuleOp,
  generator: CodeGenerator,
):
  | t.Statement
  | t.ExportSpecifier
  | t.ImportSpecifier
  | t.ImportDefaultSpecifier
  | t.ImportNamespaceSpecifier {
  if (instruction instanceof ExportAllOp) {
    return generateExportAllOp(instruction, generator);
  } else if (instruction instanceof ExportDefaultDeclarationOp) {
    return generateExportDefaultDeclarationOp(instruction, generator);
  } else if (instruction instanceof ExportFromOp) {
    return generateExportFromOp(instruction, generator);
  } else if (instruction instanceof ExportNamedDeclarationOp) {
    return generateExportNamedDeclarationOp(instruction, generator);
  } else if (instruction instanceof ExportSpecifierOp) {
    return generateExportSpecifierOp(instruction, generator);
  } else if (instruction instanceof ImportDeclarationOp) {
    return generateImportDeclarationOp(instruction, generator);
  } else if (instruction instanceof ImportSpecifierOp) {
    return generateImportSpecifierOp(instruction, generator);
  }

  throw new Error(
    `Unsupported module instruction: ${(instruction as { constructor: { name: string } }).constructor.name}`,
  );
}
