import type * as ESTree from "estree";
import type { ImportOrExportKind } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  BaseInstruction,
  ExportNamedDeclarationInstruction,
  Place,
  StoreLocalInstruction,
  StoreContextInstruction,
} from "../../../ir";
import { ExportFromInstruction } from "../../../ir/instructions/module/ExportFrom";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { resolveModulePath } from "../resolveModulePath";
import { isTSOnlyNode } from "../../estree";

export function buildExportNamedDeclaration(
  node: ESTree.ExportNamedDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  // Type-only exports (export type { X }, export type X = ...) are erased.
  // OXC extends ESTree with exportKind when parsing with astType:"ts".
  if ((node as ESTree.ExportNamedDeclaration & { exportKind?: ImportOrExportKind }).exportKind === "type") {
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
  if (declaration != null && isTSOnlyNode(declaration as ESTree.Node)) {
    return undefined;
  }
  if (declaration != null) {
    let declarationPlace = buildExportDeclaration(
      declaration,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );

    // Suppress standalone emission on the StoreLocal/StoreContext so the
    // export wraps the declaration. Without this, codegen emits the
    // declaration as a separate statement and the export gets just the
    // lval identifier (which isn't a Declaration node).
    const storeInstruction = environment.placeToInstruction.get(declarationPlace.id);
    if (
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
    moduleBuilder.exports.set(identifier.name, {
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
 * their existing StoreLocal place instead of calling buildNode (which
 * returns undefined for these).
 */
function buildExportDeclaration(
  declaration: ESTree.Declaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  // Function declarations are fully built during scope instantiation.
  // Find the StoreLocal instruction that assigned the function value
  // to the binding — its place produces a VariableDeclaration in codegen.
  if (declaration.type === "FunctionDeclaration" && declaration.id) {
    const name = declaration.id.name;
    const declarationId = functionBuilder.getDeclarationId(name, scope);
    if (declarationId !== undefined) {
      const storeInstr = findStoreLocal(functionBuilder, declarationId);
      if (storeInstr !== undefined) {
        // Ensure the binding name matches the exported name so
        // `export function foo()` emits `export const foo = ...`.
        storeInstr.lval.identifier.name = name;
        return storeInstr.place;
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
 * Finds the StoreLocal instruction that writes to a binding with the given
 * declarationId.
 */
function findStoreLocal(
  functionBuilder: FunctionIRBuilder,
  declarationId: import("../../../ir").DeclarationId,
): StoreLocalInstruction | undefined {
  for (const block of functionBuilder.blocks.values()) {
    for (const instr of block.instructions as BaseInstruction[]) {
      if (
        instr instanceof StoreLocalInstruction &&
        instr.lval.identifier.declarationId === declarationId
      ) {
        return instr;
      }
    }
  }
  return undefined;
}

function buildExportFrom(
  node: ESTree.ExportNamedDeclaration,
  _scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const source = node.source!.value as string;
  const resolvedSource = resolveModulePath(source, moduleBuilder.path);

  const specifiers: Array<{ local: string; exported: string }> = [];

  for (const specifier of node.specifiers) {
    if (specifier.type !== "ExportSpecifier") {
      continue;
    }

    // Skip per-specifier type exports: export { value, type TypeOnly } from "mod"
    if ((specifier as ESTree.ExportSpecifier & { exportKind?: ImportOrExportKind }).exportKind === "type") {
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
    moduleBuilder.globals.set(exported as string, {
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
    moduleBuilder.exports.set(exported, {
      instruction,
      declaration: instruction,
    });
  }

  return place;
}
