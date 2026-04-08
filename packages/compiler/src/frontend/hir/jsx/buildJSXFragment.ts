import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { JSXFragmentInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

export function buildJSXFragment(
  node: AST.JSXFragment,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | undefined {
  const openingFragmentPlace = buildNode(
    node.openingFragment,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (openingFragmentPlace === undefined || Array.isArray(openingFragmentPlace)) {
    throw new Error("JSXFragment: openingFragment should be a single place");
  }

  const closingFragmentPlace = buildNode(
    node.closingFragment,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (closingFragmentPlace === undefined || Array.isArray(closingFragmentPlace)) {
    throw new Error("JSXFragment: closingFragment should be a single place");
  }

  const childrenPlaces: Place[] = [];
  for (const child of node.children) {
    const place = buildNode(child as any, scope, functionBuilder, moduleBuilder, environment);
    // JSXEmptyExpression (`{}`, `{/* ... */}`) yields no value and no IR child.
    if (place === undefined) {
      continue;
    }
    if (Array.isArray(place)) {
      throw new Error("JSXFragment: child should be a single place");
    }
    childrenPlaces.push(place);
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXFragmentInstruction,
    place,
    openingFragmentPlace,
    closingFragmentPlace,
    childrenPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
