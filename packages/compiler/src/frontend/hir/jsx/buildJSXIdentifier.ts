import type { JSXIdentifier } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  JSXIdentifierInstruction,
  LiteralInstruction,
  LoadContextInstruction,
  LoadGlobalInstruction,
  LoadLocalInstruction,
  Place,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { throwTDZAccessError } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lower a JSX tag name. React treats names starting with a lowercase ASCII letter
 * as intrinsic host elements (DOM/SVG), not as references to in-scope bindings --
 * so `<code>` must stay the tag `code` even when a parameter or local is named `code`.
 * Uppercase / non-intrinsic tags resolve like normal identifiers: local/context load
 * or `LoadGlobal`.
 */
export function buildJSXIdentifier(
  node: JSXIdentifier,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const name = node.name;
  const outIdentifier = environment.createIdentifier();
  const outPlace = environment.createPlace(outIdentifier);

  const valueIdentifier = environment.createIdentifier();
  const valuePlace = environment.createPlace(valueIdentifier);

  if (/^[a-z]/.test(name)) {
    functionBuilder.addInstruction(
      environment.createInstruction(LiteralInstruction, valuePlace, name),
    );
  } else {
    const declarationId = functionBuilder.getDeclarationId(name, scope);

    if (declarationId !== undefined) {
      if (functionBuilder.isDeclarationInTDZ(declarationId)) {
        throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? name);
      }

      if (!functionBuilder.isOwnDeclaration(declarationId)) {
        const declarationPlace = environment.getDeclarationBinding(declarationId);
        if (declarationPlace === undefined) {
          throw new Error(`Unable to find the binding place for ${name} (${declarationId})`);
        }
        functionBuilder.captures.set(declarationId, declarationPlace);
        if (!functionBuilder.captureParams.has(declarationId)) {
          const paramIdentifier = environment.createIdentifier(declarationId);
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
        const latestDeclaration = environment.getLatestDeclaration(declarationId);
        const declarationPlace = environment.places.get(latestDeclaration.placeId);
        if (declarationPlace === undefined) {
          throw new Error(`Unable to find the place for ${name} (${declarationId})`);
        }
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
