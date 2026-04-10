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
} from "../../../ir";
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
  // Always lower `export <declaration>` into the split form:
  //   <declaration with SSA name>
  //   export { $ssa_name as sourceName }
  //
  // This decouples the binding identity (SSA, freely renameable) from the
  // export contract (public name, preserved as a string on the specifier).
  // ExportDeclarationMergingPass can optionally merge them back into
  // `export const foo = ...` for nicer output.
  if (declaration != null) {
    return buildExportDeclarationAsSpecifiers(
      declaration,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
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
 * Lowers any `export <declaration>` into the split form:
 *   1. Build the declaration normally (binding uses its SSA name).
 *   2. Create `ExportSpecifier(local=$ssa, exported="sourceName")` for each
 *      declared name.
 *   3. Wrap in `ExportNamedDeclaration(specifiers=[...])`.
 *
 * ExportDeclarationMergingPass can optionally merge them back into
 * `export const foo = ...` for nicer output.
 */
function buildExportDeclarationAsSpecifiers(
  declaration: Declaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  // Collect declared names before building (needed for function/class which
  // don't go through VariableDeclaration).
  const names = collectDeclaredNames(declaration);

  // Build the declaration. Function/class declarations are already built
  // during scope instantiation; buildNode returns undefined for them, which
  // is fine — we just need the binding places, not the return value.
  buildNode(declaration, scope, functionBuilder, moduleBuilder, environment);

  // Create export specifiers for each declared name.
  const specifierPlaces: Place[] = [];
  for (const name of names) {
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

/** Extracts declared names from a declaration node. */
function collectDeclaredNames(declaration: Declaration): string[] {
  if (declaration.type === "VariableDeclaration") {
    return declaration.declarations.flatMap((d) => collectPatternNames(d.id));
  }
  if (
    (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") &&
    declaration.id
  ) {
    return [declaration.id.name];
  }
  return [];
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
