import type * as AST from "../estree";
import { Environment } from "../../environment";
import { LoadContextOp, LoadGlobalOp, LoadLocalOp, Value } from "../../ir";
import { type Scope } from "../scope/Scope";
import { FuncOpBuilder } from "./FuncOpBuilder";

/**
 * Builds a place for an identifier. Identifiers reaching this function via
 * buildNode are reference-position identifiers (binding-position identifiers
 * are handled by buildLVal, buildImportSpecifier, etc. directly).
 *
 * @param node - The ESTree Value node
 * @param scope - The scope info for this node
 * @param builder - The FuncOpBuilder managing IR state
 * @param environment - The environment managing IR state
 *
 * @returns The `Value` representing this identifier in the IR
 */
export function buildIdentifier(
  node: AST.Value,
  scope: Scope,
  builder: FuncOpBuilder,
  environment: Environment,
) {
  return buildReferencedIdentifier(node, scope, builder, environment);
}

export function throwTDZAccessError(name: string): never {
  throw new Error(`Cannot access '${name}' before initialization`);
}

export function buildBindingIdentifier(
  node: AST.Value,
  scope: Scope,
  builder: FuncOpBuilder,
  environment: Environment,
) {
  const name = node.name;

  let place: Value | undefined;
  const declarationId = builder.getDeclarationId(name, scope);
  if (declarationId !== undefined) {
    place = environment.getDeclarationBinding(declarationId);
  }

  if (place === undefined) {
    const identifier = environment.createValue();
    place = identifier;
  }
  return place;
}

function buildReferencedIdentifier(
  node: AST.Value,
  scope: Scope,
  builder: FuncOpBuilder,
  environment: Environment,
) {
  const name = node.name;
  const declarationId = builder.getDeclarationId(name, scope);

  // LoadLocal produces a temp SSA value that isn't a new version of
  // the source variable — it's just a read. Use a fresh identifier
  // so SSA rename stacks don't confuse it with the source.
  const place = environment.createValue();

  const declarationKind =
    declarationId !== undefined
      ? environment.getDeclarationMetadata(declarationId)?.kind
      : undefined;
  if (declarationId === undefined || declarationKind === "import") {
    const instruction = environment.createOperation(LoadGlobalOp, place, name);
    builder.addOp(instruction);
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
        const paramIdentifier = environment.createValue(declarationId);
        builder.captureParams.set(declarationId, paramIdentifier);
      }
      const captureParam = builder.captureParams.get(declarationId)!;
      const LoadClass = environment.contextDeclarationIds.has(declarationId)
        ? LoadContextOp
        : LoadLocalOp;
      const instruction = environment.createOperation(LoadClass, place, captureParam);
      builder.addOp(instruction);
    } else {
      const latestDeclaration = environment.getLatestDeclaration(declarationId);
      const declarationPlace = latestDeclaration.value;
      if (declarationPlace === undefined) {
        throw new Error(`Unable to find the place for ${name} (${declarationId})`);
      }
      const LoadClass = environment.contextDeclarationIds.has(declarationId)
        ? LoadContextOp
        : LoadLocalOp;
      const instruction = environment.createOperation(LoadClass, place, declarationPlace);
      builder.addOp(instruction);
    }
  }

  return place;
}
