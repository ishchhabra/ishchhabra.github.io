import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  JSXIdentifierInstruction,
  LiteralInstruction,
  LoadContextInstruction,
  LoadGlobalInstruction,
  LoadLocalInstruction,
  Place,
} from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lower a JSX tag name like a normal identifier: if `getDeclarationId(name, path)`
 * is set, emit the same loads as `buildReferencedIdentifier`. Unbound lowercase
 * names use a string literal (common host-tag spelling); other unbound names use
 * `LoadGlobal`.
 */
export function buildJSXIdentifier(
  nodePath: NodePath<t.JSXIdentifier>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const name = nodePath.node.name;

  const valueIdentifier = environment.createIdentifier();
  const valuePlace = environment.createPlace(valueIdentifier);

  const declarationId = functionBuilder.getDeclarationId(name, nodePath);

  if (declarationId !== undefined) {
    const latestDeclaration = environment.getLatestDeclaration(declarationId);
    const declarationPlace = environment.places.get(latestDeclaration.placeId);
    if (declarationPlace === undefined) {
      throw new Error(`Unable to find the place for ${name} (${declarationId})`);
    }

    if (!functionBuilder.isOwnDeclaration(declarationId)) {
      functionBuilder.captures.set(declarationId, declarationPlace);
    }

    const LoadClass = environment.contextDeclarationIds.has(declarationId)
      ? LoadContextInstruction
      : LoadLocalInstruction;
    functionBuilder.addInstruction(
      environment.createInstruction(LoadClass, valuePlace, nodePath, declarationPlace),
    );
  } else if (/^[a-z]/.test(name)) {
    functionBuilder.addInstruction(
      environment.createInstruction(LiteralInstruction, valuePlace, nodePath, name),
    );
  } else {
    functionBuilder.addInstruction(
      environment.createInstruction(LoadGlobalInstruction, valuePlace, nodePath, name),
    );
  }

  const outIdentifier = environment.createIdentifier();
  const outPlace = environment.createPlace(outIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(JSXIdentifierInstruction, outPlace, nodePath, valuePlace),
  );
  return outPlace;
}
