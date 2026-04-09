import type * as AST from "../../estree";
import type {
  Declaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  ImportOrExportKind,
  Node,
  VariableDeclaration,
} from "oxc-parser";
import { Environment } from "../../../environment";
import {
  ExportNamedDeclarationInstruction,
  Place,
  StoreLocalInstruction,
  StoreContextInstruction,
} from "../../../ir";
import { FunctionDeclarationInstruction } from "../../../ir/instructions/declaration/FunctionDeclaration";
import { ExportFromInstruction } from "../../../ir/instructions/module/ExportFrom";
import { ExportSpecifierInstruction } from "../../../ir/instructions/module/ExportSpecifier";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { resolveModulePath } from "../resolveModulePath";
import { isTSOnlyNode } from "../../estree";

export function buildExportNamedDeclaration(
  node: ExportNamedDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  // Type-only exports (export type { X }, export type X = ...) are erased.
  // OXC extends ESTree with exportKind when parsing with astType:"ts".
  if (
    (node as ExportNamedDeclaration & { exportKind?: ImportOrExportKind }).exportKind === "type"
  ) {
    return undefined;
  }

  // Re-exports: export { x, y } from './mod'
  if (node.source) {
    return buildExportFrom(node, scope, functionBuilder, moduleBuilder, environment);
  }

  const declaration = node.declaration;
  const specifiers = node.specifiers;

  // An export can have either declaration or specifiers, but not both.
  // TS-only exported declarations (export type, export interface) are erased.
  // This catches cases where exportKind is "value" but the declaration itself
  // is a TS-only node (e.g. `export interface Foo {}`).
  if (declaration != null && isTSOnlyNode(declaration as Node)) {
    return undefined;
  }
  // For `export var`, build the declaration normally and create specifiers
  // so ExportDeclarationMergingPass handles the merge. This avoids wrapping
  // the value store directly, which conflicts with the hoisted var init.
  if (
    declaration != null &&
    declaration.type === "VariableDeclaration" &&
    declaration.kind === "var"
  ) {
    return buildExportVarAsSpecifiers(
      declaration,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }

  if (declaration != null) {
    let declarationPlace = buildExportDeclaration(
      declaration,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );

    // Suppress standalone emission so the export wraps the declaration.
    // Without this, codegen emits the declaration as a separate statement.
    const storeInstruction = environment.placeToInstruction.get(declarationPlace.id);
    if (
      storeInstruction instanceof FunctionDeclarationInstruction ||
      storeInstruction instanceof StoreLocalInstruction ||
      storeInstruction instanceof StoreContextInstruction
    ) {
      storeInstruction.emit = false;
    }

    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    const instruction = environment.createInstruction(
      ExportNamedDeclarationInstruction,
      place,
      [],
      declarationPlace,
    );
    functionBuilder.addInstruction(instruction);
    const declarationInstructionId = environment.getDeclarationInstruction(
      declarationPlace.identifier.declarationId,
    )!;
    moduleBuilder.moduleIR.exports.set(identifier.name, {
      instruction,
      declaration: environment.instructions.get(declarationInstructionId)!,
    });
    return place;
  } else {
    const exportSpecifierPlaces = specifiers.map((specifier) => {
      const exportSpecifierPlace = buildNode(
        specifier,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      if (exportSpecifierPlace === undefined || Array.isArray(exportSpecifierPlace)) {
        throw new Error(`Export specifier must be a single place`);
      }
      return exportSpecifierPlace;
    });

    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    const instruction = environment.createInstruction(
      ExportNamedDeclarationInstruction,
      place,
      exportSpecifierPlaces,
      undefined,
    );
    functionBuilder.addInstruction(instruction);
    return place;
  }
}

/**
 * Builds the declaration inside an `export` statement. Function and class
 * declarations are already built during scope instantiation, so we look up
 * their existing declaration place instead of calling buildNode (which
 * returns undefined for these).
 */
function buildExportDeclaration(
  declaration: Declaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  // Function declarations are fully built during scope instantiation.
  // Reuse the existing FunctionDeclarationInstruction and suppress its
  // standalone emission so the export wraps it directly.
  if (declaration.type === "FunctionDeclaration" && declaration.id) {
    const name = declaration.id.name;
    const declarationId = functionBuilder.getDeclarationId(name, scope);
    if (declarationId !== undefined) {
      const declarationInstructionId = environment.getDeclarationInstruction(declarationId);
      if (declarationInstructionId !== undefined) {
        const declarationInstruction = environment.instructions.get(declarationInstructionId);
        if (declarationInstruction instanceof FunctionDeclarationInstruction) {
          declarationInstruction.place.identifier.name = name;
          declarationInstruction.emit = false;
          return declarationInstruction.place;
        }
      }
    }
  }

  let result = buildNode(declaration, scope, functionBuilder, moduleBuilder, environment);
  if (Array.isArray(result)) {
    // Multi-declarator: `export const a = 1, b = 2;`
    result = result[0];
  }
  if (result === undefined) {
    throw new Error(`Export declaration produced no place for ${declaration.type}`);
  }
  return result;
}

/**
 * Builds `export var x = 1` by emitting the var declaration normally
 * (which hoists it), then creating export specifiers. This lets
 * ExportDeclarationMergingPass merge them consistently with the
 * `var x = 1; export { x }` path.
 */
function buildExportVarAsSpecifiers(
  declaration: VariableDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  // Build the var declaration normally (hoisted init + value store).
  buildNode(declaration, scope, functionBuilder, moduleBuilder, environment);

  // Create export specifiers for each declared name.
  const specifierPlaces: Place[] = [];
  for (const declarator of declaration.declarations) {
    for (const name of collectPatternNames(declarator.id)) {
      const declarationId = functionBuilder.getDeclarationId(name, scope);
      if (declarationId === undefined) continue;

      const latestDeclaration = environment.getLatestDeclaration(declarationId);
      if (latestDeclaration === undefined) continue;

      const localPlace = environment.places.get(latestDeclaration.placeId);
      if (localPlace === undefined) continue;

      const specId = environment.createIdentifier();
      const specPlace = environment.createPlace(specId);
      const specInstruction = environment.createInstruction(
        ExportSpecifierInstruction,
        specPlace,
        localPlace,
        name,
      );
      functionBuilder.addInstruction(specInstruction);
      specifierPlaces.push(specPlace);

      const declarationInstructionId = environment.getDeclarationInstruction(declarationId);
      if (declarationInstructionId !== undefined) {
        moduleBuilder.moduleIR.exports.set(name, {
          instruction: specInstruction,
          declaration: environment.instructions.get(declarationInstructionId)!,
        });
      }
    }
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ExportNamedDeclarationInstruction,
    place,
    specifierPlaces,
    undefined,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

function collectPatternNames(pattern: AST.Pattern): string[] {
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ArrayPattern":
      return pattern.elements.flatMap((el) => (el ? collectPatternNames(el) : []));
    case "ObjectPattern":
      return pattern.properties.flatMap((prop) =>
        prop.type === "RestElement"
          ? collectPatternNames(prop.argument)
          : collectPatternNames(prop.value as AST.Pattern),
      );
    case "AssignmentPattern":
      return collectPatternNames(pattern.left);
    case "RestElement":
      return collectPatternNames(pattern.argument);
    default:
      return [];
  }
}

function buildExportFrom(
  node: ExportNamedDeclaration,
  _scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const source = node.source!.value as string;
  const resolvedSource = resolveModulePath(source, moduleBuilder.moduleIR.path);

  const specifiers: Array<{ local: string; exported: string }> = [];

  for (const specifier of node.specifiers) {
    if (specifier.type !== "ExportSpecifier") {
      continue;
    }

    // Skip per-specifier type exports: export { value, type TypeOnly } from "mod"
    if (
      (specifier as ExportSpecifier & { exportKind?: ImportOrExportKind }).exportKind === "type"
    ) {
      continue;
    }

    const local =
      specifier.local.type === "Identifier" ? specifier.local.name : String(specifier.local.value);
    const exported =
      specifier.exported.type === "Identifier"
        ? specifier.exported.name
        : String(specifier.exported.value);

    specifiers.push({ local, exported });

    // Register as an import so ProjectBuilder discovers the source module
    // and CallGraph can resolve through the re-export chain.
    moduleBuilder.moduleIR.globals.set(exported as string, {
      kind: "import",
      name: local,
      source: resolvedSource,
    });
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ExportFromInstruction,
    place,
    source,
    specifiers,
  );
  functionBuilder.addInstruction(instruction);

  // Register each re-exported name as an export for UnusedExportEliminationPass.
  for (const { exported } of specifiers) {
    moduleBuilder.moduleIR.exports.set(exported, {
      instruction,
      declaration: instruction,
    });
  }

  return place;
}
