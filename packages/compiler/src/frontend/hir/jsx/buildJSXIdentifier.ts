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
import { throwTDZAccessError } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lower a JSX tag name. React treats names starting with a lowercase ASCII letter
 * as intrinsic host elements (DOM/SVG), not as references to in-scope bindings —
 * so `<code>` must stay the tag `code` even when a parameter or local is named `code`.
 * Uppercase / non-intrinsic tags resolve like normal identifiers: local/context load
 * or `LoadGlobal`.
 */
export function buildJSXIdentifier(
  nodePath: NodePath<t.JSXIdentifier>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const name = nodePath.node.name;
  const outIdentifier = environment.createIdentifier();
  const outPlace = environment.createPlace(outIdentifier);

  const valueIdentifier = environment.createIdentifier();
  const valuePlace = environment.createPlace(valueIdentifier);

  if (/^[a-z]/.test(name)) {
    functionBuilder.addInstruction(
      environment.createInstruction(LiteralInstruction, valuePlace, name),
    );
  } else {
    const declarationId = functionBuilder.getDeclarationId(name, nodePath);

    if (declarationId !== undefined) {
      if (functionBuilder.isDeclarationInTDZ(declarationId)) {
        throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? name);
      }

      const latestDeclaration = environment.getLatestDeclaration(declarationId);
      const declarationPlace = environment.places.get(latestDeclaration.placeId);
      if (declarationPlace === undefined) {
        throw new Error(`Unable to find the place for ${name} (${declarationId})`);
      }

      if (!functionBuilder.isOwnDeclaration(declarationId)) {
        functionBuilder.captures.set(declarationId, declarationPlace);
        if (!functionBuilder.captureParams.has(declarationId)) {
          const paramIdentifier = environment.createIdentifier(declarationId);
          paramIdentifier.name = declarationPlace.identifier.name;
          functionBuilder.captureParams.set(
            declarationId,
            environment.createPlace(paramIdentifier),
          );
        }
        const captureParam = functionBuilder.captureParams.get(declarationId)!;
        const LoadClass = environment.contextDeclarationIds.has(declarationId)
          ? LoadContextInstruction
          : LoadLocalInstruction;
        functionBuilder.addInstruction(
          environment.createInstruction(LoadClass, valuePlace, captureParam),
        );
      } else {
        const LoadClass = environment.contextDeclarationIds.has(declarationId)
          ? LoadContextInstruction
          : LoadLocalInstruction;
        functionBuilder.addInstruction(
          environment.createInstruction(LoadClass, valuePlace, declarationPlace),
        );
      }
    } else {
      functionBuilder.addInstruction(
        environment.createInstruction(LoadGlobalInstruction, valuePlace, name),
      );
    }
  }

  functionBuilder.addInstruction(
    environment.createInstruction(JSXIdentifierInstruction, outPlace, valuePlace),
  );
  return outPlace;
}
