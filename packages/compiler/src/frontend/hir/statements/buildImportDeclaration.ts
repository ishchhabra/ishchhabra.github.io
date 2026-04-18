import type { ImportDeclaration, ImportOrExportKind, Node } from "oxc-parser";
import { Environment } from "../../../environment";
import { ImportDeclarationOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildImportSpecifier } from "../buildImportSpecifier";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { resolveModulePath } from "../resolveModulePath";

export function buildImportDeclaration(
  node: ImportDeclaration,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  // Type-only imports (import type { X }) are erased at runtime.
  // OXC extends ESTree with importKind when parsing with astType:"ts".
  if ((node as ImportDeclaration & { importKind?: ImportOrExportKind }).importKind === "type") {
    return undefined;
  }

  const sourceValue = node.source.value as string;
  const resolvedSourceValue = resolveModulePath(sourceValue, moduleBuilder.moduleIR.path);

  // Filter out per-specifier type imports: import { value, type TypeOnly }
  const valueSpecifiers = node.specifiers.filter(
    (s) => (s as Node & { importKind?: ImportOrExportKind }).importKind !== "type",
  );
  if (valueSpecifiers.length === 0) {
    return undefined;
  }

  const specifierPlaces = valueSpecifiers.map((specifier) => {
    const importSpecifierPlace = buildImportSpecifier(
      specifier,
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
    if (importSpecifierPlace === undefined || Array.isArray(importSpecifierPlace)) {
      throw new Error(`Import specifier must be a single place`);
    }
    return importSpecifierPlace;
  });

  const place = environment.createValue();
  const instruction = environment.createOperation(
    ImportDeclarationOp,
    place,
    sourceValue,
    resolvedSourceValue,
    specifierPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
