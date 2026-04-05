import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { ImportDeclarationInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildImportSpecifier } from "../buildImportSpecifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { resolveModulePath } from "../resolveModulePath";

export function buildImportDeclaration(
  node: ESTree.ImportDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  // Type-only import: import type { Foo } from './mod'
  if ((node as any).importKind === "type") {
    return undefined;
  }

  const sourceValue = node.source.value as string;
  const resolvedSourceValue = resolveModulePath(sourceValue, moduleBuilder.path);

  // Filter out type-only specifiers: import { type Foo, bar } from './mod'
  const valueSpecifiers = node.specifiers.filter(
    (specifier) => (specifier as any).importKind !== "type",
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

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ImportDeclarationInstruction,
    place,
    sourceValue,
    resolvedSourceValue,
    specifierPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
