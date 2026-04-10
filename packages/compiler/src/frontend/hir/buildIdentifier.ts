import type * as AST from "../estree";
import { Environment } from "../../environment";
import {
  LoadContextInstruction,
  LoadGlobalInstruction,
  LoadLocalInstruction,
  Place,
} from "../../ir";
import { type Scope } from "../scope/Scope";
import { FunctionIRBuilder } from "./FunctionIRBuilder";

/**
 * Builds a place for an identifier. Identifiers reaching this function via
 * buildNode are reference-position identifiers (binding-position identifiers
 * are handled by buildLVal, buildImportSpecifier, etc. directly).
 *
 * @param node - The ESTree Identifier node
 * @param scope - The scope info for this node
 * @param builder - The FunctionIRBuilder managing IR state
 * @param environment - The environment managing IR state
 *
 * @returns The `Place` representing this identifier in the IR
 */
export function buildIdentifier(
  node: AST.Identifier,
  scope: Scope,
  builder: FunctionIRBuilder,
  environment: Environment,
) {
  return buildReferencedIdentifier(node, scope, builder, environment);
}

export function throwTDZAccessError(name: string): never {
  throw new Error(`Cannot access '${name}' before initialization`);
}

export function buildBindingIdentifier(
  node: AST.Identifier,
  scope: Scope,
  builder: FunctionIRBuilder,
  environment: Environment,
) {
  const name = node.name;

  let place: Place | undefined;
  const declarationId = builder.getDeclarationId(name, scope);
  if (declarationId !== undefined) {
    place = environment.getDeclarationBinding(declarationId);
  }

  if (place === undefined) {
    const identifier = environment.createIdentifier();
    place = environment.createPlace(identifier);
  }
  return place;
}

function buildReferencedIdentifier(
  node: AST.Identifier,
  scope: Scope,
  builder: FunctionIRBuilder,
  environment: Environment,
) {
  const name = node.name;
  const declarationId = builder.getDeclarationId(name, scope);

  const identifier = environment.createIdentifier(declarationId);
  const place = environment.createPlace(identifier);

  const declarationKind =
    declarationId !== undefined ? environment.getDeclarationMetadata(declarationId)?.kind : undefined;
  if (
    declarationId === undefined ||
    declarationKind === "import"
  ) {
    const instruction = environment.createInstruction(LoadGlobalInstruction, place, name);
    builder.addInstruction(instruction);
  } else {
    const declarationId = builder.getDeclarationId(name, scope);
    if (declarationId === undefined) {
      throw new Error(`Variable accessed before declaration: ${name}`);
    }

    if (builder.isDeclarationInTDZ(declarationId)) {
      throwTDZAccessError(builder.getDeclarationSourceName(declarationId) ?? name);
    }

    // If this variable was declared in an enclosing scope (not in the
    // current function), record it as a closure capture and use a local
    // capture parameter place so the function's blocks are decoupled
    // from the parent scope's identifiers.
    if (!builder.isOwnDeclaration(declarationId)) {
      const declarationPlace = environment.getDeclarationBinding(declarationId);
      if (declarationPlace === undefined) {
        throw new Error(`Unable to find the binding place for ${name} (${declarationId})`);
      }
      builder.captures.set(declarationId, declarationPlace);
      if (!builder.captureParams.has(declarationId)) {
        const paramIdentifier = environment.createIdentifier(declarationId);
        builder.captureParams.set(declarationId, environment.createPlace(paramIdentifier));
      }
      const captureParam = builder.captureParams.get(declarationId)!;
      const LoadClass = environment.contextDeclarationIds.has(declarationId)
        ? LoadContextInstruction
        : LoadLocalInstruction;
      const instruction = environment.createInstruction(LoadClass, place, captureParam);
      builder.addInstruction(instruction);
    } else {
      const latestDeclaration = environment.getLatestDeclaration(declarationId);
      const declarationPlace = environment.places.get(latestDeclaration.placeId);
      if (declarationPlace === undefined) {
        throw new Error(`Unable to find the place for ${name} (${declarationId})`);
      }
      const LoadClass = environment.contextDeclarationIds.has(declarationId)
        ? LoadContextInstruction
        : LoadLocalInstruction;
      const instruction = environment.createInstruction(LoadClass, place, declarationPlace);
      builder.addInstruction(instruction);
    }
  }

  return place;
}
