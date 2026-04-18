import type { JSXFragment } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXFragmentOp, Value } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

export function buildJSXFragment(
  node: JSXFragment,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value | undefined {
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

  const childrenPlaces: Value[] = [];
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

  const place = environment.createValue();
  const instruction = environment.createOperation(
    JSXFragmentOp,
    place,
    openingFragmentPlace,
    closingFragmentPlace,
    childrenPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
